/**
 * Shared helpers for the headless simulation tests: a fake connection, a room builder and small drivers
 * (`run`, `idle`, `place`) so `sim-test.ts` and `bots-test.ts` set scenes up the same way.
 */
import type { Aabb } from '@shared/core/physics';
import type { GameEvent, S2C, SnapMsg } from '@shared/net/protocol';
import type { MatchRules } from '@shared/rules/modes';
import type { DoorDef } from '@shared/world/map/door-layout';
import { Room, type Conn } from '@server/rooms/room';

/** Fake connection that stores everything it receives. */
export class FakeConn implements Conn {
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

export const FLOOR: Aabb = { minX: -500, maxX: 500, minY: -1, maxY: 0, minZ: -500, maxZ: 500 };
export const SPAWNS: [number, number][] = [[0, 0], [20, 20], [-20, 20], [20, -20]];

export interface Mutable {
  state: { x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number; pitch: number };
  hp: number; kills: number; alive: boolean; mag: number[]; reserve: number[]; gren: number[];
}

/** New empty room with a floor, plus a helper to add players with fake connections. */
export function makeRoom(solids: Aabb[] = [FLOOR], pickups: { kind: 'hp' | 'ammo' | 'grenade'; x: number; z: number }[] = [], doors: DoorDef[] = [], rules?: MatchRules) {
  const room = new Room('TEST', { seed: 7, solids, spawns: SPAWNS, pickups, doors, rules });
  const add = (name: string) => {
    const conn = new FakeConn();
    const id = room.join(conn, name)!;
    room.enter(id);
    return { id, conn };
  };
  return { room, add };
}

export type Who = { id: number; conn: FakeConn };

/** Edits a player's internal state directly (tests only). */
export const mut = (room: Room, id: number) => room.inspect(id) as unknown as Mutable;

/** Moves a player to a spot and view direction. */
export function place(room: Room, id: number, x: number, z: number, yaw = 0, pitch = 0): void {
  const s = mut(room, id).state;
  Object.assign(s, { x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw, pitch });
}

/**
 * Feeds `n` ticks of the same input to a player and steps the room each time.
 * @remarks Switches weapon first (waiting out the switch delay) so tests can name the gun they want, and
 * finishes on a snapshot tick so `conn.events()` is up to date.
 */
export function run(room: Room, who: Who, n: number, cmd: { keys?: number; yaw?: number; pitch?: number; weapon?: number } = {}): void {
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
export function idle(room: Room, n: number): void {
  for (let i = 0; i < n; i++) room.step();
}

/** Lets spawn protection expire. */
export const warm = (room: Room) => idle(room, 130);

/** Pitch that points from eye height at a target `dist` away, `h` above the feet. */
export const aimPitch = (dist: number, h: number) => Math.atan2(h - 1.62, dist);
