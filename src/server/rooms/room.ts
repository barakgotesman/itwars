/**
 * One room: the authoritative simulation for up to `MAX_PLAYERS` players. Owns the state and the public API
 * (join, enter, leave, input, step); the rules themselves live in `server/sim/*`, one system per file.
 * Driven by `step()` at 60 Hz; snapshots go out every `SNAPSHOT_EVERY` ticks through each player's `Conn`.
 */
import { MAX_NAME_LEN, MAX_PLAYERS, SNAPSHOT_EVERY } from '@shared/core/constants';
import { PLAYER_COLORS } from '@shared/core/characters';
import type { Aabb } from '@shared/core/physics';
import type { GameEvent, InputMsg } from '@shared/net/protocol';
import { DEFAULT_RULES, type MatchRules } from '@shared/rules/modes';
import type { PickupKind } from '@shared/rules/weapons';
import { Doors } from '@shared/world/doors';
import { DOORS, type DoorDef } from '@shared/world/map/door-layout';
import { PICKUP_SPOTS, SOLIDS, SPAWNS } from '@shared/world/map';
import { stepDoors } from '@server/sim/doors';
import type { Grenade } from '@server/sim/grenades';
import { tickGrenades } from '@server/sim/grenades';
import type { Loot } from '@server/sim/loot';
import { tickLoot } from '@server/sim/loot';
import { endByTime, restartMatch, spawn, startClockIfReady } from '@server/sim/match';
import { applyInputs, queueInput } from '@server/sim/movement';
import { newPlayer, type Conn, type Player } from '@server/sim/player';
import { tickPickups } from '@server/sim/pickups';
import { flushRoster, roster, sendSnapshots } from '@server/sim/snapshot';
import type { Sim } from '@server/sim/state';
import { makeRng } from '@server/sim/util';
import { tickWeapons } from '@server/sim/weapons';

export type { Conn } from '@server/sim/player';

/** Construction options; tests use them for determinism and custom maps. */
export interface RoomOptions {
  /** The host's match rules; defaults to Deathmatch to 50 with no time limit. */
  rules?: MatchRules;
  /** Seed for the room's random numbers (spread, spawn colours). */
  seed?: number;
  /** Collision geometry; defaults to the office. */
  solids?: readonly Aabb[];
  /** Spawn points as `[x, z]`; defaults to the office spawns. */
  spawns?: readonly (readonly [number, number])[];
  /** Sliding doors; defaults to the office doors, or none when custom `solids` are given. */
  doors?: readonly DoorDef[];
  /** Pickup spots; defaults to the office pickups. */
  pickups?: readonly { kind: PickupKind; x: number; z: number }[];
}

/** The authoritative game simulation for one room. */
export class Room implements Sim {
  /** Four-character join code. */
  readonly code: string;
  readonly rules: MatchRules;
  tick = 0;
  phase: 'play' | 'over' = 'play';
  winner = -1;

  readonly players = new Map<number, Player>();
  readonly solids: readonly Aabb[];
  /** Sliding doors; their collision boxes are part of `solids` and move in place. */
  readonly doors: Doors;
  doorsDirty = false;
  endsAt = 0;
  restartAt = 0;
  readonly spawns: readonly (readonly [number, number])[];
  readonly spots: readonly { kind: PickupKind; x: number; z: number }[];
  readonly pickupReady: number[];
  grenades: Grenade[] = [];
  nextGrenadeId = 1;
  loot: Loot[] = [];
  nextLootId = 1;
  events: GameEvent[] = [];
  rosterDirty = false;
  readonly rng: () => number;

  private nextPlayerId = 1;

  /**
   * @param code - The room's join code.
   * @param opts - Optional seed and map overrides (for tests).
   */
  constructor(code: string, opts: RoomOptions = {}) {
    this.code = code;
    this.rng = makeRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.rules = opts.rules ?? DEFAULT_RULES;
    this.doors = new Doors(opts.doors ?? (opts.solids ? [] : DOORS));
    this.solids = [...(opts.solids ?? SOLIDS), ...this.doors.boxes];
    this.spawns = opts.spawns ?? SPAWNS;
    this.spots = opts.pickups ?? PICKUP_SPOTS;
    this.pickupReady = this.spots.map(() => 0);
  }

  /** Number of players currently in the room. */
  get size(): number {
    return this.players.size;
  }

  /** True when nobody is in the room (it should be deleted). */
  get isEmpty(): boolean {
    return this.players.size === 0;
  }

  /** True when no more players fit. */
  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  /**
   * Adds a player and tells everyone. They wait in the lobby until `enter`.
   * @param conn - Where to send this player's messages.
   * @param name - Already-sanitised callsign.
   * @param look - Chosen character style and colour index (-1 or omitted = random colour).
   * @returns The new player's id, or null if the room is full.
   */
  join(conn: Conn, name: string, look: { model?: number; color?: number } = {}): number | null {
    if (this.isFull) return null;
    const id = this.nextPlayerId++;
    const color = PLAYER_COLORS[look.color ?? -1] ?? PLAYER_COLORS[Math.floor(this.rng() * PLAYER_COLORS.length)]!;
    this.players.set(id, newPlayer(id, this.uniqueName(name), conn, look.model ?? 0, color));
    conn.send({
      t: 'joined', id, code: this.code, players: roster(this), tick: this.tick,
      pickups: this.pickupReady.map((r) => (r <= this.tick ? '1' : '0')).join(''),
      loot: this.loot.map((l) => ({ id: l.id, from: l.from, x: l.x, y: l.y, z: l.z })),
      doors: this.doors.wire(),
      rules: this.rules,
    });
    this.rosterDirty = true;
    return id;
  }

  /**
   * Moves a player from the room lobby into the match (they clicked "Enter the office").
   * @param id - Player id from `join`.
   * @remarks During the intermission they wait and are spawned by the restart with everyone else.
   */
  enter(id: number): void {
    const p = this.players.get(id);
    if (!p || p.playing) return;
    p.playing = true;
    if (this.phase === 'play') spawn(this, p);
    startClockIfReady(this);
  }

  /** Appends a number if another player already uses the name, so the scoreboard stays unambiguous. */
  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
      const suffix = ` ${n}`;
      candidate = name.slice(0, MAX_NAME_LEN - suffix.length) + suffix;
    }
    return candidate;
  }

  /**
   * Removes a player; their grenades stay live.
   * @param id - Player id from `join`.
   */
  leave(id: number): void {
    if (this.players.delete(id)) this.rosterDirty = true;
  }

  /**
   * Queues one validated input command for the next ticks.
   * @param id - Sender's player id.
   * @param msg - Validated input message.
   */
  input(id: number, msg: InputMsg): void {
    const p = this.players.get(id);
    if (p) queueInput(p, msg);
  }

  /** Read-only view of a player's state, for tests and diagnostics. */
  inspect(id: number): Readonly<Player> | undefined {
    return this.players.get(id);
  }

  /** Ends the intermission now (tests use this to skip the wait). */
  restartMatch(): void {
    restartMatch(this);
  }

  /** Advances the simulation by one tick and sends snapshots when due. */
  step(): void {
    this.tick++;
    if (this.phase === 'over' && this.tick >= this.restartAt) restartMatch(this);

    stepDoors(this);
    if (this.phase === 'play' && this.endsAt > 0 && this.tick >= this.endsAt) endByTime(this);
    for (const p of this.players.values()) {
      applyInputs(this, p);
      if (p.playing && !p.alive && this.phase === 'play' && this.tick >= p.respawnAt) spawn(this, p);
      if (p.alive) tickWeapons(this, p);
    }
    tickPickups(this);
    tickLoot(this);
    tickGrenades(this);

    flushRoster(this);
    if (this.tick % SNAPSHOT_EVERY === 0) sendSnapshots(this);
  }
}
