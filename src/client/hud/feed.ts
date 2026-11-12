/**
 * Event feed data: joins, leaves and kills. A kill reads "X [gun icon] Y". The pieces are drawn by
 * `ui/hud/FeedView.tsx`; `createFeed` in `ui/hud/feed-store.ts` fills it.
 */
import type { IconKind } from './gun-icons';

/** Colour of a text piece. */
export type Tone = 'name' | 'me' | 'dim' | 'kill';

/** One piece of a feed line: coloured text, or a weapon/grenade icon. */
export type FeedPart = { text: string; tone?: Tone } | { icon: IconKind };

/**
 * Plain-text version of a feed line, for other screens that show the same happenings (the wall scoreboards).
 * A kill line (name, weapon icon, name) reads "A killed B", or "A got killed" when it is a self-kill.
 * @param parts - The pieces of the feed line.
 * @param myName - Your real callsign, used instead of "You" so everyone's screens read the same.
 */
export function feedLineText(parts: readonly FeedPart[], myName: string): string {
  const names = parts.filter((p): p is { text: string; tone?: Tone } => 'text' in p);
  const nameOf = (p: { text: string; tone?: Tone }) => (p.tone === 'me' && p.text === 'You' ? myName : p.text);
  if (parts.some((p) => 'icon' in p) && names.length === 2) {
    const a = nameOf(names[0]!), b = nameOf(names[1]!);
    return a === b ? `${a} got killed` : `${a} killed ${b}`;
  }
  return names.map(nameOf).join('').replace(/\s+/g, ' ').trim();
}

/** Handle for adding lines to the feed. */
export interface Feed {
  /**
   * Adds one line. Pieces are coloured separately so names stand out from the action text.
   * @param parts - Text pieces and icons, in reading order.
   */
  push(parts: readonly FeedPart[]): void;
}
