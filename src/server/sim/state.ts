/**
 * The mutable state of one room that the simulation systems (`movement`, `weapons`, `grenades`, ...)
 * read and write. `Room` implements it; each system is a set of plain functions over this shape.
 */
import type { Aabb } from '@shared/core/physics';
import type { GameEvent } from '@shared/net/protocol';
import type { MatchRules } from '@shared/rules/modes';
import type { PickupKind } from '@shared/rules/weapons';
import type { Doors } from '@shared/world/doors';
import type { NavGrid } from '@shared/world/nav';
import type { BotState } from './bots/state';
import type { Grenade } from './grenades';
import type { Loot } from './loot';
import type { Player } from './player';

/** A pickup location from the map. */
export interface PickupSpot {
  kind: PickupKind;
  x: number;
  z: number;
}

/** Everything the systems share. All timers are integer ticks. */
export interface Sim {
  /** Mode, kill limit and time limit for every match in this room. */
  readonly rules: MatchRules;
  /** Current tick. */
  tick: number;
  /** `play` during a round, `over` during the intermission. */
  phase: 'play' | 'over';
  /** Id of the last round's winner, or -1. */
  winner: number;
  readonly players: Map<number, Player>;
  /** Id of the player who created the room (the first human to join); only they may start the match. Null once they leave with nobody else to take over. */
  hostId: number | null;
  /** Static collision plus the doors' moving boxes. */
  readonly solids: readonly Aabb[];
  readonly doors: Doors;
  /** A door moved since the last snapshot, so the next one carries door states. */
  doorsDirty: boolean;
  /** Tick at which the match clock runs out, or 0 while it is not running (no limit, or waiting for a second player). */
  endsAt: number;
  /** Tick the intermission ends. */
  restartAt: number;
  readonly spawns: readonly (readonly [number, number])[];
  readonly spots: readonly PickupSpot[];
  /** Tick each pickup becomes active again (0 = active now). */
  readonly pickupReady: number[];
  grenades: Grenade[];
  nextGrenadeId: number;
  loot: Loot[];
  nextLootId: number;
  /** One-off events since the last snapshot. */
  events: GameEvent[];
  /** The roster (names, scores) changed and must be re-sent. */
  rosterDirty: boolean;
  /** The room's seeded random numbers. */
  rng(): number;
  /** Walkable grid of the static map (doors are not in it), built on first use. */
  readonly nav: NavGrid;
  /** Brain memory of each bot, by player id. */
  readonly bots: Map<number, BotState>;
  /** Last tick a bot ran a path search; only one search per room per tick keeps the cost flat. */
  lastPlanTick: number;
}
