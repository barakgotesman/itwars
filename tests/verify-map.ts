/**
 * Map sanity check: every spawn must be outside solids and reachable on foot from the first spawn.
 * Run with `npm run verify:map`; exits non-zero on failure.
 */
import { Doors } from '@shared/world/doors';
import { MAP_BOXES, PICKUP_SPOTS, SOLIDS, SPAWNS } from '@shared/world/map';
import { buildNavGrid, cellAt, reachable, standingFree } from '@shared/world/nav';
import { overlaps } from '@shared/core/physics';

const grid = buildNavGrid(SOLIDS);
const walkable = grid.walkable;

let failures = 0;
const seen = reachable(grid, cellAt(SPAWNS[0]![0], SPAWNS[0]![1]));
const reachableCount = seen.reduce((a, b) => a + b, 0);

/** Checks one point is outside solids and reachable; logs and counts a failure otherwise. */
function check(label: string, x: number, z: number): void {
  if (!standingFree(SOLIDS, x, z)) {
    console.error(`FAIL ${label} (${x}, ${z}) is inside a solid`);
    failures++;
    return;
  }
  const n = cellAt(x, z);
  if (n < 0 || !seen[n]) {
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
  `doors: ${doors.defs.length}, walkable cells: ${walkableCount}, reachable from spawn #0: ${reachableCount}`,
);
if (failures) process.exit(1);
console.log('verify:map OK');
