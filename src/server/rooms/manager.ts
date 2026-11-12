/**
 * Registry of live rooms: creates them with unique codes, deletes them when they empty out, and keeps the server
 * inside its load budget. Every human and every bot costs a measured share of the tick (`LoadModel`); the manager
 * refuses what does not fit and lets humans push bots out, so a busy server never gets slower for the people on it.
 */
import { CODE_ALPHABET, CODE_LEN } from '@shared/core/constants';
import type { MatchRules } from '@shared/rules/modes';
import { UNLIMITED, type LoadModel } from '../capacity';
import { Room } from './room';

/** What a menu needs to know to offer sensible choices right now. */
export interface ServerStatus {
  rooms: number;
  humans: number;
  bots: number;
  /** Share (0-1) of the budget in use. */
  load: number;
  /** Bots a room hosted right now could get (after the host's own seat). */
  botsAvailable: number;
  /** More players that fit before the server is full. */
  playersAvailable: number;
}

/** Owns every `Room` on this server, keyed by join code. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  /**
   * @param model - Measured cost of a human and a bot, and the budget to spend (no limit by default).
   * @param maxBots - Extra owner-set cap on bots across all rooms (`MAX_BOTS`).
   */
  constructor(private readonly model: LoadModel = UNLIMITED, private readonly maxBots = Infinity) {}

  /** All live rooms (for the tick loop). */
  all(): IterableIterator<Room> {
    return this.rooms.values();
  }

  /** Number of live rooms. */
  get count(): number {
    return this.rooms.size;
  }

  /** Humans across every room. */
  get humanCount(): number {
    let n = 0;
    for (const r of this.rooms.values()) n += r.humans;
    return n;
  }

  /** Bots across every room. */
  get botCount(): number {
    let n = 0;
    for (const r of this.rooms.values()) n += r.botCount;
    return n;
  }

  /** Tick time (ms) the current players and bots are expected to cost. */
  get loadMs(): number {
    return this.humanCount * this.model.msPerHuman + this.botCount * this.model.msPerBot;
  }

  /** Bots that fit after `extraHumans` more humans are counted, under both the time budget and the owner's cap. */
  private botsThatFit(extraHumans: number): number {
    const free = this.model.budgetMs - this.loadMs - extraHumans * this.model.msPerHuman;
    const byTime = this.model.msPerBot > 0 ? Math.floor(free / this.model.msPerBot + 1e-9) : Infinity;
    return Math.max(0, Math.min(byTime, this.maxBots - this.botCount));
  }

  /** Current load and what is still available, for `/api/info`. */
  status(): ServerStatus {
    const h = this.model.msPerHuman;
    const free = this.model.budgetMs - this.loadMs;
    return {
      rooms: this.rooms.size, humans: this.humanCount, bots: this.botCount,
      load: Number.isFinite(this.model.budgetMs) ? this.loadMs / this.model.budgetMs : 0,
      botsAvailable: Math.min(7, this.botsThatFit(1)),
      playersAvailable: h > 0 ? Math.max(0, Math.floor(free / h + 1e-9)) : 999,
    };
  }

  /**
   * Creates a room with a fresh random code.
   * @param rules - The host's match rules (already validated by `parseC2S`).
   * @returns The new room, or null if the server has no room left even for the host.
   * @remarks A host who asks for more bots than fit simply gets fewer.
   */
  create(rules?: MatchRules): Room | null {
    if (this.loadMs + this.model.msPerHuman > this.model.budgetMs + 1e-9) return null;
    let code: string;
    do {
      code = '';
      for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    } while (this.rooms.has(code));
    const capped = rules && rules.bots > 0 ? { ...rules, bots: Math.min(rules.bots, this.botsThatFit(1)) } : rules;
    const room = new Room(code, { rules: capped });
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Makes space for one more human in a room, pushing bots out if needed.
   * @returns False if the server is full of humans (no bot is left to drop); otherwise the caller may join.
   * @remarks Humans win over bots in two ways: a full room gives a seat up from a bot, and a server over its time
   * budget drops bots (from the room with the most) until the newcomer fits.
   */
  admit(room: Room): boolean {
    if (room.isFull && !room.dropBot()) return false;
    while (this.loadMs + this.model.msPerHuman > this.model.budgetMs + 1e-9) {
      let donor: Room | null = null;
      for (const r of this.rooms.values()) if (r.botCount > (donor ? donor.botCount : 0)) donor = r;
      if (!donor || !donor.dropBot()) return false;
    }
    return true;
  }

  /**
   * Looks a room up by code.
   * @param code - Normalised code.
   */
  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  /** Deletes the room if nobody is left in it. */
  prune(room: Room): void {
    if (room.isEmpty) this.rooms.delete(room.code);
  }
}
