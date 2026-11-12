/**
 * Who is in the room: names and shirt colours by id, join/leave announcements in the feed, and the
 * dirty flag that tells the scoreboard to redraw.
 */
import type { PlayerInfo } from '@shared/net/protocol';
import type { Feed } from './ports';

/** The room's roster as the local client sees it. */
export class RosterTracker {
  /** Latest roster from the server. */
  players: PlayerInfo[];
  /** The scoreboard must redraw. */
  dirty = true;

  /** Every name ever seen, so a kill by someone who just left still reads correctly. */
  private readonly names: Map<number, string>;
  private knownIds: Set<number>;

  /**
   * @param initial - The roster from the welcome message.
   * @param myId - The local player's id.
   * @param feed - Where join/leave lines go.
   */
  constructor(initial: readonly PlayerInfo[], private readonly myId: number, private readonly feed: Feed) {
    this.players = [...initial];
    this.names = new Map(initial.map((p) => [p.id, p.name]));
    this.knownIds = new Set(initial.map((p) => p.id));
  }

  /** Name piece for the feed; the local player is highlighted. */
  who(id: number): { text: string; tone: 'me' | 'name' } {
    return { text: id === this.myId ? 'You' : (this.names.get(id) ?? 'Someone'), tone: id === this.myId ? 'me' : 'name' };
  }

  /** A player's name, or undefined if never seen. */
  nameOf(id: number): string | undefined {
    return this.names.get(id);
  }

  /** A player's shirt colour, or undefined if they are not in the roster. */
  colorOf(id: number): number | undefined {
    return this.players.find((p) => p.id === id)?.color;
  }

  /** A player's spray-paint design index (0 if they are not in the roster). */
  sprayOf(id: number): number {
    return this.players.find((p) => p.id === id)?.spray ?? 0;
  }

  /** Announces joins and leaves by comparing the new roster with the last one. */
  update(players: readonly PlayerInfo[]): void {
    this.players = [...players];
    this.dirty = true;
    const ids = new Set(players.map((p) => p.id));
    for (const p of players) {
      this.names.set(p.id, p.name);
      if (!this.knownIds.has(p.id) && p.id !== this.myId) this.feed.push([this.who(p.id), { text: ' joined the session' }]);
    }
    for (const id of this.knownIds) if (!ids.has(id)) this.feed.push([this.who(id), { text: ' left the session' }]);
    this.knownIds = ids;
  }
}
