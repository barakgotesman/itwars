/**
 * Keeps bots on the roof on maps with a void (`Sim.killY`). Navigation already plans only over floor, but a fight
 * (strafing, a hop, sprinting past a gap) or a jump over a parapet can still carry a bot off an edge, and a bot has no
 * fear of heights. So every tick, before its input is queued, the brain's keys are test-run on a copy of the body:
 * if holding them would take it below the floor, safer keys replace them (no jump or sprint, then the opposite way,
 * then standing still, then walking to the middle). Cheap: a bot with floor under its next 0.75 s skips the test run.
 */
import { Key, TICK_DT, SPRINT_SPEED, WALK_SPEED } from '@shared/core/constants';
import { stepMovement, type InputCmd, type PlayerState } from '@shared/core/physics';
import { floorUnder } from '@shared/world/nav';
import type { Player } from '../player';
import type { Sim } from '../state';

/** Ticks the test run holds the keys at most (1 s: longer than a whole jump, so a hop off an edge is seen to land in the void). */
const LOOKAHEAD = 60;
/** Below this height a body counts as having fallen off the roof. */
const FALLEN_Y = -0.3;
/** Movement keys the guard may change; everything else (fire, reload, use) is left alone. */
const MOVE = Key.Forward | Key.Back | Key.Left | Key.Right | Key.Sprint | Key.Jump;

/** What a brain decides each tick, as far as the guard cares. */
interface Cmd { keys: number; yaw: number; pitch: number; weapon: number }

/** The ground velocity the keys ask for, as `stepMovement` computes it. */
function wishVelocity(keys: number, yaw: number): { x: number; z: number } {
  let fwd = 0, side = 0;
  if (keys & Key.Forward) fwd += 1;
  if (keys & Key.Back) fwd -= 1;
  if (keys & Key.Right) side += 1;
  if (keys & Key.Left) side -= 1;
  const len = Math.hypot(fwd, side) || 1;
  fwd /= len; side /= len;
  const speed = keys & Key.Sprint ? SPRINT_SPEED : WALK_SPEED;
  return { x: (-Math.sin(yaw) * fwd + Math.cos(yaw) * side) * speed, z: (-Math.cos(yaw) * fwd - Math.sin(yaw) * side) * speed };
}

/** True if there is floor under where the body will be 0.25, 0.5 and 0.75 s from now with these keys. */
function floorAhead(sim: Sim, s: PlayerState, keys: number, yaw: number): boolean {
  const w = wishVelocity(keys, yaw);
  for (const t of [0.25, 0.5, 0.75]) {
    const x = s.x + ((s.vx + w.x) / 2) * t, z = s.z + ((s.vz + w.z) / 2) * t;
    if (!floorUnder(sim.solids, x, z)) return false;
  }
  return true;
}

/** True if holding `cmd` for `LOOKAHEAD` ticks takes a copy of the body below the floor. */
function fallsWith(sim: Sim, s: PlayerState, cmd: InputCmd): boolean {
  const c: PlayerState = { ...s };
  for (let i = 0; i < LOOKAHEAD; i++) {
    stepMovement(c, cmd, TICK_DT, sim.solids);
    if (c.y < FALLEN_Y) return true;
    // Back on the floor after the first few ticks (a jump leaves it at once): the run ends safely.
    if (c.onGround && i > 4) return false;
  }
  return false;
}

/** The movement keys that walk toward the middle of the map from where the body is. */
function towardCentre(s: PlayerState, yaw: number): number {
  const dx = -s.x, dz = -s.z;
  const len = Math.hypot(dx, dz) || 1;
  // Forward is (-sin, -cos) and right is (cos, -sin) in world x/z for a given yaw.
  const fwd = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / len;
  const right = (dx * Math.cos(yaw) + dz * -Math.sin(yaw)) / len;
  let keys = 0;
  if (fwd > 0.38) keys |= Key.Forward; else if (fwd < -0.38) keys |= Key.Back;
  if (right > 0.38) keys |= Key.Right; else if (right < -0.38) keys |= Key.Left;
  return keys;
}

/**
 * Returns the brain's input, with its movement keys swapped for safe ones if holding them would fall off the roof.
 * @param sim - The room (its `killY` says whether the map has a void).
 * @param p - The bot.
 * @param input - What the brain decided this tick.
 */
export function keepOnFloor<T extends Cmd>(sim: Sim, p: Player, input: T): T {
  if (sim.killY === null || !p.alive) return input;
  const s = p.state;
  const test = (keys: number): boolean => !fallsWith(sim, s, { keys, yaw: input.yaw, pitch: input.pitch, weapon: input.weapon });
  if (s.onGround && floorAhead(sim, s, input.keys, input.yaw) && floorUnder(sim.solids, s.x, s.z)) return input;
  if (test(input.keys)) return input;
  const rest = input.keys & ~MOVE;
  const moves = input.keys & MOVE;
  const walk = moves & ~(Key.Jump | Key.Sprint);
  // The same walk without a jump or sprint; the opposite way; standing still; the way to the middle.
  const swap = (walk & Key.Forward ? Key.Back : 0) | (walk & Key.Back ? Key.Forward : 0) | (walk & Key.Left ? Key.Right : 0) | (walk & Key.Right ? Key.Left : 0);
  for (const keys of [rest | walk, rest | swap, rest, rest | towardCentre(s, input.yaw)]) {
    if (test(keys)) return { ...input, keys };
  }
  return { ...input, keys: rest };
}
