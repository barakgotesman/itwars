/**
 * Automatic graphics quality, decided once: a ladder of presets, a first guess from the hardware, and a
 * short calibration that runs while the player is still on the room screen (before entering the map).
 * The result is saved and then left alone; nothing changes while the player is playing.
 */
import { notifyChange, settings } from './settings';

/** One rung of the quality ladder. Lower index = prettier and heavier. */
export interface Tier {
  name: string;
  renderScale: number;
  antialias: boolean;
  bloom: boolean;
  dust: boolean;
  particles: boolean;
}

/** From best looking (0) to fastest (last). Each step drops the most expensive remaining feature. */
export const TIERS: readonly Tier[] = [
  { name: 'High', renderScale: 1, antialias: true, bloom: true, dust: true, particles: true },
  { name: 'Medium', renderScale: 1, antialias: true, bloom: false, dust: true, particles: true },
  { name: 'Low', renderScale: 1, antialias: false, bloom: false, dust: false, particles: true },
  { name: 'Lower', renderScale: 0.75, antialias: false, bloom: false, dust: false, particles: true },
  { name: 'Very low', renderScale: 0.75, antialias: false, bloom: false, dust: false, particles: false },
  { name: 'Minimum', renderScale: 0.5, antialias: false, bloom: false, dust: false, particles: false },
];

/** The graphics options actually in force right now. */
export interface Graphics {
  renderScale: number;
  antialias: boolean;
  bloom: boolean;
  dust: boolean;
  particles: boolean;
}

const STORAGE_KEY = 'itwars.tier';
const LAST = TIERS.length - 1;

/** Reads the remembered tier, or null if there is none. */
function loadTier(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v = Number(raw);
    if (raw !== null && Number.isInteger(v) && v >= 0 && v <= LAST) return v;
  } catch {
    // Storage blocked: calibrate every time instead.
  }
  return null;
}

let tier = loadTier() ?? 0;

/** Index of the current automatic preset. */
export function currentTier(): number {
  return tier;
}

/**
 * Chooses the preset to start calibrating from: software renderers and weak integrated GPUs or few CPU
 * cores start lower, so calibration needs fewer steps.
 * @param gl - The renderer's WebGL context, if available, to read the GPU name.
 * @param cores - CPU core count (defaults to the browser's value).
 */
export function guessTier(gl?: WebGLRenderingContext | WebGL2RenderingContext | null, cores = navigator.hardwareConcurrency || 8): number {
  let t = cores <= 2 ? 3 : cores <= 4 ? 2 : 0;
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software|basic render|softpipe/i.test(name)) t = LAST;
    else if (/intel/i.test(name) && !/\barc\b|iris.{0,6}xe/i.test(name)) t = Math.max(t, 2);
  } catch {
    // Some browsers hide the GPU name; the core count guess stands.
  }
  return t;
}

/**
 * Sets up the tier for this session.
 * @param gl - The renderer's WebGL context.
 * @returns True if a calibration run is needed (no saved result yet); false if a saved tier is simply used.
 */
export function initQuality(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): boolean {
  const saved = loadTier();
  if (saved !== null) {
    tier = saved;
    return false;
  }
  tier = guessTier(gl);
  return true;
}

/** Moves to a tier, optionally saves it, and tells the game to re-apply graphics. */
export function setTier(n: number, remember = true): void {
  tier = Math.max(0, Math.min(LAST, n));
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, String(tier));
    } catch {
      // Not persisting is fine.
    }
  }
  notifyChange();
}

/** Forgets the saved preset, so the next time a room is joined the computer is measured again. */
export function redetect(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}

/** The graphics to use: the calibrated preset, or the player's own choices in manual mode. */
export function effectiveGraphics(): Graphics {
  if (settings.autoQuality) return TIERS[tier]!;
  return { renderScale: settings.renderScale, antialias: settings.antialias, bloom: settings.bloom, dust: settings.dust, particles: settings.particles };
}

/** Below this the preset is judged too slow (a 60 Hz screen normally shows 59-60). */
const FPS_LOW = 56;
/** Below this the machine is far off target, so skip a rung. */
const FPS_VERY_LOW = 25;
/** Seconds ignored at the start and after each change (shader compiles, buffer reallocation). */
const SETTLE_S = 1.2;
/** One measuring window. */
const WINDOW_S = 1;
/** Frames longer than this are hitches (tab switch, loading) and are not measured. */
const HITCH_S = 0.5;
/** Give up and keep the current preset after this much measured play time. */
const MAX_S = 20;
/** Hard limit including hitches, so entering the game can never be held up for long. */
const MAX_TOTAL_S = 20;
/** This many long frames in a row means the machine really is that slow, not that it hitched once. */
const SLOW_RUN = 4;

/**
 * One-time calibration. Feed it every rendered frame while the player is on the room screen: it starts at
 * the hardware guess and steps down until a preset holds 60 FPS, then reports the result and stops for good.
 */
export class Calibration {
  /** True once the result is final; further frames are ignored. */
  done = false;
  private clock = 0;
  /** Visible time including hitched frames. */
  private elapsed = 0;
  private frames = 0;
  private time = 0;
  private longRun = 0;
  private settleUntil = SETTLE_S;

  /**
   * @param onDone - Called once, with the final tier and the last measured FPS.
   */
  constructor(private readonly onDone: (tier: number, fps: number) => void) {}

  /**
   * Feed one rendered frame.
   * @param dt - Seconds the frame took.
   * @param visible - False while the tab is hidden (such frames say nothing about speed).
   */
  frame(dt: number, visible: boolean): void {
    if (this.done) return;
    if (visible && dt > 0) this.elapsed += dt;
    if (this.elapsed >= MAX_TOTAL_S) {
      this.finish(0);
      return;
    }
    if (!visible || dt <= 0) {
      this.resetWindow();
      this.longRun = 0;
      return;
    }
    if (dt > HITCH_S) {
      // One long frame is a hitch (ignored); a run of them means the machine really is that slow.
      this.resetWindow();
      if (++this.longRun < SLOW_RUN) return;
      this.longRun = 0;
      // Nothing lighter exists once the last rung is reached, so there is no point measuring further.
      setTier(Math.min(LAST, tier + 2), false);
      if (tier >= LAST) this.finish(1 / dt);
      return;
    }
    this.longRun = 0;
    this.clock += dt;
    if (this.clock < this.settleUntil) return;
    this.frames++;
    this.time += dt;
    if (this.time < WINDOW_S) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    if (fps >= FPS_LOW || tier >= LAST || this.clock >= MAX_S) {
      this.finish(fps);
      return;
    }
    // Too slow: try a lighter preset (two rungs if hopelessly slow) and measure again.
    setTier(tier + (fps < FPS_VERY_LOW ? 2 : 1), false);
    this.settleUntil = this.clock + SETTLE_S;
  }

  /** Throws away the current measuring window and waits for things to settle again. */
  private resetWindow(): void {
    this.frames = 0;
    this.time = 0;
    this.settleUntil = this.clock + SETTLE_S;
  }

  /** Saves the preset and stops. */
  private finish(fps: number): void {
    this.done = true;
    setTier(tier, true);
    this.onDone(tier, fps);
  }
}
