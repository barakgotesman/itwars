/**
 * The shooting range: a small standalone practice map, built independently of the office (own local
 * box/light/label registries, not `builder.ts`'s shared ones, so the two maps never mix). One plain
 * rectangular hall, no internal walls (nothing for a player to clip through): a standing area behind an
 * invisible firing line, then a long dark range with a spotlit target dummy at each gun's falloff
 * distance. Used only by `rules.mode === 'range'` rooms (see `server/rooms/room.ts`); that mode also
 * turns off all damage (`server/sim/damage.ts`) and keeps every magazine and grenade full
 * (`server/sim/weapons.ts`, `grenades.ts`).
 */
import type { Aabb } from '@shared/core/physics';
import { CEILING_H, WALL_T } from './builder';
import type { BoardSpec, LabelSpec, LightSource, MapBox, MaterialId } from './types';
import type { PickupSpot } from './pickups';
import type { Zone } from './zones';

const boxes: MapBox[] = [];
/** Collides like a wall but is never drawn and stops short of head height (see `FIRING_LINE_Z` below). */
const invisible: Aabb[] = [];
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
// internal walls: the only thing dividing the standing area from the range is the invisible firing
// line at `FIRING_LINE_Z`, so there is nothing here for a player to clip through.
const X0 = -6, X1 = 6, Z_FAR = -42, Z_NEAR = 6;
const FIRING_LINE_Z = -2;
/** Below eye height (~1.6 m), so shots and grenades clear it; only walking is blocked. */
const FIRING_LINE_H = 1.0;

floor('concrete', X0 - WALL_T, X1 + WALL_T, Z_FAR - WALL_T, FIRING_LINE_Z);
floor('rug', X0 - WALL_T, X1 + WALL_T, FIRING_LINE_Z, Z_NEAR + WALL_T);

// Backstop: a solid wall plus a thick concrete block behind it, so nothing over-penetrates.
box('wall', 0, 0, Z_FAR - WALL_T / 2, X1 - X0 + WALL_T, CEILING_H, WALL_T);
box('concrete', 0, 0, Z_FAR - WALL_T - 1, X1 - X0 + WALL_T, CEILING_H, 2);
stripe('hazard', X0, X1, Z_FAR + 1.3, Z_FAR + 1.7);

// South wall (behind the spawn), west and east walls, ceiling: one unbroken box, no gaps.
box('wall', 0, 0, Z_NEAR + WALL_T / 2, X1 - X0 + WALL_T, CEILING_H, WALL_T);
box('wall', X0 - WALL_T / 2, 0, (Z_FAR + Z_NEAR) / 2, WALL_T, CEILING_H, Z_NEAR - Z_FAR + WALL_T);
box('wall', X1 + WALL_T / 2, 0, (Z_FAR + Z_NEAR) / 2, WALL_T, CEILING_H, Z_NEAR - Z_FAR + WALL_T);
box('ceiling', 0, CEILING_H, (Z_FAR + Z_NEAR) / 2, X1 - X0 + 2 * WALL_T, 0.3, Z_NEAR - Z_FAR + 2 * WALL_T);
// Periodic ceiling support beams, for structure rather than one flat slab.
for (let z = Z_NEAR - 4; z > Z_FAR; z -= 6) box('metal', 0, CEILING_H - 0.3, z, X1 - X0, 0.25, 0.3, false);

// Firing line: an invisible waist-high barrier (keeps walking out of the range; low enough that
// roughly level shots and lobbed grenades clear it) and a painted floor stripe with a wall sign, so
// the player can see why they are stopped. No wall fixtures here: the walls on either side of it are
// the same one unbroken box as the rest of the hall -- there is no doorway, gap or frame at this line.
invisible.push({ minX: X0, maxX: X1, minY: 0, maxY: FIRING_LINE_H, minZ: FIRING_LINE_Z - 0.1, maxZ: FIRING_LINE_Z + 0.1 });
stripe('hazard', X0, X1, FIRING_LINE_Z - 0.15, FIRING_LINE_Z + 0.15);
plaque('FIRING LINE', X0 - 0.05, 2.1, FIRING_LINE_Z, 'z', 1, 1.6, 0.4, 'accentRed');

// Standing area: a counter with ammo-crate decor, a mat, and a rack suggesting ear protection. The
// lamp sits at ceiling height, well above head height, so it never flares or dims sharply as the
// player walks underneath (a lamp low and close to a walkway bakes a harsh, fast-changing gradient).
box('wood', 0, 0, Z_NEAR - 1.4, 3.2, 0.9, 0.6);
box('crate', -0.8, 0.9, Z_NEAR - 1.4, 0.5, 0.4, 0.5);
box('cardboard', 0.6, 0.9, Z_NEAR - 1.4, 0.5, 0.35, 0.5);
for (const s of [-1, 1] as const) box('metal', s * 2.2, 1.6, Z_NEAR - 0.3, 0.06, 0.8, 0.06, false);
lamp(0, CEILING_H - 0.4, Z_NEAR - 1, 0xffdcb0, 0.9, 8);

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
// Dim cool fill light between the target pools, so the range reads as dark and dramatic, not black.
for (const z of [-11, -22, -32]) lamp(0, CEILING_H - 0.6, z, 0x8fa6c0, 0.22, 11);

/** Ceiling height, matching the office. */
export { CEILING_H };
/** Collision boxes: every solid box plus the invisible firing line barrier. */
export const SOLIDS: readonly Aabb[] = [...boxes.filter((b) => b.solid), ...invisible];
/** Every rendered box in the map (the firing-line barrier is not among them: it is never drawn). */
export const MAP_BOXES: readonly MapBox[] = boxes;
/** Baked light sources the client turns into vertex lighting. */
export const LIGHTS: readonly LightSource[] = lights;
/** Distance plaques and the firing-line sign. */
export const LABELS: readonly LabelSpec[] = labels;
/** No live scoreboards here. */
export const BOARDS: readonly BoardSpec[] = [];
/** No pickups: ammo and grenades are replenished server-side instead. */
export const PICKUP_SPOTS: readonly PickupSpot[] = [];
/** One spawn, behind the firing line, facing down the range (yaw 0 faces -z). */
export const SPAWNS: readonly [number, number][] = [[0, 3]];
/** One zone: dark and moody down the range, lifted only by the targets' own spotlights. */
export const ZONES: readonly Zone[] = [
  {
    id: 'range', name: 'Shooting Range',
    x0: X0 - 2, x1: X1 + 2, z0: Z_FAR - 2, z1: Z_NEAR + 2,
    ambient: { color: 0x7c8aa0, level: 0.09 },
    panels: { color: 0xffe8c8, intensity: 1.3, radius: 6.5 },
    fog: { color: 0x23262e, density: 0.014 }, floor: 0.32,
  },
];
/** Bounding box of the whole map, for the client's light-field grid. */
export const BOUNDS = { x0: X0 - 2, x1: X1 + 2, z0: Z_FAR - 2, z1: Z_NEAR + 2 };
