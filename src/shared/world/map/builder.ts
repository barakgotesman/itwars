/**
 * Low-level map builder: the shared box/light/label registries, dimensions, and the primitives
 * (box, walls with door frames, floors, signs) every room module is made of.
 */
import type { BoardSpec, Gap, LabelSpec, LightSource, MapBox, MaterialId } from './types';

export const CEILING_H = 4.2;
export const WALL_T = 0.5;
export const DOOR_W = 3.2;
export const LINTEL_Y = 3.0;
export const X0 = -50;
export const X1 = 50;
export const Z0 = -35;
export const Z1 = 35;
/** Half wall thickness; outer walls are shifted by it so the playable area is exactly X0..X1. */
export const EDGE = WALL_T / 2;

/** Every box in the map, solid or decorative. */
export const boxes: MapBox[] = [];
/** Baked light sources. */
export const lights: LightSource[] = [];
/** Door nameplates, banners and wall plaques. */
export const labels: LabelSpec[] = [];
/** Live scoreboard screens. */
export const boards: BoardSpec[] = [];

/** Registers a baked point light. */
export function lamp(x: number, y: number, z: number, color: number, intensity: number, radius: number): void {
  lights.push({ x, y, z, color, intensity, radius });
}

/**
 * Adds a box given centre x/z, base y and size; keeps map code readable.
 * @param mat - Material key.
 * @param solid - False for decoration that must not block movement or shots.
 */
export function box(mat: MaterialId, cx: number, y: number, cz: number, w: number, h: number, d: number, solid = true): void {
  boxes.push({
    minX: cx - w / 2, maxX: cx + w / 2,
    minY: y, maxY: y + h,
    minZ: cz - d / 2, maxZ: cz + d / 2,
    mat, solid,
  });
}

/** Deterministic PRNG so props land in the same place on server and clients. */
export function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Shared PRNG for scattered props (crates). */
export const rng = makeRng(1337);

/** Floor slab whose top face is y = 0; the material decides the generated texture. */
export function floor(mat: MaterialId, x0: number, x1: number, z0: number, z1: number): void {
  box(mat, (x0 + x1) / 2, -1, (z0 + z1) / 2, x1 - x0, 1, z1 - z0);
}

/**
 * Flat decoration (poster, screen, sign) lying against a wall.
 * @param axis - 'x' for a panel facing along z (thin in z), 'z' for one facing along x.
 */
export function sign(mat: MaterialId, cx: number, y: number, cz: number, w: number, h: number, axis: 'x' | 'z'): void {
  if (axis === 'x') box(mat, cx, y, cz, w, h, 0.06, false);
  else box(mat, cx, y, cz, 0.06, h, w, false);
}

/** Framed poster against a wall; frame first so the art sits slightly proud of it. */
export function poster(mat: MaterialId, cx: number, y: number, cz: number, w: number, h: number, axis: 'x' | 'z'): void {
  if (axis === 'x') {
    box('frame', cx, y - 0.05, cz, w + 0.12, h + 0.12, 0.05, false);
    box(mat, cx, y, cz, w, h, 0.07, false);
  } else {
    box('frame', cx, y - 0.05, cz, 0.05, h + 0.12, w + 0.12, false);
    box(mat, cx, y, cz, 0.07, h, w, false);
  }
}

/** Text plaque hanging from the ceiling on thin cords, readable from both sides. */
export function banner(text: string, x: number, y: number, z: number, w: number, h: number, accent: MaterialId): void {
  for (const facing of [1, -1] as const) labels.push({ text, x, y, z: z + facing * 0.04, axis: 'x', facing, w, h, accent });
  box('dark', x - w / 2 + 0.1, y + h / 2, z, 0.03, CEILING_H - y - h / 2, 0.03, false);
  box('dark', x + w / 2 - 0.1, y + h / 2, z, 0.03, CEILING_H - y - h / 2, 0.03, false);
}

/**
 * Wall-mounted live scoreboard: a dark bezel, a lamp for the screen's glow, and a registry entry the client draws on.
 * @param axis - 'x' for a wall running along X, 'z' for one along Z.
 * @param along - Centre of the screen along the wall.
 * @param face - Coordinate of the wall's room-side face on the other axis.
 * @param facing - +1 or -1: which way the screen faces along the wall's normal.
 * @param yc - Height of the screen's centre.
 */
export function scoreboard(axis: 'x' | 'z', along: number, face: number, facing: 1 | -1, yc: number, w: number, h: number): void {
  const n = face + facing * 0.05;
  if (axis === 'x') box('dark', along, yc - h / 2 - 0.12, n, w + 0.24, h + 0.24, 0.1, false);
  else box('dark', n, yc - h / 2 - 0.12, along, 0.1, h + 0.24, w + 0.24, false);
  const sx = axis === 'x' ? along : face + facing * 0.11;
  const sz = axis === 'x' ? face + facing * 0.11 : along;
  boards.push({ axis, x: sx, y: yc, z: sz, facing, w, h });
  // A cool wash on the floor in front, as if the screen lit the room.
  lamp(axis === 'x' ? along : face + facing * 2.2, yc - 0.2, axis === 'x' ? face + facing * 2.2 : along, 0xcfe2ff, 0.55, 7);
}

/** Plaque mounted flat on a wall running along Z (east/west outer walls). */
export function wallPlaque(text: string, x: number, y: number, z: number, facing: 1 | -1, w: number, accent: MaterialId): void {
  labels.push({ text, x, y, z, axis: 'z', facing, w, h: 0.55, accent });
}

/**
 * Door dressing: architrave and frame, threshold, nameplate and card reader, and for standard
 * doors a pair of open leaves folded flat against the wall on the room side (panels, hinges,
 * lever handle, kick plate, vision panel). All decorative, so the opening stays clear for
 * movement and shots.
 * @param along - Door centre along the wall.
 * @param fixed - Wall coordinate on the other axis.
 * @param axis - 'x' for a wall running along X, 'z' for one along Z.
 * @param accent - Material used for the door leaves and nameplate tint.
 * @param side - Which way the room lies from the wall (+1 or -1 on the wall's normal axis).
 */
function doorFrame(
  along: number, fixed: number, w: number, axis: 'x' | 'z',
  accent: MaterialId, side: 1 | -1, label?: string, slides = false,
): void {
  const depth = WALL_T + 0.12;
  const j = 0.12;
  // Boxes are authored for axis 'x'; `at` swaps coordinates for axis 'z'.
  const at = (a: number, y: number, n: number, la: number, h: number, ln: number, mat: MaterialId, solid = false): void => {
    if (axis === 'x') box(mat, a, y, fixed + n, la, h, ln, solid);
    else box(mat, fixed + n, y, a, ln, h, la, solid);
  };
  at(along - w / 2 + j / 2, 0, 0, j, LINTEL_Y, depth, 'frame');
  at(along + w / 2 - j / 2, 0, 0, j, LINTEL_Y, depth, 'frame');
  at(along, LINTEL_Y - j, 0, w, j, depth, 'frame');
  // Architrave: a wider, slightly deeper casing around the frame on both faces.
  for (const f of [1, -1] as const) {
    at(along - w / 2 - 0.05, 0, f * (WALL_T / 2 + 0.07), 0.1, LINTEL_Y + 0.12, 0.03, 'trim');
    at(along + w / 2 + 0.05, 0, f * (WALL_T / 2 + 0.07), 0.1, LINTEL_Y + 0.12, 0.03, 'trim');
    at(along, LINTEL_Y + 0.02, f * (WALL_T / 2 + 0.07), w + 0.2, 0.12, 0.03, 'trim');
  }
  at(along, 0, 0, w, 0.015, WALL_T, 'metal'); // threshold strip

  if (label) {
    // The name goes on the outside of the doorway only (the room lies on the `side` of the wall); inside, you already know where you are.
    for (const facing of [-side as 1 | -1]) {
      labels.push({
        text: label, axis, facing, accent,
        x: axis === 'x' ? along : fixed + facing * 0.28,
        y: 3.45,
        z: axis === 'x' ? fixed + facing * 0.28 : along,
        // Wide enough to read from across the open plan; the 5.6 : 1 shape matches the sign atlas in `client/render/signs.ts`.
        w: Math.min(w + 0.2, 3.6), h: 0.64,
      });
    }
  }

  // A working sliding door replaces the decorative static leaves and the card reader.
  if (slides || w > DOOR_W + 0.01) return;

  // Card reader beside the latch jamb, on the corridor side of the wall.
  const rn = -side * (WALL_T / 2 + 0.03);
  at(along + w / 2 + 0.35, 1.2, rn, 0.12, 0.2, 0.05, 'dark');
  at(along + w / 2 + 0.35, 1.3, rn - side * 0.0, 0.05, 0.04, 0.07, accent === 'accentRed' ? 'signRed' : 'signGreen');

  const leaf = 1.5;
  const n = side * 0.375; // clear of the wainscot and accent rail layers
  for (const s of [-1, 1] as const) {
    const c = along + s * (w / 2 + 0.06 + leaf / 2);
    at(c, 0.04, n, leaf, 2.84, 0.05, accent);
    at(c, 0.04, n, leaf, 0.25, 0.07, 'metal'); // kick plate
    at(c, 1.2, n, 0.32, 1.0, 0.07, 'glass'); // vision panel
    // Raised panels give the leaf some relief.
    at(c, 0.4, n + side * 0.03, leaf - 0.4, 0.6, 0.03, 'frame');
    at(c, 2.0, n + side * 0.03, leaf - 0.4, 0.6, 0.03, 'frame');
    // Hinges sit at the jamb (the door is swung back 180 degrees), lever at the far edge.
    for (const hy of [0.35, 1.4, 2.4]) at(along + s * (w / 2 + 0.07), hy, n + side * 0.03, 0.05, 0.14, 0.05, 'metal');
    const hx = along + s * (w / 2 + 0.06 + leaf - 0.12);
    at(hx, 0.95, n + side * 0.06, 0.05, 0.16, 0.1, 'metal'); // rose
    at(hx - s * 0.07, 0.99, n + side * 0.1, 0.16, 0.04, 0.04, 'metal'); // lever
  }
}

/**
 * Wall along X at `z`; a lintel closes each gap above head height.
 * @param gaps - Door gaps as `[centreX, width, accent?, label?]`.
 * @param roomSide - Which way the room lies from the wall (+1 south, -1 north).
 */
export function wallX(z: number, x0: number, x1: number, gaps: readonly Gap[] = [], roomSide: 1 | -1 = 1): void {
  let cursor = x0;
  for (const [c, w, accent, label, slides] of [...gaps].sort((a, b) => a[0] - b[0])) {
    const l = c - w / 2;
    box('wall', (cursor + l) / 2, 0, z, l - cursor, CEILING_H, WALL_T);
    box('wall', c, LINTEL_Y, z, w, CEILING_H - LINTEL_Y, WALL_T);
    doorFrame(c, z, w, 'x', accent ?? 'accentBlue', roomSide, label, slides);
    cursor = c + w / 2;
  }
  box('wall', (cursor + x1) / 2, 0, z, x1 - cursor, CEILING_H, WALL_T);
}

/**
 * Wall along Z at `x`; a lintel closes each gap above head height.
 * @param gaps - Door gaps as `[centreZ, width, accent?, label?]`.
 * @param roomSide - Which way the room lies from the wall (+1 east, -1 west).
 */
export function wallZ(x: number, z0: number, z1: number, gaps: readonly Gap[] = [], roomSide: 1 | -1 = 1): void {
  let cursor = z0;
  for (const [c, w, accent, label, slides] of [...gaps].sort((a, b) => a[0] - b[0])) {
    const l = c - w / 2;
    box('wall', x, 0, (cursor + l) / 2, WALL_T, CEILING_H, l - cursor);
    box('wall', x, LINTEL_Y, c, WALL_T, CEILING_H - LINTEL_Y, w);
    doorFrame(c, x, w, 'z', accent ?? 'accentBlue', roomSide, label, slides);
    cursor = c + w / 2;
  }
  box('wall', x, 0, (cursor + z1) / 2, WALL_T, CEILING_H, z1 - cursor);
}
