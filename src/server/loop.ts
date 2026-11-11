/**
 * The fixed-step game loop: steps every room at 60 Hz. A short timer plus an accumulator keeps the rate
 * without drifting the way `setInterval(16.67)` would.
 */
import { TICK_DT } from '@shared/core/constants';
import type { RoomManager } from './rooms/manager';

/** Cap on catch-up steps if the event loop stalls, so a hiccup cannot spiral. */
const MAX_STEPS_PER_FRAME = 5;

/**
 * Starts stepping all rooms.
 * @param rooms - The registry of live rooms.
 */
export function startLoop(rooms: RoomManager): void {
  let last = performance.now();
  let acc = 0;
  setInterval(() => {
    const now = performance.now();
    acc += (now - last) / 1000;
    last = now;
    let steps = 0;
    while (acc >= TICK_DT && steps < MAX_STEPS_PER_FRAME) {
      for (const room of rooms.all()) room.step();
      acc -= TICK_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  }, 4);
}
