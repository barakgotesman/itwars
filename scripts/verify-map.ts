/**
 * Map sanity check: every spawn must be outside solids and reachable on foot from the first spawn.
 * Run with `npm run verify:map`; exits non-zero on failure.
 */
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../src/shared/constants';
import { Doors } from '../src/shared/doors';
import { MAP_BOXES, PICKUP_SPOTS, SOLIDS, SPAWNS } from '../src/shared/map';
import { overlaps } from '../src/shared/physics';

const CELL = 0.5;
const X0 = -50;
const Z0 = -35;
const NX = Math.round(100 / CELL);
const NZ = Math.round(70 / CELL);

/** True if a standing player centred at x/z (feet on the floor) overlaps no solid. */
function free(x: number, z: number): boolean {
  for (const b of SOLIDS) {
    if (
      x + PLAYER_RADIUS > b.minX && x - PLAYER_RADIUS < b.maxX &&
      z + PLAYER_RADIUS > b.minZ && z - PLAYER_RADIUS < b.maxZ &&
      PLAYER_HEIGHT > b.minY && 0 < b.maxY
    ) return false;
  }
  return true;
}

const cellX = (i: number) => X0 + (i + 0.5) * CELL;
const cellZ = (j: number) => Z0 + (j + 0.5) * CELL;
const idx = (i: number, j: number) => j * NX + i;

const walkable = new Uint8Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) walkable[idx(i, j)] = free(cellX(i), cellZ(j)) ? 1 : 0;

let failures = 0;
const startI = Math.floor((SPAWNS[0]![0] - X0) / CELL);
const startJ = Math.floor((SPAWNS[0]![1] - Z0) / CELL);
const seen = new Uint8Array(NX * NZ);
const queue = [idx(startI, startJ)];
seen[queue[0]!] = 1;
for (let q = 0; q < queue.length; q++) {
  const cur = queue[q]!;
  const i = cur % NX;
  const j = Math.floor(cur / NX);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
    const n = idx(ni, nj);
    if (seen[n] || !walkable[n]) continue;
    seen[n] = 1;
    queue.push(n);
  }
}

/** Checks one point is outside solids and reachable; logs and counts a failure otherwise. */
function check(label: string, x: number, z: number): void {
  if (!free(x, z)) {
    console.error(`FAIL ${label} (${x}, ${z}) is inside a solid`);
    failures++;
    return;
  }
  const n = idx(Math.floor((x - X0) / CELL), Math.floor((z - Z0) / CELL));
  if (!seen[n]) {
    console.error(`FAIL ${label} (${x}, ${z}) is not reachable on foot`);
    failures++;
  }
}
SPAWNS.forEach(([x, z], k) => check(`spawn #${k}`, x, z));
PICKUP_SPOTS.forEach((p, k) => check(`pickup #${k} (${p.kind})`, p.x, p.z));

// Sliding doors: at every position along their travel, a panel must not cut into furniture or sit on a spawn or pickup.
const doors = new Doors();
for (const openness of [0, 0.25, 0.5, 0.75, 1]) {
  doors.applyWire(doors.defs.flatMap(() => [openness * 100, openness * 100]));
  doors.boxes.forEach((box, i) => {
    const name = `${doors.defs[i]!.name} at ${openness * 100}% open`;
    for (const b of SOLIDS) {
      const hit = b.maxX > box.minX && b.minX < box.maxX && b.maxZ > box.minZ && b.minZ < box.maxZ && b.maxY > box.minY && b.minY < box.maxY;
      if (hit) {
        console.error(`FAIL door "${name}" intersects a solid at x ${b.minX.toFixed(1)}..${b.maxX.toFixed(1)}, z ${b.minZ.toFixed(1)}..${b.maxZ.toFixed(1)}`);
        failures++;
        break;
      }
    }
    for (const [label, pts] of [['spawn', SPAWNS.map(([x, z]) => ({ x, z }))], ['pickup', PICKUP_SPOTS]] as const) {
      for (const p of pts) {
        if (overlaps({ x: p.x, y: 0, z: p.z }, box)) {
          console.error(`FAIL door "${name}" covers a ${label} at (${p.x}, ${p.z})`);
          failures++;
        }
      }
    }
  });
}

const walkableCount = walkable.reduce((a, b) => a + b, 0);
console.log(
  `boxes: ${MAP_BOXES.length} (${SOLIDS.length} solid), spawns: ${SPAWNS.length}, pickups: ${PICKUP_SPOTS.length}, ` +
  `doors: ${doors.defs.length}, walkable cells: ${walkableCount}, reachable from spawn #0: ${queue.length}`,
);
if (failures) process.exit(1);
console.log('verify:map OK');
