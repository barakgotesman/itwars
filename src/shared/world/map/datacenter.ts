/**
 * The Data Center: a small deathmatch map (32 x 26 m) for two to four players. Built independently of the
 * office with its own local registries (`local-builder.ts`), and inside the office's footprint so the shared
 * navigation grid covers it unchanged. Styled after `refs/server_room.jpg`: black cabinets with blue patch
 * cabling, cable trays full of blue cable overhead, pale perforated floor tiles, linear ceiling lights, aisle
 * and rack signs, and grey cooling units with fan fronts.
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
 *
 * Z-fighting rule for this file: no two boxes may share a coplanar, same-facing face over an overlapping area
 * (walls that meet stop at each other's faces; door trim stands proud of the wall or sits inside the doorway).
 */
import type { Aabb } from '@shared/core/physics';
import { CEILING_H, LINTEL_Y, WALL_T } from './builder';
import { DOOR_OFFSET, type DoorDef } from './door-layout';
import { createLocalMap } from './local-builder';
import type { PickupSpot } from './pickups';
import type { BoardSpec, LabelSpec, LightSource, MapBox, MaterialId } from './types';
import type { Zone } from './zones';

const m = createLocalMap();
const { box, floor, stripe, lamp, plaque } = m;

/** Playable area (the walls stand just outside it). */
const X0 = -16, X1 = 16, Z0 = -13, Z1 = 13;
const MID_Z = (Z0 + Z1) / 2;
/** Width of a doorway; matches the office. */
const GAP = 3.2;
/** Trim thickness inside a doorway, and how far door trim stands out of the wall faces on each side. */
const TRIM = 0.1;
const TRIM_PROUD = 0.06;

// Floor: pale perforated tiles everywhere, like the reference; hazard strips mark the bay's edge along the racks.
// Glossy floor: a thick solid slab that is not drawn, and a thin translucent dark layer on top that shows the
// client's mirrored copy of the room (see `MapDef.glossy`) as a reflection.
floor('floorHidden', X0 - WALL_T, X1 + WALL_T, Z0 - WALL_T, Z1 + WALL_T);
box('floorGloss', 0, -0.004, MID_Z, X1 - X0 + 2 * WALL_T, 0.004, Z1 - Z0 + 2 * WALL_T, false);
for (const z of [-5.2, 5.2]) stripe('hazard', X0, X1, z - 0.1, z + 0.1);
// A cold-aisle line down the middle of the bay and the lanes.
for (const z of [-9.9, 0, 9.9]) stripe('signBlue', X0, X1, z - 0.04, z + 0.04);

// Outer walls and ceiling: unbroken boxes. The long walls own the corners; the end walls fit between them.
box('concrete', 0, 0, Z0 - WALL_T / 2, X1 - X0 + 2 * WALL_T, CEILING_H, WALL_T);
box('concrete', 0, 0, Z1 + WALL_T / 2, X1 - X0 + 2 * WALL_T, CEILING_H, WALL_T);
box('concrete', X0 - WALL_T / 2, 0, MID_Z, WALL_T, CEILING_H, Z1 - Z0);
box('concrete', X1 + WALL_T / 2, 0, MID_Z, WALL_T, CEILING_H, Z1 - Z0);
box('ceiling', 0, CEILING_H, MID_Z, X1 - X0 + 2 * WALL_T, 0.3, Z1 - Z0 + 2 * WALL_T);
// Dark skirting and a blue rail along every outer wall (flat, proud of the wall).
box('wainGray', 0, 0, Z0 + 0.03, X1 - X0, 0.6, 0.06, false);
box('wainGray', 0, 0, Z1 - 0.03, X1 - X0, 0.6, 0.06, false);
box('wainGray', X0 + 0.03, 0, MID_Z, 0.06, 0.6, Z1 - Z0 - 0.12, false);
box('wainGray', X1 - 0.03, 0, MID_Z, 0.06, 0.6, Z1 - Z0 - 0.12, false);
box('blue', 0, 0.6, Z0 + 0.045, X1 - X0, 0.05, 0.09, false);
box('blue', 0, 0.6, Z1 - 0.045, X1 - X0, 0.05, 0.09, false);

/**
 * Adds a wall along x at `wz` from `xa` to `xb` with a doorway of `GAP` centred on `gc`: two wall pieces and a
 * lintel. Door trim stands proud of both wall faces (`TRIM_PROUD`) and its jambs sit inside the doorway, so no
 * face is coplanar with a wall face.
 */
function wallAlongX(wz: number, xa: number, xb: number, gc: number): void {
  const left = gc - GAP / 2, right = gc + GAP / 2;
  box('concrete', (xa + left) / 2, 0, wz, left - xa, CEILING_H, WALL_T);
  box('concrete', (right + xb) / 2, 0, wz, xb - right, CEILING_H, WALL_T);
  box('concrete', gc, LINTEL_Y, wz, GAP, CEILING_H - LINTEL_Y, WALL_T);
  const depth = WALL_T + TRIM_PROUD * 2;
  // Jambs inside the doorway, a header under the lintel; the header and jambs meet edge to edge, not face to face.
  box('frame', left + TRIM / 2, 0, wz, TRIM, LINTEL_Y - TRIM, depth, false);
  box('frame', right - TRIM / 2, 0, wz, TRIM, LINTEL_Y - TRIM, depth, false);
  box('frame', gc, LINTEL_Y - TRIM, wz, GAP, TRIM, depth, false);
}

// ---- Control room (north, centre): x -4..4, z -13..-9, a glass door facing the bay. ----
const CR_WALL_Z = -9;
// Side walls run the full wall thickness so the door wall only has to reach their inner faces.
box('concrete', -4, 0, (Z0 + CR_WALL_Z + WALL_T / 2) / 2, WALL_T, CEILING_H, CR_WALL_Z + WALL_T / 2 - Z0);
box('concrete', 4, 0, (Z0 + CR_WALL_Z + WALL_T / 2) / 2, WALL_T, CEILING_H, CR_WALL_Z + WALL_T / 2 - Z0);
wallAlongX(CR_WALL_Z, -4 + WALL_T / 2, 4 - WALL_T / 2, 0);
// Desk run along the north wall with monitors, chairs and a wall of status screens.
box('desk', 0, 0, -12.5, 7, 0.75, 0.8);
for (const mx of [-2.4, 0, 2.4]) {
  box('dark', mx, 0.75, -12.7, 0.9, 0.5, 0.06, false);
  box(mx === 0 ? 'screenTerm' : 'screen', mx, 0.78, -12.66, 0.8, 0.44, 0.03, false);
  box('chair', mx, 0, -11.7, 0.5, 0.9, 0.5, false);
}
box('dark', 0, 0.7, Z0 + 0.1, 6.4, 1.7, 0.06, false);
for (let k = 0; k < 4; k++) box(k % 2 ? 'screenTerm' : 'screenSaver', -2.4 + k * 1.6, 1.7, Z0 + 0.15, 1.4, 1.2, 0.03, false);
plaque('CONTROL ROOM', 0, 3.25, CR_WALL_Z + WALL_T / 2 + TRIM_PROUD + 0.02, 'x', 1, 2.6, 0.5, 'accentBlue', true);
lamp(0, 3.4, -11, 0xffc88a, 0.85, 5);
box('light', 0, CEILING_H - 0.05, -11, 2.2, 0.1, 0.8, false);

// ---- Tape vault (south-east corner): x 10..16, z 9..13, a sliding door facing north. ----
const VAULT_WALL_Z = 9;
box('concrete', 10, 0, (VAULT_WALL_Z - WALL_T / 2 + Z1) / 2, WALL_T, CEILING_H, Z1 - VAULT_WALL_Z + WALL_T / 2);
wallAlongX(VAULT_WALL_Z, 10 + WALL_T / 2, X1, 13);
// Tape shelving along the east wall, a drive cabinet by the west wall.
box('shelf', X1 - 0.35, 0, 11.1, 0.7, 2.2, 3.2);
for (let k = 0; k < 6; k++) box(k % 2 ? 'cardboard' : 'paper', X1 - 0.74, 0.5 + (k >> 1) * 0.6, 10.1 + (k % 2) * 1.8, 0.04, 0.4, 1.2, false);
box('rack', 10.9, 0, 12.2, 0.7, 1.8, 0.9);
box('led', 11.27, 1.2, 12.2, 0.04, 0.05, 0.6, false);
plaque('TAPE VAULT', 13, 3.25, VAULT_WALL_Z - WALL_T / 2 - TRIM_PROUD - 0.02, 'x', -1, 2.2, 0.45, 'accentOrange', true);
lamp(13, 3.3, 11.2, 0xa8d4ff, 0.8, 5);
box('light', 13, CEILING_H - 0.05, 11.2, 2.0, 0.1, 0.8, false);

/** The two sliding doors, in wire order: control room, tape vault. The panel hangs on the bay / aisle side of its wall. */
const DOORS: readonly DoorDef[] = [
  { name: 'Control room', x: 0, z: CR_WALL_Z + DOOR_OFFSET, axis: 'x', gap: GAP, dir: 1, side: 1, initial: 0.5, style: 'glass', color: 0x3a5f8f },
  { name: 'Tape vault', x: 13, z: VAULT_WALL_Z - DOOR_OFFSET, axis: 'x', gap: GAP, dir: -1, side: -1, initial: 0.5, style: 'wood', color: 0x8c2b2b },
];

// ---- Server racks: black cabinets with blue patch cabling, in back-to-back rows with a crack in the middle. ----
const LEDS = ['ledBlink', 'led', 'ledBlinkB', 'led'] as const;

/**
 * One cabinet whose front faces `dir` (-1 = toward -z). Every third one is a closed door with a handle and a
 * status light; the others are open fronted: server slabs, patch cables strung between them, and a loom of blue
 * cable down each side. Details stand at least a centimetre proud of the front face.
 * @param label - Optional rack number on a small plate above the front.
 */
function rack(cx: number, rz: number, dir: -1 | 1, idx: number, amber: boolean, label?: string): void {
  box('rack', cx, 0, rz, 0.9, 2.3, 1.0);
  const fz = rz + dir * 0.5;
  /** A decoration box on the front face, `d` deep. */
  const put = (mat: MaterialId, x: number, y: number, w: number, h: number, d: number): void => box(mat, x, y, fz + dir * (d / 2 + 0.01), w, h, d, false);
  box('metal', cx, 2.3, rz, 0.94, 0.05, 1.0, false);
  // Glowing blue edge strips down both sides of the front, like the reference's light bars.
  put('signBlue', cx - 0.43, 0.08, 0.035, 2.14, 0.045);
  put('signBlue', cx + 0.43, 0.08, 0.035, 2.14, 0.045);
  if (idx % 3 === 2) {
    // Closed door: a lighter panel, a long handle and one status light.
    put('wainGray', cx, 0.1, 0.78, 2.1, 0.03);
    put('metal', cx + 0.3, 0.9, 0.04, 0.6, 0.06);
    put(LEDS[idx % 4]!, cx - 0.3, 1.9, 0.06, 0.06, 0.05);
    return;
  }
  for (let u = 0; u < 7; u++) {
    const y = 0.15 + u * 0.3;
    put('metal', cx, y, 0.66, 0.16, 0.05);
    // Two columns of status lights per slab; the vault side of the hall runs amber, the rest green and blue.
    for (const [lx, k] of [[-0.27, 0], [-0.2, 1], [0.24, 2], [0.31, 3]] as const) put(amber ? (k % 2 ? 'ledBlinkB' : 'ledBlinkB') : LEDS[(u + idx + k) % 4]!, cx + lx, y + 0.06, 0.04, 0.035, 0.07);
    // Patch cables looping between this slab and the next.
    if (u < 6) put('blue', cx + (u % 2 ? 0.08 : -0.08), y + 0.2, 0.5, 0.035, 0.07);
  }
  put('blue', cx - 0.37, 0.1, 0.07, 2.0, 0.09);
  put('blue', cx + 0.37, 0.1, 0.07, 2.0, 0.09);
  if (label) plaque(label, cx, 2.12, fz + dir * 0.03, 'x', dir, 0.72, 0.16, 'accentBlue', true);
}

/** One rack block: two rows of six racks centred on (cx, cz), fronts facing the aisles on each side. */
function rackBlock(cx: number, cz: number, firstLabel: number): void {
  // A glowing strip along the floor at the foot of each row, lighting the tiles like the reference's reflections.
  for (const row of [-1, 1] as const) box('signBlue', cx, 0, cz + row * 1.015, 6.5, 0.03, 0.04, false);
  let idx = 0;
  for (const row of [-1, 1] as const) {
    const rz = cz + row * 0.5;
    for (const side of [-1, 1] as const) {
      for (let k = 0; k < 3; k++) {
        const rx = cx + side * (1.0 + 0.95 * k);
        // Row-end racks carry the number plates.
        const label = k === 0 ? `RACK ${String(firstLabel + (row > 0 ? 2 : 0) + (side > 0 ? 1 : 0)).padStart(2, '0')}` : undefined;
        rack(rx, rz, row, idx++, cx > 0 && row > 0, label);
      }
    }
    // Overhead cable tray along the row: a steel tray carrying two bundles of blue cable.
    box('metal', cx, 2.5, rz, 6.7, 0.06, 0.55, false);
    box('metal', cx, 2.56, rz - 0.27, 6.7, 0.1, 0.04, false);
    box('metal', cx, 2.56, rz + 0.27, 6.7, 0.1, 0.04, false);
    box('blue', cx, 2.56, rz - 0.12, 6.7, 0.1, 0.14, false);
    box('blue', cx, 2.56, rz + 0.12, 6.7, 0.1, 0.14, false);
  }
  // Cable drops from the trays down the block's two outer ends, between the rows' ends and the tray.
  for (const side of [-1, 1] as const) {
    const ex = cx + side * 3.5;
    box('blue', ex, 2.35, cz, 0.12, 0.28, 1.1, false);
  }
  // Cold-aisle blue wash in front of each row, high so it never flares as players walk past.
  for (const row of [-1, 1] as const) {
    for (const lx of [-2.4, 0, 2.4]) lamp(cx + lx, 2.2, cz + row * 1.9, 0x3a78ff, 0.8, 4.2);
  }
}
let labelNo = 1;
for (const cx of [-10, 10]) for (const cz of [-6, 6]) { rackBlock(cx, cz, labelNo); labelNo += 4; }

// ---- Cooling units: fan-fronted grey cabinets in the north lane and along the side walls. ----
/** One cooling unit, its fans facing `dir` along z (north lane) or x (side walls). */
function coolingUnit(cx: number, cz: number, alongX: boolean, face: -1 | 1): void {
  const w = alongX ? 2.6 : 0.9, d = alongX ? 1.0 : 2.0;
  box('metal', cx, 0, cz, w, 2.4, d);
  box('wainGray', cx, 2.4, cz, w + 0.06, 0.05, d + 0.06, false);
  for (const o of [-0.5, 0.5]) {
    const fx = alongX ? cx + o * 1.0 : cx + face * (w / 2 + 0.02);
    const fz = alongX ? cz + face * (d / 2 + 0.02) : cz + o * 0.9;
    // Fan: a dark round-ish grille with a hub and a cross of blades, each proud of the one below.
    box('dark', fx, 0.9, fz, alongX ? 0.8 : 0.04, 1.1, alongX ? 0.04 : 0.8, false);
    box('metal', fx + (alongX ? 0 : face * 0.03), 1.4, fz + (alongX ? face * 0.03 : 0), alongX ? 0.7 : 0.03, 0.06, alongX ? 0.03 : 0.7, false);
    box('metal', fx + (alongX ? 0 : face * 0.03), 0.95, fz + (alongX ? face * 0.03 : 0), alongX ? 0.06 : 0.03, 0.9, alongX ? 0.03 : 0.06, false);
    box('metal', fx + (alongX ? 0 : face * 0.05), 1.42, fz + (alongX ? face * 0.05 : 0), alongX ? 0.14 : 0.04, 0.14, alongX ? 0.04 : 0.14, false);
  }
  box('signBlue', alongX ? cx : cx + face * (w / 2 + 0.02), 2.15, alongX ? cz + face * (d / 2 + 0.02) : cz, alongX ? 1.8 : 0.03, 0.06, alongX ? 0.03 : 1.6, false);
}
for (const cx of [-11.5, 11.5]) coolingUnit(cx, -11.8, true, 1);
for (const cz of [-5.5, 5.5]) {
  coolingUnit(X0 + 0.45, cz, false, 1);
  coolingUnit(X1 - 0.45, cz, false, -1);
}
// Cover in the bay (kept off the podium spot) and a small stack on one crate.
box('crate', -9, 0, 1.6, 1.2, 1.2, 1.2);
box('crate', 9, 0, -1.6, 1.2, 1.2, 1.2);
box('cardboard', -9, 1.2, 1.6, 0.8, 0.5, 0.8);
// UPS cabinets against the west wall of the south lane.
box('rack', X0 + 0.5, 0, 10.5, 0.9, 1.6, 1.4);
box('rack', X0 + 0.5, 0, 8.6, 0.9, 1.6, 1.4);
box('led', X0 + 0.96, 1.2, 10.5, 0.04, 0.08, 0.9, false);
box('led', X0 + 0.96, 1.2, 8.6, 0.04, 0.08, 0.9, false);

// ---- Ceiling: blue cable trays and grey ducts run across, pipes and sprinklers, long linear lights. ----
for (const z of [-9.9, 9.9]) {
  box('metal', 0, 3.45, z - 0.55, X1 - X0, 0.05, 0.5, false);
  box('blue', 0, 3.5, z - 0.62, X1 - X0, 0.1, 0.14, false);
  box('blue', 0, 3.5, z - 0.46, X1 - X0, 0.1, 0.14, false);
  box('duct', 0, 3.4, z + 0.45, X1 - X0, 0.4, 0.5, false);
}
// Cross pipes over the bay, and a sprinkler head under each.
for (const x of [-12, -4, 4, 12]) {
  box('duct', x, 3.7, 0, 0.18, 0.18, 9.6, false);
  box('red', x, 3.55, 0, 0.1, 0.1, 0.1, false);
}
// Linear ceiling lights in five segments along each aisle, with a lamp under each.
for (const z of [-9.3, -2.5, 2.5, 9.3]) {
  for (const x of [-12.5, -6.25, 0, 6.25, 12.5]) {
    box('light', x, CEILING_H - 0.05, z, 4.2, 0.1, 0.3, false);
    lamp(x, CEILING_H - 0.5, z, 0x9ec0ff, 0.26, 6);
  }
}

// ---- Signs: aisle signs hung over the aisles, wall plaques and the live scoreboards on the long end walls. ----
/** A double-sided sign hung from the ceiling on two cords, facing along x so it reads down the aisle. */
function hangingSign(text: string, x: number, z: number, accent: MaterialId): void {
  for (const f of [1, -1] as const) plaque(text, x + f * 0.05, 3.3, z, 'z', f, 1.9, 0.38, accent, true);
  box('dark', x, 3.05, z, 0.06, 0.5, 2.0, false);
  for (const dz of [-0.85, 0.85]) box('dark', x, 3.55, z + dz, 0.03, CEILING_H - 3.55, 0.03, false);
}
hangingSign('AISLE 1 · COLD', 0, -9.9, 'accentBlue');
hangingSign('BAY · COLD', -7, 0, 'accentBlue');
hangingSign('BAY · COLD', 7, 0, 'accentBlue');
hangingSign('AISLE 2 · HOT', 0, 9.9, 'accentOrange');
plaque('DATA CENTER', X0 + 0.04, 3.4, -9, 'z', 1, 3.6, 0.6, 'accentBlue', true);
plaque('DO NOT UNPLUG', X0 + 0.04, 3.0, 6, 'z', 1, 2.8, 0.5, 'accentRed');
plaque('COLD AISLE', X1 - 0.04, 3.4, 6, 'z', -1, 3.0, 0.5, 'accentBlue', true);
plaque('HAVE YOU TRIED TURNING THEM OFF?', X1 - 0.04, 3.0, -10, 'z', -1, 4.6, 0.6, 'accentOrange');
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

/** Lighting: a clean, bright cold-blue hall like the reference, warmer control room, pale vault. First match wins, so sub-rooms come first. */
const ZONE_LIST: readonly Zone[] = [
  {
    id: 'control', name: 'Control room', x0: -4, x1: 4, z0: Z0 - 1, z1: CR_WALL_Z,
    ambient: { color: 0xffb070, level: 0.09 },
    panels: { color: 0xffc890, intensity: 0.45, radius: 6 },
    fog: { color: 0x1c1610, density: 0.012 }, floor: 0.45,
  },
  {
    id: 'vault', name: 'Tape vault', x0: 10, x1: X1 + 1, z0: VAULT_WALL_Z, z1: Z1 + 1,
    ambient: { color: 0xff9a50, level: 0.075 },
    panels: { color: 0xffb070, intensity: 0.4, radius: 6 },
    fog: { color: 0x1a120c, density: 0.014 }, floor: 0.42,
  },
  {
    id: 'hall', name: 'Server hall', x0: X0 - 2, x1: X1 + 2, z0: Z0 - 2, z1: Z1 + 2,
    ambient: { color: 0x3c5cc8, level: 0.065 },
    panels: { color: 0x9ec0ff, intensity: 0.3, radius: 7 },
    fog: { color: 0x0a1226, density: 0.013 }, floor: 0.4,
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
