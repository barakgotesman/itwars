/**
 * A Hard bot with the A4 paper in hand: when to cut and which swing to use. The keys are the ones a player presses
 * (left click = `Key.Fire`, right click = `Key.Aim`), so the server applies its usual cooldowns, wind-up and cone,
 * and a bot gets no reach or speed a human does not have.
 */
import { Key, PLAYER_RADIUS } from '@shared/core/constants';
import { lookDir } from '@shared/core/physics';
import { WEAPONS, type MeleeDef } from '@shared/rules/weapons';
import type { Player } from '../player';
import type { Sim } from '../state';
import type { BotState } from './state';

/** The bot swings a little before the target is at the very edge of the reach, so a step back does not save them. */
const REACH_MARGIN = 0.3;
/** A target slower than this (m/s) cannot step out of a heavy swing's narrow cone in time. */
const STILL_SPEED = 1.5;
/** Chance a good moment for the heavy stab is taken (the rest of the time the bot just slashes). */
const HEAVY_CHANCE = 0.6;
/** The crosshair must be this close (rad) to the target before a heavy stab is started: its cone is narrow. */
const HEAVY_AIM_ERR = 0.2;
/** Closer than this (m) the bot stops walking in. */
export const MELEE_STAND_OFF = 1.2;

/** The paper's data. */
export function meleeDef(): MeleeDef {
  return WEAPONS[5]!.melee!;
}

/** True when `target` is facing away from `p` (a back turned: a still, unaware target is the one to stab). */
function backTurned(p: Player, target: Player): boolean {
  const [lx, , lz] = lookDir(target.state.yaw, 0);
  const dx = p.state.x - target.state.x, dz = p.state.z - target.state.z;
  const d = Math.hypot(dx, dz);
  return d > 0.01 && (lx * dx + lz * dz) / (d * Math.hypot(lx, lz)) < -0.2;
}

/**
 * Decides the attack key for this tick.
 * @param ready - Everything that must be true to strike (reaction time over, aimed, clear line, target hittable).
 * @param dist - Horizontal distance to the target in metres.
 * @param angleErr - How far (rad) the crosshair is from the target.
 * @returns `Key.Fire` (slash), `Key.Aim` (heavy) or 0.
 */
export function meleeKey(sim: Sim, p: Player, st: BotState, target: Player, ready: boolean, dist: number, angleErr: number): number {
  // A key pressed last tick is let go this tick: the server only acts on a fresh press.
  if (st.meleePulse) { st.meleePulse = false; return 0; }
  const def = meleeDef();
  if (!ready || p.weapon !== st.wantWeapon || !WEAPONS[p.weapon]?.melee || p.meleeAt !== 0 || sim.tick < p.nextFire) return 0;
  const speed = Math.hypot(target.state.vx, target.state.vz);
  const heavyGood = (speed < STILL_SPEED || backTurned(p, target)) && target.hp > def.slash.damage &&
    angleErr < HEAVY_AIM_ERR && dist <= def.heavy.reach + PLAYER_RADIUS - REACH_MARGIN;
  if (heavyGood && sim.rng() < HEAVY_CHANCE) { st.meleePulse = true; return Key.Aim; }
  if (dist <= def.slash.reach + PLAYER_RADIUS - REACH_MARGIN) { st.meleePulse = true; return Key.Fire; }
  return 0;
}
