/**
 * Server capacity benchmark: steps R rooms with P scripted human players on the real office map and reports
 * the cost of one server tick (all rooms together) against the 16.6 ms budget.
 * Run with `npm run bench [-- rooms players ticks bots skill]`, e.g. `npm run bench -- 4 1 3600 7 3`
 * (4 rooms, 1 human + 7 Hard bots each). With no arguments it prints a table of rooms x bots.
 */
import { Key, TICK_RATE } from '@shared/core/constants';
import { DEFAULT_RULES, type MatchRules } from '@shared/rules/modes';
import type { S2C } from '@shared/net/protocol';
import { Room, type Conn } from '@server/rooms/room';

/** Milliseconds one tick may take at the tick rate. */
const BUDGET_MS = 1000 / TICK_RATE;
/** Tick-time targets from the capacity plan: a spike must never delay the next tick. */
const TARGET_AVG_MS = 5;
const TARGET_P99_MS = 10;

/** Connection that serialises like the real gateway does, so the cost of JSON is included. */
class JsonConn implements Conn {
  bytes = 0;
  send(msg: S2C): void {
    this.bytes += JSON.stringify(msg).length;
  }
}

/** Small deterministic generator so runs are comparable. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** One scripted human: wanders, turns, fires in bursts and throws grenades now and then. */
interface Script {
  room: Room;
  id: number;
  seq: number;
  yaw: number;
  keys: number;
  until: number;
}

/**
 * Runs the benchmark for one configuration.
 * @param rooms - Number of rooms.
 * @param players - Humans per room.
 * @param ticks - Ticks to simulate after a warm-up.
 * @param rules - Match rules for every room (bot counts etc.).
 * @returns Per-tick durations in ms, and total bytes sent.
 */
export function bench(rooms: number, players: number, ticks: number, rules: MatchRules = DEFAULT_RULES): { ms: number[]; bytes: number } {
  const rng = lcg(1234);
  const all: Room[] = [];
  const scripts: Script[] = [];
  const conns: JsonConn[] = [];
  for (let r = 0; r < rooms; r++) {
    const room = new Room(`B${r}`, { seed: 100 + r, rules });
    all.push(room);
    for (let p = 0; p < players; p++) {
      const conn = new JsonConn();
      conns.push(conn);
      const id = room.join(conn, `P${p}`)!;
      room.enter(id);
      scripts.push({ room, id, seq: 0, yaw: rng() * 6.28, keys: 0, until: 0 });
    }
  }

  const feed = (tick: number): void => {
    for (const s of scripts) {
      if (tick >= s.until) {
        s.until = tick + 20 + Math.floor(rng() * 60);
        s.yaw += (rng() - 0.5) * 2;
        s.keys = Key.Forward | (rng() < 0.4 ? Key.Left : 0) | (rng() < 0.3 ? Key.Right : 0) | (rng() < 0.2 ? Key.Sprint : 0) |
          (rng() < 0.5 ? Key.Fire : 0) | (rng() < 0.1 ? Key.Jump : 0) | (rng() < 0.05 ? Key.Grenade1 : 0) | (rng() < 0.05 ? Key.Interact : 0);
      }
      s.room.input(s.id, { t: 'input', seq: ++s.seq, keys: s.keys, yaw: s.yaw, pitch: 0, weapon: 1 + (Math.floor(tick / 600) % 3) });
    }
  };

  for (let t = 0; t < 120; t++) {
    feed(t);
    for (const room of all) room.step();
  }
  const ms: number[] = [];
  for (let t = 120; t < 120 + ticks; t++) {
    feed(t);
    const t0 = performance.now();
    for (const room of all) room.step();
    ms.push(performance.now() - t0);
  }
  return { ms, bytes: conns.reduce((a, c) => a + c.bytes, 0) };
}

/** Average, 99th percentile and max of a list of durations. */
export function stats(ms: readonly number[]): { avg: number; p99: number; max: number } {
  const sorted = [...ms].sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  return { avg, p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0, max: sorted[sorted.length - 1] ?? 0 };
}

/** Prints one result row. */
function report(label: string, ms: readonly number[], bytes: number, ticks: number): void {
  const s = stats(ms);
  const ok = s.avg <= TARGET_AVG_MS && s.p99 <= TARGET_P99_MS;
  const kbps = (bytes / (ticks / TICK_RATE) / 1024).toFixed(0);
  console.log(
    `${label.padEnd(22)} avg ${s.avg.toFixed(3)} ms  p99 ${s.p99.toFixed(3)} ms  max ${s.max.toFixed(3)} ms  ` +
    `${((s.avg / BUDGET_MS) * 100).toFixed(1)}% of a tick  ${kbps} KB/s out  ${ok ? 'OK' : 'OVER BUDGET'}`,
  );
}

// Only run when executed directly (the bot tests import `bench` and `stats`).
if (process.argv[1]?.split(String.fromCharCode(92)).join('/').endsWith('tools/bench.ts')) {
  const [r, p, t, b, k] = process.argv.slice(2).map(Number);
  console.log(`budget ${BUDGET_MS.toFixed(1)} ms/tick; targets avg <= ${TARGET_AVG_MS} ms, p99 <= ${TARGET_P99_MS} ms`);
  if (r && p) {
    const ticks = t ?? 3600;
    const rules = { ...DEFAULT_RULES, bots: b ?? 0, botSkill: k ?? 2 };
    const res = bench(r, p, ticks, rules);
    report(`${r} rooms x ${p}+${rules.bots} bots`, res.ms, res.bytes, ticks);
  } else {
    const ticks = 1800;
    for (const [humans, bots] of [[8, 0], [1, 7], [4, 4]] as const) {
      for (const rooms of [1, 4, 8, 16, 32]) {
        const res = bench(rooms, humans, ticks, { ...DEFAULT_RULES, bots, botSkill: 3 });
        report(`${rooms} rooms ${humans}h+${bots}b`, res.ms, res.bytes, ticks);
      }
    }
  }
}
