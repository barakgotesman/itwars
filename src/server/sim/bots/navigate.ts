/**
 * Bot navigation: picks roaming goals, plans paths on the shared grid, follows them with the same movement
 * keys a human would press, opens doors that block the way and recovers when stuck. Produces key bits and the
 * yaw the bot wants to face; the caller turns toward it at the bot's own turn rate.
 */
import { Key, PLAYER_RADIUS } from '@shared/core/constants';
import { rayVsAabb, type Aabb } from '@shared/core/physics';
import type { BotTuning } from '@shared/rules/bots';
import { DOOR_HEIGHT } from '@shared/world/map/door-layout';
import { findPath, lineWalkable, type Pt } from '@shared/world/nav';
import type { Player } from '../player';
import type { Sim } from '../state';
import { wrapAngle, yawTo } from './angles';
import type { BotState, GoalKind } from './state';

/** What navigation wants this tick. */
export interface NavOut {
  /** Movement, jump and use key bits. */
  keys: number;
  /** The direction the bot would like to look (along its route, or at a door it is opening). */
  faceYaw: number;
}

/** Distance (m) at which an intermediate waypoint counts as reached. */
const WAYPOINT_REACH = 0.9;
/** Distance (m) at which the final waypoint counts as reached. */
const ARRIVE = 1.2;
/** Ticks between planning again even when nothing changed (the world moves: doors, other players). */
const REPLAN_TICKS = 90;
/** A goal that moved further than this (m) needs a new path. */
const GOAL_MOVED = 2;
/** Ticks between stuck checks, and how far (m) the bot must have moved between them. */
const STUCK_EVERY = 20;
const STUCK_MOVE = 0.35;
/** Ticks a wanted key change must stay the same before the bot presses it, so keys do not flicker. */
const KEY_HOLD = 4;
/** Share of the desired direction a key needs before it is pressed. */
const DEAD_ZONE = 0.38;
/** The bot cuts across to the waypoint after the next one when it is this close (m) and the way is clear. */
const CORNER_CUT = 2;
/** Remaining route (m) above which a sprinting bot sprints. */
const SPRINT_DIST = 8;
/** How far ahead (m) a door is looked for, and how far off the panel's line the bot may stand and still be blocked. */
const DOOR_LOOK = 2.5;
/** Ticks before a bot presses use on the same door again, and before it gives up waiting for one. */
const DOOR_PAUSE = 30;
const DOOR_GIVE_UP = 240;
/** Largest angle (rad) between where the bot looks and the door for it to press use. */
const DOOR_FACE_TOL = 0.3;
/** Longest pause (ticks) after reaching a goal. */
const PAUSE_MAX = 60;
/** Roam goals are picked at least this far and at most this far from the bot (m). */
const ROAM_MIN = 10;
const ROAM_MAX = 45;
/** Roam goals remembered, so the bot does not walk back and forth between two spots. */
const RECENT_GOALS = 6;

/** Sends the bot to a point; the path is planned on the next free planning slot. */
export function setGoal(st: BotState, goal: Pt, kind: GoalKind = 'roam'): void {
  st.goal = goal;
  st.goalKind = kind;
  st.path = [];
  st.pathIdx = 0;
  st.pathGoal = null;
  st.forceReplan = false;
}

/** Picks the next roaming goal: a spawn or pickup spot, 10-45 m away, not one of the last few. */
export function pickRoamGoal(sim: Sim, p: Player, st: BotState): void {
  const pts: Pt[] = [...sim.spawns.map(([x, z]) => ({ x, z })), ...sim.spots.map((s) => ({ x: s.x, z: s.z }))];
  if (pts.length === 0) return;
  const fresh = pts.map((_, i) => i).filter((i) => !st.recent.includes(i));
  const near = fresh.filter((i) => {
    const d = Math.hypot(pts[i]!.x - p.state.x, pts[i]!.z - p.state.z);
    return d >= ROAM_MIN && d <= ROAM_MAX;
  });
  const pool = near.length > 0 ? near : fresh.length > 0 ? fresh : pts.map((_, i) => i);
  const pick = pool[Math.floor(sim.rng() * pool.length)]!;
  st.recent.push(pick);
  if (st.recent.length > RECENT_GOALS) st.recent.shift();
  setGoal(st, pts[pick]!);
}

/** Reused for the door test so the per-tick check allocates nothing. */
const scratch: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

/**
 * The door whose panel stands in the way along the heading (dx, dz), or -1.
 * @remarks Only doors the bot would cross are considered: walking along a wall past a door is not a block.
 */
function doorBlocking(sim: Sim, x: number, z: number, dx: number, dz: number): number {
  const defs = sim.doors.defs;
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i]!;
    if (Math.abs(d.x - x) > 7 || Math.abs(d.z - z) > 7) continue;
    if ((d.axis === 'x' ? Math.abs(dz) : Math.abs(dx)) < 0.3) continue;
    const b = sim.doors.boxes[i]!;
    const m = PLAYER_RADIUS + 0.05;
    scratch.minX = b.minX - m; scratch.maxX = b.maxX + m;
    scratch.minZ = b.minZ - m; scratch.maxZ = b.maxZ + m;
    scratch.minY = 0; scratch.maxY = DOOR_HEIGHT;
    const t = rayVsAabb(x, 0.9, z, dx, 0, dz, scratch);
    if (t !== null && t <= DOOR_LOOK) return i;
  }
  return -1;
}

/** Yaw toward the nearest point of a doorway, as the game's own door picking measures it. */
function yawToDoor(sim: Sim, i: number, x: number, z: number): number | null {
  const d = sim.doors.defs[i]!;
  const half = d.gap / 2;
  const px = d.axis === 'x' ? Math.min(d.x + half, Math.max(d.x - half, x)) : d.x;
  const pz = d.axis === 'z' ? Math.min(d.z + half, Math.max(d.z - half, z)) : d.z;
  return Math.hypot(px - x, pz - z) < 0.01 ? null : yawTo(px - x, pz - z);
}

/** Length (m) of the route still to walk, from the bot through the remaining waypoints. */
function routeLeft(st: BotState, x: number, z: number): number {
  let len = 0;
  let px = x, pz = z;
  for (let k = st.pathIdx; k < st.path.length; k++) {
    len += Math.hypot(st.path[k]!.x - px, st.path[k]!.z - pz);
    px = st.path[k]!.x; pz = st.path[k]!.z;
  }
  return len;
}

/**
 * Runs navigation for one bot for one tick.
 * @param sim - The room.
 * @param p - The bot's player record (alive).
 * @param st - Its memory.
 * @param tune - Its skill tuning.
 * @returns Key bits and the yaw it wants to face.
 */
export function navigate(sim: Sim, p: Player, st: BotState, tune: BotTuning): NavOut {
  const s = p.state;
  const tick = sim.tick;
  const stop: NavOut = { keys: 0, faceYaw: s.yaw };
  if (tick < st.idleUntil) { st.keys = 0; st.pendKeys = 0; return stop; }
  if (!st.goal) {
    pickRoamGoal(sim, p, st);
    if (!st.goal) return stop;
  }

  // Plan: when there is no route, the goal moved, the route is old or a search ended short. One search per room per tick.
  const stale = st.path.length === 0 || !st.pathGoal || Math.hypot(st.pathGoal.x - st.goal.x, st.pathGoal.z - st.goal.z) > GOAL_MOVED ||
    tick >= st.replanAt || st.forceReplan;
  if (stale && sim.lastPlanTick !== tick) {
    sim.lastPlanTick = tick;
    const path = findPath(sim.nav, s.x, s.z, st.goal.x, st.goal.z);
    if (!path || path.length === 0) {
      // Nowhere to go from here (or already there): take a short breather and choose again.
      st.goal = null; st.path = []; st.idleUntil = tick + 30;
      return stop;
    }
    st.path = path; st.pathIdx = 0; st.pathGoal = st.goal; st.replanAt = tick + REPLAN_TICKS; st.forceReplan = false;
  }
  if (st.path.length === 0) { st.keys = 0; st.pendKeys = 0; return stop; } // waiting for its turn to plan

  // Advance past waypoints that are reached.
  while (st.pathIdx < st.path.length) {
    const w = st.path[st.pathIdx]!;
    const last = st.pathIdx === st.path.length - 1;
    if (Math.hypot(w.x - s.x, w.z - s.z) < (last ? ARRIVE : WAYPOINT_REACH)) st.pathIdx++;
    else break;
  }
  if (st.pathIdx >= st.path.length) {
    if (Math.hypot(st.goal.x - s.x, st.goal.z - s.z) <= ARRIVE * 2) {
      st.goal = null; st.path = []; st.keys = 0; st.pendKeys = 0;
      st.idleUntil = tick + Math.floor(sim.rng() * PAUSE_MAX);
    } else {
      st.forceReplan = true; // a capped search ended short of the goal
    }
    return stop;
  }

  // Steer toward the waypoint, or the one after it when the corner can be cut.
  let target = st.path[st.pathIdx]!;
  const next = st.path[st.pathIdx + 1];
  if (next && Math.hypot(target.x - s.x, target.z - s.z) < CORNER_CUT && lineWalkable(sim.nav, s.x, s.z, next.x, next.z, true)) target = next;
  let dx = target.x - s.x;
  let dz = target.z - s.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  let faceYaw = yawTo(dx, dz);

  // A closed door in the way: stop, face it and press use; wait while it opens.
  let hold = false;
  let pulse = false;
  const door = tick < st.ignoreDoorsUntil ? -1 : doorBlocking(sim, s.x, s.z, dx, dz);
  if (door >= 0) {
    hold = true;
    if (st.holdSince === 0) st.holdSince = tick;
    if (tick - st.holdSince > DOOR_GIVE_UP) {
      // The door never finished (wedged, or another player keeps shutting it): push on and look for another way.
      st.ignoreDoorsUntil = tick + 120; st.holdSince = 0; st.forceReplan = true; hold = false;
    } else if (sim.doors.states[door]!.target < 1) {
      const toDoor = yawToDoor(sim, door, s.x, s.z);
      if (toDoor !== null) {
        faceYaw = toDoor;
        if (Math.abs(wrapAngle(toDoor - s.yaw)) < DOOR_FACE_TOL && tick >= st.doorReadyAt[door]! && sim.doors.pick(s.x, s.z, s.yaw) === door) {
          pulse = true;
          st.doorReadyAt[door] = tick + DOOR_PAUSE;
        }
      }
    }
  } else {
    st.holdSince = 0;
  }

  // Keys relative to where the bot is looking now, so it can walk one way while turning another.
  let want = 0;
  if (!hold) {
    const fwd = -Math.sin(s.yaw) * dx - Math.cos(s.yaw) * dz;
    const side = Math.cos(s.yaw) * dx - Math.sin(s.yaw) * dz;
    if (fwd > DEAD_ZONE) want |= Key.Forward;
    else if (fwd < -DEAD_ZONE) want |= Key.Back;
    if (side > DEAD_ZONE) want |= Key.Right;
    else if (side < -DEAD_ZONE) want |= Key.Left;
    if (tune.sprintWhenRoaming && fwd > 0.8 && routeLeft(st, s.x, s.z) > SPRINT_DIST) want |= Key.Sprint;
  }
  if (want !== st.pendKeys) { st.pendKeys = want; st.pendSince = tick; }
  // Stopping is immediate; starting or changing direction waits a few ticks so the keys do not flicker.
  if (want === 0 || tick - st.pendSince >= KEY_HOLD) st.keys = want;

  // Stuck check over a window in which the bot has been walking the whole time (waiting for a plan slot, a door
  // or a pause is not being stuck). Jump a lip, then replan, then give up on this goal.
  if (st.keys === 0 || hold) {
    st.checkAt = 0;
  } else if (st.checkAt === 0) {
    st.checkX = s.x; st.checkZ = s.z; st.checkAt = tick + STUCK_EVERY;
  } else if (tick >= st.checkAt) {
    if (Math.hypot(s.x - st.checkX, s.z - st.checkZ) < STUCK_MOVE) {
      st.stuck++;
      if (st.stuck === 1) st.jumpUntil = tick + 6;
      else if (st.stuck === 2) st.forceReplan = true;
      else { st.goal = null; st.path = []; st.stuck = 0; }
    } else {
      st.stuck = 0;
    }
    st.checkX = s.x; st.checkZ = s.z; st.checkAt = tick + STUCK_EVERY;
  }

  let keys = st.keys;
  if (tick < st.jumpUntil) keys |= Key.Jump;
  if (pulse) keys |= Key.Interact;
  return { keys, faceYaw };
}
