/**
 * A small "i" badge that shows a longer explanation in a bubble on hover or keyboard focus, so a screen can stay
 * short and still explain each option (used by the Game setup rows). The bubble is positioned against the window
 * when it opens: below the badge if it fits, above it otherwise, and never past the left or right edge, so it is
 * never cut off.
 */
import { useState } from 'react';

/** Bubble width in px (matches `w-64`). */
const WIDTH = 256;
/** Gap between badge and bubble, and the margin kept to the window edge, in px. */
const GAP = 8;
/** Rough characters per line and line height of the bubble text, to know its height before it is drawn. */
const CHARS_PER_LINE = 38;
const LINE_PX = 16;
const PAD_PX = 20;

/** Where the open bubble sits, in window coordinates. */
interface Pos {
  top: number;
  left: number;
}

/** Renders the badge and its bubble; `text` is also the accessible name. */
export function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<Pos | null>(null);

  const open = (el: HTMLElement) => {
    const b = el.getBoundingClientRect();
    const height = Math.ceil(text.length / CHARS_PER_LINE) * LINE_PX + PAD_PX;
    const fitsBelow = b.bottom + GAP + height + GAP <= window.innerHeight;
    const top = fitsBelow ? b.bottom + GAP : Math.max(GAP, b.top - GAP - height);
    const left = Math.min(Math.max(GAP, b.left), window.innerWidth - WIDTH - GAP);
    setPos({ top, left });
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={text}
        className="flex h-5 w-5 cursor-help items-center justify-center bg-raised text-[11px] font-black text-dim hover:text-ink focus-visible:text-ink"
        onMouseEnter={(e) => open(e.currentTarget)}
        onFocus={(e) => open(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onBlur={() => setPos(null)}
      >
        i
      </button>
      {pos && (
        <span
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: WIDTH }}
          className="slab pointer-events-none fixed z-50 bg-raised p-2.5 text-xs font-medium text-ink"
        >
          {text}
        </span>
      )}
    </span>
  );
}
