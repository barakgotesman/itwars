/**
 * A bot in a fight: aims at the enemy, shoots when it is ready, strafes and keeps a sensible range.
 * Everything it does goes through ordinary input keys, so the server applies the usual rules.
 */
import { CHEST_Y, EYE_HEIGHT, Key } from '@shared/core/constants';
import type { BotTuning } from '@shared/rules/bots';
import { WEAPONS } from '@shared/rules/weapons';
import { hasLineOfSight } from '../combat';
import type { Player } from '../player';
import type { Sim } from '../state';
import { aimAt } from './aim';
import { ADS_DISTANCE, chooseWeapon, idealRange, reloadKey, trigger } from './gun';
import type { BotState } from './state';

/** What a fight wants this tick. */
export interface FightOut {
  yaw: number;
  pitch: number;
  keys: number;
  weapon: number;
}

/** Strafe flips are spread by this fraction either side so the dodging is not a metronome. */
const STRAFE_JITTER = 0.3;
/** Closer than this share of the ideal range the bot backs off; farther than the other it presses in. */
const TOO_CLOSE = 0.5;
const TOO_FAR = 1.3;
/** Chance per tick a bot that hops in fights does so. */
const HOP_CHANCE = 1 / 90;
/** A shot counts as lined up when the crosshair is within this much of the target body (m at the target) ... */
const AIM_CONE_WIDTH = 0.6;
/** ... plus this share of the current aim wander, so a sloppy bot also shoots when only roughly on target. */
const AIM_CONE_WANDER = 0.5;
/** Smallest cone (rad), so very close targets are not impossible to line up. */
const AIM_CONE_MIN = 0.02;

/**
 * Runs one tick of a fight against the bot's current target.
 * @returns The input to send, or null if the target is gone (the caller falls back to roaming or chasing).
 */
export function fight(sim: Sim, p: Player, st: BotState, tune: BotTuning): FightOut | null {
  const target = sim.players.get(st.targetId);
  if (!target || !target.alive || !target.playing) {
    st.visible = false;
    return null;
  }
  const s = p.state;
  const dist = Math.hypot(target.state.x - s.x, target.state.z - s.z);
  const weapon = chooseWeapon(sim, p, st, dist);
  const w = WEAPONS[p.weapon]!;
  const aim = aimAt(sim, p, st, tune, target);

  // Shoot only when the reaction time is over, the crosshair is near the target, the line is clear right now
  // (perception can be a tick old) and the target can be hurt.
  const cone = Math.max(AIM_CONE_MIN, Math.atan2(AIM_CONE_WIDTH, aim.dist) + AIM_CONE_WANDER * aim.amp);
  const los = hasLineOfSight(sim.solids, s.x, s.y + EYE_HEIGHT, s.z, target.state.x, target.state.y + CHEST_Y, target.state.z);
  const ready = sim.phase === 'play' && sim.tick >= st.engageStart + tune.reactionTicks && aim.angleErr < cone && los &&
    sim.tick >= p.blindEnd && sim.tick >= target.protectUntil;
  const fire = trigger(sim, p, st, tune, ready);
  if (fire) st.lastFire = { tick: sim.tick, los };

  let keys = fire | reloadKey(p, st, true);
  if (aim.dist > ADS_DISTANCE || w.zoom >= 2) keys |= Key.Aim;

  // Dodge side to side and hold a range that suits the weapon.
  if (sim.tick >= st.strafeAt) {
    st.strafeDir = sim.rng() < 0.5 ? 1 : -1;
    st.strafeAt = sim.tick + Math.round(tune.strafeSwitchTicks * (1 + (sim.rng() * 2 - 1) * STRAFE_JITTER));
  }
  keys |= st.strafeDir > 0 ? Key.Right : Key.Left;
  const ideal = idealRange(w);
  if (p.hp < tune.retreatHp) keys |= Key.Back; // badly hurt: back away while still shooting
  else if (dist > ideal * TOO_FAR) keys |= Key.Forward;
  else if (dist < ideal * TOO_CLOSE) keys |= Key.Back;
  if (tune.jumpsInFights && sim.rng() < HOP_CHANCE) keys |= Key.Jump;

  return { yaw: aim.yaw, pitch: aim.pitch, keys, weapon };
}
