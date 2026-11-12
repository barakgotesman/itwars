/**
 * Bot aiming. The crosshair moves toward the target at a limited turn rate (a flick takes human time) and
 * wanders around it by an error that grows with distance and with the target's speed and shrinks while the
 * target stays in view. All numbers come from `BotTuning`.
 */
import { CHEST_Y, EYE_HEIGHT, MAX_PITCH, TICK_DT } from '@shared/core/constants';
import type { BotTuning } from '@shared/rules/bots';
import type { Player } from '../player';
import type { Sim } from '../state';
import { turnToward, wrapAngle, yawTo } from './angles';
import type { BotState } from './state';

/** Height above the feet a bot aims at when going for the head (the head box starts at 1.4 m). */
const HEAD_AIM_Y = 1.6;
/** Ticks between re-deciding whether a fight aims for the head. */
const HEAD_ROLL_TICKS = 45;
/** How quickly the wander decays each tick; with the noise term below it settles to a standard deviation of `amp`. */
const WANDER_KEEP = 0.92;
const WANDER_NOISE = Math.sqrt(1 - WANDER_KEEP * WANDER_KEEP);
/** The error never settles below this fraction of its starting size, however long the target stays in view. */
const SETTLE_FLOOR = 0.35;
/** Vertical error is smaller than horizontal: people drift sideways more than up and down. */
const PITCH_ERROR_SHARE = 0.6;

/** Where the bot is looking after this tick's aiming, and how far that is from the target. */
export interface AimResult {
  yaw: number;
  pitch: number;
  /** Angle (rad) between where the bot looks and the exact direction to the target. */
  angleErr: number;
  /** Straight-line distance to the aim point. */
  dist: number;
  /** Current size of the wander (standard deviation, rad). */
  amp: number;
}

/** Roughly normal random number (mean 0, deviation 1) from the room's seeded generator. */
function gauss(rng: () => number): number {
  return (rng() + rng() + rng() - 1.5) * 2;
}

/**
 * Turns the bot toward its target for one tick.
 * @param sim - The room.
 * @param p - The bot.
 * @param st - Its memory (the wander and head choice live here).
 * @param tune - Its skill tuning.
 * @param target - The enemy being aimed at.
 */
export function aimAt(sim: Sim, p: Player, st: BotState, tune: BotTuning, target: Player): AimResult {
  const s = p.state;
  const t = target.state;
  if (sim.tick >= st.aimRollAt) {
    st.aimHead = sim.rng() < tune.headshotBias;
    st.aimRollAt = sim.tick + HEAD_ROLL_TICKS;
  }
  const dx = t.x - s.x;
  const dz = t.z - s.z;
  const dy = t.y + (st.aimHead ? HEAD_AIM_Y : CHEST_Y) - (s.y + EYE_HEIGHT);
  const flat = Math.hypot(dx, dz);
  const speed = Math.hypot(t.vx, t.vz);

  const settle = Math.max(SETTLE_FLOOR, 0.5 ** ((sim.tick - st.visibleSince) / tune.errorSettleTicks));
  const amp = tune.aimError * (0.5 + Math.min(flat, 40) / 20) * (1 + tune.errorPerSpeed * speed) * settle;
  st.errYaw = st.errYaw * WANDER_KEEP + gauss(sim.rng) * amp * WANDER_NOISE;
  st.errPitch = st.errPitch * WANDER_KEEP + gauss(sim.rng) * amp * PITCH_ERROR_SHARE * WANDER_NOISE;

  const trueYaw = yawTo(dx, dz);
  const truePitch = Math.atan2(dy, flat);
  const step = tune.turnRate * TICK_DT;
  const yaw = turnToward(s.yaw, trueYaw + st.errYaw, step);
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, turnToward(s.pitch, truePitch + st.errPitch, step)));
  const angleErr = Math.hypot(wrapAngle(yaw - trueYaw) * Math.cos(truePitch), pitch - truePitch);
  return { yaw, pitch, angleErr, dist: Math.hypot(dx, dy, dz), amp };
}
