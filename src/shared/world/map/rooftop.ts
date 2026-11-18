/**
 * The Rooftop: a small open-air deathmatch map (36 x 28 m) on top of the IT Wars office tower, for two to four
 * players. Built with its own local registries (`local-builder.ts`) inside the office's footprint. There is no
 * ceiling and no outer wall: the roof slab floats in a void, so walking or jumping off an edge is a fall to your
 * death (`MapDef.killY`). A knee-high parapet runs round most of the roof, with gaps (a broken railing in the north,
 * a loading edge in the west, a collapsed section in the east) and a completely open south side.
 *
 * Layout (north is -z):
 *   north-east   the stair hut (x 10..16, z -14..-8.7), doorway to the south, a roof you cannot climb onto
 *   north-west   air-conditioning unit; west: the water tank on legs (walk under it)
 *   centre       the helipad: the post-match podium stands on it, so nothing solid goes within x +-5.5, z +-2.5
 *   east         the antenna mast with its blinking beacon, a second AC unit
 *   south        the billboard and the open edge, a skylight and crates
 *
 * Z-fighting rule (see `datacenter.ts`): no two boxes share a coplanar, same-facing, visible face. Parapet pieces
 * abut at their ends, caps repeat the footprint of the body below, markings stand 1 cm above the paint under them.
 */
import type { Aabb } from '@shared/core/physics';
import { createLocalMap } from './local-builder';
import type { PickupSpot } from './pickups';
import type { BoardSpec, CameraSpec, LabelSpec, LightSource, MapBox, MaterialId, ScreenSpec } from './types';
import type { Zone } from './zones';

const m = createLocalMap();
const { box, floor, stripe, lamp, plaque } = m;

/** The roof (its top is y = 0, like every map's floor). */
const X0 = -18, X1 = 18, Z0 = -14, Z1 = 14;
/** Parapet: body height (solid, hoppable: a jump reaches 1.39 m), thickness, and the cap on top. */
const PAR_H = 0.85, PAR_T = 0.3, CAP_H = 0.05;
/** Stair hut footprint and height. */
const HUT_X0 = 10, HUT_X1 = 16, HUT_Z1 = -8.7, HUT_H = 3.2, HUT_T = 0.3;

/** A small deterministic random source, so the skyline is the same on the server and in every client. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---- Roof ---------------------------------------------------------------------------------------------------
floor('concrete', X0, X1, Z0, Z1);
// Dark tar walkways (north-south and east-west) and the helipad pad; they stop at the pad so no two overlap.
stripe('floorDark', -1, 1, Z0 + 0.3, -3);
stripe('floorDark', -1, 1, 3, Z1 - 0.3);
stripe('floorDark', X0 + 0.3, -6, -1, 1);
stripe('floorDark', 6, X1 - 0.3, -1, 1);
stripe('floorDark', -6, 6, -3, 3);
// Helipad markings, painted white one centimetre above the pad: a frame, a blocky ring (0.4 m cells) and an H inside it.
const mark = (x0: number, x1: number, z0: number, z1: number) => box('white', (x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, false);
// (The frame sits 1 cm inside the pad so its sides never share a plane with the pad's.)
mark(-5.99, 5.99, -2.99, -2.8);
mark(-5.99, 5.99, 2.8, 2.99);
mark(-5.99, -5.8, -2.8, 2.8);
mark(5.8, 5.99, -2.8, 2.8);
for (let i = -7; i < 7; i++) {
  for (let j = -7; j < 7; j++) {
    const cx = (i + 0.5) * 0.4, cz = (j + 0.5) * 0.4, r = Math.hypot(cx, cz);
    if (r >= 2.0 && r <= 2.4) mark(cx - 0.2, cx + 0.2, cz - 0.2, cz + 0.2);
  }
}
mark(-0.95, -0.65, -1.2, 1.2);
mark(0.65, 0.95, -1.2, 1.2);
mark(-0.65, 0.65, -0.12, 0.12);
// Patches of darker roofing (repairs, old tar), laid side by side so none overlap.
for (const [x0, x1, z0, z1] of [
  [-17.7, -14.2, 4.6, 9.4], [-3.9, -1.3, -9.9, -6.4], [2.4, 6.6, 7.2, 10.2],
  [11.2, 15.4, 4.9, 6.1], [-12.6, -9.2, 11.1, 13.1], [6.9, 10.1, -10.4, -7.2],
] as const) stripe('floorDark', x0, x1, z0, z1);

// The tower under the roof (seen when you look over an edge), inset so its sides never share a plane with the slab.
const TOWER_BOTTOM = -70;
/** Distant towers start lower than the roof but not at the street, so their baked light stays bright where you see them. */
const DISTANT_BOTTOM = -14;
box('wainSlate', 0, TOWER_BOTTOM, 0, X1 - X0 - 0.6, -1 - TOWER_BOTTOM, Z1 - Z0 - 0.6, false);
for (let y = -4; y > TOWER_BOTTOM + 3; y -= 3.5) {
  // A lit band of windows on every side, broken into three pieces.
  for (const k of [-1, 0, 1]) {
    const mat: MaterialId = (Math.abs(Math.round(y * 7)) + k) % 5 === 0 ? 'signBlue' : 'signOrange';
    if ((Math.abs(Math.round(y)) + k) % 3 === 0) continue;
    box(mat, k * 11, y, Z0 + 0.25, 8, 1.2, 0.1, false);
    box(mat, k * 11, y, Z1 - 0.25, 8, 1.2, 0.1, false);
    box(mat, X0 + 0.25, y, k * 8.5, 0.1, 1.2, 6, false);
    box(mat, X1 - 0.25, y, k * 8.5, 0.1, 1.2, 6, false);
  }
}

// ---- Parapet: knee-high, hoppable, with gaps ---------------------------------------------------------------
/** A parapet piece along x at `z` from `xa` to `xb`. */
function parapetX(z: number, xa: number, xb: number): void {
  box('brick', (xa + xb) / 2, 0, z, xb - xa, PAR_H, PAR_T);
  box('concrete', (xa + xb) / 2, PAR_H, z, xb - xa, CAP_H, PAR_T, false);
}
/** A parapet piece along z at `x` from `za` to `zb`. */
function parapetZ(x: number, za: number, zb: number): void {
  box('brick', x, 0, (za + zb) / 2, PAR_T, PAR_H, zb - za);
  box('concrete', x, PAR_H, (za + zb) / 2, PAR_T, CAP_H, zb - za, false);
}
const NORTH_Z = Z0 + PAR_T / 2, WEST_X = X0 + PAR_T / 2, EAST_X = X1 - PAR_T / 2;
// North: a broken-railing gap at x -9..-6.5; the stair hut's back wall closes x 10..16.
parapetX(NORTH_Z, X0, -9);
parapetX(NORTH_Z, -6.5, HUT_X0);
parapetX(NORTH_Z, HUT_X1, X1);
// West: the loading edge is open at z -3..3. The corner pieces start where the north parapet ends.
parapetZ(WEST_X, Z0 + PAR_T, -3);
parapetZ(WEST_X, 3, Z1);
// East: a collapsed section at z 6..9.
parapetZ(EAST_X, Z0 + PAR_T, 6);
parapetZ(EAST_X, 9, Z1);
// South: no parapet at all.

// Warning tape along every open edge, a line of red lights, and the stumps of a railing on the south side.
const tape = (x0: number, x1: number, z0: number, z1: number) => box('hazard', (x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, false);
tape(X0 + 0.3, X1 - 0.3, Z1 - 0.8, Z1 - 0.5);
tape(X0, X0 + 0.3, -3, 3);
tape(X1 - 0.3, X1, 6, 9);
tape(-9, -6.5, Z0, Z0 + 0.3);
for (let x = X0 + 1; x <= X1 - 1; x += 3) box('signRed', x, 0, Z1 - 0.1, 0.14, 0.14, 0.14, false);
for (const z of [-2.5, 0, 2.5]) box('signRed', X0 + 0.1, 0, z, 0.14, 0.14, 0.14, false);
for (const z of [6.5, 7.5, 8.5]) box('signRed', X1 - 0.1, 0, z, 0.14, 0.14, 0.14, false);
for (const x of [-8.5, -7.75, -7]) box('signRed', x, 0, Z0 + 0.1, 0.14, 0.14, 0.14, false);
for (const x of [-15, -10.5, -6, 3.5, 8, 12.5]) {
  box('metal', x, 0, Z1 - 0.4, 0.1, 1.0, 0.1, false);
}
box('metal', -12.75, 0.9, Z1 - 0.4, 4.4, 0.06, 0.06, false);
box('metal', 5.75, 0.9, Z1 - 0.4, 4.4, 0.06, 0.06, false);
box('metal', -2.2, 0.55, Z1 - 0.4, 1.6, 0.06, 0.06, false);

// ---- Stair hut (north-east) --------------------------------------------------------------------------------
box('concrete', 0 + (HUT_X0 + HUT_X1) / 2, 0, Z0 + PAR_T / 2, HUT_X1 - HUT_X0, HUT_H, PAR_T);
box('concrete', HUT_X0 + HUT_T / 2, 0, (Z0 + PAR_T + HUT_Z1) / 2, HUT_T, HUT_H, HUT_Z1 - Z0 - PAR_T);
box('concrete', HUT_X1 - HUT_T / 2, 0, (Z0 + PAR_T + HUT_Z1) / 2, HUT_T, HUT_H, HUT_Z1 - Z0 - PAR_T);
// The front wall has a 2 m doorway at x 12..14.
box('concrete', (HUT_X0 + HUT_T + 12) / 2, 0, HUT_Z1 - HUT_T / 2, 12 - HUT_X0 - HUT_T, HUT_H, HUT_T);
box('concrete', (14 + HUT_X1 - HUT_T) / 2, 0, HUT_Z1 - HUT_T / 2, HUT_X1 - HUT_T - 14, HUT_H, HUT_T);
box('concrete', 13, 2.4, HUT_Z1 - HUT_T / 2, 2, HUT_H - 2.4, HUT_T);
box('wainSlate', (HUT_X0 + HUT_X1) / 2, HUT_H, (Z0 + HUT_Z1) / 2, HUT_X1 - HUT_X0, 0.2, HUT_Z1 - Z0);
// A dark stairwell in the floor with a rail, a crate and a green exit sign over the door.
stripe('dark', 10.7, 12.5, -13.2, -10.7);
box('metal', 11.6, 0, -10.55, 1.8, 0.9, 0.05, false);
box('crate', 14.8, 0, -12.9, 0.8, 0.8, 0.8);
plaque('STAIRS', 13, 2.8, HUT_Z1 + 0.06, 'x', 1, 1.4, 0.4, 'accentGreen', true);
box('signGreen', 13, 2.35, HUT_Z1 - HUT_T - 0.05, 2, 0.05, 0.05, false);
lamp(13, 2.6, -11, 0xffd9a0, 0.75, 6.5);

// ---- Water tank (west): four legs, a body you can walk under, a ladder -------------------------------------
const TANK = { x0: -14.5, x1: -11.5, z0: -7.5, z1: -4.5, y0: 2.3, y1: 4.7 };
for (const lx of [TANK.x0 + 0.25, TANK.x1 - 0.25]) for (const lz of [TANK.z0 + 0.25, TANK.z1 - 0.25]) box('metal', lx, 0, lz, 0.3, TANK.y0, 0.3);
box('metal', (TANK.x0 + TANK.x1) / 2, TANK.y0, (TANK.z0 + TANK.z1) / 2, TANK.x1 - TANK.x0, TANK.y1 - TANK.y0, TANK.z1 - TANK.z0);
box('duct', (TANK.x0 + TANK.x1) / 2, TANK.y1, (TANK.z0 + TANK.z1) / 2, 2.6, 0.08, 2.6, false);
for (const y of [3.0, 3.8]) box('wainSlate', (TANK.x0 + TANK.x1) / 2, y, (TANK.z0 + TANK.z1) / 2, 3.1, 0.12, 3.1, false);
box('metal', -12.4, 0, TANK.z1 + 0.04, 0.5, TANK.y1, 0.06, false);
lamp(-13, 1.8, -6, 0x9fc4ff, 0.4, 5);

// ---- Air-conditioning: a big louvred enclosure, fan units with hoods, silver ducts and pipe racks -------------
/** Vertical louvre slats along a wall face: dark slats proud of the face every 0.3 m. `axis` is the face's direction of run. */
function louvres(axis: 'x' | 'z', c0: number, c1: number, at: number, y0: number, y1: number, side: 1 | -1): void {
  for (let c = c0 + 0.2; c < c1 - 0.1; c += 0.3) {
    if (axis === 'x') box('dark', c, y0, at + side * 0.02, 0.12, y1 - y0, 0.04, false);
    else box('dark', at + side * 0.02, y0, c, 0.04, y1 - y0, 0.12, false);
  }
}
/**
 * The large louvred enclosure (the roof's big chiller): a solid block with louvre slats on every face, and an
 * open-topped machine bay on top whose fan housings and pipes show from above.
 */
function chillerBay(x0: number, x1: number, z0: number, z1: number, h: number): void {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  box('wainGray', cx, 0, cz, w, h, d);
  louvres('x', x0, x1, z0, 0.2, h - 0.2, -1);
  louvres('x', x0, x1, z1, 0.2, h - 0.2, 1);
  louvres('z', z0, z1, x0, 0.2, h - 0.2, -1);
  louvres('z', z0, z1, x1, 0.2, h - 0.2, 1);
  // Top rim and the machines inside it.
  box('metal', cx, h, z0 + 0.06, w, 0.15, 0.12, false);
  box('metal', cx, h, z1 - 0.06, w, 0.15, 0.12, false);
  box('metal', x0 + 0.06, h, cz, 0.12, 0.15, d - 0.24, false);
  box('metal', x1 - 0.06, h, cz, 0.12, 0.15, d - 0.24, false);
  box('dark', cx, h, cz, w - 0.3, 0.05, d - 0.3, false);
  for (let i = 0; i < 4; i++) {
    const mx = x0 + 0.9 + i * ((w - 1.8) / 3);
    box('metal', mx, h + 0.05, cz - 0.6, 0.9, 0.55, 0.9, false);
    box('dark', mx, h + 0.6, cz - 0.6, 0.6, 0.04, 0.6, false);
    box('duct', mx, h + 0.05, cz + 0.7, 0.8, 0.4, 0.8, false);
  }
  box('duct', cx, h + 0.45, cz + 0.1, w - 1.6, 0.14, 0.14, false);
}
chillerBay(-10, -3, -11.5, -7.5, 1.6);
/** A fan unit: a plinth, a metal body with louvres, a stepped hood (the blocky version of a cone) and a fan on top. */
function hvac(cx: number, cz: number, w: number, d: number, h: number): void {
  box('wainGray', cx, 0, cz, w + 0.2, 0.18, d + 0.2, false);
  box('metal', cx, 0, cz, w, h, d);
  louvres('x', cx - w / 2, cx + w / 2, cz - d / 2, 0.25, h - 0.2, -1);
  louvres('x', cx - w / 2, cx + w / 2, cz + d / 2, 0.25, h - 0.2, 1);
  box('wainGray', cx, h, cz, w - 0.2, 0.14, d - 0.2, false);
  box('metal', cx, h + 0.14, cz, w - 0.8, 0.14, d - 0.8, false);
  box('dark', cx, h + 0.28, cz, w - 1.4, 0.05, d - 1.4, false);
  box('duct', cx, h + 0.33, cz, 0.12, 0.14, d - 1.4, false);
  box('duct', cx, h + 0.35, cz, w - 1.4, 0.14, 0.12, false);
  box('led', cx + w / 2 - 0.25, h - 0.3, cz + d / 2 + 0.06, 0.08, 0.08, 0.03, false);
}
hvac(-12, 8, 3.0, 1.6, 1.3);
hvac(8.5, 7, 2.4, 2.4, 1.6);
hvac(12.5, 3.5, 2.4, 2.4, 1.2);
/** A silver duct run, 0.55 m high (hoppable), along x at `z` or along z at `x`; the ends carry a flange. */
function duct(axis: 'x' | 'z', at: number, a: number, b: number): void {
  const w = 0.5, len = b - a;
  if (axis === 'x') {
    box('duct', (a + b) / 2, 0, at, len, 0.55, w);
    box('metal', a - 0.05, 0, at, 0.1, 0.62, w + 0.1, false);
    box('metal', b + 0.05, 0, at, 0.1, 0.62, w + 0.1, false);
  } else {
    box('duct', at, 0, (a + b) / 2, w, 0.55, len);
    box('metal', at, 0, a - 0.05, w + 0.1, 0.62, 0.1, false);
    box('metal', at, 0, b + 0.05, w + 0.1, 0.62, 0.1, false);
  }
}
duct('x', 4.2, 7.4, 12.2);
duct('z', 15.4, 8.3, 12.8);
duct('x', -9.4, -17, -13.2);
/** Pipe racks: three pipes on short stands. */
function pipeRack(axis: 'x' | 'z', cx: number, cz: number, len: number): void {
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 0.22;
    const mat: MaterialId = i === 1 ? 'duct' : 'metal';
    const y = 0.42 + (i === 1 ? 0.06 : 0);
    if (axis === 'x') box(mat, cx, y, cz + off, len, 0.1, 0.1, false);
    else box(mat, cx + off, y, cz, 0.1, 0.1, len, false);
  }
  for (let t = -len / 2 + 0.3; t <= len / 2 - 0.3; t += 1.6) {
    if (axis === 'x') box('metal', cx + t, 0, cz, 0.08, 0.4, 0.62, false);
    else box('metal', cx, 0, cz + t, 0.62, 0.4, 0.08, false);
  }
}
pipeRack('x', 2.5, -12.4, 7.0);
pipeRack('z', 16.9, -3.2, 5.6);
lamp(-6.5, 1.9, -6.2, 0xffd0a0, 0.35, 4);

// ---- Antenna mast (east) -----------------------------------------------------------------------------------
box('concrete', 15.5, 0, 0, 0.8, 0.6, 0.8);
box('metal', 15.5, 0.6, 0, 0.16, 8.5, 0.16, false);
box('metal', 15.5, 4.5, 0, 1.2, 0.06, 0.06, false);
box('metal', 15.5, 6.4, 0, 0.8, 0.06, 0.06, false);
box('ledBlink', 15.5, 9.1, 0, 0.3, 0.3, 0.3, false);
lamp(15.5, 5, 0, 0xff4a3a, 0.55, 7);

// ---- Skylight (south-west), crates, barriers ---------------------------------------------------------------
box('metal', -7, 0, 4, 3.0, 0.5, 2.0);
box('glass', -7, 0.5, 4, 2.6, 0.03, 1.6, false);
lamp(-7, 1.0, 4, 0x7fdcff, 0.6, 5.5);
/** A crate cube of side `s` at (cx, cz), `y` above the floor. */
const crate = (cx: number, cz: number, s: number, y = 0) => box('crate', cx, y, cz, s, s, s);
crate(-2.5, 6.8, 1.2);
crate(-2.5, 6.8, 0.8, 1.2);
crate(-1.1, 6.6, 0.8);
crate(4.8, -6.8, 1.2);
/**
 * A concrete jersey barrier along `axis` at (cx, cz): 1.1 m high (hoppable), with an orange reflective band that
 * stands proud on both faces.
 */
function barrier(axis: 'x' | 'z', cx: number, cz: number, len: number): void {
  const w = axis === 'x' ? len : 0.3, d = axis === 'x' ? 0.3 : len;
  box('concrete', cx, 0, cz, w, 1.1, d);
  box('accentOrange', cx, 0.55, cz, axis === 'x' ? len - 0.4 : 0.38, 0.1, axis === 'x' ? 0.38 : len - 0.4, false);
}
barrier('x', -3, -3.9, 2.6);
barrier('x', 3, 3.9, 2.6);
barrier('z', -8.5, 0.5, 2.6);
barrier('z', 8.5, -0.5, 2.6);
barrier('x', -4.5, 10.5, 3.0);
barrier('x', 11.5, -4.5, 2.6);

// ---- Billboard (south) --------------------------------------------------------------------------------------
for (const px of [0.5, 5.5]) box('metal', px, 0, 11, 0.3, 2.0, 0.3);
box('dark', 3, 2.0, 11, 7, 2.0, 0.2);
box('light', 3, 4.0, 10.8, 6.6, 0.08, 0.3, false);
plaque('IT WARS', 3, 3.0, 10.84, 'x', -1, 6.2, 1.3, 'accentOrange', true);
lamp(3, 1.6, 9.6, 0xffd070, 0.7, 8);

// ---- Floodlights, edge signs and the helipad lights ---------------------------------------------------------
for (const [px, pz] of [[-15.5, -12], [-15.5, 12], [15.5, 12]] as const) {
  box('metal', px, 0, pz, 0.15, 4.0, 0.15, false);
  box('light', px, 4.0, pz, 0.5, 0.15, 0.35, false);
  lamp(px, 3.7, pz, 0xffe6c0, 0.5, 13);
}
lamp(0, 4.4, -12.8, 0xffe6c0, 0.45, 12);
// The low sun in the west: one broad warm light that rakes across the roof and throws long shadows.
lamp(-30, 9, 0, 0xffb066, 0.9, 60);
box('metal', 0, 0, -13.3, 0.15, 4.4, 0.15, false);
box('light', 0, 4.4, -13.3, 0.5, 0.15, 0.35, false);
for (const [lx, lz] of [[-5.8, -2.8], [5.8, -2.8], [-5.8, 2.8], [5.8, 2.8]] as const) lamp(lx, 0.4, lz, 0xffb050, 0.4, 4.5);
plaque('MIND THE EDGE', X1 - PAR_T - 0.06, 0.45, -2, 'z', -1, 1.8, 0.4, 'accentRed', true);

// ---- Skyline: a layered golden-hour city round the roof, a glowing horizon, and the street far below -------------
const rng = lcg(41);
/** Facade materials for the distant towers (the warm light colours them). */
const FACADES: readonly MaterialId[] = ['concrete', 'wainGray', 'white', 'brick', 'concrete', 'wainGray', 'wainBrown'];
/** Window colours: the sun catching glass, mostly warm. */
const WINDOWS: readonly MaterialId[] = ['signOrange', 'signOrange', 'signBlue', 'signOrange'];
/**
 * One distant tower with a setback, a water tank (and on the tallest a spire). `face` is the side that looks at the
 * roof; it gets a few rows of sunlit windows. Towers are decoration (no collision) and stand well outside the roof.
 */
function tower(cx: number, cz: number, w: number, d: number, top: number, face: 'n' | 's' | 'e' | 'w'): void {
  // A little different for every tower (from its position), so overlapping towers never share a bottom plane.
  const bottom = DISTANT_BOTTOM - ((Math.abs(cx * 7.31 + cz * 13.77) % 8) + 0.013);
  const facade = FACADES[Math.floor(rng() * FACADES.length)]!;
  box(facade, cx, bottom, cz, w, top - bottom, d, false);
  const across = face === 'n' || face === 's' ? w : d;
  // Each tower's rows are offset by its own amount, so windows of two overlapping towers never share a plane.
  const rowShift = rng() * 3.1;
  for (let y = -6 + rowShift; y < top - 4; y += 4.5) {
    if (rng() < 0.45) continue;
    const mat = WINDOWS[Math.floor(rng() * WINDOWS.length)]!;
    const span = across * (0.2 + rng() * 0.4);
    const off = (rng() - 0.5) * (across - span);
    if (face === 'n') box(mat, cx + off, y, cz - d / 2 - 0.1, span, 0.8, 0.1, false);
    else if (face === 's') box(mat, cx + off, y, cz + d / 2, span, 0.8, 0.1, false);
    else if (face === 'e') box(mat, cx + w / 2, y, cz + off, 0.1, 0.8, span, false);
    else box(mat, cx - w / 2 - 0.1, y, cz + off, 0.1, 0.8, span, false);
  }
  let roofY = top;
  if (rng() < 0.7) {
    const sh = 5 + rng() * 11;
    box(facade, cx, top, cz, w * 0.62, sh, d * 0.62, false);
    roofY = top + sh;
  }
  box('metal', cx + w * 0.15, roofY, cz - d * 0.1, 2.2, 2.4, 2.2, false);
  if (top > 50) box('metal', cx, roofY, cz, 0.7, 14 + rng() * 14, 0.7, false);
  if (top > 55) box('ledBlink', cx, roofY + 14, cz, 0.6, 0.6, 0.6, false);
}
/** A band of towers along one side at a distance, spaced a little apart. */
function row(side: 'n' | 's' | 'e' | 'w', near: number, spread: number, step: number, height: number): void {
  for (let t = -120; t <= 120; t += step + rng() * 6) {
    const w = 11 + rng() * 11, d = 12 + rng() * 11;
    const dist = near + rng() * spread, top = 6 + rng() * height;
    if (side === 'n') tower(t, -dist, w, d, top, 's');
    else if (side === 's') tower(t, dist, w, d, top, 'n');
    else if (side === 'w') tower(-dist, t * 0.5, w, d, top, 'e');
    else tower(dist, t * 0.5, w, d, top, 'w');
  }
}
row('n', 62, 16, 16, 56);
row('n', 98, 22, 18, 78);
row('w', 68, 14, 17, 52);
row('w', 104, 20, 18, 72);
row('s', 64, 20, 18, 52);
row('e', 66, 20, 18, 54);
// A glow along the horizon behind the towers (the sun sets in the west), plus the sun itself.
// (The side bands stop short of the corners, so no two bands overlap.)
box('signOrange', 0, -4, -125, 250, 9, 0.5, false);
box('signOrange', -125, -4, 0, 0.5, 9, 249, false);
box('signOrange', 0, -6, 125, 250, 6, 0.5, false);
box('signOrange', 125, -6, 0, 0.5, 6, 249, false);
box('signOrange', -123.8, 4, 0, 0.5, 11, 16, false);
box('sky', -123.2, 6.5, 0, 0.3, 6, 8, false);
// The street at the foot of the tower.
box('floorDark', 0, TOWER_BOTTOM - 0.5, 0, 300, 0.5, 300, false);

// ---- Spawns, pickups, zones --------------------------------------------------------------------------------
/** Pickup spots, in protocol order. SMG in the north-west, Shredder in the stair hut, Laser Pointer on the south-east corner; no RPG. */
const PICKUPS: readonly PickupSpot[] = [
  { kind: 'hp', x: 0, z: -7.5 },
  { kind: 'hp', x: -14.5, z: 0 },
  { kind: 'hp', x: 15, z: -1.5 },
  { kind: 'hp', x: 0, z: 8.5 },
  { kind: 'ammo', x: -5, z: -6 },
  { kind: 'ammo', x: 5.5, z: 5.5 },
  { kind: 'ammo', x: -10, z: 10 },
  { kind: 'ammo', x: 11, z: 10.5 },
  { kind: 'grenade', x: -2, z: -9.5 },
  { kind: 'grenade', x: 14.7, z: -10.2 },
  { kind: 'grenade', x: -15, z: 10 },
  { kind: 'weapon', weapon: 1, x: -16, z: -8 },
  { kind: 'weapon', weapon: 2, x: 11.2, z: -9.7 },
  { kind: 'weapon', weapon: 3, x: 14.5, z: 10.5 },
];

/** Spawn points as `[x, z]`, all at least 3 m from an open edge. */
const SPAWN_POINTS: readonly [number, number][] = [
  [-14, -11], [-10, -3], [-2, -10.5], [4, -8], [8.5, -5], [14, -5.5],
  [13.5, 0.5], [14, 9.5], [6, 7.5], [-1, 7.5], [-9, 9], [-14, 4],
];

/** Lighting: a dusk sky (the fog colour is the sky), floodlit; the stair hut is a warm pocket. First match wins. */
const ZONE_LIST: readonly Zone[] = [
  {
    id: 'hut', name: 'Stair hut', x0: HUT_X0, x1: HUT_X1, z0: Z0 - 1, z1: HUT_Z1,
    ambient: { color: 0xffd8a8, level: 0.16 },
    panels: { color: 0xffd9a0, intensity: 0.5, radius: 5 },
    fog: { color: 0xf0a878, density: 0.008 }, floor: 0.5,
  },
  {
    id: 'roof', name: 'Roof', x0: X0 - 6, x1: X1 + 6, z0: Z0 - 6, z1: Z1 + 6,
    ambient: { color: 0xffc896, level: 0.34 },
    panels: { color: 0xffe6c0, intensity: 0.5, radius: 12 },
    fog: { color: 0xf0a878, density: 0.008 }, floor: 0.55,
  },
];

/** Collision boxes: every solid box. */
export const SOLIDS: readonly Aabb[] = m.boxes.filter((b) => b.solid);
/** Every rendered box in the map. */
export const MAP_BOXES: readonly MapBox[] = m.boxes;
/** Baked light sources the client turns into vertex lighting. */
export const LIGHTS: readonly LightSource[] = m.lights;
/** Wall plaques and signs. */
export const LABELS: readonly LabelSpec[] = m.labels;
/** Live scoreboards (none here). */
export const BOARDS: readonly BoardSpec[] = m.boards;
/** Security cameras (none on a roof). */
export const CAMERAS: readonly CameraSpec[] = m.cameras;
/** Animated screens (none here). */
export const SCREENS: readonly ScreenSpec[] = m.screens;
/** Pickup spots, in protocol order. */
export const PICKUP_SPOTS: readonly PickupSpot[] = PICKUPS;
/** Spawn points. */
export const SPAWNS: readonly [number, number][] = [...SPAWN_POINTS];
/** Lighting zones. */
export const ZONES: readonly Zone[] = ZONE_LIST;
/** Bounding box of the playable roof, for the client's light-field grid. */
export const BOUNDS = { x0: X0 - 2, x1: X1 + 2, z0: Z0 - 2, z1: Z1 + 2 };
/** Height below which a player has fallen to their death: about 0.8 s of falling off an edge. */
export const KILL_Y = -8;
