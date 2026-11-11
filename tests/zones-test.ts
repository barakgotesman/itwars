/**
 * Checks the lighting design: the zones tile the whole office, every spawn and pickup is in one, the values are
 * sane, and no lamp is buried inside furniture (a buried lamp lights nothing, because every ray starts inside a solid).
 * Run with `npm run test:zones`.
 */
import { LIGHTS, PICKUP_SPOTS, SOLIDS } from '@shared/world/map';
import { X0, X1, Z0, Z1 } from '@shared/world/map/builder';
import { ACCENT_COUNT } from '@shared/world/map/accents';
import { SPAWNS } from '@shared/world/map';
import { ZONES, zoneAt } from '@shared/world/map/zones';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) return;
  failed++;
  console.log(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
}

const inside = (z: (typeof ZONES)[number], x: number, zz: number) => x >= z.x0 && x < z.x1 && zz >= z.z0 && zz < z.z1;

// Every point of the floor plan belongs to a zone (the open-plan fallback must never be what answers).
let uncovered = 0;
for (let x = X0; x < X1; x += 0.5) {
  for (let z = Z0; z < Z1; z += 0.5) if (!ZONES.some((zone) => inside(zone, x, z))) uncovered++;
}
check('every floor point is inside a zone', uncovered === 0, `${uncovered} uncovered`);

for (const [x, z] of SPAWNS) check(`spawn ${x},${z} has a zone`, ZONES.some((zone) => inside(zone, x, z)));
for (const p of PICKUP_SPOTS) check(`pickup ${p.x},${p.z} has a zone`, ZONES.some((zone) => inside(zone, p.x, p.z)));

for (const z of ZONES) {
  check(`${z.id}: ambient level in range`, z.ambient.level > 0.03 && z.ambient.level < 0.4);
  check(`${z.id}: player floor in range`, z.floor >= 0.3 && z.floor <= 1);
  check(`${z.id}: fog density in range`, z.fog.density > 0.003 && z.fog.density < 0.02);
  check(`${z.id}: has a positive area`, z.x1 > z.x0 && z.z1 > z.z0);
  for (const key of [...(z.panels.onlyAt ?? []), ...(z.panels.flickerAt ?? [])]) {
    const [x, zz] = key.split(',').map(Number) as [number, number];
    check(`${z.id}: panel cell ${key} lies in the zone`, zoneAt(x, zz).id === z.id);
  }
}

check('lamp count stays within the baking budget', LIGHTS.length <= 190, `${LIGHTS.length} lamps`);
check('accent lights exist', ACCENT_COUNT > 20, `${ACCENT_COUNT}`);

// A lamp inside a solid is blocked in every direction, so it would light nothing at all.
const buried = LIGHTS.filter((l) => SOLIDS.some((b) => l.x > b.minX && l.x < b.maxX && l.y > b.minY && l.y < b.maxY && l.z > b.minZ && l.z < b.maxZ));
check('no lamp is buried inside a solid', buried.length === 0, buried.map((l) => `${l.x},${l.y},${l.z}`).join(' | '));

if (failed > 0) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log(`zones OK: ${ZONES.length} zones, ${LIGHTS.length} lamps (${ACCENT_COUNT} accents)`);
console.log('test:zones OK');
