/**
 * Reusable furniture and props: chairs, desks, tables, sofas, monitors, racks, and low/high cover
 * pieces. Solid parts are kept to a thin top plus a few supports so shots can pass under tables.
 */
import { box, lamp, makeRng, rng } from './builder';
import type { Facing, MaterialId } from './types';

/** Unit forward vector (x, z) for a facing. */
function fwd(face: Facing): [number, number] {
  return face === 'n' ? [0, -1] : face === 's' ? [0, 1] : face === 'e' ? [1, 0] : [-1, 0];
}

/**
 * Box placed relative to a facing: `f` metres forward, `s` sideways, sized `sideLen` x `fwdLen`.
 * Keeps oriented furniture code free of per-direction branching.
 */
function rel(
  mat: MaterialId, cx: number, cz: number, face: Facing,
  f: number, s: number, y: number, h: number, sideLen: number, fwdLen: number, solid = false,
): void {
  const [fx, fz] = fwd(face);
  const alongX = face === 'n' || face === 's';
  // Side vector is the forward vector rotated 90 degrees.
  const x = cx + fx * f + -fz * s;
  const z = cz + fz * f + fx * s;
  box(mat, x, y, z, alongX ? sideLen : fwdLen, h, alongX ? fwdLen : sideLen, solid);
}

/** Chair styles: swivel task chair, high-back meeting chair, fixed-leg guest chair, bar stool. */
export type ChairKind = 'task' | 'meeting' | 'guest' | 'stool';

/**
 * Office chair. Only the seat is solid (a thin plate at hop height), so the base, column,
 * backrest and arms are pure decoration and shots pass below the seat.
 * @param face - Direction the sitter looks.
 */
export function chair(cx: number, cz: number, face: Facing, kind: ChairKind = 'task'): void {
  if (kind === 'stool') {
    rel('dark', cx, cz, face, 0, 0, 0, 0.55, 0.06, 0.06);
    rel('metal', cx, cz, face, 0, 0, 0.02, 0.04, 0.4, 0.04);
    rel('metal', cx, cz, face, 0, 0, 0.02, 0.04, 0.04, 0.4);
    rel('chair', cx, cz, face, 0, 0, 0.55, 0.1, 0.4, 0.4, true);
    return;
  }
  if (kind === 'guest') {
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) rel('metal', cx, cz, face, a * 0.2, b * 0.2, 0, 0.42, 0.04, 0.04);
    rel('chair', cx, cz, face, 0, 0, 0.42, 0.08, 0.48, 0.48, true);
    rel('chair', cx, cz, face, -0.22, 0, 0.5, 0.5, 0.46, 0.06);
    return;
  }
  const big = kind === 'meeting';
  // Five-star base approximated by two crossed bars, plus the gas column.
  rel('dark', cx, cz, face, 0, 0, 0.04, 0.04, 0.6, 0.08);
  rel('dark', cx, cz, face, 0, 0, 0.04, 0.04, 0.08, 0.6);
  rel('dark', cx, cz, face, 0, 0, 0.08, 0.34, 0.07, 0.07);
  rel('chair', cx, cz, face, 0, 0, 0.42, 0.1, 0.5, 0.5, true); // seat plate
  rel('chair', cx, cz, face, -0.23, 0, 0.55, big ? 0.85 : 0.5, 0.46, 0.07); // backrest
  rel('dark', cx, cz, face, -0.2, 0, 0.62, 0.14, 0.3, 0.05); // lumbar support
  for (const s of [-1, 1] as const) {
    rel('dark', cx, cz, face, 0, s * 0.28, 0.52, 0.04, 0.05, 0.3); // armrest
    rel('dark', cx, cz, face, 0.08, s * 0.28, 0.42, 0.1, 0.04, 0.04); // armrest post
  }
  if (big) rel('chair', cx, cz, face, -0.24, 0, 1.3, 0.2, 0.3, 0.08); // headrest
}

/**
 * Desk with real structure: thin solid top, solid side panel and drawer pedestal, a decorative
 * modesty panel. Shots pass through the knee gap.
 * @param alongX - True when the long side runs along X.
 */
export function deskFrame(cx: number, cz: number, len: number, depth: number, alongX = true, mat: MaterialId = 'desk'): void {
  const w = alongX ? len : depth;
  const d = alongX ? depth : len;
  box(mat, cx, 0.7, cz, w, 0.06, d); // top
  const ox = alongX ? len / 2 - 0.03 : 0;
  const oz = alongX ? 0 : len / 2 - 0.03;
  box('metal', cx - ox, 0, cz - oz, alongX ? 0.05 : depth - 0.1, 0.7, alongX ? depth - 0.1 : 0.05);
  box('dark', cx + ox * 0.7, 0, cz + oz * 0.7, alongX ? 0.5 : depth - 0.1, 0.7, alongX ? depth - 0.1 : 0.5);
  box('dark', cx, 0.28, cz - (alongX ? depth * 0.38 : 0), alongX ? len - 0.6 : 0.03, 0.35, alongX ? 0.03 : len - 0.6, false);
}

/**
 * Large boardroom table: boat-shaped top (centre plus tapered end caps), a solid central spine
 * so the table works as cover, table-top ports, and executive chairs around it.
 * @param headWest - Seat a chair at the west end.
 * @param headEast - Seat a chair at the east end.
 */
export function boardTable(cx: number, cz: number, len: number, wid: number, perSide: number, headWest = true, headEast = true): void {
  box('desk', cx, 0.68, cz, len, 0.1, wid);
  box('desk', cx - len / 2 - 0.35, 0.68, cz, 0.7, 0.1, wid - 0.8);
  box('desk', cx + len / 2 + 0.35, 0.68, cz, 0.7, 0.1, wid - 0.8);
  box('dark', cx, 0, cz, len - 1.4, 0.68, 0.7); // spine
  box('dark', cx - len / 2 + 0.6, 0, cz, 0.15, 0.68, wid - 0.6, false);
  box('dark', cx + len / 2 - 0.6, 0, cz, 0.15, 0.68, wid - 0.6, false);
  box('dark', cx, 0.78, cz, len * 0.5, 0.02, 0.5, false); // cable cubby
  for (const dx of [-0.34, 0.34]) box('metal', cx + dx * len, 0.78, cz, 0.12, 0.03, 0.12, false); // power puck
  box('dark', cx, 0.78, cz + 0.55, 0.25, 0.06, 0.25, false); // speakerphone
  box('white', cx - len * 0.2, 0.78, cz - 0.55, 0.14, 0.28, 0.14, false); // carafe
  for (let i = 0; i < perSide; i++) {
    const x = cx - len / 2 + (len / perSide) * (i + 0.5);
    chair(x, cz - wid / 2 - 0.6, 's', 'meeting');
    chair(x, cz + wid / 2 + 0.6, 'n', 'meeting');
  }
  if (headWest) chair(cx - len / 2 - 1.2, cz, 'e', 'meeting');
  if (headEast) chair(cx + len / 2 + 1.2, cz, 'w', 'meeting');
}

/** Octagonal pedestal table (plus-shaped union of slabs) with stools around it. */
export function roundTable(cx: number, cz: number, r: number, seats: number): void {
  box('desk', cx, 0.68, cz, r * 2, 0.07, r * 1.1);
  box('desk', cx, 0.68, cz, r * 1.1, 0.07, r * 2);
  box('desk', cx, 0.68, cz, r * 1.7, 0.07, r * 1.7);
  box('metal', cx, 0, cz, 0.3, 0.68, 0.3);
  box('dark', cx, 0, cz, 0.9, 0.04, 0.9, false);
  const dirs: Facing[] = ['s', 'n', 'w', 'e'];
  const off = r + 0.55;
  for (let i = 0; i < seats; i++) {
    const f = dirs[i % 4]!;
    const [fx, fz] = fwd(f);
    chair(cx - fx * off, cz - fz * off, f, 'stool');
  }
}

/** Low coffee table on four legs; its top is hoppable and shots go underneath. */
export function coffeeTable(cx: number, cz: number, w: number, d: number): void {
  box('wood', cx, 0.38, cz, w, 0.06, d);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) box('metal', cx + sx * (w / 2 - 0.08), 0, cz + sz * (d / 2 - 0.08), 0.06, 0.38, 0.06, false);
  }
}

/** Sofa or armchair of length `len` with a solid backrest on the side opposite `face`. */
export function sofa(cx: number, cz: number, len: number, face: Facing, mat: MaterialId = 'sofa'): void {
  const alongX = face === 'n' || face === 's';
  box(mat, cx, 0, cz, alongX ? len : 0.9, 0.45, alongX ? 0.9 : len);
  const o = 0.38;
  const bx = face === 'e' ? -o : face === 'w' ? o : 0;
  const bz = face === 's' ? -o : face === 'n' ? o : 0;
  box(mat, cx + bx, 0.45, cz + bz, alongX ? len : 0.18, 0.5, alongX ? 0.18 : len);
  // Armrests.
  for (const s of [-1, 1] as const) {
    box(mat, cx + (alongX ? s * (len / 2 - 0.1) : 0), 0.45, cz + (alongX ? 0 : s * (len / 2 - 0.1)), alongX ? 0.2 : 0.9, 0.22, alongX ? 0.9 : 0.2, false);
  }
}

const plantRng = makeRng(99);

/**
 * Leafy clump: `n` green cubes scattered in a disc/column so the silhouette is lumpy, not a box.
 * Decoration only, drawn from a private PRNG so crate placement elsewhere is unaffected.
 */
function foliage(cx: number, y: number, cz: number, radius: number, height: number, n: number, size: number): void {
  for (let i = 0; i < n; i++) {
    const a = plantRng() * Math.PI * 2;
    const r = Math.sqrt(plantRng()) * radius;
    const s = size * (0.7 + plantRng() * 0.6);
    box('green', cx + Math.cos(a) * r, y + plantRng() * height, cz + Math.sin(a) * r, s, s * 0.8, s, false);
  }
}

/** Potted plant: solid pot (the only collision), then rim, soil, stems, lumpy leaves and sometimes blooms. */
export function plant(cx: number, cz: number): void {
  box('pot', cx, 0, cz, 0.5, 0.5, 0.5);
  box('pot', cx, 0.5, cz, 0.6, 0.07, 0.6, false);
  box('dark', cx, 0.56, cz, 0.48, 0.02, 0.48, false);
  for (let i = 0; i < 4; i++) {
    const h = 0.6 + plantRng() * 0.7;
    box('crate', cx + (plantRng() - 0.5) * 0.3, 0.57, cz + (plantRng() - 0.5) * 0.3, 0.04, h, 0.04, false);
  }
  foliage(cx, 0.75, cz, 0.35, 0.6, 7, 0.4);
  foliage(cx, 1.3, cz, 0.2, 0.35, 3, 0.35);
  if (plantRng() > 0.55) {
    const m: MaterialId = plantRng() > 0.5 ? 'accentRed' : 'accentOrange';
    for (let i = 0; i < 3; i++) box(m, cx + (plantRng() - 0.5) * 0.5, 1.2 + plantRng() * 0.6, cz + (plantRng() - 0.5) * 0.5, 0.1, 0.1, 0.1, false);
  }
}

/** Water cooler with a jug on top. */
export function cooler(cx: number, cz: number): void {
  box('white', cx, 0, cz, 0.4, 1.0, 0.4);
  box('blue', cx, 1.0, cz, 0.3, 0.4, 0.3, false);
}

const screenRng = makeRng(7);
/** Mix of what people left on their screens; the animated textures live in the client. */
const SCREEN_KINDS: readonly MaterialId[] = [
  'screenTerm', 'screenDesk', 'screenSheet', 'screenDesk', 'screenSheet', 'screenSaver', 'screenOff', 'screenTerm', 'screenBsod',
];

/**
 * Monitor with stand, keyboard and mouse. Everything is decoration so desks stay hoppable.
 * @param y - Desk-top height the monitor stands on.
 * @param face - +1 if the screen faces +z (south), -1 if it faces north.
 * @param kind - Screen content; random from `SCREEN_KINDS` when omitted.
 */
export function monitor(cx: number, y: number, cz: number, face: 1 | -1, kind?: MaterialId): void {
  const m = kind ?? SCREEN_KINDS[Math.floor(screenRng() * SCREEN_KINDS.length)]!;
  box('dark', cx, y, cz, 0.26, 0.02, 0.18, false);
  box('dark', cx, y + 0.02, cz, 0.06, 0.14, 0.05, false);
  box('dark', cx, y + 0.16, cz, 0.6, 0.37, 0.04, false);
  box(m, cx, y + 0.185, cz + face * 0.0225, 0.54, 0.31, 0.005, false);
  box('dark', cx, y, cz + face * 0.3, 0.42, 0.02, 0.14, false);
  box('dark', cx + 0.34, y, cz + face * 0.3, 0.06, 0.02, 0.09, false);
}

/** Desk with a monitor and a PC tower; `monitorZ` > 0 puts the monitor on the +z side of the desk. */
export function deskWithMonitor(cx: number, cz: number, monitorZ: number, kind?: MaterialId): void {
  deskFrame(cx, cz, 1.6, 0.8);
  const face = monitorZ > 0 ? -1 : 1;
  monitor(cx, 0.76, cz + monitorZ, face, kind);
  box('dark', cx + 0.62, 0.76, cz - monitorZ * 0.5, 0.2, 0.42, 0.34, false);
  box('ledBlinkB', cx + 0.62, 1.06, cz - monitorZ * 0.5 + face * 0.175, 0.03, 0.03, 0.01, false);
}

/** Cubicle pod: two rows of two desks back to back, split by a partition and capped by end partitions. */
export function pod(cx: number, cz: number): void {
  for (const row of [-1, 1] as const) {
    for (const col of [-1, 1] as const) {
      deskWithMonitor(cx + col * 0.9, cz + row * 1.2, -row * 0.25);
      chair(cx + col * 0.9, cz + row * 2.15, row === 1 ? 'n' : 's');
    }
  }
  box('trim', cx, 0, cz, 3.6, 1.3, 0.1);
  box('trim', cx - 1.8, 0, cz, 0.1, 1.3, 3.4);
  box('trim', cx + 1.8, 0, cz, 0.1, 1.3, 3.4);
}

/** Random pile of cardboard boxes and crates; jumpable cover. */
export function crateStack(cx: number, cz: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const s = 0.8 + rng() * 0.5;
    const ox = (rng() - 0.5) * 1.2;
    const oz = (rng() - 0.5) * 1.2;
    const level = i < 3 ? 0 : 1;
    box(rng() > 0.5 ? 'cardboard' : 'crate', cx + ox, level * 0.9, cz + oz, s, 0.9, s);
  }
}

/** Server rack column segment with LED strips on both faces; `cx` is the column centre. */
export function rackSegment(cx: number, z0: number, z1: number): void {
  box('rack', cx, 0, (z0 + z1) / 2, 1.0, 2.2, z1 - z0);
  let k = 0;
  for (let z = z0 + 0.4; z < z1 - 0.2; z += 0.6, k++) {
    // Mixed static and blinking LEDs read as live hardware.
    const m: MaterialId = k % 3 === 0 ? 'ledBlink' : k % 3 === 1 ? 'ledBlinkB' : 'led';
    box(m, cx - 0.51, 0.3, z, 0.03, 1.7, 0.1, false);
    box(m, cx + 0.51, 0.3, z, 0.03, 1.7, 0.1, false);
  }
}

/** Phone booth with the glass door facing west. */
export function booth(cx: number, cz: number): void {
  box('trim', cx + 1.05, 0, cz, 0.1, 2.4, 2.2);
  box('trim', cx, 0, cz - 1.05, 2.2, 2.4, 0.1);
  box('trim', cx, 0, cz + 1.05, 2.2, 2.4, 0.1);
  box('trim', cx, 2.4, cz, 2.2, 0.1, 2.2);
  box('glass', cx - 1.05, 0, cz - 0.85, 0.06, 2.4, 0.5);
  box('glass', cx - 1.05, 0, cz + 0.85, 0.06, 2.4, 0.5);
  box('sofa2', cx + 0.5, 0, cz, 0.6, 0.45, 1.4);
  box('led', cx, 2.3, cz, 1.2, 0.04, 0.3, false);
}

/** Pile of dead hardware; two monitors on it still show a blue screen. Top stays hoppable. */
export function eWaste(cx: number, cz: number): void {
  box('cardboard', cx - 0.6, 0, cz, 1.2, 0.6, 1.2);
  box('crate', cx + 0.5, 0, cz + 0.2, 1.2, 0.9, 1.1);
  box('dark', cx - 0.2, 0.6, cz - 0.1, 0.7, 0.5, 0.9);
  box('metal', cx + 0.6, 0.9, cz + 0.2, 0.8, 0.4, 0.7);
  box('white', cx - 1.5, 0, cz + 0.7, 0.7, 0.45, 0.6);
  box('dark', cx + 1.6, 0, cz - 0.7, 0.8, 0.6, 0.7);
  monitor(cx + 0.6, 1.3, cz + 0.2, 1, 'screenBsod');
  monitor(cx - 0.6, 0.6, cz + 0.6, 1, 'screenBsod');
  lamp(cx, 1.6, cz + 1.4, 0x4a86ff, 0.7, 5);
}

/** Arcade cabinet whose screen faces `face` along z. */
export function arcade(cx: number, cz: number, face: 1 | -1, marquee: MaterialId, glow: number): void {
  box('dark', cx, 0, cz, 0.95, 1.85, 0.8);
  box('screenSaver', cx, 1.05, cz + face * 0.405, 0.7, 0.5, 0.01, false);
  box(marquee, cx, 1.62, cz + face * 0.405, 0.85, 0.2, 0.01, false);
  box('metal', cx, 0.8, cz + face * 0.5, 0.7, 0.06, 0.25, false);
  box('red', cx - 0.15, 0.86, cz + face * 0.5, 0.07, 0.05, 0.07, false);
  box('blue', cx + 0.15, 0.86, cz + face * 0.5, 0.07, 0.05, 0.07, false);
  lamp(cx, 1.1, cz + face * 1.1, glow, 0.7, 5);
}

/** Foosball table: solid body at hop height with rods and handles as decoration. */
export function foosball(cx: number, cz: number): void {
  box('dark', cx, 0, cz, 1.2, 0.5, 0.6);
  box('green', cx, 0.5, cz, 1.45, 0.25, 0.85);
  for (let i = 0; i < 4; i++) {
    box('metal', cx - 0.5 + i * 0.33, 0.82, cz, 0.03, 0.03, 1.2, false);
    box('red', cx - 0.5 + i * 0.33, 0.8, cz - 0.65, 0.06, 0.07, 0.12, false);
    box('blue', cx - 0.5 + i * 0.33, 0.8, cz + 0.65, 0.06, 0.07, 0.12, false);
  }
}

/** Free-standing double-sided kanban board: To Do / Doing / Done columns of sticky notes. */
export function kanban(cx: number, cz: number): void {
  box('white', cx, 0.45, cz, 3.2, 1.45, 0.08);
  box('metal', cx - 1.4, 0, cz, 0.08, 0.45, 0.3);
  box('metal', cx + 1.4, 0, cz, 0.08, 0.45, 0.3);
  const notes: MaterialId[] = ['posterA', 'posterB', 'posterC', 'posterB'];
  for (const side of [-1, 1] as const) {
    for (let c = 0; c < 3; c++) {
      box(c === 0 ? 'accentRed' : c === 1 ? 'accentOrange' : 'accentGreen', cx - 1.0 + c * 1.0, 1.72, cz + side * 0.05, 0.85, 0.12, 0.02, false);
      for (let r = 0; r < 3; r++) {
        if ((c * 3 + r) % 4 === 3) continue;
        box(notes[(c + r) % 4]!, cx - 1.0 + c * 1.0 + (r % 2 ? 0.15 : -0.12), 1.4 - r * 0.38, cz + side * 0.05, 0.26, 0.26, 0.02, false);
      }
    }
  }
}

/** Squashy low seat; hoppable. */
export function beanbag(cx: number, cz: number, mat: MaterialId): void {
  box(mat, cx, 0, cz, 0.85, 0.4, 0.85);
  box(mat, cx, 0.4, cz, 0.6, 0.15, 0.6);
}

/** Coffee bar island with espresso machine, stools and a hanging menu board (menu banner added by caller). */
export function coffeeBar(cx: number, cz: number): void {
  box('wood', cx, 0, cz, 3.4, 1.1, 0.8);
  box('dark', cx, 1.1, cz, 3.5, 0.05, 0.9, false);
  box('metal', cx - 1.0, 1.15, cz, 0.55, 0.45, 0.4, false);
  box('red', cx - 1.0, 1.4, cz + 0.21, 0.4, 0.1, 0.02, false);
  for (const dx of [-0.2, 0.1, 0.4, 1.0]) box('white', cx + dx, 1.15, cz + 0.1, 0.09, 0.1, 0.09, false);
  for (let i = 0; i < 3; i++) chair(cx - 1.0 + i * 1.0, cz + 1.0, 'n', 'stool');
  box('dark', cx, 2.45, cz, 2.4, 0.9, 0.06, false);
  for (let i = 0; i < 4; i++) box('posterB', cx - 0.8 + i * 0.5, 2.7 - (i % 2) * 0.3, cz + 0.04, 0.35, 0.05, 0.02, false);
  lamp(cx, 2.2, cz + 0.8, 0xffc47a, 0.8, 6);
}

/** Two copiers, a collating table and recycling bins. */
export function copierHub(cx: number, cz: number): void {
  for (const dx of [-0.7, 0.7]) {
    box('white', cx + dx, 0, cz, 1.1, 1.0, 0.7);
    box('dark', cx + dx, 1.0, cz, 1.1, 0.08, 0.7, false);
    box('screenDesk', cx + dx, 1.04, cz + 0.25, 0.3, 0.02, 0.15, false);
  }
  deskFrame(cx, cz + 1.4, 1.8, 0.7);
  box('paper', cx - 0.4, 0.76, cz + 1.4, 0.5, 0.3, 0.38, false);
  box('paper', cx + 0.3, 0.76, cz + 1.4, 0.5, 0.18, 0.38, false);
  box('blue', cx + 1.7, 0, cz + 0.2, 0.55, 0.8, 0.55);
  box('green', cx + 2.4, 0, cz + 0.2, 0.55, 0.8, 0.55);
}

/**
 * Indoor tree in a planter: solid planter and trunk (collision), then mulch, rim, tapering trunk,
 * side branches, a three-layer lumpy canopy, a few blossoms and a soft uplight. All decor is non-solid.
 */
export function planterTree(cx: number, cz: number): void {
  box('shelf', cx, 0, cz, 2.0, 0.6, 2.0);
  box('dark', cx, 0.6, cz, 1.8, 0.04, 1.8, false);
  box('shelf', cx, 0.6, cz, 2.1, 0.06, 2.1, false); // rim
  for (let i = 0; i < 9; i++) box('concrete', cx + (plantRng() - 0.5) * 1.6, 0.64, cz + (plantRng() - 0.5) * 1.6, 0.18, 0.06, 0.15, false); // pebbles
  box('crate', cx, 0.6, cz, 0.25, 1.4, 0.25); // trunk
  box('crate', cx, 2.0, cz, 0.18, 0.8, 0.18, false);
  box('crate', cx, 2.8, cz, 0.12, 0.4, 0.12, false);
  for (const [dx, dz, y, len] of [[0.45, 0, 1.5, 0.7], [-0.45, 0.1, 1.8, 0.8], [0.1, 0.5, 2.1, 0.7], [-0.1, -0.5, 2.3, 0.8]] as const) {
    const wide = Math.abs(dx) > 0.2;
    box('crate', cx + dx * 0.8, y, cz + dz * 0.8, wide ? len : 0.1, 0.1, wide ? 0.1 : len, false);
  }
  foliage(cx, 1.5, cz, 1.0, 0.5, 9, 0.8);
  foliage(cx, 2.1, cz, 0.8, 0.5, 8, 0.75);
  foliage(cx, 2.7, cz, 0.45, 0.4, 5, 0.7);
  box('green', cx, 3.1, cz, 0.7, 0.5, 0.7, false);
  for (let i = 0; i < 6; i++) {
    const a = plantRng() * Math.PI * 2;
    box(i % 2 ? 'accentOrange' : 'posterA', cx + Math.cos(a) * 1.0, 1.6 + plantRng() * 1.3, cz + Math.sin(a) * 1.0, 0.12, 0.12, 0.12, false);
  }
}

/**
 * Glass partition room with an open top (like a real office subdivision): glass panes between
 * slim frame posts, a frosted privacy band, and one doorway. Glass is solid, so it stops
 * movement and bullets (shared collision cannot be see-through for shots only).
 * @param door - Which wall holds the doorway, its centre along that wall, and its width.
 */
export function glassRoom(
  x0: number, x1: number, z0: number, z1: number,
  door: { wall: 'n' | 's' | 'e' | 'w'; c: number; w: number },
): void {
  const H = 2.8;
  const run = (fixed: number, a: number, b: number, alongX: boolean, gap?: { c: number; w: number }): void => {
    const pieces: [number, number][] = gap ? [[a, gap.c - gap.w / 2], [gap.c + gap.w / 2, b]] : [[a, b]];
    for (const [p, q] of pieces) {
      const len = q - p;
      const mid = (p + q) / 2;
      if (alongX) {
        box('glass', mid, 0, fixed, len, H, 0.08);
        box('white', mid, 0.95, fixed, len, 0.3, 0.1, false); // frosted band
        box('dark', mid, H, fixed, len, 0.06, 0.12, false); // top rail
        box('dark', mid, 0, fixed, len, 0.08, 0.12, false); // base rail
      } else {
        box('glass', fixed, 0, mid, 0.08, H, len);
        box('white', fixed, 0.95, mid, 0.1, 0.3, len, false);
        box('dark', fixed, H, mid, 0.12, 0.06, len, false);
        box('dark', fixed, 0, mid, 0.12, 0.08, len, false);
      }
      for (let t = p; t <= q + 0.01; t += 1.5) {
        if (alongX) box('dark', t, 0, fixed, 0.08, H, 0.12, false);
        else box('dark', fixed, 0, t, 0.12, H, 0.08, false);
      }
    }
    if (gap) {
      // Header bar so the doorway reads as a door.
      if (alongX) box('dark', gap.c, 2.15, fixed, gap.w, 0.08, 0.12, false);
      else box('dark', fixed, 2.15, gap.c, 0.12, 0.08, gap.w, false);
    }
  };
  run(z0, x0, x1, true, door.wall === 'n' ? door : undefined);
  run(z1, x0, x1, true, door.wall === 's' ? door : undefined);
  run(x0, z0, z1, false, door.wall === 'w' ? door : undefined);
  run(x1, z0, z1, false, door.wall === 'e' ? door : undefined);
}

/** Row of filing cabinets along X; solid cover just under head height (`tall` reaches 2 m). */
export function cabinets(x: number, z: number, count: number, tall = false): void {
  for (let i = 0; i < count; i++) {
    const cx = x + i * 0.52;
    box('metal', cx, 0, z, 0.5, tall ? 2.0 : 1.35, 0.7);
    for (const y of tall ? [0.35, 0.85, 1.35, 1.75] : [0.35, 0.78, 1.1]) box('dark', cx, y, z + 0.36, 0.28, 0.04, 0.02, false);
  }
}

/** Collapsed cubicle: partition ends, a stranded desk and papers on the floor. */
export function cubicleRuin(cx: number, cz: number): void {
  box('trim', cx, 0, cz, 3, 1.3, 0.1);
  box('trim', cx - 1.45, 0, cz + 1.0, 0.1, 1.3, 2);
  deskWithMonitor(cx + 0.3, cz + 1.2, 0.2, 'screenBsod');
  chair(cx - 0.5, cz + 2.0, 'n');
  for (let i = 0; i < 7; i++) {
    box('paper', cx - 1.2 + ((i * 37) % 24) / 10, 0, cz + 0.6 + ((i * 53) % 21) / 10, 0.25, 0.02, 0.33, false);
  }
}

/** Two desks stacked into a barricade with a crate and cabinet at the flanks. */
export function deskFort(cx: number, cz: number): void {
  box('desk', cx, 0, cz, 1.6, 0.75, 0.8);
  box('desk', cx, 0.75, cz, 1.6, 0.75, 0.8);
  box('desk', cx + 1.0, 0, cz + 0.9, 0.8, 0.75, 1.6);
  box('crate', cx - 1.1, 0, cz - 0.2, 0.9, 0.9, 0.9);
  cabinets(cx - 0.6, cz + 0.9, 2);
}

/** Traffic cone. */
export function cone(x: number, z: number): void {
  box('accentOrange', x, 0, z, 0.32, 0.6, 0.32);
  box('white', x, 0.3, z, 0.34, 0.1, 0.34, false);
}

/** A-frame wet-floor sign. */
export function wetFloor(x: number, z: number): void {
  box('hazard', x, 0, z, 0.5, 0.7, 0.14, false);
  box('dark', x, 0.45, z + 0.08, 0.3, 0.1, 0.01, false);
}

// ---------------------------------------------------------------- cover pieces

/** Waist-high wall (1.1 m): hides the body, you still shoot over it. */
export function lowWall(cx: number, cz: number, len: number, alongX: boolean, mat: MaterialId = 'trim'): void {
  box(mat, cx, 0, cz, alongX ? len : 0.4, 1.1, alongX ? 0.4 : len);
}

/** Free-standing acoustic screen (2.2 m): breaks line of sight completely, with feet and a top rail. */
export function screenPanel(cx: number, cz: number, len: number, alongX: boolean, mat: MaterialId = 'wainNavy'): void {
  box(mat, cx, 0.08, cz, alongX ? len : 0.12, 2.1, alongX ? 0.12 : len);
  box('dark', cx, 2.18, cz, alongX ? len + 0.04 : 0.16, 0.06, alongX ? 0.16 : len + 0.04, false);
  for (const s of [-1, 1] as const) {
    box('metal', cx + (alongX ? s * (len / 2 - 0.2) : 0), 0, cz + (alongX ? 0 : s * (len / 2 - 0.2)), alongX ? 0.1 : 0.6, 0.08, alongX ? 0.6 : 0.1, false);
  }
}

/** Structural column with a skirting base: a full-height corner to peek around. */
export function pillar(cx: number, cz: number, size = 1.0): void {
  box('wall', cx, 0, cz, size, 4.2, size);
  box('dark', cx, 0, cz, size + 0.08, 0.18, size + 0.08, false);
  box('accentBlue', cx, 1.1, cz, size + 0.04, 0.06, size + 0.04, false);
}

/** Vending machine (1.9 m tall block with a glowing front facing `face` along z). */
export function vending(cx: number, cz: number, face: 1 | -1, glow: MaterialId = 'signBlue'): void {
  box('dark', cx, 0, cz, 1.0, 1.9, 0.9);
  box(glow, cx, 0.5, cz + face * 0.455, 0.7, 1.2, 0.02, false);
  box('metal', cx + 0.3, 0.3, cz + face * 0.46, 0.2, 0.3, 0.03, false);
}

/** Planter box wall (1 m) used as long, soft-looking cover. */
export function planterWall(cx: number, cz: number, len: number, alongX: boolean): void {
  box('shelf', cx, 0, cz, alongX ? len : 0.8, 1.0, alongX ? 0.8 : len);
  box('green', cx, 1.0, cz, alongX ? len - 0.1 : 0.7, 0.55, alongX ? 0.7 : len - 0.1, false);
}

/**
 * Hanging chandelier built from boxes: ceiling rose, chain, a central column, two square
 * ring tiers with candle arms and glowing bulbs, and glass crystal drops. Purely decorative
 * (non-solid) and well above head height; adds a warm baked light below it.
 * @param r - Radius of the lower ring in metres (the upper ring is 60% of it).
 */
export function chandelier(cx: number, cz: number, r = 0.9): void {
  const top = 4.14;
  const low = 3.0; // lowest point of the fixture, clear of jumping heads
  box('metal', cx, top - 0.06, cz, 0.35, 0.06, 0.35, false); // ceiling rose
  box('dark', cx, low + 0.5, cz, 0.04, top - low - 0.5, 0.04, false); // chain
  box('metal', cx, low + 0.25, cz, 0.14, 0.4, 0.14, false); // column
  box('metal', cx, low + 0.1, cz, 0.22, 0.12, 0.22, false); // finial boss
  for (const [ring, y, k] of [[r, low + 0.2, 8], [r * 0.6, low + 0.5, 4]] as const) {
    // Square ring from four bars, each side doubled so it reads as a thick gilt band.
    box('metal', cx, y, cz - ring, ring * 2 + 0.06, 0.05, 0.05, false);
    box('metal', cx, y, cz + ring, ring * 2 + 0.06, 0.05, 0.05, false);
    box('metal', cx - ring, y, cz, 0.05, 0.05, ring * 2, false);
    box('metal', cx + ring, y, cz, 0.05, 0.05, ring * 2, false);
    // Spokes from the column to the ring corners.
    box('metal', cx, y - 0.02, cz, ring * 2, 0.03, 0.03, false);
    box('metal', cx, y - 0.02, cz, 0.03, 0.03, ring * 2, false);
    // Candles with bulbs spaced around the ring.
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + Math.PI / 4;
      const px = cx + Math.sign(Math.cos(a)) * ring * Math.min(1, Math.abs(Math.cos(a)) * 1.4);
      const pz = cz + Math.sign(Math.sin(a)) * ring * Math.min(1, Math.abs(Math.sin(a)) * 1.4);
      box('white', px, y + 0.05, pz, 0.06, 0.14, 0.06, false);
      box('light', px, y + 0.19, pz, 0.07, 0.1, 0.07, false);
      box('glass', px, y - 0.14, pz, 0.04, 0.14, 0.04, false); // crystal drop
    }
  }
  box('glass', cx, low - 0.1, cz, 0.1, 0.22, 0.1, false); // centre pendant
  lamp(cx, low - 0.1, cz, 0xffd9a0, 0.9, 9);
}
