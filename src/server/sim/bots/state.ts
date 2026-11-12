/**
 * What a bot remembers between ticks. One `BotState` per bot, kept in `Sim.bots`; the brain modules read and
 * write it and never touch the network.
 */
import type { Pt } from '@shared/world/nav';

/** Why the bot is travelling: what the current goal is for. */
export type GoalKind = 'roam' | 'chase' | 'investigate' | 'heal' | 'ammo' | 'loot';

/** Where an enemy was last seen, with how fast it was moving, and when. */
export interface Sighting {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  tick: number;
}

/** A sound the bot heard or an attack it felt: where it came from and when. */
export interface Noise {
  x: number;
  z: number;
  tick: number;
}

/** Per-bot memory. Grows as the brain gains abilities (navigation, perception, aim). */
export interface BotState {
  /** Sequence number of the last input this bot queued (inputs are numbered like a client's). */
  seq: number;

  // ---- navigation
  /** Where the bot is heading, or null when it needs a new goal. */
  goal: Pt | null;
  /** What the goal is for (kept after arrival so the decision layer knows what just finished). */
  goalKind: GoalKind;
  /** Smoothed waypoints to the goal (the start point is not included) and the one being walked to. */
  path: Pt[];
  pathIdx: number;
  /** The goal the current path was planned for, to notice when the goal moved. */
  pathGoal: Pt | null;
  /** Tick at which the path is planned again even if nothing changed. */
  replanAt: number;
  /** Plan again at the first chance (stuck, or a capped search ended short). */
  forceReplan: boolean;
  /** The bot stands still until this tick (a short pause after arriving). */
  idleUntil: number;
  /** Indices (into the waypoint list) of recent roam goals, so it does not ping-pong. */
  recent: number[];
  /** Movement keys currently pressed, and the keys it wants to switch to once they have held long enough. */
  keys: number;
  pendKeys: number;
  pendSince: number;
  /** Position at the last stuck check, the tick of the next check and how many checks in a row found no progress. */
  checkX: number;
  checkZ: number;
  checkAt: number;
  stuck: number;
  /** Tick until which Jump is held (clearing a desk lip). */
  jumpUntil: number;
  /** Per door: tick before which this bot will not press use on it again. */
  doorReadyAt: number[];
  /** Tick the bot started waiting for a door (0 = not waiting), and until when it ignores doors after giving up. */
  holdSince: number;
  ignoreDoorsUntil: number;

  // ---- perception
  /** The enemy it is watching (a player id), or -1. */
  targetId: number;
  /** The target is in sight right now. */
  visible: boolean;
  /** Tick the target came into continuous sight; the aim settles the longer it stays in view. */
  visibleSince: number;
  /** Tick the current fight began (the target first spotted after a quiet spell); the reaction delay counts from here. */
  engageStart: number;
  /** Where the target was last seen, or null once forgotten. */
  seen: Sighting | null;
  /** The last gunshot, explosion or attack heard. */
  heard: Noise | null;
  /** Whether the bot is walking to where it last saw an enemy. */
  chasing: boolean;
  /** It was in a fight last tick, so its old route is stale once the fight ends. */
  wasFighting: boolean;

  // ---- aim and fire
  /** Wandering aim error, in radians, that shrinks while the target stays in view. */
  errYaw: number;
  errPitch: number;
  /** This fight aims for the head, and the tick the choice is made again. */
  aimHead: boolean;
  aimRollAt: number;
  /** Automatic fire: trigger held now, until when, and the pause before the next burst. */
  fireHeld: boolean;
  burstUntil: number;
  pauseUntil: number;
  /** Trigger or reload key was pressed last tick, so this tick releases it (the server needs a fresh press). */
  firePulse: boolean;
  reloadPulse: boolean;
  /** Earliest tick for the next semi-automatic shot. */
  semiNextAt: number;
  /** Weapon the bot wants in hand, and the tick it last changed. */
  wantWeapon: number;
  switchedAt: number;
  /** Strafe direction in a fight (+1 right, -1 left) and the tick it flips. */
  strafeDir: 1 | -1;
  strafeAt: number;
  /** A hidden enemy's last position the bot is lining up a grenade for (tick = when it started), and the tick it may throw again. */
  throwAt: Noise | null;
  grenadeReadyAt: number;
  /** The last time the bot pressed fire: whether it had a clear line to the target (tests check this is never false). */
  lastFire: { tick: number; los: boolean } | null;
}

/** Fresh memory for a new bot. */
export function newBotState(doorCount: number): BotState {
  return {
    seq: 0, goal: null, goalKind: 'roam', path: [], pathIdx: 0, pathGoal: null, replanAt: 0, forceReplan: false, idleUntil: 0, recent: [],
    keys: 0, pendKeys: 0, pendSince: 0, checkX: 0, checkZ: 0, checkAt: 0, stuck: 0, jumpUntil: 0,
    doorReadyAt: new Array<number>(doorCount).fill(0), holdSince: 0, ignoreDoorsUntil: 0,
    targetId: -1, visible: false, visibleSince: 0, engageStart: 0, seen: null, heard: null, chasing: false, wasFighting: false,
    errYaw: 0, errPitch: 0, aimHead: false, aimRollAt: 0, fireHeld: false, burstUntil: 0, pauseUntil: 0,
    firePulse: false, reloadPulse: false, semiNextAt: 0, wantWeapon: 1, switchedAt: 0, strafeDir: 1, strafeAt: 0, throwAt: null, grenadeReadyAt: 0, lastFire: null,
  };
}

/** Forgets the route and goal (after dying or respawning, the old path no longer starts where the bot is). */
export function resetNavigation(st: BotState): void {
  st.goal = null;
  st.path = [];
  st.pathIdx = 0;
  st.pathGoal = null;
  st.forceReplan = false;
  st.keys = 0;
  st.pendKeys = 0;
  st.stuck = 0;
  st.jumpUntil = 0;
  st.holdSince = 0;
  st.idleUntil = 0;
  st.chasing = false;
  st.wasFighting = false;
}

/** Forgets everything about the current fight (after dying, or when the target is gone). */
export function resetCombat(st: BotState): void {
  st.targetId = -1;
  st.visible = false;
  st.seen = null;
  st.heard = null;
  st.errYaw = 0;
  st.errPitch = 0;
  st.fireHeld = false;
  st.firePulse = false;
  st.reloadPulse = false;
  st.throwAt = null;
}
