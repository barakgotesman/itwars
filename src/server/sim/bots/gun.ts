/**
 * Bot gun handling: which weapon to hold at a distance (worked out from the `WEAPONS` data, so a new gun is
 * considered automatically), when to pull the trigger and when to reload. Keys follow the server's rules:
 * semi-automatic fire and reload need a fresh press, automatic fire is held.
 */
import { Key } from '@shared/core/constants';
import type { BotTuning } from '@shared/rules/bots';
import { WEAPONS, type WeaponDef } from '@shared/rules/weapons';
import type { Player } from '../player';
import type { Sim } from '../state';
import type { BotState } from './state';

/** Width (m) of the target a bullet has to hit, for the chance a shot lands. */
const TARGET_HALF_WIDTH = 0.35;
/** A weapon must be this much better than the one in hand before the bot swaps. */
const SWITCH_ADVANTAGE = 1.25;
/** Ticks between voluntary weapon swaps. */
const SWITCH_COOLDOWN = 90;
/** An empty magazine counts for little: the bot would have to reload first. */
const EMPTY_MAG_FACTOR = 0.3;
/** Beyond this distance (m) a bot aims down the sights. */
export const ADS_DISTANCE = 12;
/** Distances (m) a weapon is used at, as a fraction of where its damage starts to fall off. */
const IDEAL_RANGE_SHARE = 0.8;
const IDEAL_RANGE_MIN = 4;
const IDEAL_RANGE_MAX = 20;
/** Reload when the magazine is below this fraction and no enemy is in sight. */
const IDLE_RELOAD_BELOW = 0.4;

/** Damage multiplier at a distance, the same curve the server applies. */
function falloff(w: WeaponDef, d: number): number {
  if (d <= w.falloffStart) return 1;
  if (d >= w.falloffEnd) return w.minMul;
  return 1 - (1 - w.minMul) * ((d - w.falloffStart) / (w.falloffEnd - w.falloffStart));
}

/** How useful a weapon is at a distance: damage per second, discounted by how many shots will miss. */
function usefulness(p: Player, i: number, d: number, aiming: boolean): number {
  const w = WEAPONS[i]!;
  const mag = p.mag[i] ?? 0;
  const reserve = p.reserve[i] ?? 0;
  if (mag + reserve <= 0) return 0;
  const spread = aiming ? w.aimSpread : w.spread;
  const hitShare = Math.min(1, TARGET_HALF_WIDTH / Math.max(0.05, d * Math.max(spread, 0.002)));
  const dps = (w.damage * w.pellets * 60 / w.interval) * falloff(w, d) * hitShare;
  return mag <= 0 ? dps * EMPTY_MAG_FACTOR : dps;
}

/**
 * Picks the weapon to hold for a target `dist` metres away and remembers it in `st.wantWeapon`.
 * @returns The weapon index to put in the input.
 */
export function chooseWeapon(sim: Sim, p: Player, st: BotState, dist: number): number {
  const aiming = dist > ADS_DISTANCE;
  const current = usefulness(p, st.wantWeapon, dist, aiming);
  let best = st.wantWeapon;
  let bestScore = current;
  for (let i = 0; i < WEAPONS.length; i++) {
    const score = usefulness(p, i, dist, aiming);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  // Swap when clearly better, but not constantly; a gun with nothing left is dropped at once.
  const dry = current <= 0;
  if (best !== st.wantWeapon && (dry || (bestScore > current * SWITCH_ADVANTAGE && sim.tick - st.switchedAt >= SWITCH_COOLDOWN))) {
    st.wantWeapon = best;
    st.switchedAt = sim.tick;
  }
  return st.wantWeapon;
}

/** The range (m) a fight with this weapon is best fought at. */
export function idealRange(w: WeaponDef): number {
  return Math.min(IDEAL_RANGE_MAX, Math.max(IDEAL_RANGE_MIN, w.falloffStart * IDEAL_RANGE_SHARE));
}

/**
 * Decides the trigger for this tick.
 * @param ready - Everything that must be true to shoot (reaction time over, aimed, clear line, target hittable).
 * @returns `Key.Fire` or 0.
 */
export function trigger(sim: Sim, p: Player, st: BotState, tune: BotTuning, ready: boolean): number {
  const w = WEAPONS[p.weapon]!;
  const canShoot = ready && p.weapon === st.wantWeapon && p.reloadEnd === 0 && (p.mag[p.weapon] ?? 0) > 0;
  if (!canShoot) {
    st.fireHeld = false;
    st.firePulse = false;
    return 0;
  }
  if (w.auto) {
    // Bursts: hold for a while, release for a beat, so the gun is not emptied in one go.
    if (st.fireHeld && sim.tick >= st.burstUntil) { st.fireHeld = false; st.pauseUntil = sim.tick + tune.burstOff; }
    else if (!st.fireHeld && sim.tick >= st.pauseUntil) { st.fireHeld = true; st.burstUntil = sim.tick + tune.burstOn; }
    return st.fireHeld ? Key.Fire : 0;
  }
  // One shot per press: press, release the next tick, and wait for the gun to cycle.
  if (st.firePulse) { st.firePulse = false; return 0; }
  if (sim.tick >= st.semiNextAt) {
    st.firePulse = true;
    st.semiNextAt = sim.tick + w.interval + 2;
    return Key.Fire;
  }
  return 0;
}

/**
 * Decides whether to press reload this tick.
 * @param inFight - An enemy is in sight, so only a completely empty magazine is worth the time.
 * @returns `Key.Reload` or 0.
 */
export function reloadKey(p: Player, st: BotState, inFight: boolean): number {
  if (st.reloadPulse) { st.reloadPulse = false; return 0; }
  const w = WEAPONS[p.weapon]!;
  const mag = p.mag[p.weapon] ?? 0;
  const spare = p.reserve[p.weapon] ?? 0;
  if (p.reloadEnd !== 0 || spare <= 0 || mag >= w.magSize) return 0;
  if (mag === 0 || (!inFight && mag < w.magSize * IDLE_RELOAD_BELOW)) {
    st.reloadPulse = true;
    return Key.Reload;
  }
  return 0;
}
