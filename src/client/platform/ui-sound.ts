/**
 * Menu sounds: a soft blip when the pointer enters a button and a click when one is pressed (a deeper thump for the
 * big primary buttons), plus a tick that rises with a slider. Synthesised with Web Audio like every other sound, so
 * there are no files, and scaled by the master volume and the "Menu sounds" setting (Settings > Audio). Listeners sit on the document, so every current and
 * future button gets the sounds without wiring.
 * Browsers only start audio after a click or key press, so the very first hover in a fresh tab stays silent.
 */
import { settings } from './settings';

/** Menu sound level: the master volume times the player's "Menu sounds" setting. */
const level = () => settings.volume * settings.uiVolume;

/** Elements that count as controls. */
const CONTROL = 'button, a[href], summary, [role="button"], input[type="range"], input[type="checkbox"]';
/** Loudest a UI sound ever gets before the master volume scales it. */
const LEVEL = 0.22;

let ctx: AudioContext | null = null;
/** Control the pointer is currently over, so one entry makes one blip. */
let hovered: Element | null = null;
let lastTick = 0;

/**
 * Creates the audio context on first use (needs a user gesture) and resumes it.
 * @param fromGesture - True for a click: notes scheduled on a still-waking context play as soon as it runs, so the very
 * first click is heard. A hover is not a gesture, so it stays silent until the context is running.
 */
function audio(fromGesture = false): AudioContext | null {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return fromGesture || ctx.state === 'running' ? ctx : null;
}

/** One short square-wave note that glides from `f0` to `f1`. */
function blip(c: AudioContext, at: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'square'): void {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain * LEVEL * level(), at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/** A light blip for hovering a control. */
export function playHover(): void {
  const c = audio();
  if (!c || level() <= 0) return;
  blip(c, c.currentTime, 0.035, 1150, 1500, 0.45);
}

/**
 * The click of a pressed control.
 * @param primary - True for the big action buttons, which add a low thump.
 */
export function playClick(primary = false): void {
  const c = audio(true);
  if (!c || level() <= 0) return;
  const t = c.currentTime;
  blip(c, t, 0.045, 560, 380, 0.7);
  blip(c, t + 0.04, 0.06, 840, 700, 0.55);
  if (primary) blip(c, t, 0.14, 210, 90, 1, 'sine');
}

/** A tick that rises with a slider's value (0 to 1). */
function playSlider(value: number): void {
  const c = audio();
  if (!c || level() <= 0) return;
  blip(c, c.currentTime, 0.03, 600 + value * 900, 650 + value * 900, 0.4);
}

/** Starts the listeners. Call once at startup. */
export function initUiSound(): void {
  document.addEventListener('pointerover', (e) => {
    const target = (e.target as Element | null)?.closest(CONTROL) ?? null;
    if (target === hovered) return;
    hovered = target;
    if (target && !(target as HTMLButtonElement).disabled) playHover();
  });
  document.addEventListener('pointerleave', () => { hovered = null; });
  // The capture phase runs before any handler that might remove the button, and `pointerdown` also wakes the audio context.
  document.addEventListener('pointerdown', (e) => {
    const target = (e.target as Element | null)?.closest(CONTROL);
    if (!target || (target as HTMLButtonElement).disabled || (target as HTMLInputElement).type === 'range') return;
    playClick(target.classList.contains('btn'));
  }, true);
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'range') return;
    const now = performance.now();
    if (now - lastTick < 45) return;
    lastTick = now;
    const min = Number(el.min) || 0, max = Number(el.max) || 1;
    playSlider((Number(el.value) - min) / Math.max(1e-6, max - min));
  });
}
