/**
 * Loadouts: which guns a player spawns with. A room's rules pick one (`MatchRules.loadout`); the default makes
 * everyone start with the pistol and find the other guns on the map, the other restores the full arsenal.
 * Ownership travels as a bitmask (bit `w` set = weapon `w` owned) so it fits one number in snapshots.
 */
import type { WeaponId } from './weapons';

/** Index into `LOADOUTS`. */
export type LoadoutId = 0 | 1;

/** One way to equip players at spawn. */
export interface LoadoutDef {
  name: string;
  hint: string;
  /** Guns owned at spawn; the first is the one in hand. */
  startWeapons: readonly WeaponId[];
  /** Whether the weapon pickups placed in the map are active (pointless when everyone owns every gun). */
  mapGuns: boolean;
}

/** Every loadout, in setup-screen order. The first is the default. */
export const LOADOUTS: readonly LoadoutDef[] = [
  { name: 'Pistol only', hint: 'Everyone spawns with the Stapler .45; the other guns are pickups hidden around the office.', startWeapons: [0], mapGuns: true },
  // The SMG in hand, as the game always spawned players before loadouts existed.
  { name: 'Full arsenal', hint: 'Everyone spawns with all four guns.', startWeapons: [1, 0, 2, 3], mapGuns: false },
];

/** Loadout ids offered on the setup screen. */
export const LOADOUT_IDS: readonly number[] = LOADOUTS.map((_, i) => i);
/** Names in the same order, for the setup screen's choice labels. */
export const LOADOUT_NAMES: readonly string[] = LOADOUTS.map((l) => l.name);

/** The loadout a rules value picks (falls back to the default for anything unknown). */
export function loadoutOf(loadout: number): LoadoutDef {
  return LOADOUTS[loadout] ?? LOADOUTS[0]!;
}

/** True when bit `w` is set in an ownership mask. */
export function ownsBit(mask: number, w: number): boolean {
  return (mask & (1 << w)) !== 0;
}

/** The mask with weapon `w` added. */
export function withGun(mask: number, w: number): number {
  return mask | (1 << w);
}

/** Ownership mask for a list of weapons. */
export function maskOf(weapons: readonly number[]): number {
  return weapons.reduce((m, w) => withGun(m, w), 0);
}

/** True when weapon `w` is part of the loadout's spawn kit (a starter gun is never dropped on death). */
export function isStarter(loadout: number, w: number): boolean {
  return loadoutOf(loadout).startWeapons.includes(w as WeaponId);
}
