/**
 * "The arsenal": a spotlight carousel where the weapons are the show. The weapon in the middle is a real 3D model (the
 * game's own, swinging side to side); the ones either side are smaller, dimmer pixel icons that slide in and out as the
 * row turns, wrapping round for ever and fading out at both edges. It turns by itself, pauses on hover, and can be
 * driven by clicking a neighbour, a dot or a swipe. Only the middle item has any text: its name and type.
 */
import { useEffect, useRef, useState } from 'react';
import { createGunShowcase, type GunShowcase } from '@client/render/arsenal-showcase';
import { GunIcon } from '../../components/GunIcon';
import type { IconKind } from '../../hud/gun-icons';
import { ARSENAL_INTRO, GRENADE_KINDS, GRENADE_NAMES, GUN_KINDS, GUN_NAMES } from './copy';
import { Section } from './Section';

/** One thing in the row. */
interface Item {
  icon: IconKind;
  name: string;
  kind: string;
  /** Index into `WEAPONS` when there is a 3D model to show (grenades have none and show their big icon). */
  weapon?: number;
}

/** Every weapon in key order, then the two grenades. */
const ITEMS: readonly Item[] = [
  ...GUN_NAMES.map((name, i): Item => ({ icon: i, name, kind: GUN_KINDS[i] ?? '', weapon: i })),
  ...GRENADE_NAMES.map((name, i): Item => ({ icon: i === 0 ? 'frag' : 'flash', name, kind: GRENADE_KINDS[i] ?? '' })),
];
const N = ITEMS.length;

/** Milliseconds each item stays in the spotlight before the row turns. */
const DWELL_MS = 3200;
/** Distance (rem) between neighbouring slots. */
const SLOT_REM = 24;
/** Pointer travel (px) that counts as a swipe. */
const SWIPE_PX = 40;

/** Signed distance of item `i` from the spotlight, wrapped into [-N/2, N/2). */
function offsetOf(i: number, index: number): number {
  return ((i - index + N + N / 2) % N) - N / 2;
}

/** True when the browser can make a WebGL context (a throwaway canvas is asked once, when the section first renders). */
function hasWebgl(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl') !== null;
  } catch {
    return false;
  }
}

/** The arsenal section. */
export function Arsenal() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const showcase = useRef<GunShowcase | null>(null);
  const swipeFrom = useRef<number | null>(null);
  /** False when WebGL is unavailable: the big pixel icon then stands in for the 3D weapon. */
  const [webgl] = useState(hasWebgl);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const current = ITEMS[index]!;

  // The turntable lives as long as the section; it only draws while the stage is on screen.
  useEffect(() => {
    const el = canvas.current, st = stage.current;
    if (!el || !st) return undefined;
    let sc: GunShowcase;
    try {
      sc = createGunShowcase(el);
    } catch {
      return undefined;
    }
    showcase.current = sc;
    const seen = new IntersectionObserver(([e]) => sc.setActive(e?.isIntersecting === true), { threshold: 0.1 });
    seen.observe(st);
    const sized = new ResizeObserver(() => sc.resize());
    sized.observe(el);
    // The weapon already in the spotlight when the turntable comes up.
    const first = ITEMS[0]!.weapon;
    if (first !== undefined) sc.show(first);
    return () => {
      seen.disconnect();
      sized.disconnect();
      sc.dispose();
      showcase.current = null;
    };
  }, []);

  // Whenever the spotlight moves, bring in that weapon's model.
  const weapon = current.weapon;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (weapon !== undefined) showcase.current?.show(weapon);
  }, [weapon, index]);

  // The row turns by itself, unless the pointer is on it or the visitor prefers no motion.
  useEffect(() => {
    if (paused || reduced) return undefined;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % N), DWELL_MS);
    return () => window.clearInterval(t);
  }, [paused, reduced, index]);

  const go = (to: number) => setIndex(((to % N) + N) % N);
  const has3d = current.weapon !== undefined && webgl;

  return (
    <div className="overflow-x-clip">
      <Section id="arsenal" kicker="02 / The arsenal" title="Office supplies, repurposed" intro={ARSENAL_INTRO}>
        <div className="relative left-1/2 w-screen -translate-x-1/2">
          <div
            ref={stage}
            className="fade-edges relative h-[31rem] select-none"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onPointerDown={(e) => { swipeFrom.current = e.clientX; }}
            onPointerUp={(e) => {
              if (swipeFrom.current !== null && Math.abs(e.clientX - swipeFrom.current) > SWIPE_PX) go(index + (e.clientX < swipeFrom.current ? 1 : -1));
              swipeFrom.current = null;
            }}
          >
            {/* A pool of light under the spotlight. */}
            <div className="pointer-events-none absolute left-1/2 top-[42%] h-80 w-[56rem] max-w-full -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(255,214,64,0.18),transparent_68%)]" />

            {/* Every item as a pixel icon at its slot: big in the middle (only when it has no 3D model), small and dim beside it. */}
            {ITEMS.map((item, i) => {
              const d = offsetOf(i, index);
              const near = Math.abs(d);
              const centre = d === 0;
              const opacity = centre ? (has3d ? 0 : 1) : near === 1 ? 0.55 : near === 2 ? 0.22 : 0;
              const scale = centre ? 1.5 : 0.62;
              return (
                <button
                  key={item.name}
                  type="button"
                  tabIndex={near <= 2 && !centre ? 0 : -1}
                  aria-label={`Show ${item.name}`}
                  aria-current={centre || undefined}
                  className="absolute left-1/2 top-[42%] block w-72 cursor-pointer transition-[transform,opacity] duration-700 ease-out motion-reduce:transition-none"
                  style={{ transform: `translate(-50%, -50%) translateX(${d * SLOT_REM}rem) scale(${scale})`, opacity, pointerEvents: near > 2 || centre ? 'none' : 'auto' }}
                  onClick={() => go(i)}
                >
                  <GunIcon kind={item.icon} className="block h-36 w-full" />
                </button>
              );
            })}

            {/* The spotlight: the real 3D weapon. */}
            <canvas
              ref={canvas}
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[42%] h-[26rem] w-[56rem] max-w-full -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300"
              style={{ opacity: has3d ? 1 : 0 }}
            />

            {/* The only text: name and type of the weapon in the spotlight. */}
            <div key={current.name} className="feed-in absolute inset-x-0 bottom-9 text-center" aria-live="polite">
              <h3 className="text-4xl font-black uppercase tracking-wide">{current.name}</h3>
              <p className="label !text-accent">{current.kind}</p>
            </div>

            {/* Dots: one per item, the lit one is the spotlight. */}
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
              {ITEMS.map((item, i) => (
                <button
                  key={item.name}
                  type="button"
                  aria-label={`Show ${item.name}`}
                  className={`h-2 w-6 transition-colors ${i === index ? 'bg-accent' : 'bg-raised hover:bg-faint'}`}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
