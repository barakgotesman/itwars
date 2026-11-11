/** Screen-space and ambient effects: bloom post-processing and floating dust motes. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Post-processing pipeline handle. */
export interface PostFx {
  render(): void;
  resize(w: number, h: number): void;
  /** Turns the glow on or off. */
  setBloom(on: boolean): void;
  /** Turns 4x multisampling on or off (it is the most expensive part on weak GPUs). */
  setAntialias(on: boolean): void;
  /** Matches the internal resolution to the renderer's pixel ratio (call after `renderer.setPixelRatio`). */
  setPixelRatio(ratio: number): void;
}

/**
 * Renders the scene (plus an optional overlay such as the weapon viewmodel) into a half-float target (so emissive surfaces can exceed 1.0), blooms what is
 * brighter than normal lit surfaces, then tone/colour-converts to the screen.
 */
export function createPostFx(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  overlay?: { scene: THREE.Scene; camera: THREE.Camera },
): PostFx {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  if (overlay) {
    // Second pass for first-person weapons: keep the colours, clear depth so the gun never clips into walls.
    const pass = new RenderPass(overlay.scene, overlay.camera);
    pass.clear = false;
    pass.clearDepth = true;
    composer.addPass(pass);
  }
  // Threshold sits above the baked-light ceiling, so only lights, screens and signs glow.
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.2, 0.4, 1.5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    resize: (w, h) => composer.setSize(w, h),
    setBloom: (on) => {
      bloom.enabled = on;
    },
    setAntialias: (on) => {
      // Samples are read when a render target is (re)allocated, so change them and force a rebuild.
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
        rt.samples = on ? 4 : 0;
        rt.dispose();
      }
    },
    setPixelRatio: (ratio) => composer.setPixelRatio(ratio),
  };
}

const DUST_COUNT = 350;
const DUST_BOX = 24;

/**
 * Slow drifting dust motes that wrap around the camera, giving depth and making light feel airy.
 * @returns Handle to call each frame.
 */
export function createDust(scene: THREE.Scene): { update(cam: THREE.Vector3, t: number): void; setEnabled(on: boolean): void } {
  const rnd = (() => {
    let s = 42;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  const seeds = Array.from({ length: DUST_COUNT }, () => ({
    ox: rnd() * DUST_BOX, oy: rnd() * 5, oz: rnd() * DUST_BOX,
    vx: (rnd() - 0.5) * 0.15, vy: (rnd() - 0.5) * 0.06, vz: (rnd() - 0.5) * 0.15,
  }));
  const positions = new Float32Array(DUST_COUNT * 3);

  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.05, transparent: true, opacity: 0.4, depthWrite: false, fog: false,
  }));
  points.frustumCulled = false;
  scene.add(points);

  const wrap = (v: number, centre: number): number => ((((v - centre) % DUST_BOX) + DUST_BOX * 1.5) % DUST_BOX) - DUST_BOX / 2 + centre;
  return {
    setEnabled(on) {
      points.visible = on;
    },
    update(cam, t) {
      seeds.forEach((s, i) => {
        positions[i * 3] = wrap(s.ox + s.vx * t, cam.x);
        positions[i * 3 + 1] = 0.3 + ((s.oy + s.vy * t) % 3.6 + 3.6) % 3.6;
        positions[i * 3 + 2] = wrap(s.oz + s.vz * t, cam.z);
      });
      geo.getAttribute('position').needsUpdate = true;
    },
  };
}
