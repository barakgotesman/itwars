/**
 * Checks every selectable map (`MAPS`): spawns and pickups stand outside solids and are reachable on foot, door
 * panels never cut into furniture or cover a spawn or pickup at any point of their travel, the lighting zones
 * cover the whole floor with sane values, no lamp is buried in a solid, boards sit on free wall, and the podium
 * has clear floor. Also checks the `map` rule's validation. Run with `npm run test:maps`.
 */
import { overlaps } from '@shared/core/physics';
import { DEFAULT_RULES, sanitizeRules } from '@shared/rules/modes';
import { Doors } from '@shared/world/doors';
import { MAP_INFO } from '@shared/world/map/map-info';
import { MAPS, RANGE_MAP, mapFor, type MapDef } from '@shared/world/map/maps';
import { buildNavGrid, cellAt, reachable, standingFree } from '@shared/world/nav';
import { Room } from '@server/rooms/room';
import { FakeConn, mut } from './helpers';

let failed = 0;
/** Records a failed check. */
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) return;
  failed++;
  console.log(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
}

check('MAPS and MAP_INFO line up', MAPS.length === MAP_INFO.length && MAPS.every((m, i) => m.id === MAP_INFO[i]!.id));
check('map rule: default is the office', DEFAULT_RULES.map === 0 && mapFor(DEFAULT_RULES).id === 'office');
check('map rule: unknown values fall back to the default', sanitizeRules({ map: 99 }).map === 0 && sanitizeRules({ map: 'x' }).map === 0 && sanitizeRules({}).map === 0);
check('map rule: valid values survive', sanitizeRules({ map: 1 }).map === 1 && mapFor(sanitizeRules({ map: 1 })).id === 'datacenter');
check('the range always uses the range map', mapFor({ mode: 'range', map: 1 }) === RANGE_MAP);

/** Runs every per-map check. */
function checkMap(map: MapDef): void {
  const tag = (s: string) => `${map.id}: ${s}`;
  const grid = buildNavGrid(map.solids);
  const first = map.spawns[0]!;
  const seen = reachable(grid, cellAt(first[0], first[1]));
  const point = (label: string, x: number, z: number) => {
    check(tag(`${label} (${x}, ${z}) is outside every solid`), standingFree(map.solids, x, z));
    const n = cellAt(x, z);
    check(tag(`${label} (${x}, ${z}) is reachable on foot`), n >= 0 && seen[n] === 1);
  };
  // The range's armory pickups stand on a table and its one spawn is by design: `verify:range-map` covers it.
  if (map !== RANGE_MAP) {
    map.spawns.forEach(([x, z], k) => point(`spawn #${k}`, x, z));
    map.pickups.forEach((p, k) => point(`pickup #${k} (${p.kind})`, p.x, p.z));
    check(tag('has enough spawns for 8 players'), map.spawns.length >= 8, `${map.spawns.length}`);
  }

  // Doors, at every point of their travel.
  const doors = new Doors(map.doors);
  for (const openness of [0, 0.25, 0.5, 0.75, 1]) {
    doors.applyWire(doors.defs.flatMap(() => [openness * 100, openness * 100]));
    doors.boxes.forEach((box, i) => {
      const name = `door "${doors.defs[i]!.name}" at ${openness * 100}%`;
      const hit = map.solids.find((b) => b.maxX > box.minX && b.minX < box.maxX && b.maxZ > box.minZ && b.minZ < box.maxZ && b.maxY > box.minY && b.minY < box.maxY);
      check(tag(`${name} does not cut into a solid`), !hit, hit ? `x ${hit.minX.toFixed(1)}..${hit.maxX.toFixed(1)}, z ${hit.minZ.toFixed(1)}..${hit.maxZ.toFixed(1)}` : '');
      for (const [label, pts] of [['spawn', map.spawns.map(([x, z]) => ({ x, z }))], ['pickup', map.pickups]] as const) {
        for (const p of pts) check(tag(`${name} does not cover a ${label} at (${p.x}, ${p.z})`), !overlaps({ x: p.x, y: 0, z: p.z }, box));
      }
    });
  }

  // Zones: the floor is covered, values are sane.
  const inside = (z: MapDef['zones'][number], x: number, zz: number) => x >= z.x0 && x < z.x1 && zz >= z.z0 && zz < z.z1;
  let uncovered = 0;
  const b = map.bounds;
  for (let x = b.x0 + 2; x < b.x1 - 2; x += 0.5) for (let z = b.z0 + 2; z < b.z1 - 2; z += 0.5) if (!map.zones.some((zone) => inside(zone, x, z))) uncovered++;
  check(tag('every floor point is inside a zone'), uncovered === 0, `${uncovered} uncovered`);
  for (const z of map.zones) {
    check(tag(`zone ${z.id}: ambient level in range`), z.ambient.level > 0.03 && z.ambient.level < 0.4);
    check(tag(`zone ${z.id}: player floor in range`), z.floor >= 0.3 && z.floor <= 1);
    check(tag(`zone ${z.id}: fog density in range`), z.fog.density > 0.003 && z.fog.density < 0.04);
  }

  // Lamps are in free air and within the baking budget.
  check(tag('lamp count stays within the baking budget'), map.lights.length <= 190, `${map.lights.length}`);
  const buried = map.lights.filter((l) => map.solids.some((s) => l.x > s.minX && l.x < s.maxX && l.y > s.minY && l.y < s.maxY && l.z > s.minZ && l.z < s.maxZ));
  check(tag('no lamp is buried inside a solid'), buried.length === 0, buried.map((l) => `${l.x},${l.y},${l.z}`).join(' | '));

  // Boards fit between floor and ceiling, inside the map, and do not overlap each other.
  for (const bd of map.boards) {
    check(tag(`board at ${bd.x},${bd.z} fits between floor and ceiling`), bd.y - bd.h / 2 > 0.6 && bd.y + bd.h / 2 < 4.0);
    check(tag(`board at ${bd.x},${bd.z} is inside the map`), bd.x > b.x0 && bd.x < b.x1 && bd.z > b.z0 && bd.z < b.z1);
  }

  // The podium needs about 11 m x 5 m of clear floor around its origin, and a camera spot that is not inside a solid.
  // (The office's own podium spot was placed by hand between its lobby pillars, so only the new maps are measured.)
  if (map !== RANGE_MAP) {
    const { origin, camPos } = map.podium;
    let blocked = 0;
    for (let x = origin.x - 5.5; x <= origin.x + 5.5; x += 0.5) for (let z = origin.z - 2.5; z <= origin.z + 2.5; z += 0.5) if (!standingFree(map.solids, x, z)) blocked++;
    if (map.id !== 'office') check(tag('podium floor is clear'), blocked === 0, `${blocked} blocked cells`);
    check(tag('podium camera is in free air'), standingFree(map.solids, camPos[0], camPos[2]));
  }
}

for (const m of [...MAPS, RANGE_MAP]) checkMap(m);

// A real room on each selectable map: everyone spawns on that map's spawns, bots roam 
// and the map's doors and pickups are the ones sent to the client.
for (const [index, map] of MAPS.entries()) {
  const room = new Room('MAPS', { seed: 11, rules: { ...DEFAULT_RULES, map: index, bots: 3, botSkill: 3, loadout: 0 } });
  const id = room.join(new FakeConn(), 'Tester')!;
  room.enter(id);
  const start = new Map<number, string>();
  let outside = 0;
  const near = (x: number, z: number) => map.spawns.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 0.01);
  for (let t = 0; t < 60 * 40; t++) {
    room.step();
    for (const [pid] of room.players) {
      const st = mut(room, pid).state;
      if (!start.has(pid) && t > 5) start.set(pid, `${st.x.toFixed(1)},${st.z.toFixed(1)}`);
      const b = map.bounds;
      if (st.x < b.x0 || st.x > b.x1 || st.z < b.z0 || st.z > b.z1) outside++;
    }
  }
  check(`${map.id}: a room plays on the map's own geometry`, room.spots === map.pickups && room.spawns === map.spawns && room.doors.defs === map.doors);
  check(`${map.id}: nobody leaves the map in 40 s of bot play`, outside === 0, `${outside} samples outside`);
  const moved = [...room.players.keys()].filter((pid) => {
    const st = mut(room, pid).state;
    return start.get(pid) !== `${st.x.toFixed(1)},${st.z.toFixed(1)}`;
  }).length;
  check(`${map.id}: bots move around`, moved >= 3, `${moved} players moved`);
  check(`${map.id}: first spawn is one of the map's`, near(map.spawns[0]![0], map.spawns[0]![1]));
}

if (failed > 0) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
for (const m of MAPS) console.log(`${m.id}: ${m.boxes.length} boxes (${m.solids.length} solid), ${m.spawns.length} spawns, ${m.pickups.length} pickups, ${m.doors.length} doors, ${m.lights.length} lamps, ${m.boards.length} boards`);
console.log('test:maps OK');
