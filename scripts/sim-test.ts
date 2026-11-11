/**
 * Headless server simulation tests: drives `Room` directly with fake connections (no sockets, no browser).
 * Run with `npm run test:sim`; exits non-zero on any failure.
 */
import { INTERMISSION_TICKS, Key, KILLS_TO_WIN, MAX_HP, MAX_PLAYERS, RESPAWN_TICKS, TICK_DT } from '../src/shared/constants';
import { PLAYER_COLORS } from '../src/shared/characters';
import type { Aabb } from '../src/shared/physics';
import { parseC2S, type GameEvent, type S2C, type SnapMsg } from '../src/shared/protocol';
import { GRENADES, LOOT_FRACTION, LOOT_LIFETIME_TICKS, PICKUP_DEFS, WEAPONS } from '../src/shared/weapons';
import { Room, type Conn } from '../src/server/room';

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

/** Fake connection that stores everything it receives. */
class FakeConn implements Conn {
  msgs: S2C[] = [];
  seq = 0;
  send(msg: S2C): void {
    this.msgs.push(msg);
  }
  /** Last snapshot received. */
  get snap(): SnapMsg | undefined {
    for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i]!.t === 'snap') return this.msgs[i] as SnapMsg;
    return undefined;
  }
  /** Every event seen so far. */
  events(): GameEvent[] {
    return this.msgs.flatMap((m) => (m.t === 'snap' ? m.ev : []));
  }
}

const FLOOR: Aabb = { minX: -500, maxX: 500, minY: -1, maxY: 0, minZ: -500, maxZ: 500 };
const SPAWNS: [number, number][] = [[0, 0], [20, 20], [-20, 20], [20, -20]];

interface Mutable {
  state: { x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number; pitch: number };
  hp: number; kills: number; alive: boolean; mag: number[]; reserve: number[]; gren: number[];
}

/** New empty room with a floor, plus a helper to add players with fake connections. */
function makeRoom(solids: Aabb[] = [FLOOR], pickups: { kind: 'hp' | 'ammo' | 'grenade'; x: number; z: number }[] = []) {
  const room = new Room('TEST', { seed: 7, solids, spawns: SPAWNS, pickups });
  const add = (name: string) => {
    const conn = new FakeConn();
    const id = room.join(conn, name)!;
    room.enter(id);
    return { id, conn };
  };
  return { room, add };
}

type Who = { id: number; conn: FakeConn };

/** Edits a player's internal state directly (tests only). */
const mut = (room: Room, id: number) => room.inspect(id) as unknown as Mutable;

/** Moves a player to a spot and view direction. */
function place(room: Room, id: number, x: number, z: number, yaw = 0, pitch = 0): void {
  const s = mut(room, id).state;
  Object.assign(s, { x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, pitch });
}

/**
 * Feeds `n` ticks of the same input to a player and steps the room each time.
 * @remarks Switches weapon first (waiting out the switch delay) so tests can name the gun they want, and
 * finishes on a snapshot tick so `conn.events()` is up to date.
 */
function run(room: Room, who: Who, n: number, cmd: { keys?: number; yaw?: number; pitch?: number; weapon?: number } = {}): void {
  const weapon = cmd.weapon ?? room.inspect(who.id)!.weapon;
  const send = (keys: number) => {
    room.input(who.id, { t: 'input', seq: ++who.conn.seq, keys, yaw: cmd.yaw ?? 0, pitch: cmd.pitch ?? 0, weapon });
    room.step();
  };
  if (room.inspect(who.id)!.weapon !== weapon) for (let i = 0; i < 16; i++) send(0);
  for (let i = 0; i < n; i++) send(cmd.keys ?? 0);
  if (room.tick % 2 !== 0) room.step();
}

/** Steps the room with no input from anyone. */
function idle(room: Room, n: number): void {
  for (let i = 0; i < n; i++) room.step();
}

/** Lets spawn protection expire. */
const warm = (room: Room) => idle(room, 130);

/** Pitch that points from eye height at a target `dist` away, `h` above the feet. */
const aimPitch = (dist: number, h: number) => Math.atan2(h - 1.62, dist);

// ---------------------------------------------------------------- joining

{
  const { room, add } = makeRoom();
  const a = add('Alice');
  check('join sends joined msg', a.conn.msgs[0]?.t === 'joined');
  const b = add('Bob');
  idle(room, 2);
  check('roster reaches everyone', a.conn.msgs.some((m) => m.t === 'roster' && m.players.length === 2));
  check('ids are unique', a.id !== b.id);
  const dup = add('Alice');
  const names = (a.conn.msgs.filter((m) => m.t === 'joined')[0] as { players: { name: string }[] }).players.map((p) => p.name);
  const dupJoined = dup.conn.msgs[0] as { players: { id: number; name: string }[] };
  check('first player keeps their name', names[0] === 'Alice');
  check('duplicate names get a number', dupJoined.players.find((p) => p.id === dup.id)?.name === 'Alice 2');
  room.leave(dup.id);
  room.leave(b.id);
  check('leave shrinks room', room.size === 1);
  room.leave(a.id);
  check('empty room reports isEmpty', room.isEmpty);
}
{
  const { room, add } = makeRoom();
  for (let i = 0; i < MAX_PLAYERS; i++) add(`p${i}`);
  check('room full at MAX_PLAYERS', room.isFull);
  check('join refused when full', room.join(new FakeConn(), 'late') === null);
}

// ---------------------------------------------------------------- validation

{
  check('parse: valid input', parseC2S({ t: 'input', seq: 1, keys: 3, yaw: 0.5, pitch: 0.1, weapon: 2 })?.t === 'input');
  check('parse: NaN rejected', parseC2S({ t: 'input', seq: 1, keys: 3, yaw: NaN, pitch: 0, weapon: 0 }) === null);
  check('parse: string seq rejected', parseC2S({ t: 'input', seq: '1', keys: 3, yaw: 0, pitch: 0, weapon: 0 }) === null);
  const m = parseC2S({ t: 'input', seq: 1, keys: 0xffffff, yaw: 0, pitch: 99, weapon: 9 });
  check('parse: keys masked, pitch/weapon clamped', m?.t === 'input' && m.keys < 2048 && m.pitch < 1.6 && m.weapon === 3);
  check('parse: bad code rejected', parseC2S({ t: 'join', code: 'AB0I', name: 'x' }) === null);
  const j = parseC2S({ t: 'join', code: ' abcd ', name: '  <b>Eve</b>\n' });
  check('parse: code normalised, name sanitised', j?.t === 'join' && j.code === 'ABCD' && j.name === 'bEveb');
  const g = parseC2S({ t: 'host', name: '   ' });
  check('blank name becomes a guest name', g?.t === 'host' && /^Guest\d{4}$/.test(g.name), g?.t === 'host' ? g.name : '');
  const look = parseC2S({ t: 'host', name: 'x', model: 2, color: 5 });
  check('parse: model and colour kept', look?.t === 'host' && look.model === 2 && look.color === 5);
  const badLook = parseC2S({ t: 'host', name: 'x', model: 99, color: 'red' });
  check('parse: bad model/colour fall back', badLook?.t === 'host' && badLook.model === 0 && badLook.color === -1);
  {
    const { room, add } = makeRoom();
    const conn = new FakeConn();
    room.join(conn, 'Styled', { model: 3, color: 1 });
    const joined = conn.msgs[0] as { players: { model: number; color: number }[] };
    check('room keeps chosen model and colour', joined.players[0]?.model === 3 && joined.players[0]?.color === PLAYER_COLORS[1]);
    const other = add('Random');
    const oj = other.conn.msgs[0] as { players: { id: number; color: number; model: number }[] };
    check('omitted colour is still a palette colour', PLAYER_COLORS.includes(oj.players.find((p) => p.id === other.id)!.color));
  }
  check('parse: junk rejected', parseC2S('hi') === null && parseC2S(null) === null && parseC2S({ t: 'nope' }) === null);
}

// ---------------------------------------------------------------- movement

{
  const { room, add } = makeRoom();
  const a = add('A');
  place(room, a.id, 0, 0);
  run(room, a, 60, { keys: Key.Forward });
  const s = mut(room, a.id).state;
  check('forward moves toward -Z', s.z < -4 && Math.abs(s.x) < 0.01, `z=${s.z}`);
  check('snapshot acks last seq', a.conn.snap?.me.ack === a.conn.seq, `ack=${a.conn.snap?.me.ack} seq=${a.conn.seq}`);
  check('snapshot me matches server state', Math.abs(a.conn.snap!.me.z - s.z) < 0.5);
}
{
  // A client flooding inputs must not move faster than the tick rate allows.
  const { room, add } = makeRoom();
  const honest = add('H');
  const cheat = add('C');
  place(room, honest.id, 0, 0);
  place(room, cheat.id, 10, 0);
  for (let i = 0; i < 120; i++) {
    room.input(honest.id, { t: 'input', seq: i + 1, keys: Key.Forward, yaw: 0, pitch: 0, weapon: 1 });
    for (let k = 0; k < 3; k++) room.input(cheat.id, { t: 'input', seq: i * 3 + k + 1, keys: Key.Forward, yaw: 0, pitch: 0, weapon: 1 });
    room.step();
  }
  const dh = -mut(room, honest.id).state.z;
  const dc = -mut(room, cheat.id).state.z;
  check('input flooding gives no speed advantage', dc <= dh + 0.5, `honest=${dh.toFixed(2)} cheat=${dc.toFixed(2)}`);
}

// ---------------------------------------------------------------- hitscan

{
  const { room, add } = makeRoom();
  const a = add('A');
  const b = add('B');
  warm(room);
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, b.id, 0, -10);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('stapler body shot does 24', mut(room, b.id).hp === MAX_HP - 24, `hp=${mut(room, b.id).hp}`);
  check('shot uses a round', mut(room, a.id).mag[0] === WEAPONS[0]!.magSize - 1);
  const ev = a.conn.events();
  check('hit event emitted', ev.some((e) => e.k === 'hit' && e.by === a.id && e.to === b.id && e.dmg === 24 && !e.head));
}
{
  const { room, add } = makeRoom();
  const a = add('A');
  const b = add('B');
  warm(room);
  place(room, a.id, 0, 0);
  place(room, b.id, 0, -10);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0 });
  check('headshot doubles damage', mut(room, b.id).hp === MAX_HP - 48, `hp=${mut(room, b.id).hp}`);
}
{
  const wall: Aabb = { minX: -5, maxX: 5, minY: 0, maxY: 4, minZ: -6, maxZ: -5 };
  const { room, add } = makeRoom([FLOOR, wall]);
  const a = add('A');
  const b = add('B');
  warm(room);
  place(room, a.id, 0, 0);
  place(room, b.id, 0, -10);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0 });
  check('walls block bullets', mut(room, b.id).hp === MAX_HP);
}
{
  const { room, add } = makeRoom();
  const a = add('A');
  const b = add('B');
  place(room, a.id, 0, 0);
  place(room, b.id, 0, -10);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0 });
  check('spawn protection blocks damage', mut(room, b.id).hp === MAX_HP);
}
{
  // Shotgun: strong up close, weak far away.
  const { room, add } = makeRoom();
  const a = add('A');
  const b = add('B');
  warm(room);
  place(room, a.id, 0, 0, 0, aimPitch(2, 1.0));
  place(room, b.id, 0, -2);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 2, pitch: aimPitch(2, 1.0) });
  const near = MAX_HP - mut(room, b.id).hp;
  check('shotgun point blank is brutal', near >= 60, `dmg=${near}`);
  const far = makeRoom();
  const fa = far.add('A');
  const fb = far.add('B');
  warm(far.room);
  place(far.room, fa.id, 0, 0, 0, aimPitch(40, 1.0));
  place(far.room, fb.id, 0, -40);
  run(far.room, fa, 1, { keys: Key.Fire | Key.Aim, weapon: 2, pitch: aimPitch(40, 1.0) });
  const farDmg = MAX_HP - mut(far.room, fb.id).hp;
  check('shotgun falls off at range', farDmg < near / 3, `near=${near} far=${farDmg}`);
}

// ---------------------------------------------------------------- ammo and reload

{
  const { room, add } = makeRoom();
  const a = add('A');
  warm(room);
  place(room, a.id, 0, 0);
  const w = WEAPONS[0]!;
  mut(room, a.id).mag[0] = 2;
  const reserve0 = mut(room, a.id).reserve[0]!;
  run(room, a, 1, { keys: Key.Reload, weapon: 0 });
  run(room, a, 1, { keys: 0, weapon: 0 });
  idle(room, w.reloadTicks + 2);
  run(room, a, 1, { weapon: 0 });
  check('reload fills magazine', mut(room, a.id).mag[0] === w.magSize, `mag=${mut(room, a.id).mag[0]}`);
  check('reload spends reserve', mut(room, a.id).reserve[0] === reserve0 - (w.magSize - 2));
  mut(room, a.id).mag[0] = 0;
  mut(room, a.id).reserve[0] = 0;
  run(room, a, 5, { keys: Key.Fire, weapon: 0 });
  check('cannot fire with empty mag and no reserve', mut(room, a.id).mag[0] === 0);
}
{
  // Semi-auto does not machine-gun when the button is held.
  const { room, add } = makeRoom();
  const a = add('A');
  warm(room);
  place(room, a.id, 0, 0);
  run(room, a, 60, { keys: Key.Fire, weapon: 0 });
  check('semi-auto fires once per pull', mut(room, a.id).mag[0] === WEAPONS[0]!.magSize - 1, `mag=${mut(room, a.id).mag[0]}`);
  const b = makeRoom();
  const ba = b.add('A');
  warm(b.room);
  place(b.room, ba.id, 0, 0);
  run(b.room, ba, 30, { keys: Key.Fire, weapon: 1 });
  check('SMG fires automatically', mut(b.room, ba.id).mag[1]! <= WEAPONS[1]!.magSize - 5);
}

// ---------------------------------------------------------------- kills, respawn, match

{
  const { room, add } = makeRoom();
  const a = add('A');
  const b = add('B');
  warm(room);
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, b.id, 0, -10);
  const cmd = { keys: Key.Fire | Key.Aim, weapon: 3, pitch: aimPitch(10, 1.0) };
  run(room, a, 1, cmd);
  check('sniper body shot leaves 20 hp', mut(room, b.id).hp === 20, `hp=${mut(room, b.id).hp}`);
  run(room, a, 1, { weapon: 3, pitch: cmd.pitch });
  idle(room, WEAPONS[3]!.interval);
  run(room, a, 1, cmd);
  check('second sniper shot kills', !mut(room, b.id).alive);
  check('killer scores', mut(room, a.id).kills === 1);
  check('kill event emitted', a.conn.events().some((e) => e.k === 'kill' && e.by === a.id && e.to === b.id));
  idle(room, RESPAWN_TICKS + 2);
  check('victim respawns after delay', mut(room, b.id).alive && mut(room, b.id).hp === MAX_HP);
  check('respawn grants protection', (b.conn.snap?.me.prot ?? 0) > 0);
  check('respawn picks a far spawn', Math.hypot(mut(room, b.id).state.x - mut(room, a.id).state.x, mut(room, b.id).state.z - mut(room, a.id).state.z) > 15);
}
{
  const { room, add } = makeRoom();
  const a = add('A');
  const b = add('B');
  warm(room);
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, b.id, 0, -10);
  mut(room, a.id).kills = KILLS_TO_WIN - 1;
  mut(room, b.id).hp = 1;
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('50th kill ends the match', room.phase === 'over' && room.winner === a.id);
  check('matchEnd event sent', b.conn.events().some((e) => e.k === 'matchEnd' && e.winner === a.id));
  const hpBefore = mut(room, a.id).hp;
  run(room, b, 3, { keys: Key.Fire, weapon: 1 });
  check('no damage during intermission', mut(room, a.id).hp === hpBefore);
  idle(room, INTERMISSION_TICKS + 2);
  check('match restarts after intermission', room.phase === 'play');
  check('scores reset on restart', mut(room, a.id).kills === 0 && mut(room, b.id).alive);
  check('matchStart event sent', b.conn.events().some((e) => e.k === 'matchStart'));
}

// ---------------------------------------------------------------- grenades

{
  const frag = GRENADES[0]!;
  const { room, add } = makeRoom();
  const a = add('A');
  const b = add('B');
  warm(room);
  place(room, a.id, 0, 0);
  place(room, b.id, 0, -3);
  const g = { id: 99, slot: 0, owner: a.id, x: 0, y: 0.12, z: -1, vx: 0, vy: 0, vz: 0, explodeAt: 0 };
  (room as unknown as { grenades: unknown[] }).grenades.push(g);
  room.step();
  room.step();
  const dmg = MAX_HP - mut(room, b.id).hp;
  const expected = Math.round(frag.damage * (1 - Math.hypot(0, 1.0 - 0.12, 2) / frag.radius));
  check('frag damages by distance', Math.abs(dmg - expected) <= 1 && dmg > 0, `dmg=${dmg} expected~${expected}`);
  check('thrower takes reduced self damage', mut(room, a.id).hp < MAX_HP && mut(room, a.id).hp > MAX_HP - dmg - 1);
  check('boom event emitted', b.conn.events().some((e) => e.k === 'boom' && e.s === 0));
}
{
  const wall: Aabb = { minX: -5, maxX: 5, minY: 0, maxY: 4, minZ: -2.1, maxZ: -1.9 };
  const { room, add } = makeRoom([FLOOR, wall]);
  const a = add('A');
  const b = add('B');
  warm(room);
  place(room, a.id, 30, 30);
  place(room, b.id, 0, -3);
  (room as unknown as { grenades: unknown[] }).grenades.push({ id: 1, slot: 0, owner: a.id, x: 0, y: 0.12, z: -1, vx: 0, vy: 0, vz: 0, explodeAt: 0 });
  room.step();
  check('walls shield from explosions', mut(room, b.id).hp === MAX_HP);
}
{
  const { room, add } = makeRoom();
  const a = add('A');
  const b = add('B');
  const c = add('C');
  warm(room);
  place(room, a.id, 50, 50);
  // Flash is at the origin: C (at +Z, facing -Z) looks at it, B (at -Z, facing -Z) has it behind.
  place(room, b.id, 0, -3, 0, 0);
  place(room, c.id, 0, 3, 0, 0);
  (room as unknown as { grenades: unknown[] }).grenades.push({ id: 1, slot: 1, owner: a.id, x: 0, y: 1.2, z: 0, vx: 0, vy: 0, vz: 0, explodeAt: 0 });
  room.step();
  room.step();
  const bBlind = b.conn.snap!.me.blind;
  const cBlind = c.conn.snap!.me.blind;
  check('flash still dazzles someone facing away', bBlind > 0);
  check('flash blinds more when facing it', cBlind > bBlind, `facing=${cBlind} away=${bBlind}`);
  check('flash does no damage', mut(room, b.id).hp === MAX_HP);
}
{
  const { room, add } = makeRoom();
  const a = add('A');
  warm(room);
  place(room, a.id, 0, 0);
  run(room, a, 1, { keys: Key.Grenade1 });
  check('throw consumes a grenade', mut(room, a.id).gren[0] === GRENADES[0]!.startCarry - 1);
  check('throw event emitted', a.conn.events().some((e) => e.k === 'throw' && e.s === 0));
  check('grenade in flight is in snapshots', (a.conn.snap?.grenades.length ?? 0) === 1);
  run(room, a, 1, { keys: 0 });
  run(room, a, 40, { keys: Key.Grenade1 });
  check('cannot throw with none left', mut(room, a.id).gren[0] === 0 && (a.conn.snap?.grenades.length ?? 0) === 1);
  idle(room, GRENADES[0]!.fuseTicks + 5);
  check('thrown grenade detonates after its fuse', a.conn.events().some((e) => e.k === 'boom'));
  check('grenade is removed after exploding', (a.conn.snap?.grenades.length ?? 1) === 0);
  const y = a.conn.events().find((e) => e.k === 'boom');
  check('grenade landed on the floor, not under it', y?.k === 'boom' && y.y >= 0 && y.y < 1);
}

// ---------------------------------------------------------------- pickups

{
  const { room, add } = makeRoom([FLOOR], [
    { kind: 'hp', x: 0, z: 0 }, { kind: 'ammo', x: 10, z: 0 }, { kind: 'grenade', x: 20, z: 0 },
  ]);
  const a = add('A');
  warm(room);
  place(room, a.id, 0, 0);
  run(room, a, 2);
  check('full-health player leaves HP box', !a.conn.events().some((e) => e.k === 'pickup'));
  mut(room, a.id).hp = 50;
  run(room, a, 2);
  check('HP box heals 35', mut(room, a.id).hp === 85, `hp=${mut(room, a.id).hp}`);
  check('pickup event emitted', a.conn.events().some((e) => e.k === 'pickup' && e.kind === 'hp'));
  mut(room, a.id).hp = 50;
  run(room, a, 2);
  check('taken box stays gone', mut(room, a.id).hp === 50);
  idle(room, PICKUP_DEFS.hp.respawnTicks + 2);
  check('box respawns on its timer', a.conn.events().some((e) => e.k === 'pk' && e.on));
  run(room, a, 2);
  check('respawned box works again', mut(room, a.id).hp === 85);

  place(room, a.id, 10, 0);
  mut(room, a.id).reserve = [0, 0, 0, 0];
  run(room, a, 2);
  check('ammo box refills half of max reserve', mut(room, a.id).reserve.every((r, i) => r === Math.ceil(WEAPONS[i]!.maxReserve / 2)));

  place(room, a.id, 20, 0);
  mut(room, a.id).gren = [0, 2];
  run(room, a, 2);
  check('grenade crate adds one, capped at max', mut(room, a.id).gren[0] === 1 && mut(room, a.id).gren[1] === 2);
}

// ---------------------------------------------------------------- bullet holes: the server tells everyone where shots land

type HoleEv = Extract<GameEvent, { k: 'hole' }>;
const holesSeen = (c: FakeConn): HoleEv[] => c.events().filter((e): e is HoleEv => e.k === 'hole');

{
  const wall: Aabb = { minX: -5, maxX: 5, minY: 0, maxY: 4, minZ: -6, maxZ: -5 };
  const { room, add } = makeRoom([FLOOR, wall]);
  const a = add('Shooter');
  const b = add('Watcher');
  warm(room);
  place(room, a.id, 0, 0, 0, 0);
  place(room, b.id, 30, 30);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: 0 });
  const holes = holesSeen(a.conn);
  check('a shot into a wall leaves one hole', holes.length === 1, `holes=${holes.length}`);
  const h = holes[0]!;
  check('the hole is on the wall face', h && Math.abs(h.z + 5) < 0.01 && Math.abs(h.x) < 0.1 && Math.abs(h.y - 1.62) < 0.1, JSON.stringify(h));
  check('the hole faces back toward the shooter (+Z normal)', h?.a === 2 && h?.s === 1);
  check('other players are told about the same hole', holesSeen(b.conn).length === 1 && JSON.stringify(holesSeen(b.conn)[0]) === JSON.stringify(h));
}
{
  // Floors and walls from different directions give the right normals.
  const { room, add } = makeRoom();
  const a = add('Shooter');
  warm(room);
  place(room, a.id, 0, 0, 0, -0.6);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: -0.6 });
  const h = holesSeen(a.conn)[0];
  check('a shot at the floor leaves a hole facing up', h?.a === 1 && h?.s === 1 && Math.abs(h.y) < 0.01, JSON.stringify(h));
  check('and the hole is ahead of the shooter, not under them', h !== undefined && h.z < -1);

  const { room: room2, add: add2 } = makeRoom([FLOOR, { minX: -5, maxX: 5, minY: 0, maxY: 4, minZ: 5, maxZ: 6 }]);
  const c = add2('Back');
  warm(room2);
  place(room2, c.id, 0, 0, Math.PI, 0);
  run(room2, c, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: 0, yaw: Math.PI });
  const h2 = holesSeen(c.conn)[0];
  check('a wall to the south faces north (-Z normal)', h2?.a === 2 && h2?.s === -1 && Math.abs(h2.z - 5) < 0.02, JSON.stringify(h2));
}
{
  // The shotgun fires 8 pellets, so a close wall gets a cluster of holes.
  const wall: Aabb = { minX: -5, maxX: 5, minY: 0, maxY: 4, minZ: -4, maxZ: -3 };
  const { room, add } = makeRoom([FLOOR, wall]);
  const a = add('Shooter');
  warm(room);
  place(room, a.id, 0, 0, 0, 0);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 2, pitch: 0 });
  check('a shotgun blast leaves a hole per pellet', holesSeen(a.conn).length === WEAPONS[2]!.pellets, `holes=${holesSeen(a.conn).length}`);
}
{
  // No holes where there is no surface: players soak the bullet, open air has nothing to mark.
  const { room, add } = makeRoom();
  const a = add('Shooter');
  const b = add('Target');
  warm(room);
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, b.id, 0, -10);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('a bullet that hits a player leaves no hole', holesSeen(a.conn).length === 0);
  run(room, a, 2, { weapon: 0 });
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: 0.4 });
  check('a shot into open air leaves no hole', holesSeen(a.conn).length === 0);
}

// ---------------------------------------------------------------- pickups are left alone when they would not help

{
  const spots = [{ kind: 'hp' as const, x: 0, z: 0 }, { kind: 'ammo' as const, x: 10, z: 0 }, { kind: 'grenade' as const, x: 20, z: 0 }];
  const { room, add } = makeRoom([FLOOR], spots);
  const a = add('Full');
  warm(room);
  const m = mut(room, a.id);
  m.hp = MAX_HP;
  m.reserve = WEAPONS.map((w) => w.maxReserve);
  m.gren = GRENADES.map((g) => g.maxCarry);
  const taken = () => a.conn.events().filter((e) => e.k === 'pickup' || (e.k === 'pk' && !e.on)).length;
  for (const [x, label] of [[0, 'HP'], [10, 'ammo'], [20, 'grenade']] as const) {
    place(room, a.id, x, 0);
    run(room, a, 10);
    check(`full ${label}: standing on the box does not take it`, taken() === 0, `events=${taken()}`);
  }

  // Missing even a little of one thing is enough to collect that kind of box.
  m.reserve = WEAPONS.map((w) => w.maxReserve);
  m.reserve[3] = WEAPONS[3]!.maxReserve - 1;
  place(room, a.id, 10, 0);
  run(room, a, 3);
  check('ammo box is taken if any weapon is below max', a.conn.events().some((e) => e.k === 'pickup' && e.kind === 'ammo'));
  check('and it tops every weapon up to max', m.reserve.every((r, i) => r === WEAPONS[i]!.maxReserve));

  m.gren = [GRENADES[0]!.maxCarry, GRENADES[1]!.maxCarry - 1];
  place(room, a.id, 20, 0);
  run(room, a, 3);
  check('grenade crate is taken if either slot is below max', a.conn.events().some((e) => e.k === 'pickup' && e.kind === 'grenade'));
  check('and never pushes a slot over its cap', m.gren[0] === GRENADES[0]!.maxCarry && m.gren[1] === GRENADES[1]!.maxCarry);

  // HP at 99 still counts as hurt; it heals but never goes past 100.
  const hp = makeRoom([FLOOR], [{ kind: 'hp' as const, x: 0, z: 0 }]);
  const h = hp.add('Hurt');
  warm(hp.room);
  mut(hp.room, h.id).hp = 99;
  place(hp.room, h.id, 0, 0);
  run(hp.room, h, 3);
  check('HP box heals a 99 hp player and caps at max', mut(hp.room, h.id).hp === MAX_HP);
}

// ---------------------------------------------------------------- loot: dead players drop their ammo

/** A shoots B dead with one stapler shot; B dies at (0, -10). */
function killB(room: Room, a: Who, b: Who): void {
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, b.id, 0, -10);
  mut(room, b.id).hp = 1;
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
}

type LootEv = Extract<GameEvent, { k: 'lootDrop' | 'lootTake' | 'lootGone' }>;
const lootEvents = (c: FakeConn): LootEv[] => c.events().filter((e): e is LootEv => e.k === 'lootDrop' || e.k === 'lootTake' || e.k === 'lootGone');

{
  const { room, add } = makeRoom();
  const a = add('Killer');
  const b = add('Victim');
  warm(room);
  const carried = WEAPONS.map((w, i) => mut(room, b.id).mag[i]! + mut(room, b.id).reserve[i]!);
  killB(room, a, b);
  const drop = lootEvents(a.conn).find((e) => e.k === 'lootDrop');
  check('a dead player drops a loot bag at their body', drop?.k === 'lootDrop' && drop.from === b.id && drop.x === 0 && drop.z === -10);

  // A late joiner learns about bags already on the floor.
  const lateConn = new FakeConn();
  room.join(lateConn, 'Late');
  check('late joiners are told about existing bags', (lateConn.msgs[0] as { loot: unknown[] }).loot.length === 1);

  // Walking over the bag takes it automatically; it carries the victim's whole stock.
  const m = mut(room, a.id);
  m.reserve = [0, 0, 0, 0];
  m.gren = [0, 0];
  place(room, a.id, 0, -10);
  run(room, a, 3);
  check('hovering over the bag loots it automatically', lootEvents(a.conn).some((e) => e.k === 'lootTake' && e.by === a.id && e.from === b.id));
  check('the bag holds half of what the victim carried (rounded down)', WEAPONS.every((w, i) => m.reserve[i] === Math.min(w.maxReserve, Math.floor(carried[i]! * LOOT_FRACTION))), `reserve=${m.reserve} carried=${carried}`);
  check('a lone grenade still drops (grenades round up)', m.gren[0] === 1 && m.gren[1] === 1);
  check('an emptied bag disappears', lootEvents(a.conn).some((e) => e.k === 'lootGone'));
}
{
  // What does not fit stays in the bag; a full player takes nothing.
  const { room, add } = makeRoom();
  const a = add('Killer');
  const b = add('Victim');
  warm(room);
  killB(room, a, b);
  const m = mut(room, a.id);
  m.reserve = WEAPONS.map((w) => w.maxReserve);
  m.gren = GRENADES.map((g) => g.maxCarry);
  place(room, a.id, 0, -10);
  run(room, a, 4);
  check('a player with full ammo and grenades takes nothing', !lootEvents(a.conn).some((e) => e.k === 'lootTake'));
  check('and the bag stays on the floor', !lootEvents(a.conn).some((e) => e.k === 'lootGone'));

  m.reserve = WEAPONS.map((w) => w.maxReserve);
  m.reserve[0] = WEAPONS[0]!.maxReserve - 5;
  run(room, a, 4);
  check('with room for only 5 stapler rounds, exactly 5 are taken', m.reserve[0] === WEAPONS[0]!.maxReserve && lootEvents(a.conn).filter((e) => e.k === 'lootTake').length === 1);
  check('the rest of the bag stays', !lootEvents(a.conn).some((e) => e.k === 'lootGone'));
  m.reserve = [0, 0, 0, 0];
  m.gren = [0, 0];
  run(room, a, 4);
  check('later the remainder can be taken and the bag then vanishes', lootEvents(a.conn).some((e) => e.k === 'lootGone'));
}
{
  // Nobody to loot it: it expires. A player standing in the lobby cannot loot either.
  const { room, add } = makeRoom();
  const a = add('Killer');
  const b = add('Victim');
  const lobbyConn = new FakeConn();
  const lobbyId = room.join(lobbyConn, 'Lobby')!;
  warm(room);
  killB(room, a, b);
  place(room, lobbyId, 0, -10);
  place(room, a.id, 30, 30);
  idle(room, 6);
  check('lobby players cannot loot', !lootEvents(lobbyConn).some((e) => e.k === 'lootTake'));
  idle(room, LOOT_LIFETIME_TICKS);
  check('an untouched bag expires', lootEvents(a.conn).some((e) => e.k === 'lootGone'));
}
{
  // Empty-handed victims drop nothing; suicides still drop.
  const { room, add } = makeRoom();
  const a = add('Killer');
  const b = add('Empty');
  warm(room);
  mut(room, b.id).mag = [0, 0, 0, 0];
  mut(room, b.id).reserve = [0, 0, 0, 0];
  mut(room, b.id).gren = [0, 0];
  killB(room, a, b);
  check('a victim with no ammo drops nothing', !lootEvents(a.conn).some((e) => e.k === 'lootDrop'));

  // One spare round is less than one after halving, so there is nothing worth dropping.
  const d = add('Almost');
  warm(room);
  mut(room, d.id).mag = [1, 0, 0, 0];
  mut(room, d.id).reserve = [0, 0, 0, 0];
  mut(room, d.id).gren = [0, 0];
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, d.id, 0, -10);
  mut(room, d.id).hp = 1;
  run(room, a, 2, { weapon: 0 });
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('setup: second victim died', !mut(room, d.id).alive);
  check('a victim with a single round drops nothing (half rounds down)', !lootEvents(a.conn).some((e) => e.k === 'lootDrop'));

  const c = add('Boomer');
  warm(room);
  place(room, c.id, 30, 30);
  mut(room, c.id).hp = 5;
  (room as unknown as { grenades: unknown[] }).grenades.push({ id: 50, slot: 0, owner: c.id, x: 30, y: 0.12, z: 30, vx: 0, vy: 0, vz: 0, explodeAt: 0 });
  room.step();
  room.step();
  check('a player who blows themselves up still drops loot', lootEvents(c.conn).some((e) => e.k === 'lootDrop' && e.from === c.id));
}
{
  // A new match starts with a clean floor.
  const { room, add } = makeRoom();
  const a = add('Killer');
  const b = add('Victim');
  warm(room);
  killB(room, a, b);
  mut(room, a.id).kills = KILLS_TO_WIN - 1;
  mut(room, b.id).hp = 1;
  const c = add('Another');
  warm(room);
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, c.id, 0, -10);
  mut(room, c.id).hp = 1;
  run(room, a, 2, { weapon: 0 }); // release the trigger so the next pull counts as a new shot
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('setup: match over', room.phase === 'over');
  idle(room, INTERMISSION_TICKS + 2);
  const drops = lootEvents(a.conn).filter((e) => e.k === 'lootDrop').length;
  const gone = lootEvents(a.conn).filter((e) => e.k === 'lootGone').length;
  check('every bag is cleared when the next match starts', drops > 0 && gone >= drops, `drops=${drops} gone=${gone}`);
}

// ---------------------------------------------------------------- lobby (joined but not yet entered the map)

{
  const { room, add } = makeRoom([FLOOR], [{ kind: 'hp', x: 0, z: -10 }]);
  const a = add('Shooter');
  const lobbyConn = new FakeConn();
  const lobbyId = room.join(lobbyConn, 'Lobby')!;
  warm(room);
  check('lobby player is not alive or in the match', !mut(room, lobbyId).alive && !room.inspect(lobbyId)!.playing);
  check('lobby player is hidden from others in snapshots', a.conn.snap!.players.every((p) => p.id !== lobbyId));
  check('lobby player is told they are not playing', lobbyConn.snap!.me.playing === false && lobbyConn.snap!.me.alive === false);

  // Park the lobby player exactly where bullets, blasts and a pickup would reach them.
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, lobbyId, 0, -10);
  mut(room, lobbyId).hp = 50;
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('bullets pass through a lobby player', mut(room, lobbyId).hp === 50);
  (room as unknown as { grenades: unknown[] }).grenades.push({ id: 7, slot: 0, owner: a.id, x: 0, y: 0.12, z: -9, vx: 0, vy: 0, vz: 0, explodeAt: 0 });
  room.step();
  check('explosions ignore a lobby player', mut(room, lobbyId).hp === 50);
  idle(room, 4);
  check('lobby player cannot take pickups', !lobbyConn.events().some((e) => e.k === 'pickup'));

  // A lobby player never respawns on their own and takes no spawn slot.
  idle(room, RESPAWN_TICKS + 10);
  check('lobby player is not auto-spawned', !room.inspect(lobbyId)!.alive);

  room.enter(lobbyId);
  idle(room, 2);
  check('entering spawns them into the match', room.inspect(lobbyId)!.alive && room.inspect(lobbyId)!.playing);
  check('entered player appears in snapshots', a.conn.snap!.players.some((p) => p.id === lobbyId));
  check('entering gives spawn protection', (lobbyConn.snap!.me.prot ?? 0) > 0);
  check('spawn event sent on entering', lobbyConn.events().some((e) => e.k === 'spawn' && e.id === lobbyId));
  const hpNow = mut(room, lobbyId).hp;
  room.enter(lobbyId);
  check('entering twice does nothing', mut(room, lobbyId).hp === hpNow && lobbyConn.events().filter((e) => e.k === 'spawn' && e.id === lobbyId).length === 1);
}
{
  // Entering during the intermission waits for the restart instead of spawning mid-intermission.
  const { room, add } = makeRoom();
  const a = add('A');
  const b = add('B');
  warm(room);
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, b.id, 0, -10);
  mut(room, a.id).kills = KILLS_TO_WIN - 1;
  mut(room, b.id).hp = 1;
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('setup: match is over', room.phase === 'over');
  const lateConn = new FakeConn();
  const lateId = room.join(lateConn, 'Late')!;
  room.enter(lateId);
  idle(room, 4);
  check('entering during intermission does not spawn yet', !room.inspect(lateId)!.alive);
  idle(room, INTERMISSION_TICKS + 2);
  check('late entrant spawns when the next match starts', room.phase === 'play' && room.inspect(lateId)!.alive);
}
{
  check('parse: enter message', parseC2S({ t: 'enter' })?.t === 'enter');
}

// ---------------------------------------------------------------- misc

{
  const { room, add } = makeRoom();
  const a = add('A');
  idle(room, 10);
  check('snapshots arrive at 30 Hz', a.conn.msgs.filter((m) => m.t === 'snap').length === 5);
  check('TICK_DT is 1/60', Math.abs(TICK_DT - 1 / 60) < 1e-9);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('test:sim OK');
