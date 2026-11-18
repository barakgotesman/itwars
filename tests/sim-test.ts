/**
 * Headless server simulation tests: drives `Room` directly with fake connections (no sockets, no browser).
 * Run with `npm run test:sim`; exits non-zero on any failure.
 */
import { damage } from '@server/sim/damage';
import { FALL_CREDIT_TICKS, INTERMISSION_TICKS, Key, KILLS_TO_WIN, MAX_HP, MAX_PLAYERS, RESPAWN_TICKS, SPRAY_COOLDOWN_TICKS, SPRINT_SPEED, TICK_DT } from '@shared/core/constants';
import { LOADOUTS } from '@shared/rules/loadout';
import { SPRAYS, SPRAY_GRID, SPRAY_PALETTE } from '@shared/rules/sprays';
import { PLAYER_COLORS } from '@shared/core/characters';
import { newPlayerState, stepMovement, type Aabb } from '@shared/core/physics';
import { parseC2S, type GameEvent } from '@shared/net/protocol';
import { GRENADES, LOOT_FRACTION, LOOT_LIFETIME_TICKS, PICKUP_DEFS, WEAPONS } from '@shared/rules/weapons';
import { Doors } from '@shared/world/doors';
import { DEFAULT_RULES, MODES, RANGE_RULES, describeRules, groupOptions, sanitizeRules, type MatchRules } from '@shared/rules/modes';
import type { DoorDef } from '@shared/world/map/door-layout';
import type { PickupSpot } from '@shared/world/map/pickups';
import { Room } from '@server/rooms/room';
import { RoomManager } from '@server/rooms/manager';
import { FLOOR, FULL_RULES, FakeConn, aimPitch, idle, makeRoom, mut, place, run, warm, type Who } from './helpers';

/** Ownership bit of the A4 paper, which every player always has. */
const PAPER = 1 << 5;

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
  check('parse: keys masked, pitch/weapon clamped', m?.t === 'input' && m.keys < 8192 && m.pitch < 1.6 && m.weapon === WEAPONS.length - 1);
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

// ---------------------------------------------------------------- shooting range

{
  const { room, add } = makeRoom([FLOOR], [], [], { ...RANGE_RULES, loadout: 1 });
  const a = add('A');
  warm(room);
  place(room, a.id, 0, 0);
  const w = WEAPONS[0]!;
  const reserve0 = mut(room, a.id).reserve[0]!;
  for (let i = 0; i < w.magSize * 2; i++) {
    run(room, a, 1, { keys: Key.Fire, weapon: 0 });
    run(room, a, 1, { keys: 0, weapon: 0 });
  }
  check('range mode keeps the magazine full after firing', mut(room, a.id).mag[0] === w.magSize, `mag=${mut(room, a.id).mag[0]}`);
  check('range mode never touches reserve', mut(room, a.id).reserve[0] === reserve0);
  check('range mode starts with no grenades', mut(room, a.id).gren.every((n) => n === 0), `gren=${mut(room, a.id).gren}`);
  run(room, a, 1, { keys: Key.Grenade1, weapon: 0 });
  check('range mode no longer refills grenades by itself', mut(room, a.id).gren[0] === 0);

  // A grenade at the player's own feet must not hurt or kill them in practice.
  const g = { id: 99, slot: 0, owner: a.id, x: 0, y: 0.12, z: 0, vx: 0, vy: 0, vz: 0, explodeAt: 0 };
  (room as unknown as { grenades: unknown[] }).grenades.push(g);
  room.step();
  room.step();
  check('range mode takes no damage from your own grenade', mut(room, a.id).hp === MAX_HP && mut(room, a.id).alive);

  // Solo practice: a second human cannot join the same range room.
  check('a second human cannot join a range room', room.join(new FakeConn(), 'B') === null);
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
  mut(room, a.id).reserve = [0, 0, 0, 0, 0];
  run(room, a, 2);
  check('ammo box refills half of max reserve', mut(room, a.id).reserve.every((r, i) => r === (WEAPONS[i]!.boxAmmo === false ? 0 : Math.ceil(WEAPONS[i]!.maxReserve / 2))));

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

// ---------------------------------------------------------------- sliding doors

/** A test door across a doorway at x 0, z -5: 3.2 m wide, slides toward +x, panel on the +z side. */
const testDoor = (initial: number): DoorDef => ({ name: 'Test door', x: 0, z: -5, axis: 'x', gap: 3.2, dir: 1, side: 1, initial, style: 'wood', color: 0x886644 });
type DoorPeek = { doors: { states: { open: number; target: number }[] } };
const doorOf = (room: Room, i = 0) => (room as unknown as DoorPeek).doors.states[i]!;

{
  // A closed door is solid; an open one is not.
  const { room, add } = makeRoom([FLOOR], [], [testDoor(0)]);
  const a = add('Walker');
  warm(room);
  place(room, a.id, 0, 0, 0, 0);
  run(room, a, 120, { keys: Key.Forward });
  check('a closed door stops a player walking into it', mut(room, a.id).state.z > -4.75, `z=${mut(room, a.id).state.z.toFixed(2)}`);

  // Using the door while facing it opens it, and everyone is told.
  const b = add('Watcher');
  place(room, a.id, 0, -3, 0, 0);
  place(room, b.id, 30, 30);
  run(room, a, 2, { keys: Key.Interact });
  const ev = a.conn.events().filter((e) => e.k === 'door');
  check('using a door toggles it and sends a door event', ev.length === 1 && doorOf(room).target === 1);
  check('other players get the same door event', b.conn.events().filter((e) => e.k === 'door').length === 1);
  idle(room, 150);
  check('the door slides fully open over about 2 seconds', doorOf(room).open === 1, `open=${doorOf(room).open}`);
  place(room, a.id, 0, -3, 0, 0);
  run(room, a, 100, { keys: Key.Forward });
  check('an open door lets a player through', mut(room, a.id).state.z < -6, `z=${mut(room, a.id).state.z.toFixed(2)}`);
}
{
  // A half-closed door leaves half the doorway open.
  const { room, add } = makeRoom([FLOOR], [], [testDoor(0.5)]);
  const a = add('Walker');
  warm(room);
  check('a half-closed door starts at 50%', doorOf(room).open === 0.5 && doorOf(room).target === 0.5);
  place(room, a.id, -1, 0, 0, 0);
  run(room, a, 120, { keys: Key.Forward });
  check('you can squeeze through the open half', mut(room, a.id).state.z < -6);
  place(room, a.id, 1.5, 0, 0, 0);
  run(room, a, 120, { keys: Key.Forward });
  check('the closed half still blocks', mut(room, a.id).state.z > -4.75);
  // Using a half-closed door opens it fully; using an open one closes it.
  place(room, a.id, 1.5, -3, 0, 0);
  run(room, a, 2, { keys: Key.Interact });
  check('using a half-closed door opens it', doorOf(room).target === 1);
  run(room, a, 2);
  run(room, a, 2, { keys: Key.Interact });
  check('using it again before it settles is ignored for a moment (no stutter)', doorOf(room).target === 1);
}
{
  // Doors push players out of their way.
  const { room, add } = makeRoom([FLOOR], [], [testDoor(1)]);
  const a = add('InTheWay');
  warm(room);
  place(room, a.id, 0.5, -4.95, 0, 0);
  run(room, a, 2, { keys: Key.Interact });
  idle(room, 160);
  check('a closing door finishes closing', doorOf(room).open === 0, `open=${doorOf(room).open}`);
  check('it pushed the player out in front of it, not through it', mut(room, a.id).state.z > -4.7 && mut(room, a.id).state.z < -4.5, `z=${mut(room, a.id).state.z.toFixed(2)}`);
  check('the pushed player is fine', mut(room, a.id).alive && mut(room, a.id).hp === MAX_HP);
}
{
  // A player who cannot be pushed (wall behind them) stops the door instead of being crushed.
  const wall: Aabb = { minX: -3, maxX: 3, minY: 0, maxY: 4, minZ: -4.6, maxZ: -4.0 };
  const { room, add } = makeRoom([FLOOR, wall], [], [testDoor(1)]);
  const a = add('Wedged');
  warm(room);
  place(room, a.id, 0.5, -4.95, 0, 0);
  run(room, a, 2, { keys: Key.Interact });
  idle(room, 200);
  const stuck = doorOf(room).open;
  check('a wedged player blocks the door part-way', stuck > 0.1 && stuck < 0.9, `open=${stuck}`);
  check('and is not moved or hurt', Math.abs(mut(room, a.id).state.z + 4.95) < 0.01 && mut(room, a.id).hp === MAX_HP);
  place(room, a.id, 0.5, 5, 0, 0);
  idle(room, 200);
  check('once they step away the door finishes closing', doorOf(room).open === 0);
}
{
  // Closed doors stop bullets; open ones do not.
  const { room, add } = makeRoom([FLOOR], [], [testDoor(0)]);
  const a = add('Shooter');
  const b = add('Target');
  warm(room);
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, b.id, 0, -10);
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('a closed door blocks bullets', mut(room, b.id).hp === MAX_HP);
  check('and the bullet leaves a hole on the door', a.conn.events().some((e) => e.k === 'hole' && e.a === 2 && Math.abs(e.z + 4.95) < 0.02));
  doorOf(room).target = 1;
  idle(room, 150);
  run(room, a, 2, { weapon: 0 });
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('an open door lets bullets through', mut(room, b.id).hp < MAX_HP);
}
{
  // Door state reaches late joiners and snapshots only while something moves; a new match resets it.
  const { room, add } = makeRoom([FLOOR], [], [testDoor(0)]);
  const a = add('Opener');
  warm(room);
  check('snapshots carry no door data while nothing moves', a.conn.snap?.doors === undefined);
  place(room, a.id, 0, -3, 0, 0);
  run(room, a, 2, { keys: Key.Interact });
  idle(room, 10);
  check('snapshots carry door data while a door moves', Array.isArray(a.conn.snap?.doors) && a.conn.snap!.doors!.length === 2);
  idle(room, 150);
  check('the final state is sent once the door stops', a.conn.snap?.doors?.[0] === 100 || a.conn.msgs.filter((m) => m.t === 'snap').some((m) => (m as { doors?: number[] }).doors?.[0] === 100));
  const late = new FakeConn();
  room.join(late, 'Late');
  check('late joiners learn the current door states', (late.msgs[0] as { doors: number[] }).doors[0] === 100);
  (room as unknown as { restartMatch(): void }).restartMatch();
  check('a new match puts doors back to their starting state', doorOf(room).open === 0 && doorOf(room).target === 0);
}
{
  // The facing check: you cannot use a door behind you or far away.
  const { room, add } = makeRoom([FLOOR], [], [testDoor(0)]);
  const a = add('Looker');
  warm(room);
  place(room, a.id, 0, -3, Math.PI, 0);
  run(room, a, 2, { keys: Key.Interact, yaw: Math.PI });
  check('a door behind you cannot be used', doorOf(room).target === 0);
  run(room, a, 2, { weapon: 1, yaw: 0 });
  place(room, a.id, 0, 20, 0, 0);
  run(room, a, 2, { keys: Key.Interact });
  check('a door far away cannot be used', doorOf(room).target === 0);
}

// Clients keep their own door motion and only correct real drift, so doors do not jitter on every update.
{
  const d = new Doors([testDoor(0)]);
  d.setState(0, 40, 100);
  d.applyWire([44, 100], 0.08);
  check('a server update close to the local state does not snap the door back', d.states[0]!.open === 0.4);
  d.applyWire([60, 100], 0.08);
  check('a real drift is corrected', Math.abs(d.states[0]!.open - 0.6) < 1e-9);
  d.applyWire([60, 0], 0.08);
  check('the target is always taken from the server', d.states[0]!.target === 0);
  d.applyWire([90, 100]);
  check('without a tolerance the server state is applied exactly (server and tests)', d.states[0]!.open === 0.9);
}

// ---------------------------------------------------------------- spray paint: tags on walls

type SprayEv = Extract<GameEvent, { k: 'spray' }>;
const spraysSeen = (c: FakeConn): SprayEv[] => c.events().filter((e): e is SprayEv => e.k === 'spray');

{
  const wall: Aabb = { minX: -5, maxX: 5, minY: 0, maxY: 4, minZ: -3.5, maxZ: -2.5 };
  const { room, add } = makeRoom([FLOOR, wall]);
  const a = add('Sprayer');
  const b = add('Watcher');
  warm(room);
  place(room, a.id, 0, 0, 0, 0);
  place(room, b.id, 30, 30);
  run(room, a, 2, { keys: Key.Spray });
  const tags = spraysSeen(a.conn);
  check('spraying a wall in range sends one spray event', tags.length === 1, `tags=${tags.length}`);
  const t = tags[0]!;
  check('the tag is on the wall face, facing the sprayer', t && Math.abs(t.z + 2.5) < 0.01 && t.a === 2 && t.s === 1, JSON.stringify(t));
  check('the event names the sprayer', t?.id === a.id);
  check('other players get the same tag', spraysSeen(b.conn).length === 1);

  // Cooldown: pressing again straight away does nothing; after 10 s it works.
  run(room, a, 2, { keys: 0 });
  run(room, a, 2, { keys: Key.Spray });
  check('a second spray inside the cooldown is ignored', spraysSeen(a.conn).length === 1);
  idle(room, SPRAY_COOLDOWN_TICKS);
  run(room, a, 2, { keys: 0 });
  run(room, a, 2, { keys: Key.Spray });
  check('spraying works again after the cooldown', spraysSeen(a.conn).length === 2);
}
{
  // Too far, open air, and a lobby player all produce nothing.
  const wall: Aabb = { minX: -5, maxX: 5, minY: 0, maxY: 4, minZ: -9, maxZ: -8 };
  const { room, add } = makeRoom([FLOOR, wall]);
  const a = add('Far');
  warm(room);
  place(room, a.id, 0, 0, 0, 0);
  run(room, a, 2, { keys: Key.Spray });
  check('a wall out of range is not sprayed', spraysSeen(a.conn).length === 0);
  place(room, a.id, 0, 0, 0, 1.4);
  run(room, a, 2, { keys: 0, pitch: 1.4 });
  run(room, a, 2, { keys: Key.Spray, pitch: 1.4 });
  check('open sky is not sprayed', spraysSeen(a.conn).length === 0);
}
{
  const { room } = makeRoom([FLOOR]);
  const conn = new FakeConn();
  const id = room.join(conn, 'Lobby')!;
  const lobby = { id, conn };
  idle(room, 4);
  room.input(id, { t: 'input', seq: 1, keys: Key.Spray, yaw: 0, pitch: -1.2, weapon: 1 });
  idle(room, 4);
  check('a lobby player cannot spray', spraysSeen(lobby.conn).length === 0);
}
{
  // A door panel is never sprayed (the tag would be left floating when it moves).
  const { room, add } = makeRoom([FLOOR], [], [testDoor(0)]);
  const a = add('Door sprayer');
  warm(room);
  place(room, a.id, 0, -3, 0, 0);
  run(room, a, 2, { keys: Key.Spray });
  check('a sliding door is not sprayed', spraysSeen(a.conn).length === 0);
}
{
  // The look sent at join is sanitised and travels in the roster.
  const parsed = parseC2S({ t: 'join', code: 'ABCD', name: 'x', model: 0, color: 0, spray: 999 });
  check('an out-of-range spray design falls back to 0', parsed?.t === 'join' && parsed.spray === 0);
  const ok = parseC2S({ t: 'join', code: 'ABCD', name: 'x', model: 0, color: 0, spray: 3 });
  check('a valid spray design is kept', ok?.t === 'join' && ok.spray === 3);
  check('every design fits the 16 x 16 grid', SPRAYS.every((s) => s.rows.length <= SPRAY_GRID && s.rows.every((r) => r.length <= SPRAY_GRID)));
  check('every design uses only palette colours', SPRAYS.every((s) => s.rows.every((r) => [...r].every((c) => c === '.' || c in SPRAY_PALETTE))));
}

// ---------------------------------------------------------------- match rules: kill limit and time limit

/** Shorthand for rules in tests. */
const rulesOf = (killLimit: number, timeLimitMin = 0): MatchRules => ({ ...FULL_RULES, killLimit, timeLimitMin });
type EndEv = Extract<GameEvent, { k: 'matchEnd' }>;
const endEvent = (c: FakeConn): EndEv | undefined => c.events().find((e): e is EndEv => e.k === 'matchEnd');

{
  check('sanitizeRules keeps valid rules', JSON.stringify(sanitizeRules(rulesOf(30, 15))) === JSON.stringify(rulesOf(30, 15)));
  check('sanitizeRules fixes a bad kill limit', sanitizeRules({ mode: 'dm', killLimit: 25, timeLimitMin: 0 }).killLimit === 50);
  check('sanitizeRules fixes a bad time limit', sanitizeRules({ mode: 'dm', killLimit: 20, timeLimitMin: 7 }).timeLimitMin === 0);
  check('sanitizeRules fixes an unknown mode', sanitizeRules({ mode: 'ctf', killLimit: 20, timeLimitMin: 0 }).mode === 'dm');
  check('sanitizeRules survives junk', JSON.stringify(sanitizeRules(null)) === JSON.stringify(DEFAULT_RULES) && JSON.stringify(sanitizeRules('x')) === JSON.stringify(DEFAULT_RULES));
  check('describeRules reads well', describeRules({ ...DEFAULT_RULES, killLimit: 30, timeLimitMin: 10 }) === 'Deathmatch · first to 30 · 10 min' && describeRules(rulesOf(50)).includes('no time limit'));
  check('describeRules names the full arsenal', describeRules(rulesOf(30, 10)) === 'Deathmatch · first to 30 · 10 min · full arsenal');
  const h = parseC2S({ t: 'host', name: 'x', rules: { mode: 'dm', killLimit: 20, timeLimitMin: 15 } });
  check('parse: a host message carries validated rules', h?.t === 'host' && h.rules.killLimit === 20 && h.rules.timeLimitMin === 15);
  const h2 = parseC2S({ t: 'host', name: 'x' });
  check('parse: missing rules become the defaults', h2?.t === 'host' && JSON.stringify(h2.rules) === JSON.stringify(DEFAULT_RULES));
}
{
  // A lower kill limit ends the match sooner.
  const { room, add } = makeRoom([FLOOR], [], [], rulesOf(10));
  const a = add('A');
  const b = add('B');
  check('the joined message tells the player the room rules', (a.conn.msgs[0] as { rules: MatchRules }).rules.killLimit === 10);
  warm(room);
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, b.id, 0, -10);
  mut(room, a.id).kills = 8;
  mut(room, b.id).hp = 1;
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('9 kills does not end a first-to-10 match', room.phase === 'play');
  idle(room, RESPAWN_TICKS + 130); // respawn, then let spawn protection run out
  place(room, a.id, 0, 0, 0, aimPitch(10, 1.0));
  place(room, b.id, 0, -10);
  mut(room, b.id).hp = 1;
  mut(room, b.id).state.y = 0;
  run(room, a, 2, { weapon: 0 });
  run(room, a, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  check('the 10th kill ends a first-to-10 match', room.phase === 'over' && room.winner === a.id);
  check('and the end is reported as a kill-limit win', endEvent(a.conn)?.reason === 'kills');
}
{
  // The time limit: no clock without a limit, the clock waits for a second player, counts down, ends the match.
  const none = makeRoom([FLOOR], [], [], rulesOf(50, 0));
  const n1 = none.add('A');
  none.add('B');
  idle(none.room, 10);
  check('without a time limit the clock reads -1', n1.conn.snap!.me.timeLeft === -1);

  const { room, add } = makeRoom([FLOOR], [], [], rulesOf(50, 5));
  const a = add('Solo');
  idle(room, 700);
  check('with a time limit the clock shows the full time while waiting for players', a.conn.snap!.me.timeLeft === 300);
  const b = add('Second');
  idle(room, 600);
  const left = a.conn.snap!.me.timeLeft;
  check('the clock starts when a second player enters and counts down', left <= 291 && left >= 288, `timeLeft=${left}`);
  mut(room, a.id).kills = 3;
  mut(room, b.id).kills = 1;
  idle(room, 5 * 60 * 60 - 600 + 20); // just past the whistle, still inside the intermission
  check('when time runs out the match ends', room.phase === 'over');
  check('the player with the most kills wins on time', room.winner === a.id);
  const ev = endEvent(a.conn);
  check('and the end is reported as a time-out', ev?.reason === 'time' && ev.winner === a.id);
  check('the clock shows 0 during the intermission', a.conn.snap!.me.timeLeft === 0);
  idle(room, INTERMISSION_TICKS + 10);
  check('the next match starts with a fresh clock', room.phase === 'play' && a.conn.snap!.me.timeLeft > 290, `timeLeft=${a.conn.snap!.me.timeLeft}`);
}
{
  // A tie for first place is a draw.
  const { room, add } = makeRoom([FLOOR], [], [], rulesOf(50, 5));
  const a = add('A');
  const b = add('B');
  warm(room);
  mut(room, a.id).kills = 2;
  mut(room, b.id).kills = 2;
  idle(room, 5 * 60 * 60 - 130 + 20);
  check('equal kills at the whistle is a draw', room.phase === 'over' && room.winner === -1 && endEvent(a.conn)?.winner === -1);
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
  m.reserve = [0, 0, 0, 0, 0];
  m.gren = [0, 0];
  place(room, a.id, 0, -10);
  run(room, a, 3);
  check('hovering over the bag loots it automatically', lootEvents(a.conn).some((e) => e.k === 'lootTake' && e.by === a.id && e.from === b.id));
  check('the bag holds half of what the victim carried (rounded down)', WEAPONS.every((w, i) => (m.reserve[i] ?? 0) === Math.min(w.maxReserve, Math.floor(carried[i]! * LOOT_FRACTION))), `reserve=${m.reserve} carried=${carried}`);
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
  m.reserve = [0, 0, 0, 0, 0];
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
  mut(room, b.id).mag = [0, 0, 0, 0, 0];
  mut(room, b.id).reserve = [0, 0, 0, 0, 0];
  mut(room, b.id).gren = [0, 0];
  killB(room, a, b);
  check('a victim with no ammo drops nothing', !lootEvents(a.conn).some((e) => e.k === 'lootDrop'));

  // One spare round is less than one after halving, so there is nothing worth dropping.
  const d = add('Almost');
  warm(room);
  mut(room, d.id).mag = [1, 0, 0, 0, 0];
  mut(room, d.id).reserve = [0, 0, 0, 0, 0];
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

// ---------------------------------------------------------------- loadouts: pistol only, the other guns are pickups

type PickEv = Extract<GameEvent, { k: 'pickup' }>;
const pickupEvents = (c: FakeConn): PickEv[] => c.events().filter((e): e is PickEv => e.k === 'pickup');

{
  const { room, add } = makeRoom([FLOOR], [{ kind: 'weapon', weapon: 1, x: 10, z: 0 }, { kind: 'ammo', x: 20, z: 0 }], [], DEFAULT_RULES);
  const a = add('A');
  const b = add('B');
  warm(room);
  const m = mut(room, a.id);
  check('default rules spawn the pistol only', m.guns === (1 | PAPER) && m.weapon === 0 && a.conn.snap?.me.guns === (1 | PAPER));
  check('unowned guns carry no ammo', m.mag[1] === 0 && m.reserve[1] === 0 && m.mag[0] === WEAPONS[0]!.magSize);
  run(room, a, 4, { weapon: 1 });
  check('switching to a gun you have not found is ignored', m.weapon === 0);

  place(room, a.id, 10, 0);
  run(room, a, 2);
  const smg = WEAPONS[1]!;
  check('a gun pickup grants the gun with a full magazine and half its reserve', m.guns === (0b11 | PAPER) && m.mag[1] === smg.magSize && m.reserve[1] === Math.floor(smg.maxReserve * 0.5), `guns=${m.guns} mag=${m.mag[1]} res=${m.reserve[1]}`);
  check('the pickup event names the gun', pickupEvents(a.conn).some((e) => e.kind === 'weapon' && e.w === 1 && e.got === 'gun'));
  check('the gun spot goes away like any box', a.conn.events().some((e) => e.k === 'pk' && !e.on));
  run(room, a, 4, { weapon: 1 });
  check('a found gun can be selected', m.weapon === 1);

  // Step off the spot while it respawns, or it is taken again the moment it comes back.
  place(room, a.id, 0, 0);
  idle(room, PICKUP_DEFS.weapon.respawnTicks + 2);
  m.reserve[1] = 0;
  place(room, a.id, 10, 0);
  run(room, a, 2);
  check('walking over a gun you own tops up only that gun', m.reserve[1] === Math.ceil(smg.maxReserve * PICKUP_DEFS.weapon.amount) && m.guns === (0b11 | PAPER) && m.reserve[2] === 0);
  check('the pickup event says it was ammo', pickupEvents(a.conn).some((e) => e.kind === 'weapon' && e.w === 1 && e.got === 'ammo'));
  place(room, a.id, 0, 0);
  idle(room, PICKUP_DEFS.weapon.respawnTicks + 2);
  m.reserve[1] = smg.maxReserve;
  const before = pickupEvents(a.conn).length;
  place(room, a.id, 10, 0);
  run(room, a, 2);
  check('a gun spot is left alone when that gun is full', pickupEvents(a.conn).length === before);

  place(room, a.id, 20, 0);
  m.reserve = [0, 0, 0, 0, 0];
  run(room, a, 2);
  check('an ammo box refills only the guns you own', m.reserve[0] === Math.ceil(WEAPONS[0]!.maxReserve / 2) && m.reserve[1] === Math.ceil(smg.maxReserve / 2) && m.reserve[2] === 0 && m.reserve[3] === 0, `reserve=${m.reserve}`);
  place(room, a.id, 0, 0);
  idle(room, PICKUP_DEFS.ammo.respawnTicks + 2);
  m.reserve = [WEAPONS[0]!.maxReserve, smg.maxReserve, 0, 0, 0];
  const before2 = pickupEvents(a.conn).length;
  place(room, a.id, 20, 0);
  run(room, a, 2);
  check('an ammo box is left alone when every owned gun is full', pickupEvents(a.conn).length === before2);

  // A dies holding the SMG: the bag carries the gun; B (pistol only) takes the gun out of it.
  place(room, a.id, 0, -10, 0, 0);
  run(room, a, 4, { weapon: 1 });
  m.hp = 1;
  place(room, b.id, 0, 0, 0, aimPitch(10, 1.0));
  run(room, b, 1, { keys: Key.Fire | Key.Aim, weapon: 0, pitch: aimPitch(10, 1.0) });
  const drop = lootEvents(b.conn).find((e) => e.k === 'lootDrop');
  check('dying with a found gun in hand drops it in the bag', drop?.k === 'lootDrop' && drop.w === 1, `w=${drop?.k === 'lootDrop' ? drop.w : 'none'}`);
  const mb = mut(room, b.id);
  check('the victim respawns without it', (() => { idle(room, RESPAWN_TICKS + 2); return m.guns === (1 | PAPER) && m.weapon === 0; })());
  place(room, b.id, 0, -10);
  run(room, b, 3);
  check('looting a bag with a gun grants that gun', (mb.guns & 0b10) !== 0 && mb.mag[1] === smg.magSize, `guns=${mb.guns}`);
  check('the loot event says which gun was taken', lootEvents(b.conn).some((e) => e.k === 'lootTake' && e.by === b.id && e.w === 1));
  check('late joiners see which gun a bag holds', (() => {
    const late = new FakeConn();
    room.join(late, 'Late');
    const j = late.msgs[0] as { loot: { w: number }[] };
    return Array.isArray(j.loot) && j.loot.every((l) => typeof l.w === 'number');
  })());
}
{
  const { room, add } = makeRoom([FLOOR], [], [], DEFAULT_RULES);
  const a = add('A');
  const b = add('B');
  warm(room);
  killB(room, a, b);
  const drop = lootEvents(a.conn).find((e) => e.k === 'lootDrop');
  check('the starter pistol never drops (ammo-only bag)', drop?.k === 'lootDrop' && drop.w === -1);
  idle(room, RESPAWN_TICKS + 2);
  warm(room);
  run(room, a, 2); // release the trigger so the next shot is a fresh press
  // B carries a dry SMG: no ammo anywhere, yet the gun itself is worth a bag.
  const mb = mut(room, b.id);
  mb.guns = 0b11;
  run(room, b, 4, { weapon: 1 });
  mb.mag = [0, 0, 0, 0, 0];
  mb.reserve = [0, 0, 0, 0, 0];
  mb.gren = [0, 0];
  const n = lootEvents(a.conn).filter((e) => e.k === 'lootDrop').length;
  killB(room, a, b);
  const drops = lootEvents(a.conn).filter((e) => e.k === 'lootDrop');
  check('a gun with no ammo still drops a bag', drops.length === n + 1 && drops[n]!.k === 'lootDrop' && drops[n]!.w === 1);
  const ma = mut(room, a.id);
  place(room, a.id, 0, -10);
  run(room, a, 3);
  check('taking the gun out empties the bag', (ma.guns & 0b10) !== 0 && lootEvents(a.conn).some((e) => e.k === 'lootGone' && e.id === drops[n]!.id));
  check('bag ammo for a gun you do not own stays (nothing taken)', (() => {
    // A fresh victim with only pistol ammo; C owns the pistol so takes it; the SMG rounds would have stayed, but there are none to begin with: cover the rule directly.
    const c = add('C');
    warm(room);
    const mc = mut(room, c.id);
    mc.reserve = [0, 0, 0, 0, 0];
    room.loot.push({ id: 900, from: 1, x: 30, y: 0, z: 30, ammo: [0, 40, 0, 0, 0], gren: [0, 0], w: -1, expiresAt: room.tick + 3000 });
    place(room, c.id, 30, 30);
    run(room, c, 3);
    return mc.reserve[1] === 0 && room.loot.some((l) => l.id === 900 && l.ammo[1] === 40);
  })());
}
{
  // Full arsenal restores the old game: every gun at spawn, SMG in hand, and the map's gun spots stay off.
  const { room, add } = makeRoom([FLOOR], [{ kind: 'weapon', weapon: 2, x: 10, z: 0 }], [], FULL_RULES);
  const a = add('A');
  warm(room);
  const m = mut(room, a.id);
  check('full arsenal spawns with every gun, SMG in hand', m.guns === (0b1111 | PAPER) && m.weapon === 1 && WEAPONS.every((w, i) => m.mag[i] === (i === 4 ? 0 : w.magSize)));
  place(room, a.id, 10, 0);
  m.reserve[2] = 0;
  run(room, a, 2);
  check('gun spots are inert under the full arsenal', pickupEvents(a.conn).length === 0 && m.reserve[2] === 0);
}
{
  // Shooting range: pistol at spawn, guns on the armory table, the table is never emptied.
  const { room, add } = makeRoom([FLOOR], [{ kind: 'weapon', weapon: 2, x: 5, z: 0, y: 0.9 }], [], RANGE_RULES);
  const a = add('A');
  warm(room);
  const m = mut(room, a.id);
  check('the range starts with the pistol only (and the paper)', m.guns === (1 | PAPER) && m.weapon === 0);
  place(room, a.id, 5, 0);
  run(room, a, 2);
  check('an armory gun is picked up', (m.guns & 0b100) !== 0);
  check('the armory table is never emptied', !a.conn.events().some((e) => e.k === 'pk' && !e.on) && room.pickupReady[0] === 0);
  m.reserve[2] = 0;
  run(room, a, 2);
  check('walking over it again gives ammo at once (no respawn wait)', m.reserve[2] > 0);
}
{
  // Range grenade crates: you start with none, a crate gives them, and it is never emptied.
  const { room, add } = makeRoom([FLOOR], [{ kind: 'grenade', x: 5, z: 0, y: 0.9 }], [], RANGE_RULES);
  const a = add('A');
  warm(room);
  const m = mut(room, a.id);
  check('the range starts with no grenades', m.gren.every((n) => n === 0));
  place(room, a.id, 5, 0);
  run(room, a, 2);
  check('a range grenade crate gives grenades', m.gren.every((n) => n > 0), `gren=${m.gren}`);
  check('the range grenade crate is never emptied', !a.conn.events().some((e) => e.k === 'pk' && !e.on));
  m.gren[0] = 0;
  run(room, a, 2);
  check('walking over the crate again refills at once', m.gren[0]! > 0);
}
{
  check('sanitizeRules keeps a valid loadout', sanitizeRules({ ...DEFAULT_RULES, loadout: 1 }).loadout === 1);
  check('sanitizeRules fixes a bad loadout', sanitizeRules({ ...DEFAULT_RULES, loadout: 7 }).loadout === 0 && sanitizeRules({}).loadout === 0);
  check('the setup screen offers the loadout', MODES[0]!.options.some((o) => o.key === 'loadout' && o.kind === 'choice' && o.labels?.length === 2));
}
{
  // The setup screen lists options under group headings: none may be missing a group, and grouping loses nothing.
  const all = MODES.flatMap((m) => m.options);
  check('every setup option has a group heading', all.every((o) => o.group.length > 0));
  const dm = MODES[0]!.options;
  const groups = groupOptions(dm);
  check('grouping keeps every option exactly once', groups.flatMap((g) => g.options).length === dm.length && dm.every((o) => groups.some((g) => g.options.includes(o))));
  check('groups keep registry order', groups.map((g) => g.group).join(',') === 'Map,Match,Weapons,Players,Visibility' || groups.map((g) => g.group).join(',') === 'Map,Match,Players,Weapons,Visibility', groups.map((g) => g.group).join(','));
  check('bot skill sits in the same group as bots', groups.some((g) => g.options.some((o) => o.key === 'bots') && g.options.some((o) => o.key === 'botSkill')));
}

// ---------------------------------------------------------------- the RPG: pickup only, three rockets, heavy, explosive

{
  const rpg = WEAPONS[4]!;
  check('the RPG holds one rocket and three in all', rpg.magSize === 1 && rpg.magSize + rpg.maxReserve === 3 && rpg.rocket !== undefined);
  check('nobody spawns with the RPG', LOADOUTS.every((l) => !l.startWeapons.includes(4)));
  check('only the RPG hides its crosshair from the hip', WEAPONS.every((w, i) => (w.hipCrosshair === false) === (i === 4)));
  check('the RPG reload is the longest', WEAPONS.every((w) => w.reloadTicks <= rpg.reloadTicks));

  // The spot is live under both loadouts; the SMG spot goes inert under the full arsenal. A taken RPG waits long to return.
  const spots: PickupSpot[] = [{ kind: 'weapon', weapon: 1, x: 10, z: 0 }, { kind: 'weapon', weapon: 4, x: 20, z: 0, respawnTicks: 7200 }];
  for (const [label, rules, smgOn] of [['pistol only', DEFAULT_RULES, '1'], ['full arsenal', FULL_RULES, '0']] as const) {
    const { room, add } = makeRoom([FLOOR], spots, [], rules);
    const a = add(`A-${label}`);
    const late = new FakeConn();
    room.join(late, 'Late');
    const wire = (late.msgs[0] as { pickups: string }).pickups;
    check(`${label}: the RPG spot is shown and the SMG spot ${smgOn === '1' ? 'too' : 'is hidden'}`, wire === `${smgOn}1`, `pickups=${wire}`);
    warm(room);
    const m = mut(room, a.id);
    place(room, a.id, 20, 0);
    run(room, a, 2);
    check(`${label}: walking over the RPG gives it with all three rockets`, (m.guns & 16) !== 0 && m.mag[4] === 1 && m.reserve[4] === 2, `guns=${m.guns} mag=${m.mag[4]} res=${m.reserve[4]}`);
    check(`${label}: a taken RPG stays gone for the long respawn`, room.pickupReady[1]! - room.tick > 7000 && room.pickupReady[1]! - room.tick <= 7200);
  }

  // Ammo boxes never feed it.
  {
    const { room, add } = makeRoom([FLOOR], [{ kind: 'ammo', x: 10, z: 0 }], [], FULL_RULES);
    const a = add('A');
    warm(room);
    const m = mut(room, a.id);
    m.guns |= 16;
    m.mag[4] = 0;
    m.reserve = [0, 0, 0, 0, 0];
    place(room, a.id, 10, 0);
    run(room, a, 2);
    check('ammo boxes refill the other guns but never the RPG', m.reserve[4] === 0 && (m.reserve[0] ?? 0) > 0);
    m.reserve = WEAPONS.map((w) => (w.boxAmmo === false ? 0 : w.maxReserve));
    const seen = pickupEvents(a.conn).length;
    place(room, a.id, 0, 0);
    idle(room, PICKUP_DEFS.ammo.respawnTicks + 2);
    place(room, a.id, 10, 0);
    run(room, a, 2);
    check('an ammo box is left alone when only the RPG could use it', pickupEvents(a.conn).length === seen);
  }

  // Firing: a real rocket that flies, blows up on a wall and hurts whoever is near.
  const WALL: Aabb = { minX: -8, maxX: 8, minY: 0, maxY: 6, minZ: -21, maxZ: -20 };
  {
    const { room, add } = makeRoom([FLOOR, WALL], [], [], FULL_RULES);
    const a = add('Shooter');
    const b = add('Bystander');
    warm(room);
    const m = mut(room, a.id);
    m.guns |= 16;
    m.weapon = 4;
    m.mag[4] = 1;
    m.reserve[4] = 2;
    place(room, a.id, 0, 0, 0, 0);
    place(room, b.id, 3, -17);
    run(room, a, 1, { keys: Key.Fire | Key.Aim });
    check('firing spends the round and launches a rocket', m.mag[4] === 0 && room.rockets.length === 1);
    check('the snapshot carries the rocket', (a.conn.snap?.rockets.length ?? 0) === 1);
    const z0 = room.rockets[0]!.z;
    idle(room, 6);
    const dz = Math.abs(room.rockets[0]!.z - z0);
    check('the rocket flies on at its set speed', Math.abs(dz - rpg.rocket!.speed * 6 * TICK_DT) < 0.2, `dz=${dz}`);
    idle(room, 60);
    const boom = a.conn.events().find((e) => e.k === 'boom' && e.s === 2);
    check('it explodes on the wall', boom !== undefined && room.rockets.length === 0 && boom.k === 'boom' && boom.z > -21 && boom.z < -19);
    const hurt = mut(room, b.id).hp;
    check('the blast hurts someone standing near the wall', hurt < MAX_HP && hurt > 0, `hp=${hurt}`);
    check('the shooter, 20 m away, is untouched', m.hp === MAX_HP);
  }
  {
    // A direct hit is a one-shot kill, credited to the RPG in the feed.
    const { room, add } = makeRoom([FLOOR, WALL], [], [], FULL_RULES);
    const a = add('Shooter');
    const b = add('Target');
    warm(room);
    const m = mut(room, a.id);
    m.guns |= 16;
    m.weapon = 4;
    m.mag[4] = 1;
    place(room, a.id, 0, 0, 0, 0);
    place(room, b.id, 0, -12);
    run(room, a, 1, { keys: Key.Fire | Key.Aim });
    idle(room, 40);
    const kill = a.conn.events().find((e) => e.k === 'kill');
    check('a direct hit kills from full health, credited to the RPG', kill?.k === 'kill' && kill.by === a.id && kill.to === b.id && kill.w === 4, JSON.stringify(kill));
  }
  {
    // A rocket into a close wall hurts the one who fired it, but only half as much as a bystander would be.
    const near: Aabb = { minX: -8, maxX: 8, minY: 0, maxY: 6, minZ: -5, maxZ: -4 };
    const { room, add } = makeRoom([FLOOR, near], [], [], FULL_RULES);
    const a = add('Shooter');
    add('Other');
    warm(room);
    const m = mut(room, a.id);
    m.guns |= 16;
    m.weapon = 4;
    m.mag[4] = 1;
    place(room, a.id, 0, 0, 0, 0);
    run(room, a, 1, { keys: Key.Fire | Key.Aim });
    idle(room, 30);
    check('firing at a wall 4 m away hurts the shooter but does not kill', m.hp < MAX_HP && m.hp > 50, `hp=${m.hp}`);
  }
  {
    // Accuracy: aimed rockets fly where the crosshair points; hip-fired ones scatter inside a cone.
    const angles = (aim: boolean): number[] => {
      const out: number[] = [];
      for (let n = 0; n < 24; n++) {
        const { room, add } = makeRoom([FLOOR], [], [], FULL_RULES);
        const a = add('A');
        warm(room);
        const m = mut(room, a.id);
        m.guns |= 16;
        m.weapon = 4;
        m.mag[4] = 1;
        for (let k = 0; k < n; k++) room.rng();
        place(room, a.id, 0, 0, 0, 0);
        run(room, a, 1, { keys: aim ? Key.Fire | Key.Aim : Key.Fire });
        const r = room.rockets[0]!;
        out.push(Math.hypot(r.vx, r.vy) / Math.hypot(r.vx, r.vy, r.vz));
      }
      return out;
    };
    const aimed = Math.max(...angles(true));
    const hip = angles(false);
    check('an aimed rocket flies almost exactly along the view', aimed <= Math.tan(rpg.aimSpread) * 1.01 + 1e-6, `max=${aimed}`);
    check('hip-fired rockets scatter, but stay inside the cone', Math.max(...hip) > Math.tan(rpg.aimSpread) * 4 && Math.max(...hip) <= Math.tan(rpg.spread) * 1.01, `max=${Math.max(...hip)}`);
  }
  {
    // Reload: a long one, then one rocket back in the tube and one left in reserve.
    const { room, add } = makeRoom([FLOOR], [], [], FULL_RULES);
    const a = add('A');
    warm(room);
    const m = mut(room, a.id);
    m.guns |= 16;
    m.weapon = 4;
    m.mag[4] = 0;
    m.reserve[4] = 2;
    run(room, a, 1, { keys: Key.Reload });
    check('the reload event fires', a.conn.events().some((e) => e.k === 'reload'));
    idle(room, rpg.reloadTicks - 20);
    check('still reloading just before the end', m.mag[4] === 0);
    idle(room, 40);
    check('the reload puts one rocket in the tube and keeps the spare', m.mag[4] === 1 && m.reserve[4] === 1, `mag=${m.mag[4]} res=${m.reserve[4]}`);
  }
  {
    // Weight: held, the RPG slows both walking and sprinting; the shared movement code agrees with the server.
    const { room, add } = makeRoom([FLOOR], [], [], FULL_RULES);
    const a = add('Heavy');
    const b = add('Light');
    warm(room);
    const ma = mut(room, a.id);
    ma.guns |= 16;
    ma.weapon = 4;
    place(room, a.id, -10, 0);
    place(room, b.id, 10, 0);
    run(room, a, 90, { keys: Key.Forward });
    run(room, b, 90, { keys: Key.Forward, weapon: 0 });
    const heavy = Math.abs(ma.state.vz);
    const light = Math.abs(mut(room, b.id).state.vz);
    check('walking with the RPG is at its set share of normal speed', Math.abs(heavy - light * rpg.moveMul!) < 0.1 && heavy < light, `heavy=${heavy} light=${light}`);
    const s = newPlayerState(0, 0, 0);
    for (let i = 0; i < 120; i++) stepMovement(s, { keys: Key.Forward | Key.Sprint, yaw: 0, pitch: 0, weapon: 4 }, TICK_DT, [FLOOR]);
    check('sprinting with it is slowed too (shared movement code)', Math.abs(Math.abs(s.vz) - SPRINT_SPEED * rpg.moveMul!) < 0.1, `vz=${s.vz}`);
  }
  {
    // Loot: a dead RPG carrier's bag holds the gun; the looter gets what was left, not a fresh supply.
    const { room, add } = makeRoom([FLOOR], [], [], FULL_RULES);
    const a = add('Killer');
    const b = add('Victim');
    warm(room);
    const mb = mut(room, b.id);
    mb.guns |= 16;
    mb.weapon = 4;
    mb.mag[4] = 0;
    mb.reserve[4] = 0;
    killB(room, a, b);
    const drop = lootEvents(a.conn).find((e) => e.k === 'lootDrop');
    check('dying with the RPG drops it in the bag', drop?.k === 'lootDrop' && drop.w === 4, JSON.stringify(drop));
    const ma = mut(room, a.id);
    place(room, a.id, 0, -10);
    run(room, a, 3);
    check('the looter gets the RPG with just one loaded rocket (the carrier had used them all)', (ma.guns & 16) !== 0 && ma.mag[4] === 1 && ma.reserve[4] === 0, `mag=${ma.mag[4]} res=${ma.reserve[4]}`);
  }
}

// ---- Lobby browser: RoomManager.list() ----
{
  console.log('\nlobby list');
  const mgr = new RoomManager();
  check('an empty server lists nothing', mgr.list().length === 0);
  const open = mgr.create({ ...DEFAULT_RULES, bots: 2 })!;
  const hostId = open.join(new FakeConn(), 'Boss')!;
  const hidden = mgr.create({ ...DEFAULT_RULES, listed: 0 })!;
  hidden.join(new FakeConn(), 'Ghost');
  const solo = mgr.create(RANGE_RULES)!;
  solo.join(new FakeConn(), 'Lonely');
  mgr.create(DEFAULT_RULES);
  const rows = mgr.list();
  const row = rows[0];
  check('only the listed, hosted, non-range room is shown', rows.length === 1 && row?.code === open.code, JSON.stringify(rows.map((r) => r.code)));
  check('the row carries host, counts, rules and capacity', row?.host === 'Boss' && row.humans === 1 && row.bots === 2 && row.capacity === MAX_PLAYERS && row.rules.bots === 2, JSON.stringify(row));
  check('a room nobody entered yet is in the lobby phase', row?.phase === 'lobby');
  open.enter(hostId);
  check('after the host enters it is in play', mgr.list()[0]?.phase === 'play');
  open.phase = 'over';
  check('during the intermission it says so', mgr.list()[0]?.phase === 'over');
  open.phase = 'play';
  check('a room with only bots to spare is still joinable', mgr.list()[0]?.joinable === true);
  const full = mgr.create({ ...DEFAULT_RULES, bots: 0 })!;
  for (let i = 0; i < MAX_PLAYERS; i++) full.join(new FakeConn(), `P${i}`);
  check('a room full of humans is listed but not joinable', mgr.list().find((r) => r.code === full.code)?.joinable === false);
  check('sanitizeRules keeps listed 0/1 and defaults the rest to listed', sanitizeRules({ ...DEFAULT_RULES, listed: 0 }).listed === 0 && sanitizeRules({ ...DEFAULT_RULES, listed: 5 }).listed === 1 && sanitizeRules({}).listed === 1);
}

// ---------------------------------------------------------------- the A4 paper: always owned, two swings, light

{
  const paper = WEAPONS[5]!;
  const melee = paper.melee!;
  check('the paper is a melee weapon with no ammo', melee !== undefined && paper.magSize === 0 && paper.maxReserve === 0);
  check('two slashes kill from full health, one does not', melee.slash.damage * 2 >= MAX_HP && melee.slash.damage < MAX_HP);
  check('the heavy stab kills in one hit, from a narrower cone but a longer reach', melee.heavy.damage >= MAX_HP && melee.heavy.halfArc < melee.slash.halfArc && melee.heavy.reach > melee.slash.reach);
  check('the heavy stab winds up longer and recovers longer', melee.heavy.windup > melee.slash.windup && melee.heavy.interval > melee.slash.interval);
  check('the paper is light: faster than walking with anything else', (paper.moveMul ?? 1) > 1 && WEAPONS.every((w, i) => i === 5 || (w.moveMul ?? 1) <= 1));
  check('the paper has no zoom', paper.zoom === 1);

  for (const [label, rules] of [['pistol only', DEFAULT_RULES], ['full arsenal', FULL_RULES], ['range', RANGE_RULES]] as const) {
    const { room, add } = makeRoom([FLOOR], [], [], rules);
    const a = add('Owner');
    warm(room);
    check(`${label}: everyone spawns owning the paper`, (mut(room, a.id).guns & 32) !== 0);
  }

  // Swinging: the slash, ammo, credit.
  {
    const { room, add } = makeRoom([FLOOR], [], [], DEFAULT_RULES);
    const a = add('Cutter');
    const b = add('Victim');
    warm(room);
    const m = mut(room, a.id);
    m.weapon = 5;
    place(room, a.id, 0, 0, 0, 0);
    place(room, b.id, 0, -1.5, 0, 0);
    const mb = mut(room, b.id);
    const ammoBefore = [...m.mag, ...m.reserve].join();
    run(room, a, 1, { keys: Key.Fire });
    check('the click starts a wind-up that has not hurt anyone yet', mb.hp === MAX_HP && a.conn.events().some((e) => e.k === 'melee' && e.r === 0 && !e.heavy));
    idle(room, melee.slash.windup + 2);
    check('the slash lands and takes half the health', mb.hp === MAX_HP - melee.slash.damage, `hp=${mb.hp}`);
    check('it announces a hit on the victim', a.conn.events().some((e) => e.k === 'melee' && e.r === 1 && e.to === b.id));
    check('no ammo is spent', [...m.mag, ...m.reserve].join() === ammoBefore);
    run(room, a, 1, { keys: 0 });
    idle(room, melee.slash.interval + 2);
    run(room, a, 1, { keys: Key.Fire });
    idle(room, melee.slash.windup + 2);
    check('the second slash kills', !mb.alive, `hp=${mb.hp}`);
    check('the kill is credited to the paper', a.conn.events().some((e) => e.k === 'kill' && e.w === 5 && e.by === a.id && e.to === b.id));
    check('the paper is never dropped as a loot gun', !a.conn.events().some((e) => e.k === 'lootDrop' && e.w === 5));
  }

  // The cone and the reach.
  {
    const { room, add } = makeRoom([FLOOR], [], [], DEFAULT_RULES);
    const a = add('Cutter');
    const b = add('Victim');
    warm(room);
    mut(room, a.id).weapon = 5;
    const mb = mut(room, b.id);
    const swing = (bx: number, bz: number, keys: number) => {
      mb.hp = MAX_HP;
      mb.alive = true;
      place(room, a.id, 0, 0, 0, 0);
      place(room, b.id, bx, bz, 0, 0);
      idle(room, 80);
      run(room, a, 1, { keys });
      run(room, a, 1, { keys: 0 });
      idle(room, 40);
      return mb.hp;
    };
    check('a target within reach is cut', swing(0, -1.5, Key.Fire) < MAX_HP);
    check('a target beyond reach is missed', swing(0, -3.5, Key.Fire) === MAX_HP);
    check('a target behind is missed', swing(0, 1.5, Key.Fire) === MAX_HP);
    check('a target far off to the side is missed', swing(2.0, -0.1, Key.Fire) === MAX_HP);
    check('a target just off-centre is still cut', swing(0.8, -1.4, Key.Fire) < MAX_HP);
    check('the heavy stab kills in one hit', swing(0, -1.8, Key.Aim) <= 0);
    check('the heavy stab misses what the slash would catch off to the side', swing(1.2, -1.2, Key.Aim) === MAX_HP);
    check('the heavy stab reaches further than the slash', swing(0, -2.5, Key.Aim) <= 0 && swing(0, -2.5, Key.Fire) === MAX_HP);
  }

  // A wall in the way.
  {
    const WALL: Aabb = { minX: -3, maxX: 3, minY: 0, maxY: 4, minZ: -1.1, maxZ: -1.0 };
    const { room, add } = makeRoom([FLOOR, WALL], [], [], DEFAULT_RULES);
    const a = add('Cutter');
    const b = add('Victim');
    warm(room);
    mut(room, a.id).weapon = 5;
    const mb = mut(room, b.id);
    place(room, a.id, 0, 0, 0, 0);
    place(room, b.id, 0, -1.8, 0, 0);
    run(room, a, 1, { keys: Key.Fire });
    idle(room, melee.slash.windup + 2);
    check('a wall between them stops the swing', mb.hp === MAX_HP);
  }

  // Dodging the wind-up, and switching away.
  {
    const { room, add } = makeRoom([FLOOR], [], [], DEFAULT_RULES);
    const a = add('Cutter');
    const b = add('Victim');
    warm(room);
    mut(room, a.id).weapon = 5;
    const mb = mut(room, b.id);
    place(room, a.id, 0, 0, 0, 0);
    place(room, b.id, 0, -1.8, 0, 0);
    run(room, a, 1, { keys: Key.Aim });
    run(room, a, 1, { keys: 0 });
    idle(room, 10);
    place(room, b.id, 4, -1.8, 0, 0); // steps out of the cone during the wind-up
    idle(room, melee.heavy.windup);
    check('stepping away during the heavy wind-up dodges it', mb.hp === MAX_HP);
    check('the miss is announced', a.conn.events().some((e) => e.k === 'melee' && e.heavy && e.r === 2));

    place(room, b.id, 0, -1.8, 0, 0);
    idle(room, melee.heavy.interval);
    run(room, a, 1, { keys: Key.Aim });
    run(room, a, 3, { keys: 0, weapon: 0 });
    idle(room, melee.heavy.windup + 4);
    check('switching weapons cancels the swing', mb.hp === MAX_HP);
  }

  // Flooding the click gains nothing.
  {
    const { room, add } = makeRoom([FLOOR], [], [], DEFAULT_RULES);
    const a = add('Cutter');
    const b = add('Victim');
    warm(room);
    mut(room, a.id).weapon = 5;
    place(room, a.id, 0, 0, 0, 0);
    place(room, b.id, 0, -1.5, 0, 0);
    const t0 = room.tick;
    for (let i = 0; i < melee.slash.interval * 2; i++) run(room, a, 1, { keys: i % 2 ? Key.Fire : 0 });
    const starts = a.conn.events().filter((e) => e.k === 'melee' && e.r === 0).length;
    check('swings start no faster than the interval', starts <= Math.ceil((room.tick - t0) / melee.slash.interval) && starts >= 1, `starts=${starts} ticks=${room.tick - t0}`);
  }

  // Lighter in the hand.
  {
    const speedOf = (weapon: number) => {
      const s = newPlayerState(0, 0, 0);
      const cmd = { keys: Key.Forward, yaw: 0, pitch: 0, weapon };
      for (let i = 0; i < 60; i++) stepMovement(s, cmd, TICK_DT, [FLOOR]);
      return Math.hypot(s.vx, s.vz);
    };
    check('walking with the paper is faster than with the pistol', speedOf(5) > speedOf(0) * 1.1, `${speedOf(5)} vs ${speedOf(0)}`);
  }
}

// ---------------------------------------------------------------- falling off a map with a void

{
  /** A 10 x 10 m roof in the void: walk off an edge and you fall below `killY`. */
  const ROOF: Aabb = { minX: -5, maxX: 5, minY: -1, maxY: 0, minZ: -5, maxZ: 5 };
  const roomOnRoof = () => {
    const room = new Room('FALL', { seed: 3, solids: [ROOF], spawns: [[0, 0], [1, 1], [-1, 1], [1, -1]], pickups: [], doors: [], rules: FULL_RULES, killY: -8 });
    const add = (name: string): Who => {
      const conn = new FakeConn();
      const id = room.join(conn, name)!;
      room.enter(id);
      return { id, conn };
    };
    return { room, add };
  };
  /** Faces +x and walks east from `x` until the player has fallen (or 150 ticks pass). */
  const walkOff = (room: Room, who: Who, x: number) => {
    place(room, who.id, x, 0, -Math.PI / 2);
    run(room, who, 150, { keys: Key.Forward, yaw: -Math.PI / 2 });
  };

  {
    const { room, add } = roomOnRoof();
    const a = add('Alice');
    warm(room);
    walkOff(room, a, 4);
    const me = room.inspect(a.id)!;
    check('walking off the roof kills the player', !me.alive && me.deaths === 1);
    const ev = a.conn.events().find((e) => e.k === 'kill');
    check('the fall is a kill event with weapon "fall" and no killer', ev?.k === 'kill' && ev.w === 'fall' && ev.by === ev.to && !ev.head, JSON.stringify(ev));
    check('a plain fall costs no kill score', me.kills === 0);
    check('a fall drops no loot bag', room.loot.length === 0);
    idle(room, RESPAWN_TICKS);
    check('the faller respawns on the roof', room.inspect(a.id)!.alive && room.inspect(a.id)!.state.y > -1);
  }
  {
    // Spawn protection must not keep a faller alive forever.
    const { room, add } = roomOnRoof();
    const a = add('Alice');
    walkOff(room, a, 4);
    check('spawn protection does not stop a fall death', !room.inspect(a.id)!.alive);
  }
  {
    const { room, add } = roomOnRoof();
    const a = add('Alice');
    const b = add('Bob');
    warm(room);
    damage(room, room.inspect(b.id)!, 10, room.inspect(a.id)!, 0, false);
    walkOff(room, b, 4);
    const ev = b.conn.events().find((e) => e.k === 'kill' && e.w === 'fall');
    check('pushing someone off credits the one who hurt them', room.inspect(a.id)!.kills === 1 && ev?.k === 'kill' && ev.by === a.id && ev.to === b.id, JSON.stringify(ev));
    check('the pushed player still counts the death', room.inspect(b.id)!.deaths === 1 && room.inspect(b.id)!.kills === 0);
  }
  {
    const { room, add } = roomOnRoof();
    const a = add('Alice');
    const b = add('Bob');
    warm(room);
    damage(room, room.inspect(b.id)!, 10, room.inspect(a.id)!, 0, false);
    idle(room, FALL_CREDIT_TICKS + 30);
    walkOff(room, b, 4);
    check('an old hit no longer counts as a push', !room.inspect(b.id)!.alive && room.inspect(a.id)!.kills === 0);
  }
  {
    const { room, add } = roomOnRoof();
    const a = add('Alice');
    const b = add('Bob');
    warm(room);
    place(room, a.id, 0, 0);
    place(room, b.id, 2, 0);
    run(room, a, 60);
    check('staying on the roof is safe', room.inspect(a.id)!.alive && room.inspect(b.id)!.alive);
  }
  {
    const office = new Room('OFFC', { seed: 1 });
    const dc = new Room('DCTR', { seed: 1, rules: { ...DEFAULT_RULES, map: 1 } });
    check('the Office and the Data Center have no void', office.killY === null && dc.killY === null);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log('test:sim OK');
