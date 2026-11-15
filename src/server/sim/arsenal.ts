/**
 * Handing out guns and ammo: the one place that knows what "owning" a weapon means, shared by spawning,
 * pickups and loot bags. Ownership is a bitmask on the player (`Player.guns`); an unowned gun has no ammo
 * and cannot be selected (`weapons.ts` ignores the switch).
 */
import { ownsBit, withGun } from '@shared/rules/loadout';
import { GUN_PICKUP_RESERVE_FRACTION, WEAPONS } from '@shared/rules/weapons';
import type { Player } from './player';

/** True when the player owns weapon `w`. */
export function owns(p: Player, w: number): boolean {
  return ownsBit(p.guns, w);
}

/**
 * Gives a player a gun they do not have: a full magazine plus `GUN_PICKUP_RESERVE_FRACTION` of its reserve.
 * @returns False (and nothing changes) if they already own it.
 */
export function giveGun(p: Player, w: number): boolean {
  const def = WEAPONS[w];
  if (!def || owns(p, w)) return false;
  p.guns = withGun(p.guns, w);
  p.mag[w] = def.magSize;
  p.reserve[w] = Math.floor(def.maxReserve * GUN_PICKUP_RESERVE_FRACTION);
  return true;
}

/**
 * Tops up the reserve of a gun the player owns by a fraction of its maximum (never above it).
 * @returns False if they do not own it or it is already full.
 */
export function giveAmmo(p: Player, w: number, fraction: number): boolean {
  const def = WEAPONS[w];
  if (!def || !owns(p, w) || p.reserve[w]! >= def.maxReserve) return false;
  p.reserve[w] = Math.min(def.maxReserve, p.reserve[w]! + Math.ceil(def.maxReserve * fraction));
  return true;
}

/** True when every gun the player owns has a full reserve (an ammo box would do nothing). */
export function ammoFull(p: Player): boolean {
  return WEAPONS.every((w, i) => !owns(p, i) || p.reserve[i]! >= w.maxReserve);
}
