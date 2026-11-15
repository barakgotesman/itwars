/**
 * The shooting range: a small standalone practice map, built independently of the office (own local
 * box/light/label registries, not `builder.ts`'s shared ones, so the two maps never mix). One plain
 * rectangular hall, no internal walls (nothing for a player to clip through): a tiled standing area behind a
 * shooting bench (the firing line, with three numbered booths), then a long dark rubber-floored range with a
 * spotlit target dummy at each gun's falloff distance, hanging distance signs, ceiling rails and baffles, and an
 * IT-department joke at the far end. Used only by `rules.mode === 'range'` rooms (see `server/rooms/room.ts`);
 * that mode also turns off all damage (`server/sim/damage.ts`) and keeps every magazine and grenade full
 * (`server/sim/weapons.ts`, `grenades.ts`). The player arrives with the pistol only, like in a match; the
 * other three guns wait on the armory table behind the spawn, and that table is never emptied
 * (`server/sim/pickups.ts`), so any gun can be tried at any time.
 */
import type { Aabb } from '@shared/core/physics';
import { CEILING_H, WALL_T } from './builder';
import type { BoardSpec, LabelSpec, LightSource, MapBox, MaterialId } from './types';
import type { PickupSpot } from './pickups';
import type { Zone } from './zones';

const boxes: MapBox[] = [];
const lights: LightSource[] = [];
const labels: LabelSpec[] = [];

/** Adds a visible box given centre x/z, base y and size. */
function box(mat: MaterialId, cx: number, y: number, cz: number, w: number, h: number, d: number, solid = true): void {
  boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minY: y, maxY: y + h, minZ: cz - d / 2, maxZ: cz + d / 2, mat, solid });
}

/** Floor slab whose top face is y = 0. */
function floor(mat: MaterialId, x0: number, x1: number, z0: number, z1: number): void {
  box(mat, (x0 + x1) / 2, -1, (z0 + z1) / 2, x1 - x0, 1, z1 - z0);
}

/** A thin, non-solid painted stripe lying flush on the floor. */
function stripe(mat: MaterialId, x0: number, x1: number, z0: number, z1: number): void {
  box(mat, (x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, false);
}

/** Registers a baked point light. */
function lamp(x: number, y: number, z: number, color: number, intensity: number, radius: number): void {
  lights.push({ x, y, z, color, intensity, radius });
}

/** A wall-mounted plaque. */
function plaque(text: string, x: number, y: number, z: number, axis: 'x' | 'z', facing: 1 | -1, w: number, h: number, accent: MaterialId): void {
  labels.push({ text, x, y, z, axis, facing, w, h, accent });
}

// One hall, 12 m wide (x -6..6), from the spawn wall (z 6, near) to the backstop (z -42, far). No
// internal walls: the only thing dividing the standing area from the range is the shooting bench at
// `FIRING_LINE_Z`, so there is nothing here for a player to clip through.
const X0 = -6, X1 = 6, Z_FAR = -42, Z_NEAR = 6;
const FIRING_LINE_Z = -2;
/** Bench height (m): below eye height (~1.6 m), so shots and grenades clear it; only walking is blocked. */
const FIRING_LINE_H = 1.0;
const MID_Z = (Z_FAR + Z_NEAR) / 2;

floor('floorDark', X0 - WALL_T, X1 + WALL_T, Z_FAR - WALL_T, FIRING_LINE_Z);
floor('rangeTile', X0 - WALL_T, X1 + WALL_T, FIRING_LINE_Z, Z_NEAR + WALL_T);

// Backstop: a solid wall plus a thick concrete block behind it, so nothing over-penetrates.
box('rangeGreen', 0, 0, Z_FAR - WALL_T / 2, X1 - X0 + WALL_T, CEILING_H, WALL_T);
box('concrete', 0, 0, Z_FAR - WALL_T - 1, X1 - X0 + WALL_T, CEILING_H, 2);
stripe('hazard', X0, X1, Z_FAR + 1.3, Z_FAR + 1.7);

// South wall (behind the spawn), west and east walls, ceiling: one unbroken box, no gaps.
box('rangeGreen', 0, 0, Z_NEAR + WALL_T / 2, X1 - X0 + WALL_T, CEILING_H, WALL_T);
box('rangeGreen', X0 - WALL_T / 2, 0, MID_Z, WALL_T, CEILING_H, Z_NEAR - Z_FAR + WALL_T);
box('rangeGreen', X1 + WALL_T / 2, 0, MID_Z, WALL_T, CEILING_H, Z_NEAR - Z_FAR + WALL_T);
box('ceiling', 0, CEILING_H, MID_Z, X1 - X0 + 2 * WALL_T, 0.3, Z_NEAR - Z_FAR + 2 * WALL_T);
// Periodic ceiling support beams, for structure rather than one flat slab.
for (let z = Z_NEAR - 4; z > Z_FAR; z -= 6) box('metal', 0, CEILING_H - 0.3, z, X1 - X0, 0.25, 0.3, false);

// Wall dressing (flat, non-solid): a grey wainscot with an orange rail along both side walls, and a yellow
// safety strip on the floor beside each wall of the lane.
for (const s of [-1, 1] as const) {
  const wx = s < 0 ? X0 + 0.03 : X1 - 0.03;
  box('wainGray', wx, 0, MID_Z, 0.06, 1.1, Z_NEAR - Z_FAR, false);
  box('accentOrange', wx, 1.1, MID_Z, 0.08, 0.05, Z_NEAR - Z_FAR, false);
  stripe('hazard', s < 0 ? X0 : X1 - 0.18, s < 0 ? X0 + 0.18 : X1, Z_FAR + 2, FIRING_LINE_Z - 0.4);
}
// Lanes: two white lines split the range into the three booths' lanes.
for (const lx of [-2, 2]) stripe('white', lx - 0.04, lx + 0.04, Z_FAR + 2, FIRING_LINE_Z - 0.4);

// Shooting bench (the firing line): a solid body and a wooden top across the whole width, so you are stopped
// by something you can see. It is lower than eye height, so level shots and lobbed grenades clear it. A red
// neon strip runs along its front.
box('dark', 0, 0, FIRING_LINE_Z, X1 - X0, FIRING_LINE_H - 0.08, 0.2);
box('wood', 0, FIRING_LINE_H - 0.08, FIRING_LINE_Z, X1 - X0, 0.08, 0.6);
box('signRed', 0, 0.45, FIRING_LINE_Z + 0.11, X1 - X0 - 0.2, 0.05, 0.03, false);
stripe('hazard', X0, X1, FIRING_LINE_Z + 0.3, FIRING_LINE_Z + 0.6);
plaque('FIRING LINE', X0 - 0.05, 2.1, FIRING_LINE_Z, 'z', 1, 1.6, 0.4, 'accentRed');
// Booth dividers at x = -2 and 2: a solid bench-height panel (nothing to shoot through at eye height) with a
// frame and a pane of glass above it, like the stalls of a real range. Three lanes, numbered overhead.
for (const dx of [-2, 2]) {
  box('dark', dx, 0, FIRING_LINE_Z + 0.6, 0.12, FIRING_LINE_H, 1.2);
  box('frame', dx, FIRING_LINE_H, FIRING_LINE_Z + 1.15, 0.12, 1.15, 0.1, false);
  box('frame', dx, FIRING_LINE_H, FIRING_LINE_Z + 0.05, 0.12, 1.15, 0.1, false);
  box('frame', dx, 2.1, FIRING_LINE_Z + 0.6, 0.12, 0.1, 1.2, false);
  box('glass', dx, FIRING_LINE_H, FIRING_LINE_Z + 0.6, 0.04, 1.1, 1.0, false);
}
[-4, 0, 4].forEach((lx, k) => {
  box('dark', lx, 3.1, FIRING_LINE_Z + 0.5, 0.9, 0.6, 0.3, false);
  box('signOrange', lx, 3.05, FIRING_LINE_Z + 0.5, 0.7, 0.05, 0.24, false);
  for (const rx of [-0.35, 0.35]) box('frame', lx + rx, 3.7, FIRING_LINE_Z + 0.5, 0.04, CEILING_H - 3.7, 0.04, false);
  plaque(String(k + 1), lx, 3.4, FIRING_LINE_Z + 0.5 + 0.17, 'x', 1, 0.55, 0.55, 'accentOrange');
});
// Ceiling lights over the standing area, and a green "ready" strip over the lanes.
for (const lx of [-3, 3]) box('light', lx, CEILING_H - 0.05, 2.5, 1.6, 0.1, 0.9, false);
box('light', 0, CEILING_H - 0.05, 0.5, 1.6, 0.1, 0.9, false);
box('signGreen', 0, CEILING_H - 0.08, FIRING_LINE_Z - 0.4, X1 - X0 - 1, 0.06, 0.1, false);
lamp(-3, CEILING_H - 0.4, 2.5, 0xfff0d8, 0.5, 6);
lamp(3, CEILING_H - 0.4, 2.5, 0xfff0d8, 0.5, 6);

// Standing area: the armory, a long counter along the back wall with the three guns to pick up on it
// (the player spawns with the pistol only) and ammo-crate decor at the ends, plus a pegboard with the
// ear protection and the guns' outlines. The lamp sits at ceiling height, well above head height, so it never
// flares or dims sharply as the player walks underneath (a lamp low and close to a walkway bakes a harsh gradient).
const TABLE_Z = Z_NEAR - 1.4;
const TABLE_H = 0.9;
box('dark', 0, 0, TABLE_Z, 10, TABLE_H - 0.06, 0.6);
box('wood', 0, TABLE_H - 0.06, TABLE_Z, 10.2, 0.06, 0.6);
box('crate', -4.6, TABLE_H, TABLE_Z, 0.5, 0.4, 0.5);
box('cardboard', 4.6, TABLE_H, TABLE_Z, 0.5, 0.35, 0.5);
box('rack', 0, 1.0, Z_NEAR - 0.03, 10, 1.1, 0.06, false);
for (let k = 0; k < 4; k++) {
  const gx = (k - 1.5) * 2.4;
  box('metal', gx, 1.38, Z_NEAR - 0.08, 1.1, 0.14, 0.04, false);
  box('metal', gx - 0.4, 1.12, Z_NEAR - 0.08, 0.16, 0.26, 0.04, false);
}
for (const ex of [-5.1, -4.8, 4.8, 5.1]) {
  box('red', ex, 1.78, Z_NEAR - 0.12, 0.18, 0.16, 0.1, false);
  box('dark', ex, 1.94, Z_NEAR - 0.1, 0.2, 0.04, 0.04, false);
}
plaque('ARMORY', 0, 2.35, Z_NEAR - 0.05, 'x', -1, 2.4, 0.5, 'accentRed');
lamp(0, CEILING_H - 0.4, Z_NEAR - 1, 0xffdcb0, 0.9, 8);
// Side furniture: a bench by the west wall, lockers on the east wall, and a poster on each wall.
box('wood', X0 + 0.35, 0.42, 0.9, 0.5, 0.06, 2.2);
for (const bz of [-0.1, 1.9]) box('frame', X0 + 0.35, 0, bz + 0.1, 0.4, 0.42, 0.06);
for (let k = 0; k < 3; k++) box('wainSlate', X1 - 0.3, 0, 0.9 + k * 0.62, 0.5, 1.9, 0.58);
plaque('EARS ON  EYES ON', X0 - 0.05, 2.0, 1.8, 'z', 1, 1.8, 0.45, 'accentOrange');
plaque('HAVE YOU TRIED TURNING THEM OFF?', X1 + 0.05, 2.1, 1.5, 'z', -1, 3.0, 0.6, 'accentBlue');
/** The guns on the table, in slot order: SMG, Shredder, Laser Pointer, RPG. Pickup radius reaches them from in front of the table. */
const ARMORY: PickupSpot[] = ([1, 2, 3, 4] as const).map((weapon, k) => ({ kind: 'weapon', weapon, x: (k - 1.5) * 2.4, z: TABLE_Z, y: TABLE_H }));

/** Each target's distance down the range and its marker text; the dummy itself is a real bot (see `server/sim/range-dummy.ts`). */
export const TARGETS: readonly { z: number; label: string }[] = [
  { z: -6, label: '6M' }, { z: -16, label: '16M' }, { z: -27, label: '27M' }, { z: -37, label: '37M' },
];
// Distance markers and a spotlight pool over each target, all well above head height so nothing
// flares or dims sharply as the player walks the lane (shotgun falls off at 5-22 m, SMG 15-45 m,
// pistol 25-70 m; the sniper has no falloff, so the far target is its teaching moment).
for (const { z, label } of TARGETS) {
  stripe('hazard', X0, X1, z - 0.2, z + 0.2);
  plaque(label, X0 - 0.05, 1.8, z, 'z', 1, 1.0, 0.4, 'accentRed');
  box('light', 0, CEILING_H - 0.05, z, 1.4, 0.1, 1.4, false);
  lamp(0, CEILING_H - 0.4, z, 0xffe8c8, 1.3, 7.5);
}
// Overhead distance signs (a dark housing with an orange glow strip, hung just on the player's side of each
// target so they never hide it), ceiling rails that carry the targets, and baffles at the sides.
for (const { z, label } of TARGETS) {
  box('dark', 0, 3.1, z + 1.5, 1.1, 0.6, 0.3, false);
  box('signOrange', 0, 3.05, z + 1.5, 0.9, 0.05, 0.24, false);
  for (const rx of [-0.45, 0.45]) box('frame', rx, 3.7, z + 1.5, 0.04, CEILING_H - 3.7, 0.04, false);
  plaque(label, 0, 3.4, z + 1.5 + 0.17, 'x', 1, 0.9, 0.5, 'accentOrange');
}
for (const rx of [-2, 2]) box('metal', rx, CEILING_H - 0.35, (Z_FAR + FIRING_LINE_Z) / 2, 0.15, 0.15, FIRING_LINE_Z - Z_FAR, false);
for (const bz of [-11, -22, -32]) {
  for (const s of [-1, 1]) box('dark', s * 4.4, 3.3, bz, 3.2, 0.9, 0.15, false);
}

// The far end: a dark bullet-trap panel with a hazard frame and the range's name, sandbags along the foot of
// the wall and the IT department's contribution, a heap of dead printers, monitors and towers to shoot at.
box('rack', 0, 0.3, Z_FAR + 0.08, 11.6, 3.3, 0.16, false);
box('hazard', 0, 3.55, Z_FAR + 0.1, 11.8, 0.12, 0.2, false);
box('hazard', 0, 0.2, Z_FAR + 0.1, 11.8, 0.12, 0.2, false);
for (const s of [-1, 1]) box('hazard', s * 5.85, 0.2, Z_FAR + 0.1, 0.12, 3.47, 0.2, false);
plaque('IT WARS RANGE', 0, 3.0, Z_FAR + 0.2, 'x', 1, 5.0, 0.8, 'accentOrange');
for (let k = 0; k < 10; k++) box('crate', -5.4 + k * 1.2, 0, Z_FAR + 0.55, 1.0, 0.45, 0.5, false);
for (const s of [-1, 1]) {
  box('white', s * 4.6, 0, Z_FAR + 1.0, 1.0, 0.5, 0.7, false);
  box('white', s * 4.3, 0.5, Z_FAR + 1.0, 0.8, 0.35, 0.6, false);
  box('screenOff', s * 5.4, 0, Z_FAR + 1.0, 0.6, 0.55, 0.55, false);
  box('screenOff', s * 5.3, 0.55, Z_FAR + 1.0, 0.5, 0.45, 0.45, false);
  box('rack', s * 3.7, 0, Z_FAR + 1.0, 0.3, 0.9, 0.6, false);
  box('screenBsod', s * 5.4, 0.6, Z_FAR + 1.28, 0.34, 0.3, 0.02, false);
}
plaque('PRINTER GRAVEYARD', 0, 1.2, Z_FAR + 0.2, 'x', 1, 2.6, 0.4, 'accentRed');
// Dim cool fill light between the target pools, so the range reads as dark and dramatic, not black.
for (const z of [-11, -22, -32]) lamp(0, CEILING_H - 0.6, z, 0x8fa6c0, 0.22, 11);

/** Ceiling height, matching the office. */
export { CEILING_H };
/** Collision boxes: every solid box (the shooting bench is the firing line). */
export const SOLIDS: readonly Aabb[] = boxes.filter((b) => b.solid);
/** Every rendered box in the map. */
export const MAP_BOXES: readonly MapBox[] = boxes;
/** Baked light sources the client turns into vertex lighting. */
export const LIGHTS: readonly LightSource[] = lights;
/** Distance plaques, lane numbers and wall signs. */
export const LABELS: readonly LabelSpec[] = labels;
/** No live scoreboards here. */
export const BOARDS: readonly BoardSpec[] = [];
/** The armory table's guns; ammo and grenades are replenished server-side instead of being pickups. */
export const PICKUP_SPOTS: readonly PickupSpot[] = ARMORY;
/** One spawn, behind the firing line, facing down the range (yaw 0 faces -z). */
export const SPAWNS: readonly [number, number][] = [[0, 3]];
/** One zone: dark and moody down the range, lifted only by the targets' own spotlights. */
export const ZONES: readonly Zone[] = [
  {
    id: 'range', name: 'Shooting Range',
    x0: X0 - 2, x1: X1 + 2, z0: Z_FAR - 2, z1: Z_NEAR + 2,
    ambient: { color: 0x7c8aa0, level: 0.11 },
    panels: { color: 0xffe8c8, intensity: 1.3, radius: 6.5 },
    fog: { color: 0x23262e, density: 0.014 }, floor: 0.32,
  },
];
/** Bounding box of the whole map, for the client's light-field grid. */
export const BOUNDS = { x0: X0 - 2, x1: X1 + 2, z0: Z_FAR - 2, z1: Z_NEAR + 2 };
