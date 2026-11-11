/**
 * Event feed in the top-left corner: joins, leaves and kills, newest at the bottom, fading out.
 * A kill reads "X [gun icon] Y".
 */
import { iconElement, type IconKind } from './gun-icons';

const MAX_LINES = 7;
const LIFETIME_MS = 7000;

/** Colour of a text piece. */
type Tone = 'name' | 'me' | 'dim' | 'kill';

/** One piece of a feed line: coloured text, or a weapon/grenade icon. */
export type FeedPart = { text: string; tone?: Tone } | { icon: IconKind };

/** Handle for adding lines to the feed. */
export interface Feed {
  /**
   * Adds one line. Pieces are coloured separately so names stand out from the action text.
   * @param parts - Text pieces and icons, in reading order.
   */
  push(parts: readonly FeedPart[]): void;
}

const TONE: Record<Tone, string> = {
  name: 'text-white',
  me: 'text-amber-300',
  dim: 'text-white/60',
  kill: 'text-red-400',
};

/** Binds to the `#feed` element in `index.html`. */
export function createFeed(): Feed {
  const root = document.getElementById('feed') as HTMLElement;
  return {
    push(parts) {
      const line = document.createElement('div');
      line.className = 'flex items-center gap-1.5 rounded bg-black/45 px-2 py-0.5 text-sm transition-opacity duration-700';
      for (const p of parts) {
        if ('icon' in p) {
          line.append(iconElement(p.icon, 'inline-block h-5 w-10 shrink-0'));
          continue;
        }
        const span = document.createElement('span');
        span.className = TONE[p.tone ?? 'dim'];
        span.textContent = p.text;
        line.append(span);
      }
      root.append(line);
      while (root.childElementCount > MAX_LINES) root.firstElementChild?.remove();
      setTimeout(() => {
        line.classList.add('opacity-0');
        setTimeout(() => line.remove(), 800);
      }, LIFETIME_MS);
    },
  };
}
