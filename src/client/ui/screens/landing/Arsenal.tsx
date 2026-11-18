/**
 * "The arsenal": a spotlight carousel where the weapons are the show. Whatever is in the middle (a gun or a grenade) is
 * a real 3D model swinging side to side; the items either side are smaller, dimmer pixel icons that slide in and out as
 * the row turns, wrapping round for ever and fading out at both edges. It turns by itself all the time (each manual
 * step just restarts the wait), and can also be driven with the arrow buttons or arrow keys, by clicking a neighbour or
 * a dot, or by dragging. Only the middle item has any text: its name and type.
 */
import { useEffect, useRef, useState } from 'react';
import { createGunShowcase, type GunShowcase, type ShowcaseModel } from '@client/render/arsenal-showcase';
import { GunIcon } from '../../components/GunIcon';
import { Icon } from '../../components/Icon';
import type { IconKind } from '../../hud/gun-icons';
import { ARSENAL_INTRO, GRENADE_KINDS, GRENADE_NAMES, GUN_KINDS, GUN_NAMES } from './copy';
import { Section } from './Section';

/** One thing in the row. */
interface Item {
  icon: IconKind;
  name: string;
  kind: string;
  /** What the turntable shows for it. */
  model: ShowcaseModel;
}

/** Every weapon in key order, then the two grenades. */
const ITEMS: readonly Item[] = [
  ...GUN_NAMES.map((name, i): Item => ({ icon: i, name, kind: GUN_KINDS[i] ?? '', model: { weapon: i } })),
  ...GRENADE_NAMES.map((name, i): Item => ({ icon: i === 0 ? 'frag' : 'flash', name, kind: GRENADE_KINDS[i] ?? '', model: { grenade: i } })),
];
const N = ITEMS.length;

/** Milliseconds each item stays in the spotlight before the row turns. */
const DWELL_MS = 3200;
/** Distance (rem) between neighbouring slots. */
const SLOT_REM = 24;
/** Pointer travel (px) that counts as a drag to the next or previous item. */
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
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const showcase = useRef<GunShowcase | null>(null);
  const dragFrom = useRef<number | null>(null);
  /** False when WebGL is unavailable: the big pixel icon then stands in for the 3D model. */
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
    // The item already in the spotlight when the turntable comes up.
    sc.show(ITEMS[0]!.model);
    return () => {
      seen.disconnect();
      sized.disconnect();
      sc.dispose();
      showcase.current = null;
    };
  }, []);

  // Whenever the spotlight moves, bring in that item's model.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    showcase.current?.show(ITEMS[index]!.model);
  }, [index]);

  // The row turns by itself, always (unless the visitor prefers no motion). Any step, manual or not, restarts the wait.
  useEffect(() => {
    if (reduced) return undefined;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % N), DWELL_MS);
    return () => window.clearInterval(t);
  }, [reduced, index]);

  const go = (to: number) => setIndex(((to % N) + N) % N);

  return (
    <div className="overflow-x-clip">
      <Section id="arsenal" kicker="02 / The arsenal" title="Office supplies, repurposed" intro={ARSENAL_INTRO}>
        <div className="relative left-1/2 w-screen -translate-x-1/2">
          <div
            ref={stage}
            tabIndex={0}
            aria-label="Weapons. Use the left and right arrow keys to browse."
            className="fade-edges relative h-[31rem] cursor-grab select-none outline-offset-[-4px] active:cursor-grabbing"
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') go(index + 1);
              else if (e.key === 'ArrowLeft') go(index - 1);
            }}
            onPointerDown={(e) => { dragFrom.current = e.clientX; }}
            onPointerUp={(e) => {
              if (dragFrom.current !== null && Math.abs(e.clientX - dragFrom.current) > SWIPE_PX) go(index + (e.clientX < dragFrom.current ? 1 : -1));
              dragFrom.current = null;
            }}
            onPointerLeave={() => { dragFrom.current = null; }}
          >
            {/* A pool of light under the spotlight. */}
            <div className="pointer-events-none absolute left-1/2 top-[42%] h-80 w-[56rem] max-w-full -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,rgba(255,214,64,0.18),transparent_68%)]" />

            {/* Every item as a pixel icon at its slot: big in the middle (only without WebGL), small and dim beside it. */}
            {ITEMS.map((item, i) => {
              const d = offsetOf(i, index);
              const near = Math.abs(d);
              const centre = d === 0;
              const opacity = centre ? (webgl ? 0 : 1) : near === 1 ? 0.55 : near === 2 ? 0.22 : 0;
              const scale = centre ? 1.5 : 0.62;
              return (
                <button
                  key={item.name}
                  type="button"
                  tabIndex={-1}
                  aria-label={`Show ${item.name}`}
                  aria-current={centre || undefined}
                  className="absolute left-1/2 top-[42%] block w-72 cursor-pointer transition-[transform,opacity,filter] duration-700 ease-out hover:brightness-150 motion-reduce:transition-none"
                  style={{ transform: `translate(-50%, -50%) translateX(${d * SLOT_REM}rem) scale(${scale})`, opacity, pointerEvents: near > 2 || centre ? 'none' : 'auto' }}
                  onClick={() => go(i)}
                >
                  <GunIcon kind={item.icon} className="block h-36 w-full" />
                </button>
              );
            })}

            {/* The spotlight: the real 3D model. */}
            <canvas
              ref={canvas}
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[42%] h-[26rem] w-[56rem] max-w-full -translate-x-1/2 -translate-y-1/2"
              style={{ opacity: webgl ? 1 : 0 }}
            />

            {/* The only text: name and type of the item in the spotlight. */}
            <div key={current.name} className="feed-in pointer-events-none absolute inset-x-0 bottom-9 text-center" aria-live="polite">
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
                  className={`h-2 w-6 cursor-pointer transition-colors ${i === index ? 'bg-accent' : 'bg-raised hover:bg-faint'}`}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          </div>

          {/* Arrows sit outside the faded stage so they stay fully visible. */}
          <button
            type="button"
            className="btn-quiet absolute left-[max(1rem,calc(50%-36rem))] top-[42%] -translate-y-1/2 cursor-pointer !p-3"
            aria-label="Previous weapon"
            onClick={() => go(index - 1)}
          >
            <Icon name="prev" size={26} />
          </button>
          <button
            type="button"
            className="btn-quiet absolute right-[max(1rem,calc(50%-36rem))] top-[42%] -translate-y-1/2 cursor-pointer !p-3"
            aria-label="Next weapon"
            onClick={() => go(index + 1)}
          >
            <Icon name="next" size={26} />
          </button>
        </div>
      </Section>
    </div>
  );
}
