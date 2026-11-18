/**
 * A turntable for one weapon on the landing page's arsenal section: the game's own first-person gun models (no hands),
 * fitted to the view and swung gently side to side on a transparent canvas, so the page behind shows through. Swapping
 * weapons pops the old one out and the new one in by scale only (the models share materials with the in-game viewmodel,
 * so nothing here may change a material). Works before the game world exists, and stops drawing when told it is off screen.
 */
import * as THREE from 'three';
import { buildGrenadeModel } from './items';
import { buildGunModel } from './viewmodel';

/** What the turntable can show: a weapon (index into `WEAPONS`) or a grenade (slot into `GRENADES`). */
export type ShowcaseModel = { weapon: number } | { grenade: number };

/** Handle for controlling the showcase. */
export interface GunShowcase {
  /** Brings in another model, popping the current one out. */
  show(model: ShowcaseModel): void;
  /** Starts or stops drawing frames (stop it while the canvas is scrolled out of view). */
  setActive(on: boolean): void;
  /** Re-reads the canvas size (call when its box changes). */
  resize(): void;
  /** Stops drawing and frees the WebGL context and the models. */
  dispose(): void;
}

/** Seconds a model takes to pop in or out. */
const POP = 0.35;
/** How far (rad) the gun swings either side of showing its flank, and how fast (rad/s). */
const SWING = 0.55;
const SWING_RATE = 0.8;
/** How much of the view width (world units at the gun's distance) a gun may fill. */
const FIT_WIDTH = 4.6;
const FIT_HEIGHT = 1.7;

/** One model on the turntable and how far through its pop it is (0 hidden, 1 full size). */
interface Slot {
  holder: THREE.Group;
  scale: number;
  fit: number;
  /** Yaw (rad) the model faces when the swing is at its middle: guns show their flank, grenades their front. */
  yaw: number;
  /** +1 popping in, -1 popping out. */
  dir: 1 | -1;
}

/**
 * Starts the showcase.
 * @param canvas - Target canvas; its CSS size decides the render size.
 */
export function createGunShowcase(canvas: HTMLCanvasElement): GunShowcase {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7080, 2.3));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
  key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight(0x6aa8ff, 1.6);
  rim.position.set(-3, 2, -3);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 30);
  camera.position.set(0, 0.2, 5.2);
  camera.lookAt(0, 0, 0);

  const slots: Slot[] = [];
  let raf = 0;
  let last = 0;
  let time = 0;

  /** Frees a holder's geometry (materials are shared and stay). */
  const free = (s: Slot) => {
    scene.remove(s.holder);
    s.holder.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  };

  const resize = () => {
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    for (let i = slots.length - 1; i >= 0; i--) {
      const s = slots[i]!;
      s.scale = THREE.MathUtils.clamp(s.scale + s.dir * dt / POP, 0, 1);
      if (s.dir < 0 && s.scale <= 0) { free(s); slots.splice(i, 1); continue; }
      // Ease the pop so it overshoots a touch on the way in.
      const e = s.dir > 0 ? 1 - Math.pow(1 - s.scale, 3) * (1 - 0.15 * Math.sin(s.scale * Math.PI)) : s.scale * s.scale;
      s.holder.scale.setScalar(s.fit * e);
      // The barrel points right; the gun swings about its centre and rocks a little.
      s.holder.rotation.set(0.12 + Math.sin(time * 0.9) * 0.05, s.yaw + Math.sin(time * SWING_RATE) * SWING, 0);
      s.holder.position.y = Math.sin(time * 1.3) * 0.04;
    }
    renderer.render(scene, camera);
  };

  return {
    show(which) {
      for (const s of slots) s.dir = -1;
      const isGun = 'weapon' in which;
      const model = isGun ? buildGunModel(which.weapon) : buildGrenadeModel(which.grenade);
      // Fit it to the view from its own box (a gun's barrel runs along -Z; a grenade is about as wide as it is deep).
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      model.position.sub(centre);
      const holder = new THREE.Group();
      holder.add(model);
      const fit = Math.min(FIT_WIDTH / Math.max(0.05, size.x, size.z), FIT_HEIGHT / Math.max(0.05, size.y));
      holder.scale.setScalar(0.0001);
      scene.add(holder);
      slots.push({ holder, scale: 0, fit, yaw: isGun ? -Math.PI / 2 : 0, dir: 1 });
    },
    setActive(on) {
      cancelAnimationFrame(raf);
      raf = 0;
      if (on) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      slots.forEach(free);
      slots.length = 0;
      renderer.dispose();
    },
  };
}
