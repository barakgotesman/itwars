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
import type { BoardSpec, CameraSpec, LabelSpec, LightSource, MapBox, MaterialId, ScreenSpec } from './types';
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

// ---- Control room (north, centre): x -5.5..5.5, z -13..-8.7, a glass door facing the bay. ----
const CR_WALL_Z = -8.7;
/** Half-width of the room (to the wall centres) and the z of the door wall's inner face. */
const CR_HALF = 5.5;
const CR_FACE_Z = CR_WALL_Z - WALL_T / 2;
// Side walls run the full wall thickness so the door wall only has to reach their inner faces.
for (const sx of [-CR_HALF, CR_HALF]) box('concrete', sx, 0, (Z0 + CR_WALL_Z + WALL_T / 2) / 2, WALL_T, CEILING_H, CR_WALL_Z + WALL_T / 2 - Z0);
wallAlongX(CR_WALL_Z, -CR_HALF + WALL_T / 2, CR_HALF - WALL_T / 2, 0);
// Everything below stands inside the room: x -5.25..5.25, z -13..-8.95.
/** Office chair at (x, z) whose sitter looks `look` ('n' = toward -z, 'w' = toward -x, 'e' = toward +x). */
function chair(x: number, z: number, look: 'n' | 'w' | 'e'): void {
  box('chair', x, 0.42, z, 0.5, 0.08, 0.5, false);
  box('dark', x, 0.07, z, 0.06, 0.35, 0.06, false);
  box('dark', x, 0.02, z, 0.56, 0.04, 0.07, false);
  box('dark', x, 0.03, z, 0.07, 0.04, 0.56, false);
  if (look === 'n') {
    box('chair', x, 0.5, z + 0.22, 0.5, 0.55, 0.07, false);
    for (const dx of [-0.27, 0.27]) box('dark', x + dx, 0.55, z, 0.05, 0.04, 0.32, false);
  } else {
    box('chair', x + (look === 'w' ? 0.22 : -0.22), 0.5, z, 0.07, 0.55, 0.5, false);
    for (const dz of [-0.27, 0.27]) box('dark', x, 0.55, z + dz, 0.32, 0.04, 0.05, false);
  }
}

/**
 * A monitor on a desk with its keyboard and mouse. `dir` is the way the screen faces: 'z' = toward +z (the sitter is
 * south of it), 'x+' / 'x-' = toward +x / -x. (x, z) is the monitor's centre on the desk top (y 0.75).
 */
function workstation(kind: ScreenSpec['kind'], x: number, z: number, dir: 'z' | 'x+' | 'x-'): void {
  const s = dir === 'x-' ? -1 : 1;
  if (dir === 'z') {
    box('dark', x, 0.75, z, 0.18, 0.02, 0.14, false);
    box('dark', x, 0.77, z - 0.02, 0.05, 0.2, 0.05, false);
    box('dark', x, 0.95, z - 0.02, 0.66, 0.4, 0.04, false);
    m.screen(kind, 'x', x, 1.15, z + 0.005, 1, 0.6, 0.34);
    box('dark', x, 0.75, z + 0.45, 0.46, 0.02, 0.15, false);
    box('metal', x, 0.77, z + 0.45, 0.42, 0.012, 0.11, false);
    box('white', x + 0.38, 0.75, z + 0.45, 0.07, 0.025, 0.11, false);
  } else {
    box('dark', x, 0.75, z, 0.14, 0.02, 0.18, false);
    box('dark', x - s * 0.02, 0.77, z, 0.05, 0.2, 0.05, false);
    box('dark', x - s * 0.02, 0.95, z, 0.04, 0.4, 0.66, false);
    m.screen(kind, 'z', x + s * 0.005, 1.15, z, s as 1 | -1, 0.6, 0.34);
    box('dark', x + s * 0.45, 0.75, z, 0.15, 0.02, 0.46, false);
    box('metal', x + s * 0.45, 0.77, z, 0.11, 0.012, 0.42, false);
    box('white', x + s * 0.45, 0.75, z + 0.38, 0.11, 0.025, 0.07, false);
  }
}

// The video wall on the north wall: a dark backing with eight big live panels (graphs, network map, radar and meters
// on top; logs, status, load and topology below) and the sites' names above it.
box('dark', 0, 0.9, -12.93, 9.8, 2.6, 0.06, false);
(['graph', 'network', 'radar', 'bars'] as const).forEach((k, i) => m.screen(k, 'x', -3.45 + i * 2.3, 2.9, -12.885, 1, 2.1, 1.0));
(['terminal', 'status', 'graph', 'network'] as const).forEach((k, i) => m.screen(k, 'x', -3.45 + i * 2.3, 1.7, -12.885, 1, 2.1, 1.0));
['TLV', 'LON', 'NYC', 'HKG'].forEach((t, i) => plaque(t, -3.45 + i * 2.3, 3.75, -12.97, 'x', 1, 0.9, 0.26, 'accentBlue', true));

// The command desk in front of it: four workstations, four chairs, and the clutter of people who live here.
box('desk', 0, 0, -11.7, 6.6, 0.75, 0.8);
([-2.25, -0.75, 0.75, 2.25] as const).forEach((x, i) => {
  workstation((['terminal', 'graph', 'status', 'network'] as const)[i]!, x, -11.95, 'z');
  chair(x, -10.7, 'n');
});
box('red', -3.0, 0.75, -11.45, 0.08, 0.1, 0.08, false);
box('paper', 3.0, 0.75, -11.5, 0.2, 0.01, 0.28, false);
box('dark', 0, 0.75, -11.4, 0.15, 0.04, 0.15, false);
box('accentOrange', 1.5, 0.75, -11.45, 0.07, 0.12, 0.07, false);

// Side consoles along both walls, facing the room: three workstations each.
for (const side of [-1, 1] as const) {
  box('desk', side * 4.9, 0, -11.45, 0.7, 0.75, 2.9);
  const kinds = side < 0 ? (['radar', 'bars', 'status'] as const) : (['network', 'terminal', 'graph'] as const);
  [-12.3, -11.4, -10.5].forEach((z, i) => {
    workstation(kinds[i]!, side * 5.0, z, side < 0 ? 'x+' : 'x-');
    chair(side * 4.05, z, side < 0 ? 'w' : 'e');
  });
  // A two-bay equipment rack by the door, with a switch, patch panel and blinking lights on its face.
  const rx = side * 4.9, rz = -9.2;
  box('rack', rx, 0, rz, 0.7, 1.9, 0.8);
  const fx = rx - side * 0.37;
  for (let u = 0; u < 6; u++) {
    box('metal', fx, 0.25 + u * 0.28, rz, 0.04, 0.14, 0.6, false);
    box((['ledBlink', 'led', 'ledBlinkB'] as const)[(u + (side > 0 ? 1 : 0)) % 3]!, fx - side * 0.025, 0.3 + u * 0.28, rz + 0.18 - (u % 2) * 0.1, 0.02, 0.04, 0.05, false);
  }
  box('blue', fx - side * 0.015, 0.2, rz - 0.25, 0.03, 1.7, 0.07, false);
}

// The door wall's inner face: a whiteboard of diagrams and sticky notes on one side, a cork board on the other.
const bz = CR_FACE_Z;
box('frame', -3.4, 1.0, bz - 0.022, 1.6, 1.0, 0.03, false);
box('white', -3.4, 1.05, bz - 0.042, 1.5, 0.9, 0.012, false);
for (const [dx, dy, dw] of [[-0.45, 0.62, 0.34], [0.05, 0.62, 0.34], [0.5, 0.62, 0.34], [0.05, 0.28, 0.34]] as const) box('blue', -3.4 + dx, 1.05 + dy - 0.08, bz - 0.05, dw, 0.2, 0.008, false);
for (const dx of [-0.18, 0.3]) box('blue', -3.4 + dx, 1.05 + 0.3, bz - 0.053, 0.18, 0.02, 0.008, false);
for (const [dx, dy, mat] of [[-0.5, 0.18, 'accentOrange'], [-0.2, 0.15, 'red'], [0.55, 0.12, 'accentGreen']] as const) box(mat, -3.4 + dx, 1.05 + dy, bz - 0.05, 0.13, 0.13, 0.008, false);
box('frame', 3.4, 1.1, bz - 0.022, 1.3, 0.9, 0.03, false);
box('cork', 3.4, 1.14, bz - 0.042, 1.2, 0.8, 0.012, false);
for (const [dx, dy] of [[-0.35, 0.2], [0.05, 0.25], [0.4, 0.15], [-0.1, -0.12], [0.35, -0.15]] as const) box('paper', 3.4 + dx, 1.14 + dy, bz - 0.05, 0.22, 0.28, 0.008, false);
// A status strip over the inside of the doorway, and the room's lights: cool overhead, screen glow in cyan, magenta and green.
box('signGreen', 0, 3.4, bz - 0.03, 1.2, 0.05, 0.03, false);
for (const lx of [-3.2, 0, 3.2]) {
  lamp(lx, 3.4, -10.8, 0xcfe0ff, 0.4, 5);
  box('light', lx, CEILING_H - 0.05, -10.8, 2.2, 0.1, 0.8, false);
}
lamp(-2.2, 2.2, -12.4, 0x4fd0ff, 0.8, 4.5);
lamp(2.2, 2.2, -12.4, 0x4fd0ff, 0.8, 4.5);
lamp(-4.4, 1.8, -12.2, 0xff6ad0, 0.45, 3.2);
lamp(4.4, 1.8, -12.2, 0x6aff9a, 0.45, 3.2);
plaque('CONTROL ROOM', 0, 3.25, CR_WALL_Z + WALL_T / 2 + TRIM_PROUD + 0.02, 'x', 1, 2.6, 0.5, 'accentBlue', true);

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
/** How many rack consoles have been built, to give each a different screen. */
let consoleCount = 0;

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
  // Every sixth rack has a pulled-out console: a monitor on the front with a keyboard shelf under it, showing live data.
  const hasConsole = idx % 6 === 1;
  if (hasConsole) {
    put('dark', cx, 0.98, 0.66, 0.5, 0.04);
    m.screen((['terminal', 'graph', 'status', 'radar'] as const)[consoleCount++ % 4]!, 'x', cx, 1.23, fz + dir * 0.062, dir, 0.58, 0.33);
    box('metal', cx, 0.92, fz + dir * 0.12, 0.56, 0.03, 0.22, false);
    box('dark', cx, 0.95, fz + dir * 0.14, 0.46, 0.02, 0.14, false);
    box('metal', cx - 0.25, 0.9, fz + dir * 0.015, 0.03, 0.06, 0.03, false);
  }
  for (let u = 0; u < 7; u++) {
    const y = 0.15 + u * 0.3;
    // The console covers the slabs behind it.
    if (hasConsole && (u === 3 || u === 4)) continue;
    put('metal', cx, y, 0.66, 0.16, 0.05);
    // Two columns of status lights per slab; the vault side of the hall runs amber, the rest green and blue.
    for (const [lx, k] of [[-0.27, 0], [-0.2, 1], [0.24, 2], [0.31, 3]] as const) put(amber ? (k % 2 ? 'ledBlinkB' : 'ledBlinkB') : LEDS[(u + idx + k) % 4]!, cx + lx, y + 0.06, 0.04, 0.035, 0.07);
    // Patch cables looping between this slab and the next.
    if (u < 6 && !(hasConsole && u >= 2 && u <= 4)) put('blue', cx + (u % 2 ? 0.08 : -0.08), y + 0.2, 0.5, 0.035, 0.07);
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

// ---- UPS bank: six tall battery-and-inverter cabinets along the south wall of the south lane, each with a live
// load meter, vents, status lights and a charge strip. ----
for (let k = 0; k < 6; k++) {
  const ux = -13.5 + k * 0.92;
  box('rack', ux, 0, 12.45, 0.86, 1.9, 0.9);
  box('metal', ux, 1.9, 12.45, 0.9, 0.04, 0.94, false);
  box('dark', ux, 1.35, 11.985, 0.5, 0.3, 0.03, false);
  m.screen('bars', 'x', ux, 1.5, 11.965, -1, 0.42, 0.24);
  for (let v = 0; v < 4; v++) box('frame', ux, 0.2 + v * 0.12, 11.99, 0.6, 0.05, 0.02, false);
  box(LEDS[k % 4]!, ux - 0.2, 1.15, 11.985, 0.06, 0.06, 0.03, false);
  box('led', ux, 1.15, 11.985, 0.06, 0.06, 0.03, false);
  box('ledBlinkB', ux + 0.2, 1.15, 11.985, 0.06, 0.06, 0.03, false);
  box('signBlue', ux, 1.8, 11.985, 0.6, 0.04, 0.03, false);
}
plaque('UPS BANK A', -11.25, 2.4, 12.94, 'x', -1, 2.4, 0.4, 'accentOrange', true);

// ---- Cables across the open floor: from the UPS and the cooling units, through the cracks in the rack blocks, and
// to floor junction boxes in the bay. Non-solid, so nobody snags on them. ----
/**
 * A floor cable running through axis-aligned points (x, z). Each run stops half a width short of every corner and a
 * small square fills the corner, so runs join without overlapping faces. Cables that cross use different heights.
 */
function cable(mat: MaterialId, h: number, w: number, pts: readonly (readonly [number, number])[]): void {
  const hw = w / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i]!, [x1, z1] = pts[i + 1]!;
    const a = i > 0 ? hw : 0, b = i < pts.length - 2 ? hw : 0;
    if (x0 === x1) {
      const sgn = Math.sign(z1 - z0);
      const za = z0 + sgn * a, zb = z1 - sgn * b;
      box(mat, x0, 0, (za + zb) / 2, w, h, Math.abs(zb - za), false);
    } else {
      const sgn = Math.sign(x1 - x0);
      const xa = x0 + sgn * a, xb = x1 - sgn * b;
      box(mat, (xa + xb) / 2, 0, z0, Math.abs(xb - xa), h, w, false);
    }
    if (i > 0) box(mat, x0, 0, z0, w, h, w, false);
  }
}
cable('blue', 0.05, 0.07, [[-13.2, 11.7], [-10.0, 11.7], [-10.0, 4.4], [-7.0, 4.4], [-7.0, 2.6]]);
cable('dark', 0.06, 0.07, [[-13.2, 11.55], [-9.85, 11.55], [-9.85, 3.6], [-8.0, 3.6]]);
cable('accentOrange', 0.05, 0.07, [[-10.15, -7.4], [-10.15, -3.0], [-6.3, -3.0], [-6.3, -1.2]]);
cable('blue', 0.06, 0.07, [[10.15, -7.4], [10.15, 3.0], [6.3, 3.0], [6.3, 1.2]]);
cable('dark', 0.06, 0.07, [[-11.5, -10.4], [-11.5, -8.4], [-9.9, -8.4], [-9.9, -4.2], [-8.0, -4.2]]);
cable('red', 0.05, 0.07, [[11.5, -10.4], [11.5, -8.4], [9.9, -8.4], [9.9, -4.2], [8.0, -4.2]]);
cable('red', 0.05, 0.07, [[6.5, 7.4], [6.5, 8.2], [13.0, 8.2], [13.0, 10.0]]);
// Floor junction boxes where the cables end, with a blinking light each, and yellow cable ramps where a run crosses a walkway.
for (const [jx, jz] of [[-7.0, 2.35], [-6.3, -0.95], [6.3, 0.95]] as const) {
  box('metal', jx, 0, jz, 0.5, 0.14, 0.5, false);
  box('ledBlink', jx, 0.14, jz, 0.1, 0.02, 0.1, false);
}
for (const [rx, rz] of [[-8.2, -3.0], [8.2, 3.0], [-10.0, 4.4], [8.0, 8.2]] as const) box('hazard', rx, 0, rz, 0.5, 0.085, 0.4, false);

// ---- Security cameras hung from the ceiling, panning slowly: one over each corner of the hall and two over the bay. ----
[
  { x: -14.6, z: -7.6, yaw: -2.356, phase: 0 }, { x: 14.6, z: -7.6, yaw: 2.356, phase: 1.7 },
  { x: -14.6, z: 7.6, yaw: -0.785, phase: 3.1 }, { x: 14.6, z: 7.6, yaw: 0.785, phase: 4.4 },
  { x: 0, z: -4.4, yaw: Math.PI, phase: 2.2 }, { x: 0, z: 4.4, yaw: 0, phase: 5.3 },
].forEach((c) => m.camera({ x: c.x, y: 3.75, z: c.z, yaw: c.yaw, sweep: 0.8, speed: 0.55, phase: c.phase }));

// ---- Small inner walls: chest-high cover panels in the open space. Solid, with a metal cap and a blue light strip on both
// faces. None stands inside the podium's clear floor (x +-5.5, z +-2.5 around the origin) or on a cable, pickup or spawn. ----
/**
 * One cover wall of the given length along `axis`, centred on (cx, cz).
 * @param axis - 'x' for a wall running east-west, 'z' for one running north-south.
 */
function coverWall(axis: 'x' | 'z', cx: number, cz: number, len: number): void {
  const H = 1.5, T = 0.2;
  const w = axis === 'x' ? len : T, d = axis === 'x' ? T : len;
  box('wainSlate', cx, 0, cz, w, H, d);
  box('metal', cx, H, cz, axis === 'x' ? len + 0.04 : T + 0.04, 0.04, axis === 'x' ? T + 0.04 : len + 0.04, false);
  for (const f of [-1, 1] as const) {
    if (axis === 'x') box('signBlue', cx, 0.85, cz + f * (T / 2 + 0.015), len - 0.3, 0.04, 0.03, false);
    else box('signBlue', cx + f * (T / 2 + 0.015), 0.85, cz, 0.03, 0.04, len - 0.3, false);
  }
}
coverWall('x', -2.5, 3.9, 2.4);
coverWall('x', 2.5, -3.9, 2.4);
coverWall('z', -7.6, -0.5, 2.4);
coverWall('z', 7.6, 0.5, 2.4);
coverWall('x', -2.5, 10.4, 3.0);
coverWall('x', 2.5, 11.2, 3.0);
coverWall('x', -8, -10.2, 2.4);
coverWall('x', 8, -10.2, 2.4);

// ---- Ceiling: blue cable trays and grey ducts run across, pipes and sprinklers, long linear lights. ----
for (const z of [-9.9, 9.9]) {
  // The north run stops at the control room's walls on both sides (it would otherwise cross the room's ceiling).
  const runs: readonly (readonly [number, number])[] = z < 0 ? [[X0, -CR_HALF - WALL_T / 2], [CR_HALF + WALL_T / 2, X1]] : [[X0, X1]];
  for (const [r0, r1] of runs) {
    const cx = (r0 + r1) / 2, len = r1 - r0;
    box('metal', cx, 3.45, z - 0.55, len, 0.05, 0.5, false);
    box('blue', cx, 3.5, z - 0.62, len, 0.1, 0.14, false);
    box('blue', cx, 3.5, z - 0.46, len, 0.1, 0.14, false);
    box('duct', cx, 3.4, z + 0.45, len, 0.4, 0.5, false);
  }
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
hangingSign('AISLE 1 · COLD', -9, -9.9, 'accentBlue');
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
  { kind: 'grenade', x: 2.9, z: -9.6 },
  { kind: 'grenade', x: -8, z: 10.5 },
  { kind: 'grenade', x: 8, z: -8.5 },
  // Guns (only active under the "pistol only" loadout): SMG in the north-west lane, Shredder in the control room,
  // Laser Pointer in the tape vault. There is no RPG here: it stays an office reward.
  { kind: 'weapon', weapon: 1, x: -13, z: -9 },
  { kind: 'weapon', weapon: 2, x: -2.9, z: -9.6 },
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
    id: 'control', name: 'Control room', x0: -CR_HALF, x1: CR_HALF, z0: Z0 - 1, z1: CR_WALL_Z,
    ambient: { color: 0x5a88d8, level: 0.1 },
    panels: { color: 0xcfe0ff, intensity: 0.45, radius: 6 },
    fog: { color: 0x0c1220, density: 0.012 }, floor: 0.45,
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
/** Ceiling security cameras (the client pans them). */
export const CAMERAS: readonly CameraSpec[] = m.cameras;
/** Animated monitors and video-wall panels (control room, rack consoles, UPS meters). */
export const SCREENS: readonly ScreenSpec[] = m.screens;
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
