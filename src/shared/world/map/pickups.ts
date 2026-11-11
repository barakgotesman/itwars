/**
 * Fixed pickup placements. Positions are floor points; `verify:map` checks each is outside solids and reachable.
 */
import type { PickupKind } from '@shared/rules/weapons';

/** One pickup spot on the floor. */
export interface PickupSpot {
  kind: PickupKind;
  x: number;
  z: number;
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
];
