/**
 * Shooting range sanity check: the spawn and a sample point near each target/the grenade yard are
 * outside every solid. Unlike `verify-map.ts`, this does not use `buildNavGrid`/`reachable`: that
 * grid is a fixed window over the OFFICE's own footprint (`NAV_X0`/`NAV_Z0`, -50..50 x -35..35), and
 * the range sits outside it, so only the plain `standingFree` check (any solids array, any point)
 * applies here. With one spawn and no pickups, that is also all "reachable" means for this map.
 * Run with `npm run verify:range-map`; exits non-zero on failure.
 */
import { MAP_BOXES, SOLIDS, SPAWNS } from '@shared/world/map/range';
import { standingFree } from '@shared/world/nav';

let failures = 0;

/** Checks one point is outside every solid; logs and counts a failure otherwise. */
function check(label: string, x: number, z: number): void {
  if (!standingFree(SOLIDS, x, z)) {
    console.error(`FAIL ${label} (${x}, ${z}) is inside a solid`);
    failures++;
  }
}

SPAWNS.forEach(([x, z], k) => check(`spawn #${k}`, x, z));
// A sample point beside each target's distance (the dummies themselves sit at x 0, blocking it on
// purpose, and the firing line at z -2 is meant to block x 0 too) and in the standing area.
check('standing area', 2, 4);
for (const z of [-6, -16, -27, -37]) check(`range at z ${z}`, 2, z);

console.log(`boxes: ${MAP_BOXES.length} (${SOLIDS.length} solid), spawns: ${SPAWNS.length}`);
if (failures) process.exit(1);
console.log('verify:range-map OK');
