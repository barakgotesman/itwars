/**
 * Small rotating 3D preview of the selected character, shown on the welcome screen.
 * Uses its own tiny renderer and a mini stage (office wall, podium, spotlight, rim lights) so it
 * works before the game world exists.
 */
import * as THREE from 'three';
import { PLAYER_COLORS } from '../shared/characters';
import type { Look } from './appearance';
import { PlayerModel } from './players';

/** Handle for controlling the preview. */
export interface Preview {
  /** Swaps in a different character or colour. */
  setLook(look: Look): void;
  /** Stops rendering and frees the WebGL context (call when leaving the menu). */
  dispose(): void;
}

/** Paints the back wall: slate gradient, a glowing window, a blue accent stripe and a baseboard. */
function wallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#1b2433');
  bg.addColorStop(1, '#3a475c');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 512);
  // Window glow, like daylight through blinds.
  const win = g.createLinearGradient(0, 40, 0, 250);
  win.addColorStop(0, 'rgba(190,220,255,0.55)');
  win.addColorStop(1, 'rgba(190,220,255,0.18)');
  g.fillStyle = win;
  g.fillRect(150, 40, 212, 210);
  g.fillStyle = 'rgba(20,28,42,0.55)';
  for (let y = 56; y < 250; y += 22) g.fillRect(150, y, 212, 6);
  g.fillStyle = '#2f80ed';
  g.fillRect(0, 330, 512, 10);
  g.fillStyle = '#10151e';
  g.fillRect(0, 452, 512, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Marks every mesh of an object as shadow-casting. */
function castShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
}

/**
 * Starts rendering a character on a small stage into a canvas.
 * @param canvas - Target canvas; its CSS size decides the render size.
 * @param initial - Look to show first.
 */
export function createPreview(canvas: HTMLCanvasElement, initial: Look): Preview {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c111a);
  scene.fog = new THREE.Fog(0x0c111a, 6, 11);

  // Back wall and floor.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: wallTexture() }));
  wall.position.set(0, 2.1, -2.4);
  scene.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshLambertMaterial({ color: 0x3b4658 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Podium with a glowing ring in the player's shirt colour.
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.08, 40), new THREE.MeshLambertMaterial({ color: 0x566178 }));
  podium.position.y = 0.04;
  podium.receiveShadow = true;
  scene.add(podium);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.1, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.085;
  scene.add(ring);

  // Lighting: soft fill, a warm key spotlight casting a shadow, and cool/warm rim lights from behind.
  scene.add(new THREE.HemisphereLight(0xaec4ff, 0x2a2f3a, 1.1));
  const key = new THREE.SpotLight(0xfff0d8, 70, 14, 0.55, 0.65, 1.6);
  key.position.set(2.2, 4.6, 3.4);
  key.target.position.set(0, 0.9, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const rimCool = new THREE.DirectionalLight(0x5aa0ff, 2.4);
  rimCool.position.set(-3, 2.5, -3);
  const rimWarm = new THREE.DirectionalLight(0xffa060, 1.8);
  rimWarm.position.set(3, 2, -3);
  scene.add(rimCool, rimWarm);

  const camera = new THREE.PerspectiveCamera(28, canvas.clientWidth / canvas.clientHeight, 0.1, 30);
  camera.position.set(0, 1.15, 4.8);
  camera.lookAt(0, 0.95, 0);

  let model: PlayerModel | null = null;
  const setLook = (look: Look) => {
    if (model) scene.remove(model.root);
    const color = PLAYER_COLORS[look.color]!;
    ringMat.color.setHex(color);
    // Variant 0 keeps skin and hair stable while browsing styles; in game they vary by player id.
    model = new PlayerModel({ id: 0, name: '', model: look.model, color, kills: 0, deaths: 0 }, 0);
    model.tagVisible(false);
    model.root.position.y = 0.08;
    castShadows(model.root);
    scene.add(model.root);
  };
  setLook(initial);

  // ---- mouse control: drag to rotate and tilt, wheel to zoom; auto-spin resumes after a pause ----
  const TARGET_Y = 0.95;
  const AUTO_SPIN = 0.7;
  const IDLE_BEFORE_SPIN_MS = 2500;
  let spin = 0.5;
  /** Spin speed in rad/s: set by the drag, decays to the auto-spin speed. */
  let spinVel = AUTO_SPIN;
  let elevation = 0.1;
  let radius = 4.8;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastMoveT = 0;
  let lastInteract = 0;

  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastMoveT = e.timeStamp;
    spinVel = 0;
    lastInteract = performance.now();
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const dtMs = Math.max(e.timeStamp - lastMoveT, 1);
    lastX = e.clientX;
    lastY = e.clientY;
    lastMoveT = e.timeStamp;
    spin += dx * 0.012;
    // Remember the drag speed so letting go flings the model.
    spinVel = THREE.MathUtils.clamp((dx * 0.012 * 1000) / dtMs, -8, 8);
    elevation = THREE.MathUtils.clamp(elevation + dy * 0.006, -0.15, 0.45);
    lastInteract = performance.now();
  });
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    // A pause before release means no fling.
    if (e.timeStamp - lastMoveT > 80) spinVel = 0;
    lastInteract = performance.now();
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    radius = THREE.MathUtils.clamp(radius + e.deltaY * 0.004, 3.2, 6.5);
    lastInteract = performance.now();
  }, { passive: false });

  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;
    if (!dragging) {
      // Ease back to the gentle auto-spin once the player stops touching the preview.
      const target = now - lastInteract > IDLE_BEFORE_SPIN_MS ? AUTO_SPIN : 0;
      spinVel += (target - spinVel) * Math.min(1, dt * (target === 0 ? 2.5 : 1.5));
      spin += spinVel * dt;
    }
    camera.position.set(0, TARGET_Y + Math.sin(elevation) * radius, Math.cos(elevation) * radius);
    camera.lookAt(0, TARGET_Y, 0);
    if (model) {
      model.root.rotation.y = spin;
      model.idle(now / 1000);
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setLook,
    dispose: () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
