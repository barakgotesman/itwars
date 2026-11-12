/**
 * Startup capacity check. Runs short workloads of scripted players and of bots on THIS machine and works out what
 * one human and one bot cost per server tick. The room manager spends a fixed budget of tick time on those costs, so
 * the limits on players and bots always fit the hardware the server is running on, whichever machine that is today.
 * On a LAN the host usually plays on the same PC, so only part of the tick is offered.
 */
import { Key, MAX_PLAYERS, TICK_RATE } from '@shared/core/constants';
import type { S2C } from '@shared/net/protocol';
import { DEFAULT_RULES } from '@shared/rules/modes';
import { Room, type Conn } from './rooms/room';

/** Milliseconds of server time per tick the server may use: half of the 5 ms average target, so the host can still play. */
export const SERVER_BUDGET_MS = 2.5;
/** Rooms used for each measurement, and ticks to warm up and to measure. */
const SAMPLE_ROOMS = 2;
const WARM_TICKS = 60;
const MEASURE_TICKS = 300;

/** What the room manager needs to know to admit players and bots. */
export interface LoadModel {
  /** Tick time (ms) the server may spend on game simulation. */
  budgetMs: number;
  /** Tick time one human player costs, including turning snapshots into JSON. */
  msPerHuman: number;
  /** Tick time one bot costs (measured with Hard bots fighting, the expensive case). */
  msPerBot: number;
}

/** No limit at all: used by tests that are not about limits. */
export const UNLIMITED: LoadModel = { budgetMs: Infinity, msPerHuman: 0, msPerBot: 0 };

/** The load model plus what it means in plain numbers, for the console and the menu. */
export interface Capacity extends LoadModel {
  /** Players the server could host if there were no bots. */
  maxHumans: number;
  /** Bots the server could run if there were no humans. */
  maxBots: number;
}

/** Connection that serialises like the real gateway does, so that cost is counted. */
class JsonConn implements Conn {
  send(msg: S2C): void {
    JSON.stringify(msg);
  }
}

/** Small deterministic generator for the scripted players' inputs. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** One scripted human: wanders, sprints, fires and throws. */
interface Script {
  id: number;
  seq: number;
  yaw: number;
  keys: number;
  until: number;
}

/** Average server ms per tick, per room, for rooms built by `make`, with `feed` supplying input each tick. */
function timeRooms(make: (i: number) => Room, feed: (rooms: Room[], tick: number) => void, rooms: number, ticks: number): number {
  const sample = Array.from({ length: rooms }, (_, i) => make(i));
  for (let t = 0; t < WARM_TICKS; t++) {
    feed(sample, t);
    for (const r of sample) r.step();
  }
  const start = performance.now();
  for (let t = 0; t < ticks; t++) {
    feed(sample, WARM_TICKS + t);
    for (const r of sample) r.step();
  }
  return (performance.now() - start) / ticks / rooms;
}

/**
 * Measures this machine.
 * @param rooms - Rooms to run at once for each measurement (more is steadier, slower to run).
 * @param ticks - Ticks to measure after warming up.
 * @param budgetMs - Tick time the server may use.
 * @returns Cost per human and per bot, and what that allows.
 * @remarks Takes well under a second. Does not measure network bandwidth or the browser the host plays in.
 */
export function measureCapacity(rooms = SAMPLE_ROOMS, ticks = MEASURE_TICKS, budgetMs = SERVER_BUDGET_MS): Capacity {
  const rng = lcg(4242);
  const scripts = new Map<Room, Script[]>();
  const botRoom = timeRooms(
    (i) => new Room(`CAPB${i}`, {
      seed: 77 + i, rules: { ...DEFAULT_RULES, bots: MAX_PLAYERS - 1, botSkill: 3 },
      // Bots wait in the lobby for a human in a real room; this measurement is specifically the cost of
      // bots actually playing, so it skips that wait.
      botsPlayImmediately: true,
    }),
    () => undefined, rooms, ticks,
  );
  const humanRoom = timeRooms(
    (i) => {
      const room = new Room(`CAPH${i}`, { seed: 91 + i });
      scripts.set(room, Array.from({ length: MAX_PLAYERS }, (_, k) => {
        const id = room.join(new JsonConn(), `P${k}`)!;
        room.enter(id);
        return { id, seq: 0, yaw: rng() * 6.28, keys: 0, until: 0 };
      }));
      return room;
    },
    (list, tick) => {
      for (const room of list) {
        for (const s of scripts.get(room)!) {
          if (tick >= s.until) {
            s.until = tick + 20 + Math.floor(rng() * 60);
            s.yaw += (rng() - 0.5) * 2;
            s.keys = Key.Forward | (rng() < 0.4 ? Key.Left : 0) | (rng() < 0.2 ? Key.Sprint : 0) | (rng() < 0.5 ? Key.Fire : 0) |
              (rng() < 0.1 ? Key.Jump : 0) | (rng() < 0.05 ? Key.Grenade1 : 0);
          }
          room.input(s.id, { t: 'input', seq: ++s.seq, keys: s.keys, yaw: s.yaw, pitch: 0, weapon: 1 });
        }
      }
    },
    rooms, ticks,
  );
  const msPerBot = botRoom / (MAX_PLAYERS - 1);
  const msPerHuman = humanRoom / MAX_PLAYERS;
  return {
    budgetMs, msPerHuman, msPerBot,
    maxHumans: Math.floor(budgetMs / Math.max(msPerHuman, 1e-4)),
    maxBots: Math.floor(budgetMs / Math.max(msPerBot, 1e-4)),
  };
}

/** A line for the console: what was measured and what it allows. */
export function describeCapacity(c: Capacity): string {
  return `Capacity check on this machine: a player costs ${c.msPerHuman.toFixed(3)} ms and a bot ${c.msPerBot.toFixed(3)} ms of the ` +
    `${(1000 / TICK_RATE).toFixed(1)} ms tick. With a ${c.budgetMs} ms budget the server can run about ${c.maxHumans} players, ` +
    `or ${c.maxBots} bots, or a mix (players always get priority over bots). Set LOAD_BUDGET_MS to change the budget, MAX_BOTS to cap bots.`;
}
