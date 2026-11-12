/**
 * The interfaces the plain-TypeScript game talks through to reach the HUD and the event feed, owned by
 * `game/` so the game never imports React code. `ui/hud/hud-store.ts` and `ui/hud/feed-store.ts` implement
 * these; `ui/session.ts` builds the implementations and hands them to `startGame` (see `game/index.ts`).
 */
import type { MeState, PlayerInfo } from '@shared/net/protocol';

/** Which icon a feed line or HUD slot shows: a weapon index 0-3, a grenade, or a headshot skull. */
export type IconKind = number | 'frag' | 'flash' | 'head';

/** Handle for pushing state into the HUD. */
export interface Hud {
  /** Shows or hides the whole HUD. */
  show(visible: boolean): void;
  /** Refreshes every element from the latest private state. */
  update(me: MeState): void;
  /** Flashes the red damage vignette. */
  hurt(): void;
  /** Flashes the hit marker; red and bigger for headshots and kills. */
  hitMarker(kind: 'hit' | 'head' | 'kill'): void;
  /** Shows a fading arrow pointing at where damage came from. @param angle - Radians clockwise from straight ahead. */
  damageFrom(angle: number): void;
  /** Shows or hides the scoreboard; rows are sorted by kills. */
  scoreboard(visible: boolean, players: readonly PlayerInfo[], myId: number): void;
  /** Updates the "you vs the leader" strip at the top of the screen. */
  standings(players: readonly PlayerInfo[], myId: number): void;
  /** Names who killed you on the death screen, or clears it with null. */
  killedBy(name: string | null, icon?: IconKind): void;
  /** Shows a big message (match winner) or hides it with null. */
  banner(title: string | null, sub?: string): void;
  /** Shows or hides the sniper scope overlay. */
  scope(visible: boolean): void;
  /** Shows an FPS readout, or hides it with null. */
  fps(text: string | null): void;
}

/** Colour of a feed text piece. */
export type Tone = 'name' | 'me' | 'dim' | 'kill';

/** One piece of a feed line: coloured text, or a weapon/grenade icon. */
export type FeedPart = { text: string; tone?: Tone } | { icon: IconKind };

/** Handle for adding lines to the event feed. */
export interface Feed {
  /**
   * Adds one line. Pieces are coloured separately so names stand out from the action text.
   * @param parts - Text pieces and icons, in reading order.
   */
  push(parts: readonly FeedPart[]): void;
}

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
