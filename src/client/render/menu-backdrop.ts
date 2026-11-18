/**
 * The main menu's living background: the real maps (the office, then the Data Center, ...) seen from a camera that
 * drifts slowly through each one, with a slow crossfade to the next map every `HOLD_S` seconds. One renderer,
 * disposed before the game starts so it never competes with play or with the one-time graphics calibration.
 *
 * Cost control: each map is built once (the bake blocks the main thread for a moment, so the first map is built
 * after the menu has painted and each further map in its own later task, never during a fade) into its own scene.
 * Normal frames render the current scene straight to the canvas; only during the ~1.6 s dissolve are the two
 * scenes drawn into render targets and blended by one full-screen quad. Hidden tabs freeze the clock.
 */
import * as THREE from 'three';
import { MAPS, type MapDef } from '@shared/world/map/maps';
import { setActiveMap } from '@client/render/active-map';
import { createDust } from '@client/render/renderer';
import { buildWorld, type World } from '@client/render/world';

/** Handle for the backdrop. */
export interface Backdrop {
  /** Stops rendering and frees the WebGL context (call when leaving the menu). */
  dispose(): void;
}

/** Sharpest pixel ratio used; a 1.5x cap keeps it crisp on high-DPI screens without the cost of full 2x. */
const MAX_PIXEL_RATIO = 1.5;
/** Seconds each map stays on screen before the dissolve to the next one starts. */
const HOLD_S = 26;
/** Seconds the dissolve takes. */
const FADE_S = 1.6;
/** Delay (ms) before the first map is built, so the menu paints first. */
const FIRST_BUILD_MS = 350;
/** Delay (ms) between building one further map and the next. */
const NEXT_BUILD_MS = 1200;
/** Longest frame step (s) the animation clock accepts, so a stall or a hidden tab never jumps the camera. */
const MAX_DT = 0.1;

/** One built map: its scene, world, camera path and dust. */
interface Stage {
  map: MapDef;
  scene: THREE.Scene;
  world: World;
  dust: ReturnType<typeof createDust>;
  /** Seconds this stage's camera has travelled; it keeps drifting while it fades out so nothing freezes. */
  clock: number;
}

/** Smooth 0..1 ease. */
const smooth = (x: number): number => x * x * (3 - 2 * x);

/**
 * Starts the backdrop. The first map is built a moment after the menu has appeared, so the menu is never delayed,
 * and the canvas then fades in.
 * @param canvas - Full-screen canvas behind the menu; it starts transparent.
 * @returns Handle to stop it. Does nothing if WebGL is unavailable.
 */
export function createBackdrop(canvas: HTMLCanvasElement): Backdrop {
  let renderer: THREE.WebGLRenderer | null = null;
  let raf = 0;
  let timer = 0;
  let disposed = false;
  let cleanup = () => {};

  const start = () => {
    if (disposed) return;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    } catch {
      return; // No WebGL: the menu simply keeps its plain background.
    }
    const gl = renderer;
    gl.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 140);

    /** Builds one map into its own scene. The active map must be set immediately before `buildWorld`. */
    const build = (map: MapDef): Stage => {
      setActiveMap(map);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(map.backdrop.background);
      scene.fog = new THREE.FogExp2(map.backdrop.fog.color, map.backdrop.fog.density);
      const world = buildWorld(scene);
      return { map, scene, world, dust: createDust(scene), clock: 0 };
    };

    const stages: Stage[] = [build(MAPS[0]!)];
    let current = 0;
    /** Index of the stage being dissolved into, or -1 when not fading. */
    let next = -1;
    let fade = 0;
    let held = 0;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // The remaining maps are built one per task after the first has been shown.
    let queued = 1;
    const buildNext = () => {
      if (disposed || queued >= MAPS.length) return;
      stages.push(build(MAPS[queued++]!));
      timer = window.setTimeout(buildNext, NEXT_BUILD_MS);
    };
    timer = window.setTimeout(buildNext, NEXT_BUILD_MS * 2);

    // Dissolve resources, created on first use.
    let targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
    const quadScene = new THREE.Scene();
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const blend = new THREE.ShaderMaterial({
      uniforms: { a: { value: null }, b: { value: null }, mixAmount: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D a; uniform sampler2D b; uniform float mixAmount; varying vec2 vUv; '
        + 'void main() { gl_FragColor = mix(texture2D(a, vUv), texture2D(b, vUv), mixAmount); #include <colorspace_fragment> }',
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blend);
    quadScene.add(quad);

    const resize = () => {
      gl.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      if (targets) {
        const size = gl.getDrawingBufferSize(new THREE.Vector2());
        for (const t of targets) t.setSize(size.x, size.y);
      }
    };
    resize();
    addEventListener('resize', resize);

    /** Puts the camera where a stage's path says it is at that stage's own time. */
    const aim = (s: Stage) => {
      const { from, to, period, pitch, sway } = s.map.backdrop;
      // Ease along the lane and back; the yaw sways so the view never freezes. Always facing one way avoids the
      // 180 degree snap a ping-pong that looked along its path would need.
      const k = smooth(0.5 - 0.5 * Math.cos((s.clock / period) * Math.PI * 2));
      camera.position.set(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k + Math.sin(s.clock * 1.3) * 0.02, from[2] + (to[2] - from[2]) * k);
      camera.rotation.set(pitch, Math.sin(s.clock * 0.17) * sway, 0, 'YXZ');
    };
    /** Draws one stage with its own camera pose into `target` (null = the canvas). */
    const draw = (s: Stage, target: THREE.WebGLRenderTarget | null) => {
      aim(s);
      s.world.update(s.clock);
      s.dust.update(camera.position, s.clock);
      gl.setRenderTarget(target);
      gl.render(s.scene, camera);
    };

    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      if (document.hidden) return;

      stages[current]!.clock += dt;
      if (next >= 0) stages[next]!.clock += dt;
      else if (!reduceMotion && stages.length > 1) {
        held += dt;
        if (held >= HOLD_S) {
          next = (current + 1) % stages.length;
          fade = 0;
          held = 0;
          if (!targets) {
            const size = gl.getDrawingBufferSize(new THREE.Vector2());
            targets = [new THREE.WebGLRenderTarget(size.x, size.y), new THREE.WebGLRenderTarget(size.x, size.y)];
          }
        }
      }

      if (next < 0 || !targets) {
        draw(stages[current]!, null);
        return;
      }
      fade = Math.min(1, fade + dt / FADE_S);
      draw(stages[current]!, targets[0]);
      draw(stages[next]!, targets[1]);
      blend.uniforms.a!.value = targets[0].texture;
      blend.uniforms.b!.value = targets[1].texture;
      blend.uniforms.mixAmount!.value = smooth(fade);
      gl.setRenderTarget(null);
      gl.render(quadScene, quadCam);
      if (fade >= 1) {
        current = next;
        next = -1;
        // The render targets are only needed during a dissolve: give the memory back until the next one.
        for (const t of targets) t.dispose();
        targets = null;
      }
    };
    raf = requestAnimationFrame(frame);
    canvas.classList.replace('opacity-0', 'opacity-100');

    cleanup = () => {
      removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      for (const s of stages) s.world.dispose();
      if (targets) for (const t of targets) t.dispose();
      quad.geometry.dispose();
      blend.dispose();
      gl.dispose();
      gl.forceContextLoss();
      renderer = null;
    };
  };

  // Let the menu paint first; the map build blocks the main thread for a moment.
  timer = window.setTimeout(start, FIRST_BUILD_MS);

  return {
    dispose() {
      disposed = true;
      clearTimeout(timer);
      cleanup();
      canvas.classList.add('hidden');
    },
  };
}
