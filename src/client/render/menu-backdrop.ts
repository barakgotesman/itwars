/**
 * The main menu's living background: the real office map, seen from a camera that drifts slowly down the
 * open-plan floor. It has its own renderer, capped at 30 FPS, and is disposed before the game starts, so it never competes with play or
 * with the one-time graphics calibration.
 */
import * as THREE from 'three';
import { buildWorld } from '@client/render/world';

/** Handle for the backdrop. */
export interface Backdrop {
  /** Stops rendering and frees the WebGL context (call when leaving the menu). */
  dispose(): void;
}

/** Eye height of the drifting camera (m). */
const EYE = 2.2;
/** Sharpest pixel ratio used; a 1.5x cap keeps it crisp on high-DPI screens without the cost of full 2x. */
const MAX_PIXEL_RATIO = 1.5;
/** Frame interval (ms) for roughly 30 FPS. */
const FRAME_MS = 33;
/** Seconds for one trip along the lane and back. */
const PERIOD_S = 150;
/** Half-length of the lane the camera moves along (m). */
const LANE_HALF = 28;
/** The open-plan lane (z) the camera follows; it runs between the spawn rows, clear of furniture. */
const LANE_Z = -1;

/**
 * Starts the backdrop. The map is built a moment after the menu has appeared, so the menu is never delayed,
 * and the canvas then fades in.
 * @param canvas - Full-screen canvas behind the menu; it starts transparent.
 * @returns Handle to stop it. Does nothing if WebGL is unavailable.
 */
export function createBackdrop(canvas: HTMLCanvasElement): Backdrop {
  let renderer: THREE.WebGLRenderer | null = null;
  let raf = 0;
  let starter = 0;
  let disposed = false;

  const start = () => {
    if (disposed) return;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    } catch {
      return; // No WebGL: the menu simply keeps its plain background.
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9bb0c4);
    scene.fog = new THREE.FogExp2(0x8e9bab, 0.012);
    const world = buildWorld(scene);
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 140);
    const resize = () => {
      renderer?.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    addEventListener('resize', resize);

    const t0 = performance.now();
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < FRAME_MS) return;
      last = now;
      const t = (now - t0) / 1000;
      // A slow sideways dolly along the lane, looking north across the pods; the yaw sways so the view never freezes.
      // Facing one way throughout avoids the 180 degree snap a ping-pong that looked along its path would need.
      const phase = (t / PERIOD_S) * Math.PI * 2;
      camera.position.set(Math.sin(phase) * LANE_HALF, EYE + Math.sin(t * 1.3) * 0.02, LANE_Z);
      camera.rotation.set(-0.1, Math.sin(t * 0.17) * 0.5, 0, 'YXZ');
      world.update(t);
      renderer?.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    canvas.classList.replace('opacity-0', 'opacity-100');
    dispose = () => {
      removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer = null;
    };
  };

  /** Replaced once the renderer exists. */
  let dispose = () => {};
  // Let the menu paint first; the map build blocks the main thread for a moment.
  starter = window.setTimeout(start, 350);

  return {
    dispose() {
      disposed = true;
      clearTimeout(starter);
      dispose();
      canvas.classList.add('hidden');
    },
  };
}
