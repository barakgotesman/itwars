/**
 * Wall and ceiling dressing shared by all rooms: wainscot and rails, windows, wall furniture,
 * feature walls, ceiling services and floor decals.
 */
import { box, EDGE, lamp, X0, X1, Z0, Z1 } from './builder';
import { MEETING_LINK, NORTH_DOORS, SERVER_SERVICE, SOUTH_DOORS } from './shell';
import type { Gap, MaterialId } from './types';

/** Free sub-spans of [a, b] once door gaps are cut out. */
function spans(a: number, b: number, gaps: readonly Gap[]): [number, number][] {
  const out: [number, number][] = [];
  let cur = a;
  for (const [c, w] of [...gaps].sort((p, q) => p[0] - q[0])) {
    const l = c - w / 2;
    const r = c + w / 2;
    if (r <= a || l >= b) continue;
    if (l > cur) out.push([cur, l]);
    cur = Math.max(cur, r);
  }
  if (cur < b) out.push([cur, b]);
  return out;
}

/** Wall panelling spec for one room; gaps are the openings on each side so trim skips doorways. */
interface RoomSpec {
  x0: number; x1: number; z0: number; z1: number;
  wain: MaterialId;
  accent: MaterialId;
  n?: readonly Gap[]; s?: readonly Gap[]; w?: readonly Gap[]; e?: readonly Gap[];
}

/** Adds baseboard, panelled wainscot and an accent rail along the inside faces of a room. */
function dressRoom(r: RoomSpec): void {
  const ix0 = r.x0 + EDGE;
  const ix1 = r.x1 - EDGE;
  const iz0 = r.z0 + EDGE;
  const iz1 = r.z1 - EDGE;
  const layer = (mat: MaterialId, y: number, h: number, t: number): void => {
    for (const [a, b] of spans(ix0, ix1, r.n ?? [])) box(mat, (a + b) / 2, y, iz0 + t / 2, b - a, h, t, false);
    for (const [a, b] of spans(ix0, ix1, r.s ?? [])) box(mat, (a + b) / 2, y, iz1 - t / 2, b - a, h, t, false);
    for (const [a, b] of spans(iz0, iz1, r.w ?? [])) box(mat, ix0 + t / 2, y, (a + b) / 2, t, h, b - a, false);
    for (const [a, b] of spans(iz0, iz1, r.e ?? [])) box(mat, ix1 - t / 2, y, (a + b) / 2, t, h, b - a, false);
  };
  layer('dark', 0, 0.14, 0.07);
  layer(r.wain, 0.14, 0.96, 0.05);
  layer(r.accent, 1.1, 0.07, 0.08);
}

const within = (gaps: readonly Gap[], a: number, b: number): Gap[] => gaps.filter((g) => g[0] > a && g[0] < b);

/** Panelling for every room. */
function wainscot(): void {
  dressRoom({ x0: X0, x1: X1, z0: -20, z1: 14, wain: 'wainSlate', accent: 'accentBlue', n: NORTH_DOORS, s: SOUTH_DOORS });
  dressRoom({ x0: X0, x1: -34, z0: Z0, z1: -20, wain: 'wainBrown', accent: 'accentOrange', s: within(NORTH_DOORS, X0, -34) });
  dressRoom({ x0: -34, x1: -20, z0: Z0, z1: -20, wain: 'wainNavy', accent: 'accentBlue', s: within(NORTH_DOORS, -34, -20), e: MEETING_LINK });
  dressRoom({ x0: -20, x1: -6, z0: Z0, z1: -20, wain: 'wainNavy', accent: 'accentBlue', s: within(NORTH_DOORS, -20, -6), w: MEETING_LINK });
  dressRoom({ x0: -6, x1: 10, z0: Z0, z1: -20, wain: 'wainGray', accent: 'accentRed', s: within(NORTH_DOORS, -6, 10), e: SERVER_SERVICE });
  dressRoom({ x0: 10, x1: 24, z0: Z0, z1: -20, wain: 'wainSlate', accent: 'accentBlue', s: within(NORTH_DOORS, 10, 24), w: SERVER_SERVICE });
  dressRoom({ x0: 24, x1: X1, z0: Z0, z1: -20, wain: 'wainGreen', accent: 'accentGreen', s: within(NORTH_DOORS, 24, X1) });
  dressRoom({ x0: X0, x1: -30, z0: 14, z1: Z1, wain: 'wainOrange', accent: 'accentOrange', n: within(SOUTH_DOORS, X0, -30) });
  dressRoom({ x0: -30, x1: -12, z0: 14, z1: Z1, wain: 'wainGray', accent: 'accentOrange', n: within(SOUTH_DOORS, -30, -12) });
  dressRoom({ x0: -12, x1: 12, z0: 14, z1: Z1, wain: 'wainTeal', accent: 'accentOrange', n: within(SOUTH_DOORS, -12, 12), s: [[0, 6]] });
  dressRoom({ x0: 12, x1: 32, z0: 14, z1: Z1, wain: 'wainWine', accent: 'accentOrange', n: within(SOUTH_DOORS, 12, 32) });
  dressRoom({ x0: 32, x1: X1, z0: 14, z1: Z1, wain: 'wainTeal', accent: 'accentBlue', n: within(SOUTH_DOORS, 32, X1) });
}

/**
 * Window on an outer wall: bright sky pane, frame, mullion, and a cool daylight source.
 * @param axis - 'x' for a window on a north/south wall, 'z' for an east/west wall.
 * @param along - Position along the wall.
 * @param face - Coordinate of the wall's inner face on the other axis.
 * @param inward - +1 or -1: which way the room lies from the wall.
 */
function windowPane(axis: 'x' | 'z', along: number, face: number, inward: 1 | -1, w = 3.2): void {
  const y = 1.3;
  const h = 1.8;
  const c = face + inward * 0.03;
  if (axis === 'x') {
    box('sky', along, y, c, w, h, 0.05, false);
    box('frame', along, y - 0.08, c + inward * 0.02, w + 0.2, 0.1, 0.12, false);
    box('frame', along, y + h - 0.02, c + inward * 0.02, w + 0.2, 0.1, 0.12, false);
    box('frame', along, y, c + inward * 0.02, 0.07, h, 0.1, false);
    box('frame', along - w / 2, y, c + inward * 0.02, 0.1, h, 0.1, false);
    box('frame', along + w / 2, y, c + inward * 0.02, 0.1, h, 0.1, false);
    if (Math.round(along) % 2 === 0) lamp(along, 2.0, face + inward * 1.3, 0xcfe2ff, 0.3, 6);
  } else {
    box('sky', c, y, along, 0.05, h, w, false);
    box('frame', c + inward * 0.02, y - 0.08, along, 0.12, 0.1, w + 0.2, false);
    box('frame', c + inward * 0.02, y + h - 0.02, along, 0.12, 0.1, w + 0.2, false);
    box('frame', c + inward * 0.02, y, along, 0.1, h, 0.07, false);
    box('frame', c + inward * 0.02, y, along - w / 2, 0.1, h, 0.1, false);
    box('frame', c + inward * 0.02, y, along + w / 2, 0.1, h, 0.1, false);
    if (Math.round(along) % 2 === 0) lamp(face + inward * 1.3, 2.0, along, 0xcfe2ff, 0.3, 6);
  }
}

/** Windows on all four outer walls (none in the windowless server room). */
function windows(): void {
  for (const x of [-42, -27, -13, 17, 28, 48]) windowPane('x', x, Z0 + EDGE, 1);
  for (const x of [-44, -36, -18, 16, 28, -8, 8, 36, 43]) windowPane('x', x, Z1 - EDGE, -1);
  for (const z of [-33, -16, -8, 0, 8, 28]) windowPane('z', z, X0 + EDGE, 1);
  for (const z of [-14, -6, 2, 10]) windowPane('z', z, X1 - EDGE, -1);
}

/** Clocks, extinguishers, notice boards, posters and the feature walls. */
function wallFurniture(): void {
  for (const [x, z] of [[0, -19.7], [22, 13.7], [-42, -34.7], [22, -34.7]] as const) {
    box('white', x, 2.9, z, 0.55, 0.55, 0.06, false);
    box('dark', x, 3.15, z, 0.04, 0.22, 0.08, false);
    box('dark', x + 0.1, 3.18, z, 0.18, 0.04, 0.08, false);
  }
  for (const [x, z] of [[-9, -19.7], [9, -19.7], [-33, 13.7], [33, 13.7], [-7.5, -34.7], [8, 13.7]] as const) {
    box('red', x, 0.9, z, 0.2, 0.5, 0.2, false);
    box('dark', x, 1.4, z, 0.08, 0.1, 0.08, false);
  }
  for (const [x, z] of [[-22, -34.7], [-36, 34.7], [14, 34.7], [31, -34.7]] as const) {
    box('frame', x, 1.45, z, 2.5, 1.3, 0.06, false);
    box('cork', x, 1.5, z, 2.3, 1.1, 0.08, false);
    for (let i = 0; i < 5; i++) box('paper', x - 0.85 + i * 0.42, 1.7 + (i % 2) * 0.25, z, 0.3, 0.38, 0.1, false);
  }
  // Feature walls: exposed brick in the break room and lobby.
  box('brick', -40, 0.15, 34.68, 16, 3.3, 0.06, false);
  box('brick', 0, 0.15, 34.68, 10, 3.3, 0.06, false);
  box('brick', -49.7, 0.15, 22, 0.06, 3.3, 12, false);
}

/** Air ducts and floor decals. */
function services(): void {
  box('duct', 0, 3.55, -10, 96, 0.45, 0.7, false);
  box('duct', 0, 3.6, 3, 96, 0.4, 0.6, false);
  box('duct', -21, 3.5, 24, 17, 0.5, 0.6, false);
  for (const z of [-17.5, 11.5]) box('accentBlue', 0, 0, z, 88, 0.02, 0.18, false);
  box('accentOrange', 0, 0, 20, 8.6, 0.02, 5.6, false);
  box('accentBlue', 0, 0, -4, 9.4, 0.02, 6.4, false);
}

/** Applies all shared dressing. Must run after the rooms so trim sits on top of furniture decor. */
export function buildDressing(): void {
  wainscot();
  windows();
  wallFurniture();
  services();
}

