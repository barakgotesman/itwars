/**
 * Fixed pickup placements. Positions are floor points; `verify:map` checks each is outside solids and reachable.
 */
import type { PickupKind, WeaponId } from '@shared/rules/weapons';

/** One pickup spot on the floor. */
export interface PickupSpot {
  kind: PickupKind;
  x: number;
  z: number;
  /** Which gun, for `kind: 'weapon'`. */
  weapon?: WeaponId;
  /** Height the item floats at (a table top, say); the pickup test is horizontal, so this is visual only. Default floor. */
  y?: number;
}

/** Every pickup in the map, in a fixed order (indices are used in the protocol). */
export const PICKUP_SPOTS: readonly PickupSpot[] = [
  // Open plan: health and ammo around the lounge and cubicle aisles.
  { kind: 'hp', x: 0, z: -3 },
  { kind: 'ammo', x: -3, z: -3 },
  { kind: 'ammo', x: 3, z: -3 },
  { kind: 'hp', x: -33, z: -6 },
  { kind: 'hp', x: 33, z: -7 },
  { kind: 'ammo', x: -33, z: 4 },
  { kind: 'ammo', x: 33, z: 4 },
  { kind: 'grenade', x: 0, z: -14 },
  { kind: 'grenade', x: 0, z: 9 },
  // North rooms.
  { kind: 'hp', x: -45, z: -22 },
  { kind: 'ammo', x: -27, z: -25 },
  { kind: 'hp', x: -13, z: -22 },
  { kind: 'grenade', x: 2, z: -24 },
  { kind: 'ammo', x: -1.1, z: -29 },
  { kind: 'grenade', x: 7.5, z: -29 },
  { kind: 'hp', x: 18, z: -26 },
  { kind: 'ammo', x: 37, z: -25 },
  { kind: 'hp', x: 41, z: -29 },
  // South rooms.
  { kind: 'hp', x: -40, z: 20 },
  { kind: 'ammo', x: -21, z: 22 },
  { kind: 'grenade', x: -31, z: 24 },
  { kind: 'hp', x: 0, z: 20 },
  { kind: 'ammo', x: 22, z: 20 },
  { kind: 'grenade', x: 41, z: 22 },
  { kind: 'ammo', x: 8, z: 26 },
  // Guns (only active under the "pistol only" loadout). One copy north, one south, each in a room that fits it, so
  // both halves of the office are worth the walk: the Label Gun where labels and supplies live, the Paper Shredder
  // where paper goes to die, the Laser Pointer where presentations happen. Tuned against `npm run verify:map`.
  { kind: 'weapon', weapon: 1, x: 16, z: -29 },   // Print room
  { kind: 'weapon', weapon: 1, x: -24, z: 25 },   // Storage
  { kind: 'weapon', weapon: 2, x: 38, z: -23 },   // IT Helpdesk
  { kind: 'weapon', weapon: 2, x: -42, z: 24 },   // Break room
  { kind: 'weapon', weapon: 3, x: -44, z: -27 },  // Executive office
  { kind: 'weapon', weapon: 3, x: 22, z: 31 },    // Conference room, head of the table
];
