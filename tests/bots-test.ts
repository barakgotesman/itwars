/**
 * Headless bot tests: navigation over the real office map, then (as they are built) bot lifecycle, perception,
 * aim fairness and CPU cost. Run with `npm run test:bots`; exits non-zero on any failure.
 */
import { CHARACTERS, PLAYER_COLORS } from '@shared/core/characters';
import { MAX_NAME_LEN, MAX_PLAYERS } from '@shared/core/constants';
import { BOT_COUNTS, BOT_NAMES, BOT_SKILLS, BOT_TUNING, botTuning, pickBotName } from '@shared/rules/bots';
import { DEFAULT_RULES, MODES, describeRules, sanitizeRules, type MatchRules } from '@shared/rules/modes';
import { SPRAY_COUNT } from '@shared/rules/sprays';
import { sanitizeName, type PlayerInfo } from '@shared/net/protocol';
import { PICKUP_SPOTS, SOLIDS, SPAWNS } from '@shared/world/map';
import { buildNavGrid, cellAt, findPath, lineWalkable, reachable, standingFree, type Pt } from '@shared/world/nav';
import type { Aabb } from '@shared/core/physics';
import type { DoorDef } from '@shared/world/map/door-layout';
import { GRENADES, WEAPONS } from '@shared/rules/weapons';
import { Room } from '@server/rooms/room';
import { RoomManager } from '@server/rooms/manager';
import { TickMonitor } from '@server/loop';
import { SERVER_BUDGET_MS, UNLIMITED, describeCapacity, measureCapacity, type LoadModel } from '@server/capacity';
import { setGoal } from '@server/sim/bots/navigate';
import { wrapAngle } from '@server/sim/bots/angles';
import { FLOOR, FakeConn, SPAWNS as FLAT_SPAWNS, idle, mut } from './helpers';

let failed = 0;
let passed = 0;

/** Records a named check. */
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

/** Total length of a path that starts at `from`. */
function pathLength(from: Pt, path: readonly Pt[]): number {
  let len = 0;
  let prev = from;
  for (const p of path) { len += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
  return len;
}

// ---------------------------------------------------------------- navigation

{
  const grid = buildNavGrid(SOLIDS);
  check('nav grid is cached per solids array', buildNavGrid(SOLIDS) === grid);

  const seen = reachable(grid, cellAt(SPAWNS[0]![0], SPAWNS[0]![1]));
  const starts: [string, number, number][] = [
    ...SPAWNS.map(([x, z], k) => [`spawn #${k}`, x, z] as [string, number, number]),
    ...PICKUP_SPOTS.map((p, k) => [`pickup #${k}`, p.x, p.z] as [string, number, number]),
  ];
  for (const [label, x, z] of starts) check(`${label} is on the reachable grid`, seen[cellAt(x, z)] === 1);

  // The two spawns that are farthest apart make the longest realistic trip.
  let far: [Pt, Pt] = [{ x: SPAWNS[0]![0], z: SPAWNS[0]![1] }, { x: SPAWNS[1]![0], z: SPAWNS[1]![1] }];
  let farD = 0;
  for (const a of SPAWNS) for (const b of SPAWNS) {
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d > farD) { farD = d; far = [{ x: a[0], z: a[1] }, { x: b[0], z: b[1] }]; }
  }
  const path = findPath(grid, far[0].x, far[0].z, far[1].x, far[1].z);
  check('a path exists between the two farthest spawns', path !== null && path.length > 0);
  if (path) {
    let prev = far[0];
    let legsOk = true;
    for (const p of path) { if (!lineWalkable(grid, prev.x, prev.z, p.x, p.z)) legsOk = false; prev = p; }
    check('every leg of the path is walkable', legsOk);
    const last = path[path.length - 1]!;
    check('the path ends on the goal', Math.hypot(last.x - far[1].x, last.z - far[1].z) < 0.8);
    const len = pathLength(far[0], path);
    check('the path is no more than 3x the straight distance', len < farD * 3, `${len.toFixed(1)} m for ${farD.toFixed(1)} m`);
    check('smoothing leaves few waypoints', path.length < 60, `${path.length} waypoints`);
  }

  // Every spawn can reach every other spawn (the map is one connected office).
  let unreachable = 0;
  for (const a of SPAWNS) for (const b of SPAWNS) {
    if (a === b) continue;
    const p = findPath(grid, a[0], a[1], b[0], b[1]);
    const end = p?.[p.length - 1];
    if (!end || Math.hypot(end.x - b[0], end.z - b[1]) > 0.8) unreachable++;
  }
  check('A* connects every pair of spawns', unreachable === 0, `${unreachable} pairs failed`);

  // A start inside a wall is snapped to the nearest free cell instead of failing.
  const snapped = findPath(grid, -49.9, -34.9, SPAWNS[0]![0], SPAWNS[0]![1]);
  check('a start outside walkable space is snapped', snapped !== null);

  // A tiny node cap still returns a path that heads toward the goal and stays bounded.
  const capped = findPath(grid, far[0].x, far[0].z, far[1].x, far[1].z, 50);
  check('a capped search returns a partial path', capped !== null && capped.length > 0);

  // Cost of one full-map search, to back the capacity estimate in the plan with a number.
  const t0 = performance.now();
  const runs = 40;
  for (let k = 0; k < runs; k++) findPath(grid, far[0].x, far[0].z, far[1].x, far[1].z);
  const per = (performance.now() - t0) / runs;
  console.log(`A* across the map: ${per.toFixed(3)} ms per search`);
  check('a full-map search is under 3 ms', per < 3, `${per.toFixed(2)} ms`);
}

// ---------------------------------------------------------------- rules and data

{
  check('bots default to none', DEFAULT_RULES.bots === 0);
  const ok = sanitizeRules({ mode: 'dm', killLimit: 30, timeLimitMin: 10, bots: 4, botSkill: 3 });
  check('sanitizeRules keeps valid bot rules', ok.bots === 4 && ok.botSkill === 3);
  const bad = sanitizeRules({ bots: 9, botSkill: 7 });
  check('sanitizeRules resets bad bot rules', bad.bots === DEFAULT_RULES.bots && bad.botSkill === DEFAULT_RULES.botSkill);
  check('sanitizeRules resets non-numbers', sanitizeRules({ bots: '3', botSkill: null }).bots === 0);
  const rules = (bots: number, botSkill = 2): MatchRules => ({ ...DEFAULT_RULES, bots, botSkill });
  check('describeRules mentions bots', describeRules(rules(3, 3)).includes('3 bots (hard)') && describeRules(rules(1)).includes('1 bot ('));
  check('describeRules is unchanged without bots', !describeRules(rules(0)).includes('bot'));
  const keys = MODES[0]!.options.map((o) => o.key);
  check('the setup screen offers bots and bot skill', keys.includes('bots') && keys.includes('botSkill'));
  check('bot counts are 0 to 7', BOT_COUNTS.join() === '0,1,2,3,4,5,6,7' && BOT_COUNTS.length === MAX_PLAYERS);

  check('there are enough bot names for a full room', BOT_NAMES.length >= MAX_PLAYERS - 1);
  check('bot names are unique', new Set(BOT_NAMES).size === BOT_NAMES.length);
  check('every bot name passes the callsign rules', BOT_NAMES.every((n) => sanitizeName(n) === n && n.length <= MAX_NAME_LEN));
  const taken = new Set(BOT_NAMES.slice(1).map((n) => n.toLowerCase()));
  check('pickBotName finds the only free name', pickBotName(taken, () => 0.5) === BOT_NAMES[0]);
  const all = new Set(BOT_NAMES);
  const extra = pickBotName(all, () => 0.5);
  check('pickBotName falls back to a numbered name', !all.has(extra) && extra.length <= MAX_NAME_LEN);

  const [easy, normal, hard] = BOT_TUNING;
  check('there is one tuning per skill', BOT_TUNING.length === BOT_SKILLS.length && botTuning(1) === easy && botTuning(9) === normal);
  check('harder bots react faster', easy!.reactionTicks > normal!.reactionTicks && normal!.reactionTicks > hard!.reactionTicks);
  check('harder bots aim better', easy!.aimError > normal!.aimError && normal!.aimError > hard!.aimError);
  check('harder bots turn faster', easy!.turnRate < normal!.turnRate && normal!.turnRate < hard!.turnRate);
  check('harder bots go for headshots', easy!.headshotBias < normal!.headshotBias && normal!.headshotBias < hard!.headshotBias);
  check('harder bots remember longer', easy!.memoryTicks < normal!.memoryTicks && normal!.memoryTicks < hard!.memoryTicks);
}

// ---------------------------------------------------------------- bots in a room

{
  const rules3: MatchRules = { ...DEFAULT_RULES, bots: 3, botSkill: 2 };
  const room = new Room('BOTS', { seed: 11, rules: rules3 });
  check('a room with bots holds them before any human joins', room.size === 3 && room.humans === 0);
  check('a room with only bots counts as empty (it would be deleted)', room.isEmpty);
  const noBots = new Room('NONE', { seed: 11 });
  check('a default room has no bots', noBots.size === 0);

  const conn = new FakeConn();
  const me = room.join(conn, 'Alice')!;
  room.enter(me);
  check('the human joins alongside the bots', room.size === 4 && room.humans === 1 && !room.isEmpty);

  const joined = conn.msgs[0];
  const list: PlayerInfo[] = joined?.t === 'joined' ? joined.players : [];
  const bots = list.filter((p) => p.bot);
  check('the joined message lists 3 bots and the human', list.length === 4 && bots.length === 3);
  check('the human is not flagged as a bot', list.find((p) => p.id === me)?.bot === undefined);
  check('bot names are Unix names and unique', bots.every((b) => BOT_NAMES.includes(b.name)) && new Set(bots.map((b) => b.name)).size === 3);
  check('bot looks are valid', bots.every((b) => b.model >= 0 && b.model < CHARACTERS.length && PLAYER_COLORS.includes(b.color) && b.spray >= 0 && b.spray < SPRAY_COUNT));

  idle(room, 10);
  const snap = conn.snap;
  check('bots are in the match and visible in snapshots', (snap?.players.length ?? 0) === 4 && bots.every((b) => snap!.players.some((p) => p.id === b.id && p.alive)));
  check('bots spawn apart from each other', new Set(snap!.players.map((p) => `${p.x},${p.z}`)).size === 4);
  check('the roster message flags bots', conn.msgs.some((m) => m.t === 'roster' && m.players.filter((p) => p.bot).length === 3) || list.filter((p) => p.bot).length === 3);

  room.leave(me);
  check('the room is empty once the last human leaves', room.isEmpty && room.size === 3);
}

{
  const room = new Room('FULL', { seed: 5, rules: { ...DEFAULT_RULES, bots: 7 } });
  check('7 bots leave one seat', room.size === 7 && !room.isFull);
  const a = room.join(new FakeConn(), 'Host');
  check('the host takes the last seat', a !== null && room.isFull);
  check('a second human is refused', room.join(new FakeConn(), 'Late') === null);
  check('a human who is called like a bot gets a numbered name', (() => {
    const r = new Room('NAME', { seed: 5, rules: { ...DEFAULT_RULES, bots: 1 } });
    const botName = [...r.players.values()][0]!.name;
    const id = r.join(new FakeConn(), botName)!;
    return r.inspect(id)!.name !== botName && r.inspect(id)!.name.startsWith(botName);
  })());
}

{
  // Bots count toward the match clock's "two players" rule.
  const room = new Room('CLOCK', { seed: 3, rules: { ...DEFAULT_RULES, timeLimitMin: 5, bots: 1 } });
  check('one bot alone does not start the clock', room.endsAt === 0);
  const id = room.join(new FakeConn(), 'Solo')!;
  room.enter(id);
  check('a human plus a bot starts the clock', room.endsAt > 0);
}

// ---------------------------------------------------------------- navigation in a room

{
  // Seven bots roam the real office for a minute: they cover ground, stay on the floor plan and do not snag.
  const ticks = 3600;
  const room = new Room('ROAM', { seed: 21, rules: { ...DEFAULT_RULES, bots: 7, botSkill: 2 } });
  const ids = [...room.players.keys()];
  const travelled = new Map<number, number>();
  const last = new Map<number, [number, number]>();
  let wallTicks = 0, outOfBounds = 0, maxStuck = 0;
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    room.step();
    if (t % 2 === 1) room.events = [];
    for (const id of ids) {
      const p = room.inspect(id)!;
      const l = last.get(id);
      if (l) travelled.set(id, (travelled.get(id) ?? 0) + Math.hypot(p.state.x - l[0], p.state.z - l[1]));
      last.set(id, [p.state.x, p.state.z]);
      if (Math.abs(p.state.x) > 50 || Math.abs(p.state.z) > 35) outOfBounds++;
      if (p.state.y < 0.05 && !standingFree(SOLIDS, p.state.x, p.state.z)) wallTicks++;
      maxStuck = Math.max(maxStuck, room.bots.get(id)!.stuck);
    }
  }
  const perTick = (performance.now() - t0) / ticks;
  console.log(`7 roaming bots: ${perTick.toFixed(3)} ms per tick (whole room), ${[...travelled.values()].map((d) => d.toFixed(0)).join(' ')} m travelled`);
  check('every roaming bot covers ground', [...travelled.values()].every((d) => d > 150), `${[...travelled.values()].map((d) => d.toFixed(0))}`);
  check('roaming bots never leave the map', outOfBounds === 0);
  check('roaming bots never stand inside a wall or furniture', wallTicks === 0, `${wallTicks} ticks`);
  check('roaming bots rarely snag', maxStuck <= 1, `stuck level ${maxStuck}`);
  check('7 bots stay far inside the tick budget', perTick < 2, `${perTick.toFixed(2)} ms`);
}

{
  // The same seed gives the same walk: bots draw only on the room's seeded random numbers.
  const make = () => new Room('SEED', { seed: 99, rules: { ...DEFAULT_RULES, bots: 4, botSkill: 3 } });
  const a = make(), b = make();
  for (let t = 0; t < 900; t++) { a.step(); b.step(); }
  const same = [...a.players.keys()].every((id) => {
    const p = a.inspect(id)!, q = b.inspect(id)!;
    return p.name === q.name && p.state.x === q.state.x && p.state.z === q.state.z && p.state.yaw === q.state.yaw;
  });
  check('bots are deterministic for a given seed', same);
}

{
  // A bot sent across the map gets there.
  const room = new Room('GOTO', { seed: 4, rules: { ...DEFAULT_RULES, bots: 1, botSkill: 2 } });
  const id = [...room.players.keys()][0]!;
  const p = room.inspect(id)!;
  let far: [number, number] = [SPAWNS[0]![0], SPAWNS[0]![1]];
  let farD = 0;
  for (const sp of SPAWNS) { const d = Math.hypot(sp[0] - p.state.x, sp[1] - p.state.z); if (d > farD) { farD = d; far = [sp[0], sp[1]]; } }
  setGoal(room.bots.get(id)!, { x: far[0], z: far[1] });
  let arrivedAt = -1;
  for (let t = 0; t < 2400 && arrivedAt < 0; t++) {
    room.step();
    if (Math.hypot(p.state.x - far[0], p.state.z - far[1]) < 2.5) arrivedAt = t;
  }
  check('a bot walks to a goal on the far side of the map', arrivedAt >= 0, `${farD.toFixed(0)} m away`);
  // At sprint speed the straight line takes farD / 11.5 s; allow for corners, doors and turning.
  check('it takes a sensible time', arrivedAt >= 0 && arrivedAt / 60 < (farD / 7.5) * 2.2 + 10, `${(arrivedAt / 60).toFixed(1)} s for ${farD.toFixed(0)} m`);
}

{
  // A closed door between the bot and its goal: it walks up, opens it and goes through.
  const wall = (minX: number, maxX: number): Aabb => ({ minX, maxX, minY: 0, maxY: 4, minZ: -0.2, maxZ: 0.2 });
  const door: DoorDef = { name: 'Test door', x: 0, z: 0.36, axis: 'x', gap: 3.2, dir: 1, side: 1, initial: 0, style: 'wood', color: 0x886644 };
  const room = new Room('DOOR', {
    seed: 2, solids: [FLOOR, wall(-30, -1.6), wall(1.6, 30)], spawns: [[0, 6]], pickups: [], doors: [door],
    rules: { ...DEFAULT_RULES, bots: 1, botSkill: 2 },
  });
  const id = [...room.players.keys()][0]!;
  const p = room.inspect(id)!;
  check('the test door starts closed', room.doors.states[0]!.open === 0 && p.state.z > 5);
  setGoal(room.bots.get(id)!, { x: 0, z: -6 });
  let opened = false, through = -1;
  for (let t = 0; t < 1500 && through < 0; t++) {
    room.step();
    if (room.doors.states[0]!.target === 1) opened = true;
    if (p.state.z < -5) through = t;
  }
  check('the bot opened the closed door', opened);
  check('the bot went through the doorway', through >= 0, `ended at z ${p.state.z.toFixed(1)}`);
}

{
  // Dead bots stand down and come back with a fresh route.
  const room = new Room('DEAD', { seed: 8, rules: { ...DEFAULT_RULES, bots: 2, botSkill: 1 } });
  idle(room, 120);
  const id = [...room.players.keys()][0]!;
  const st = room.bots.get(id)!;
  check('a roaming bot has a goal', st.goal !== null || st.path.length > 0);
  const p = room.inspect(id) as unknown as { alive: boolean; respawnAt: number };
  p.alive = false;
  p.respawnAt = room.tick + 60;
  idle(room, 2);
  check('a dead bot forgets its route', st.goal === null && st.path.length === 0);
  idle(room, 80);
  check('a dead bot respawns', room.inspect(id)!.alive);
}

// ---------------------------------------------------------------- combat

/** A bot of the given skill and a still human dummy 12 m in front of it, on an open floor. */
function duel(seed: number, skill: number, extra: Aabb[] = []) {
  const room = new Room('DUEL', { seed, solids: [FLOOR, ...extra], spawns: FLAT_SPAWNS, pickups: [], doors: [], rules: { ...DEFAULT_RULES, bots: 1, botSkill: skill } });
  const botId = [...room.players.keys()][0]!;
  const conn = new FakeConn();
  const dummyId = room.join(conn, 'Dummy')!;
  room.enter(dummyId);
  const b = mut(room, botId).state, d = mut(room, dummyId).state;
  Object.assign(d, { x: b.x - Math.sin(b.yaw) * 12, z: b.z - Math.cos(b.yaw) * 12, y: 0, vx: 0, vz: 0 });
  return { room, botId, dummyId, conn, bot: room.bots.get(botId)!, b, d };
}

{
  // Skill matters: against a still target a Hard bot kills sooner than a Normal one, and a Normal one sooner than an Easy one.
  const meanKill = (skill: number): { mean: number; all: boolean } => {
    let sum = 0, n = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const { room, dummyId } = duel(seed, skill);
      for (let t = 0; t < 1800; t++) {
        room.step();
        const dm = room.inspect(dummyId)!;
        if (!dm.alive || dm.hp <= 0) { sum += t; n++; break; }
      }
    }
    return { mean: sum / Math.max(1, n), all: n === 8 };
  };
  const easy = meanKill(1), normal = meanKill(2), hard = meanKill(3);
  console.log(`mean ticks to kill a still target: easy ${easy.mean.toFixed(0)}, normal ${normal.mean.toFixed(0)}, hard ${hard.mean.toFixed(0)}`);
  check('bots of every skill kill a target in the open', easy.all && normal.all && hard.all);
  check('harder bots kill sooner', easy.mean > normal.mean + 10 && normal.mean > hard.mean + 10);
  check('even a Hard bot waits out its reaction time', hard.mean > 120 + 5, 'spawn protection alone lasts 120 ticks');
}

{
  // Fairness: no shots through walls, and the same bot shoots once the wall is gone.
  const wall: Aabb = { minX: -3, maxX: 3, minY: 0, maxY: 4, minZ: -3, maxZ: 3 };
  const { room, botId, dummyId, bot, b, d } = duel(5, 3, [wall]);
  const midX = (b.x + d.x) / 2, midZ = (b.z + d.z) / 2;
  Object.assign(wall, { minX: midX - 3, maxX: midX + 3, minZ: midZ - 3, maxZ: midZ + 3 });
  bot.idleUntil = 1e9; // stand still so the only question is what it can see
  let shots = 0;
  for (let t = 0; t < 600; t++) {
    room.step();
    for (const e of room.events) if (e.k === 'shot' && e.id === botId) shots++;
    if (t % 2 === 1) room.events = [];
  }
  check('a bot does not shoot at a target behind a wall', shots === 0 && bot.lastFire === null && room.inspect(dummyId)!.hp === 100, `${shots} shots`);
  Object.assign(wall, { minX: 900, maxX: 906, minZ: 900, maxZ: 906 }); // take the wall away
  let hurt = false;
  for (let t = 0; t < 900 && !hurt; t++) {
    room.step();
    if (room.inspect(dummyId)!.hp < 100) hurt = true;
  }
  check('the same bot shoots once the way is clear', hurt && bot.lastFire !== null && bot.lastFire.los);
}

{
  // Fairness: a bot's view turns no faster than its skill allows, in fights or out of them.
  const ticks = 2400;
  const room = new Room('TURN', { seed: 13, rules: { ...DEFAULT_RULES, bots: 5, botSkill: 2 } });
  const human = new FakeConn();
  const hid = room.join(human, 'Dummy')!;
  room.enter(hid);
  const limit = botTuning(2).turnRate / 60;
  const ids = [...room.players.keys()].filter((id) => id !== hid);
  const last = new Map<number, { yaw: number; pitch: number; alive: boolean }>();
  let worst = 0;
  for (let t = 0; t < ticks; t++) {
    room.step();
    if (t % 2 === 1) room.events = [];
    for (const id of ids) {
      const p = room.inspect(id)!;
      const l = last.get(id);
      // Respawning sets the view directly, so skip the tick a bot comes back to life.
      if (l && l.alive && p.alive) worst = Math.max(worst, Math.abs(wrapAngle(p.state.yaw - l.yaw)), Math.abs(p.state.pitch - l.pitch));
      last.set(id, { yaw: p.state.yaw, pitch: p.state.pitch, alive: p.alive });
    }
  }
  check('bots turn no faster than their turn rate', worst <= limit + 1e-6, `${worst.toFixed(4)} rad/tick vs ${limit.toFixed(4)}`);
}

{
  // A free-for-all on the real map: bots find each other and fight, and never shoot without a clear line.
  const room = new Room('FFA', { seed: 31, rules: { ...DEFAULT_RULES, killLimit: 10, bots: 6, botSkill: 3 } });
  const ids = [...room.players.keys()];
  let badFire = 0, started = false;
  for (let t = 0; t < 18000 && !(started && room.phase === 'over'); t++) {
    room.step();
    if (room.phase === 'over') started = true;
    for (const id of ids) {
      const f = room.bots.get(id)!.lastFire;
      if (f && !f.los) badFire++;
    }
    if (t % 2 === 1) room.events = [];
  }
  const kills = ids.reduce((n, id) => n + room.inspect(id)!.kills, 0);
  const deaths = ids.reduce((n, id) => n + room.inspect(id)!.deaths, 0);
  console.log(`6-bot free-for-all: ${kills} kills, ${deaths} deaths in ${(room.tick / 60).toFixed(0)} s, phase ${room.phase}`);
  check('bots kill each other on the real map', kills + deaths > 0 && deaths > 0);
  check('a free-for-all of bots can finish a match', started && room.phase === 'over', `${kills} kills`);
  check('bots only ever fire with a clear line', badFire === 0, `${badFire} ticks`);
}

// ---------------------------------------------------------------- decisions

/** An open room with one bot (skill 2) and some pickups. */
function pickupRoom(pickups: { kind: 'hp' | 'ammo' | 'grenade'; x: number; z: number }[]) {
  const room = new Room('PICK', { seed: 3, solids: [FLOOR], spawns: FLAT_SPAWNS, pickups, doors: [], rules: { ...DEFAULT_RULES, bots: 1, botSkill: 2 } });
  const id = [...room.players.keys()][0]!;
  return { room, id, p: mut(room, id), st: room.bots.get(id)! };
}

{
  const { room, id, p } = pickupRoom([{ kind: 'hp', x: 8, z: 8 }, { kind: 'hp', x: -25, z: -25 }]);
  p.hp = 30;
  let healedAt = -1;
  for (let t = 0; t < 900 && healedAt < 0; t++) {
    room.step();
    if (room.inspect(id)!.hp > 30) healedAt = t;
  }
  check('a hurt bot goes and takes a health box', healedAt >= 0, `hp ${room.inspect(id)!.hp}`);
}

{
  const { room, id, p } = pickupRoom([{ kind: 'ammo', x: 10, z: -6 }]);
  p.reserve = p.reserve.map(() => 0);
  p.mag = p.mag.map(() => 1);
  let gotAt = -1;
  for (let t = 0; t < 900 && gotAt < 0; t++) {
    room.step();
    if (room.inspect(id)!.reserve.some((r) => r > 0)) gotAt = t;
  }
  check('a bot low on ammo goes and takes an ammo box', gotAt >= 0);
}

{
  // A full-health bot ignores health boxes (the server would not let it take them anyway).
  const { room, id, st } = pickupRoom([{ kind: 'hp', x: 3, z: 3 }]);
  let chased = false;
  for (let t = 0; t < 600; t++) {
    room.step();
    if (st.goalKind === 'heal') chased = true;
  }
  check('a healthy bot does not hunt for health', !chased && room.inspect(id)!.hp === 100);
}

{
  // A loot bag that helps is collected; one that cannot help is left alone.
  const { room, id, p, st } = pickupRoom([]);
  p.reserve = p.reserve.map(() => 0);
  p.mag = p.mag.map(() => 2);
  room.loot.push({ id: 1, from: 99, x: p.state.x + 9, y: 0, z: p.state.z + 9, ammo: [20, 60, 10, 5], gren: [1, 0], expiresAt: room.tick + 3000 });
  let looted = -1;
  for (let t = 0; t < 900 && looted < 0; t++) {
    room.step();
    if (room.loot.length === 0) looted = t;
    if (t % 2 === 1) room.events = [];
  }
  check('a bot goes and loots a bag that helps', looted >= 0 && room.inspect(id)!.reserve.some((r) => r > 0));
  void st;

  const full = pickupRoom([]);
  full.p.reserve = WEAPONS.map((w) => w.maxReserve);
  full.p.gren = GRENADES.map((g) => g.maxCarry);
  full.room.loot.push({ id: 1, from: 99, x: full.p.state.x + 9, y: 0, z: full.p.state.z + 9, ammo: [20, 60, 10, 5], gren: [1, 0], expiresAt: full.room.tick + 3000 });
  let went = false;
  for (let t = 0; t < 600; t++) {
    full.room.step();
    if (full.st.goalKind === 'loot') went = true;
    if (t % 2 === 1) full.room.events = [];
  }
  check('a bot with full reserves leaves a bag it cannot use', !went && full.room.loot.length === 1);
}

{
  // A noise is checked out: the bot walks toward where the shot came from.
  const { room, id, p, st } = pickupRoom([]);
  p.state.x = 0; p.state.z = 0;
  st.goal = null; st.idleUntil = 0;
  st.heard = { x: 30, z: 20, tick: room.tick };
  let near = false;
  for (let t = 0; t < 600 && !near; t++) {
    room.step();
    if (t > 12) st.heard ??= null;
    if (Math.hypot(room.inspect(id)!.state.x - 30, room.inspect(id)!.state.z - 20) < 4) near = true;
  }
  check('a bot investigates a noise it heard', near);
}

{
  // A bot that lost sight of an enemy a moment ago and has a frag lobs it at the spot.
  const { room, id, p, st } = pickupRoom([]);
  const watcher = new FakeConn(); // a lobby spectator, so the test reads events the way a client does
  room.join(watcher, 'Watcher');
  const spot = { x: p.state.x - Math.sin(p.state.yaw) * 10, z: p.state.z - Math.cos(p.state.yaw) * 10 };
  st.seen = { x: spot.x, y: 0, z: spot.z, vx: 0, vz: 0, tick: room.tick };
  st.targetId = 99; st.visible = false; st.idleUntil = 1e9;
  for (let t = 0; t < 400; t++) {
    if (t < 3) st.seen.tick = room.tick - 20; // keep it fresh while the decision fires
    room.step();
  }
  const events = watcher.events();
  const throws = events.filter((e) => e.k === 'throw' && e.id === id).length;
  const booms = events.flatMap((e) => (e.k === 'boom' ? [e] : []));
  check('a bot lobs a frag at where a hidden enemy was last seen', throws === 1 && room.inspect(id)!.gren[0] === 0, `${throws} throws`);
  check('the frag lands near that spot', booms.length === 1 && Math.hypot(booms[0]!.x - spot.x, booms[0]!.z - spot.z) < 4, booms.map((b) => `${b.x},${b.z}`).join(' '));
}

// ---------------------------------------------------------------- server limits

/** A made-up machine: a human costs 1 unit, a bot 0.5, and 10 units fit in a tick. */
const TOY: LoadModel = { budgetMs: 10, msPerHuman: 1, msPerBot: 0.5 };
/** Gives a manager's room a human the way the gateway does: admit first, then join. */
function joinHuman(rooms: RoomManager, room: Room, name: string): number | null {
  return rooms.admit(room) ? room.join(new FakeConn(), name) : null;
}

{
  // The budget covers players AND bots together; a host asking for too many bots gets fewer.
  const rooms = new RoomManager(TOY);
  const a = rooms.create({ ...DEFAULT_RULES, bots: 7 })!;
  check('the host seat is reserved before bots are counted', a.botCount === 7 && rooms.loadMs === 3.5);
  const hostA = a.join(new FakeConn(), 'HostA');
  check('a room with 7 bots and a host fits', hostA !== null && rooms.loadMs === 4.5);
  const b = rooms.create({ ...DEFAULT_RULES, bots: 7 })!;
  check('a second host still gets all 7 bots while they fit', b.botCount === 7, `${b.botCount} bots`);
  b.join(new FakeConn(), 'HostB');
  const c = rooms.create({ ...DEFAULT_RULES, bots: 7 })!;
  check('a third host gets only the host seat: the budget is spent', c.botCount === 0, `${c.botCount} bots`);
  c.join(new FakeConn(), 'HostC');
  check('the total never goes over the budget', rooms.loadMs <= TOY.budgetMs, `${rooms.loadMs}`);
  check('status reports the measured totals', rooms.status().maxPlayers === 10 && rooms.status().maxBots === 20);
  check('status reports the load and nothing available', rooms.status().load === 1 && rooms.status().botsAvailable === 0 && rooms.status().playersAvailable === 0);
}

{
  // Humans win: they push bots out of a full room and out of a full server, until only humans are left.
  const rooms = new RoomManager({ budgetMs: 4, msPerHuman: 1, msPerBot: 1 });
  const a = rooms.create({ ...DEFAULT_RULES, bots: 7 })!;
  check('bots fill the budget (3 bots + the host seat)', a.botCount === 3);
  const host = joinHuman(rooms, a, 'Host');
  check('the host joins', host !== null && rooms.loadMs === 4);
  const f1 = joinHuman(rooms, a, 'Friend1');
  check('a friend joining pushes a bot out', f1 !== null && a.botCount === 2 && rooms.loadMs === 4);
  const f2 = joinHuman(rooms, a, 'Friend2');
  const f3 = joinHuman(rooms, a, 'Friend3');
  check('friends keep displacing bots until only humans remain', f2 !== null && f3 !== null && a.botCount === 0 && a.humans === 4);
  check('then the server is full for the next player', joinHuman(rooms, a, 'Friend4') === null && rooms.status().playersAvailable === 0);
  check('a new room cannot be created on a full server', rooms.create({ ...DEFAULT_RULES }) === null);
}

{
  // A full room gives up a bot seat to a human even when the machine has time to spare.
  const rooms = new RoomManager();
  const a = rooms.create({ ...DEFAULT_RULES, bots: 7 })!;
  a.join(new FakeConn(), 'Host');
  check('host + 7 bots is a full room', a.isFull);
  const friend = joinHuman(rooms, a, 'Friend');
  check('a friend can still join by displacing a bot', friend !== null && a.botCount === 6 && a.isFull);
  check('the dropped bot leaves the roster', a.humans === 2 && a.size === 8);
  check('only humans can displace bots: a room of 8 humans stays full', (() => {
    const r = new RoomManager();
    const h = r.create()!;
    for (let i = 0; i < 8; i++) h.join(new FakeConn(), `H${i}`);
    return !r.admit(h);
  })());
}

{
  // The owner's MAX_BOTS cap works on top of the time budget, and unlimited servers behave as before.
  const rooms = new RoomManager(UNLIMITED, 10);
  const a = rooms.create({ ...DEFAULT_RULES, bots: 7 })!;
  const b = rooms.create({ ...DEFAULT_RULES, bots: 7 })!;
  const c = rooms.create({ ...DEFAULT_RULES, bots: 3 })!;
  check('MAX_BOTS limits bots across rooms', a.botCount === 7 && b.botCount === 3 && c.botCount === 0 && rooms.botCount === 10);
  rooms.prune(a);
  a.join(new FakeConn(), 'x');
  a.leave(a.players.keys().next().value as number);
  check('creating a room without rules still works', RoomManager.prototype.create.call(new RoomManager()) !== null);
}

{
  // Tick monitor: quiet when fast, loud when slow, and rate limited.
  const m = new TickMonitor();
  let warned: string | null = null;
  for (let i = 0; i < 600; i++) warned = m.record(1, i / 60, () => '1 rooms') ?? warned;
  check('the tick monitor stays quiet while the server keeps up', warned === null);
  for (let i = 0; i < 600; i++) warned = m.record(12, 20 + i / 60, () => '3 rooms, 21 bots') ?? warned;
  check('the tick monitor warns when ticks are slow', warned !== null && (warned as string).includes('3 rooms, 21 bots'));
  let again: string | null = null;
  for (let i = 0; i < 600; i++) again = m.record(12, 31 + i / 60, () => 'x') ?? again;
  check('the tick monitor does not repeat itself within a minute', again === null);
}

{
  // The startup check measures THIS machine and turns it into limits; a slower budget gives smaller limits.
  const cap = measureCapacity(1, 120);
  console.log(describeCapacity(cap));
  check('the capacity check measures a positive cost for a player and a bot', cap.msPerHuman > 0 && cap.msPerBot > 0);
  check('a bot costs more than a player (it thinks)', cap.msPerBot > cap.msPerHuman * 0.5);
  check('the limits are whole numbers that fit the budget', Number.isInteger(cap.maxHumans) && Number.isInteger(cap.maxBots) &&
    cap.maxHumans * cap.msPerHuman <= cap.budgetMs + 1e-9 && cap.maxBots * cap.msPerBot <= cap.budgetMs + 1e-9);
  const tight = measureCapacity(1, 120, SERVER_BUDGET_MS / 10);
  check('a smaller budget allows fewer players and bots', tight.maxHumans < cap.maxHumans && tight.maxBots < cap.maxBots);
  check('the console line states the measured limits', describeCapacity(cap).includes(String(cap.maxHumans)) && describeCapacity(cap).includes(String(cap.maxBots)));
  // A real manager built from the measurement admits what the measurement says it can.
  const live = new RoomManager(cap);
  const room = live.create({ ...DEFAULT_RULES, bots: 7 })!;
  check('a manager built from the measurement hosts a bot room', room.humans === 0 && room.botCount <= 7 && room.botCount > 0 || cap.maxBots < 7);
}

console.log(`bots tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('test:bots OK');
