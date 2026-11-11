/**
 * Event feed in the top-right corner: joins, leaves and kills, newest at the bottom, fading out.
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
  name: 'text-ink',
  me: 'text-accent',
  dim: 'text-dim',
  kill: 'text-danger',
};

/** Binds to the `#feed` element in `index.html`. */
export function createFeed(): Feed {
  const root = document.getElementById('feed') as HTMLElement;
  return {
    push(parts) {
      const line = document.createElement('div');
      line.className = 'feed-in flex items-center gap-2 bg-ground/75 px-2.5 py-1 text-sm font-bold transition-opacity duration-700';
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
      // A line that involves you gets an accent edge so you spot your own kills and deaths.
      if (parts.some((p) => 'tone' in p && p.tone === 'me')) line.classList.add('border-r-4', 'border-accent');
      root.append(line);
      while (root.childElementCount > MAX_LINES) root.firstElementChild?.remove();
      setTimeout(() => {
        line.classList.add('opacity-0');
        setTimeout(() => line.remove(), 800);
      }, LIFETIME_MS);
    },
  };
}
