/**
 * The fixed-step game loop: steps every room at 60 Hz. A short timer plus an accumulator keeps the rate
 * without drifting the way `setInterval(16.67)` would. It also times each tick and warns when the server is
 * too slow, because a tick that overruns 16.6 ms delays every player in every room.
 */
import { TICK_DT } from '@shared/core/constants';
import type { RoomManager } from './rooms/manager';

/** Cap on catch-up steps if the event loop stalls, so a hiccup cannot spiral. */
const MAX_STEPS_PER_FRAME = 5;
/** Ticks per timing report window (10 s). */
const WINDOW_TICKS = 600;
/** Targets from the capacity plan: average tick under 5 ms and the slowest 1% under 10 ms. */
const WARN_AVG_MS = 5;
const WARN_P99_MS = 10;
/** Minimum seconds between two warnings, so an overloaded server does not flood its own log. */
const WARN_EVERY_S = 60;

/**
 * Collects tick durations and reports when a window of them is over budget.
 * @remarks Exported so the benchmark and tests can reuse the same arithmetic.
 */
export class TickMonitor {
  private window: number[] = [];
  private lastWarn = -Infinity;

  /**
   * Records one tick.
   * @param ms - How long the tick took.
   * @param now - Current time in seconds (for the warning rate limit).
   * @param describe - Builds the "N rooms, M bots" part of the message; only called when warning.
   * @returns The warning text when this window was over budget and a warning is due, otherwise null.
   */
  record(ms: number, now: number, describe: () => string): string | null {
    this.window.push(ms);
    if (this.window.length < WINDOW_TICKS) return null;
    const sorted = [...this.window].sort((a, b) => a - b);
    this.window = [];
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
    if ((avg <= WARN_AVG_MS && p99 <= WARN_P99_MS) || now - this.lastWarn < WARN_EVERY_S) return null;
    this.lastWarn = now;
    return `Server is running slow: tick avg ${avg.toFixed(1)} ms, p99 ${p99.toFixed(1)} ms, max ${sorted[sorted.length - 1]!.toFixed(1)} ms (${describe()}). ` +
      'Players may lag; the server is overloaded, so use fewer bots or rooms.';
  }
}

/**
 * Starts stepping all rooms.
 * @param rooms - The registry of live rooms.
 */
export function startLoop(rooms: RoomManager): void {
  let last = performance.now();
  let acc = 0;
  const monitor = new TickMonitor();
  setInterval(() => {
    const now = performance.now();
    acc += (now - last) / 1000;
    last = now;
    let steps = 0;
    while (acc >= TICK_DT && steps < MAX_STEPS_PER_FRAME) {
      const t0 = performance.now();
      for (const room of rooms.all()) room.step();
      const warning = monitor.record(performance.now() - t0, now / 1000, () => `${rooms.count} rooms, ${rooms.humanCount} players, ${rooms.botCount} bots`);
      if (warning) console.warn(warning);
      acc -= TICK_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  }, 4);
}
