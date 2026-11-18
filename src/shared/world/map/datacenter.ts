/**
 * The Data Center: a small deathmatch map (32 x 26 m) for two to four players. Built independently of the
 * office with its own local registries (`local-builder.ts`), and inside the office's footprint so the shared
 * navigation grid covers it unchanged.
 *
 * Layout (north is -z):
 *   north lane  z -13..-7   cooling units, the control room (sliding glass door, z -13..-9) in the middle
 *   north racks z  -7..-5   two back-to-back rows of server racks either side of the central bay
 *   central bay z  -5..5    the full-width open band: the fight, and the post-match podium at the origin
 *   south racks z   5..7    mirror of the north racks
 *   south lane  z   7..13   open floor, the tape vault (sliding door, x 10..16, z 9..13) in the south-east corner
 *
 * Every rack block has a 1.1 m crack in its middle to slip through. Cover in the bay is two crates, so the
 * podium spot at the origin stays clear. Used by `rules.map === 1` rooms (see `maps.ts`).
 */
import type { Aabb } from '@shared/core/physics';
import { CEILING_H, LINTEL_Y, WALL_T } from './builder';
import { DOOR_OFFSET, type DoorDef } from './door-layout';
import { createLocalMap } from './local-builder';
import type { PickupSpot } from './pickups';
import type { BoardSpec, LabelSpec, LightSource, MapBox } from './types';
import type { Zone } from './zones';

const m = createLocalMap();
const { box, floor, stripe, lamp, plaque } = m;

/** Playable area (the walls stand just outside it). */
const X0 = -16, X1 = 16, Z0 = -13, Z1 = 13;
const MID_Z = (Z0 + Z1) / 2;
/** Width of a doorway; matches the office. */
const GAP = 3.2;

// Floor: dark raised-floor plates, a lighter tile band down the central bay.
floor('floorDark', X0 - WALL_T, X1 + WALL_T, Z0 - WALL_T, -5);
floor('tile', X0 - WALL_T, X1 + WALL_T, -5, 5);
floor('floorDark', X0 - WALL_T, X1 + WALL_T, 5, Z1 + WALL_T);
// Hazard strips mark the bay's edge along both rows of racks.
for (const z of [-5.2, 5.2]) stripe('hazard', X0, X1, z - 0.1, z + 0.1);

// Outer walls and ceiling: unbroken boxes.
box('wall', 0, 0, Z0 - WALL_T / 2, X1 - X0 + 2 * WALL_T, CEILING_H, WALL_T);
box('wall', 0, 0, Z1 + WALL_T / 2, X1 - X0 + 2 * WALL_T, CEILING_H, WALL_T);
box('wall', X0 - WALL_T / 2, 0, MID_Z, WALL_T, CEILING_H, Z1 - Z0);
box('wall', X1 + WALL_T / 2, 0, MID_Z, WALL_T, CEILING_H, Z1 - Z0);
box('ceiling', 0, CEILING_H, MID_Z, X1 - X0 + 2 * WALL_T, 0.3, Z1 - Z0 + 2 * WALL_T);
// Wainscot and a blue rail along every outer wall (flat, non-solid).
box('wainGray', 0, 0, Z0 + 0.03, X1 - X0, 1.1, 0.06, false);
box('wainGray', 0, 0, Z1 - 0.03, X1 - X0, 1.1, 0.06, false);
box('wainGray', X0 + 0.03, 0, MID_Z, 0.06, 1.1, Z1 - Z0, false);
box('wainGray', X1 - 0.03, 0, MID_Z, 0.06, 1.1, Z1 - Z0, false);
box('accentBlue', 0, 1.1, Z0 + 0.04, X1 - X0, 0.05, 0.08, false);
box('accentBlue', 0, 1.1, Z1 - 0.04, X1 - X0, 0.05, 0.08, false);

/**
 * Adds a wall along x at `wz` from `xa` to `xb` with a doorway of `GAP` centred on `gc`, and a lintel over it.
 * Every wall box is `WALL_T` thick and `CEILING_H` tall.
 */
function wallAlongX(wz: number, xa: number, xb: number, gc: number): void {
  const left = gc - GAP / 2, right = gc + GAP / 2;
  if (left > xa) box('wall', (xa + left) / 2, 0, wz, left - xa, CEILING_H, WALL_T);
  if (xb > right) box('wall', (right + xb) / 2, 0, wz, xb - right, CEILING_H, WALL_T);
  box('wall', gc, LINTEL_Y, wz, GAP, CEILING_H - LINTEL_Y, WALL_T);
  box('frame', left - 0.06, 0, wz, 0.12, LINTEL_Y, WALL_T + 0.1, false);
  box('frame', right + 0.06, 0, wz, 0.12, LINTEL_Y, WALL_T + 0.1, false);
  box('frame', gc, LINTEL_Y - 0.06, wz, GAP + 0.24, 0.12, WALL_T + 0.1, false);
}

// ---- Control room (north, centre): x -4..4, z -13..-9.25, a glass door facing the bay. ----
const CR_WALL_Z = -9;
wallAlongX(CR_WALL_Z, -4.25, 4.25, 0);
box('wall', -4, 0, (Z0 + CR_WALL_Z) / 2, WALL_T, CEILING_H, CR_WALL_Z - Z0);
box('wall', 4, 0, (Z0 + CR_WALL_Z) / 2, WALL_T, CEILING_H, CR_WALL_Z - Z0);
// Desk run along the north wall with monitors, chairs and a wall of status screens.
box('desk', 0, 0, -12.5, 7, 0.75, 0.8);
for (const mx of [-2.4, 0, 2.4]) {
  box('dark', mx, 0.75, -12.7, 0.9, 0.5, 0.06, false);
  box(mx === 0 ? 'screenTerm' : 'screen', mx, 0.78, -12.66, 0.8, 0.44, 0.03, false);
  box('chair', mx, 0, -11.7, 0.5, 0.9, 0.5, false);
}
box('dark', 0, 1.8, Z0 + 0.06, 6.4, 1.5, 0.06, false);
for (let k = 0; k < 4; k++) box(k % 2 ? 'screenTerm' : 'screenSaver', -2.4 + k * 1.6, 1.95, Z0 + 0.1, 1.4, 1.2, 0.03, false);
plaque('CONTROL ROOM', 0, 3.25, CR_WALL_Z + WALL_T / 2 + 0.04, 'x', 1, 2.6, 0.5, 'accentBlue', true);
lamp(0, 3.4, -11, 0xffc88a, 0.85, 5);
box('light', 0, CEILING_H - 0.05, -11, 2.2, 0.1, 0.8, false);

// ---- Tape vault (south-east corner): x 10..16, z 9.25..13, a sliding door facing north. ----
const VAULT_WALL_Z = 9;
wallAlongX(VAULT_WALL_Z, 9.75, X1, 13);
box('wall', 10, 0, (VAULT_WALL_Z + Z1) / 2, WALL_T, CEILING_H, Z1 - VAULT_WALL_Z);
// Tape shelving along the east wall, a drive cabinet by the west wall.
box('shelf', X1 - 0.35, 0, 11.1, 0.7, 2.2, 3.2);
for (let k = 0; k < 6; k++) box(k % 2 ? 'cardboard' : 'paper', X1 - 0.72, 0.5 + (k >> 1) * 0.6, 10.1 + (k % 2) * 1.8, 0.04, 0.4, 1.2, false);
box('rack', 10.6, 0, 12.2, 0.7, 1.8, 0.9);
box('led', 10.96, 1.2, 12.2, 0.04, 0.05, 0.6, false);
plaque('TAPE VAULT', 13, 3.25, VAULT_WALL_Z - WALL_T / 2 - 0.04, 'x', -1, 2.2, 0.45, 'accentOrange', true);
lamp(13, 3.3, 11.2, 0xa8d4ff, 0.8, 5);
box('light', 13, CEILING_H - 0.05, 11.2, 2.0, 0.1, 0.8, false);

/** The two sliding doors, in wire order: control room, tape vault. The panel hangs on the bay / aisle side of its wall. */
const DOORS: readonly DoorDef[] = [
  { name: 'Control room', x: 0, z: CR_WALL_Z + DOOR_OFFSET, axis: 'x', gap: GAP, dir: 1, side: 1, initial: 0.5, style: 'glass', color: 0x3a5f8f },
  { name: 'Tape vault', x: 13, z: VAULT_WALL_Z - DOOR_OFFSET, axis: 'x', gap: GAP, dir: -1, side: -1, initial: 0.5, style: 'wood', color: 0x8c2b2b },
];

// ---- Server racks: two blocks of back-to-back rows each side; a 1.1 m crack splits every row. ----
const LED_MATS = ['ledBlink', 'led', 'ledBlinkB', 'signBlue'] as const;

/** One rack block: two rows of six racks centred on (cx, cz), fronts facing the aisles on each side. */
function rackBlock(cx: number, cz: number): void {
  for (const row of [-1, 1] as const) {
    const rz = cz + row * 0.5;
    const frontZ = cz + row * 1.02;
    for (const side of [-1, 1] as const) {
      for (let k = 0; k < 3; k++) {
        const rx = cx + side * (1.0 + 0.95 * k);
        box('rack', rx, 0, rz, 0.9, 2.3, 1.0);
        for (let u = 0; u < 4; u++) box(LED_MATS[(u + k + (side > 0 ? 1 : 0)) % 4]!, rx, 0.35 + u * 0.5, frontZ, 0.7, 0.07, 0.04, false);
        box('dark', rx, 2.3, rz, 0.9, 0.06, 1.0, false);
      }
    }
    // Overhead cable tray along the row.
    box('metal', cx, 2.5, rz, 6.7, 0.08, 0.5, false);
  }
  // Cold-aisle blue wash in front of each row, high so it never flares as players walk past.
  for (const row of [-1, 1] as const) {
    lamp(cx - 2, 2.9, cz + row * 1.8, 0x58a0ff, 0.7, 5);
    lamp(cx + 2, 2.9, cz + row * 1.8, 0x58a0ff, 0.7, 5);
  }
}
for (const cx of [-10, 10]) for (const cz of [-6, 6]) rackBlock(cx, cz);

// ---- Cooling units in the north lane, cover and crates in the bay and south lane. ----
for (const cx of [-11.5, 11.5]) {
  box('white', cx, 0, -11.8, 2.6, 2.2, 1.0);
  for (let k = 0; k < 5; k++) box('metal', cx - 1.0 + k * 0.5, 0.3, -11.28, 0.3, 1.4, 0.04, false);
  box('signBlue', cx, 2.0, -11.28, 1.6, 0.06, 0.04, false);
}
box('crate', -9, 0, 1.6, 1.2, 1.2, 1.2);
box('crate', 9, 0, -1.6, 1.2, 1.2, 1.2);
box('cardboard', -9, 1.2, 1.6, 0.8, 0.5, 0.8);
// UPS cabinets against the west wall of the south lane.
box('dark', X0 + 0.5, 0, 10.5, 0.9, 1.6, 1.4);
box('dark', X0 + 0.5, 0, 8.6, 0.9, 1.6, 1.4);
box('led', X0 + 0.96, 1.2, 10.5, 0.04, 0.08, 0.9, false);
box('led', X0 + 0.96, 1.2, 8.6, 0.04, 0.08, 0.9, false);

// ---- Ceiling: duct runs, light panels over the bay, cool bay light. ----
for (const z of [-10.4, 10.4]) box('duct', 0, 3.5, z, X1 - X0, 0.5, 0.6, false);
for (const x of [-12, -4, 4, 12]) {
  box('light', x, CEILING_H - 0.05, 0, 1.8, 0.1, 0.8, false);
  lamp(x, CEILING_H - 0.5, 0, 0xcfe0ff, 0.55, 6.5);
}
for (const x of [-8, 0, 8]) lamp(x, CEILING_H - 0.5, 10, 0x9cc4ff, 0.4, 6);
lamp(-8, CEILING_H - 0.5, -10, 0x9cc4ff, 0.35, 6);
lamp(8, CEILING_H - 0.5, -10, 0x9cc4ff, 0.35, 6);

// ---- Signs and the live scoreboards on the long end walls. ----
plaque('DATA CENTER', X0 + 0.04, 3.4, -8, 'z', 1, 3.6, 0.6, 'accentBlue', true);
plaque('COLD AISLE', X1 - 0.04, 3.4, 6, 'z', -1, 3.0, 0.5, 'accentBlue', true);
plaque('DO NOT UNPLUG', X0 + 0.04, 2.6, 6, 'z', 1, 2.8, 0.5, 'accentRed');
plaque('HAVE YOU TRIED TURNING THEM OFF?', X1 - 0.04, 2.6, -8, 'z', -1, 4.6, 0.6, 'accentOrange');
m.scoreboard('z', 0, X0, 1, 2.3, 5.6, 2.8);
m.scoreboard('z', 0, X1, -1, 2.3, 5.6, 2.8);

/** The pickups, in wire order: health, ammo, grenades around the bay, one copy of each standard gun in its own corner. */
const PICKUPS: readonly PickupSpot[] = [
  { kind: 'hp', x: 0, z: -7.6 },
  { kind: 'hp', x: 0, z: 8 },
  { kind: 'hp', x: -14.7, z: 0 },
  { kind: 'hp', x: 14.7, z: 0 },
  { kind: 'ammo', x: -4, z: 3 },
  { kind: 'ammo', x: 4, z: -3 },
  { kind: 'ammo', x: -13, z: 11 },
  { kind: 'ammo', x: 13, z: -9 },
  { kind: 'grenade', x: 0, z: -11 },
  { kind: 'grenade', x: -8, z: 10.5 },
  { kind: 'grenade', x: 8, z: -8.5 },
  // Guns (only active under the "pistol only" loadout): SMG in the north-west lane, Shredder in the control room,
  // Laser Pointer in the tape vault. There is no RPG here: it stays an office reward.
  { kind: 'weapon', weapon: 1, x: -13, z: -9 },
  { kind: 'weapon', weapon: 2, x: 0, z: -11.4 },
  { kind: 'weapon', weapon: 3, x: 13.4, z: 11.8 },
];

/** Spawn points as `[x, z]`, spread over the lanes and the bay. */
const SPAWN_POINTS: readonly [number, number][] = [
  [-14.5, -11], [-8.5, -9], [8.5, -9], [14.5, -11], [-14.5, 0], [14.5, 0],
  [-5, 2], [5, -2], [-14.5, 11], [-6, 10.5], [6, 10.5], [0, 4],
];

/** Lighting: cold blue hall, warmer control room, pale vault. First match wins, so sub-rooms come first. */
const ZONE_LIST: readonly Zone[] = [
  {
    id: 'control', name: 'Control room', x0: -4, x1: 4, z0: Z0 - 1, z1: CR_WALL_Z,
    ambient: { color: 0xffc890, level: 0.13 },
    panels: { color: 0xffd0a0, intensity: 0.6, radius: 6 },
    fog: { color: 0x3a3228, density: 0.008 }, floor: 0.55,
  },
  {
    id: 'vault', name: 'Tape vault', x0: 10, x1: X1 + 1, z0: VAULT_WALL_Z, z1: Z1 + 1,
    ambient: { color: 0x8fb8ff, level: 0.1 },
    panels: { color: 0xc4dcff, intensity: 0.55, radius: 6 },
    fog: { color: 0x2a3446, density: 0.01 }, floor: 0.5,
  },
  {
    id: 'hall', name: 'Server hall', x0: X0 - 2, x1: X1 + 2, z0: Z0 - 2, z1: Z1 + 2,
    ambient: { color: 0x5a82d0, level: 0.1 },
    panels: { color: 0xa8c8ff, intensity: 0.5, radius: 7 },
    fog: { color: 0x1c2638, density: 0.011 }, floor: 0.45,
  },
];

/** Ceiling height, matching the office. */
export { CEILING_H };
/** Collision boxes: every solid box. */
export const SOLIDS: readonly Aabb[] = m.boxes.filter((b) => b.solid);
/** Every rendered box in the map. */
export const MAP_BOXES: readonly MapBox[] = m.boxes;
/** Baked light sources the client turns into vertex lighting. */
export const LIGHTS: readonly LightSource[] = m.lights;
/** Wall plaques and signs. */
export const LABELS: readonly LabelSpec[] = m.labels;
/** Live scoreboards on the two end walls. */
export const BOARDS: readonly BoardSpec[] = m.boards;
/** Pickup spots, in protocol order. */
export const PICKUP_SPOTS: readonly PickupSpot[] = PICKUPS;
/** Spawn points. */
export const SPAWNS: readonly [number, number][] = [...SPAWN_POINTS];
/** Sliding doors, in protocol order. */
export const MAP_DOORS: readonly DoorDef[] = DOORS;
/** Lighting zones. */
export const ZONES: readonly Zone[] = ZONE_LIST;
/** Bounding box of the whole map, for the client's light-field grid. */
export const BOUNDS = { x0: X0 - 2, x1: X1 + 2, z0: Z0 - 2, z1: Z1 + 2 };
