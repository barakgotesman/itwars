/**
 * Input handling and movement: queues each client's per-tick commands and feeds them to the shared
 * movement code at no more than the tick rate, so flooding the server gives no speed advantage.
 */
import { TICK_DT } from '@shared/core/constants';
import { stepMovement, type InputCmd } from '@shared/core/physics';
import type { InputMsg } from '@shared/net/protocol';
import type { Player } from './player';
import type { Sim } from './state';

/** Longest input backlog kept per player; older inputs are dropped when exceeded. */
const MAX_QUEUE = 12;
/** Most spare steps a player can bank by starving, to catch up after jitter without speed-hacking. */
const MAX_CATCHUP_CREDIT = 3;

/**
 * Queues one validated input command for the next ticks.
 * @param p - The sender.
 * @param msg - Validated input message.
 */
export function queueInput(p: Player, msg: InputMsg): void {
  p.queue.push(msg);
  if (p.queue.length > MAX_QUEUE) p.queue.splice(0, p.queue.length - MAX_QUEUE);
}

/**
 * Consumes this tick's input(s). One per tick, plus one banked catch-up step if the player
 * starved earlier, so long-run speed can never exceed the tick rate.
 */
export function applyInputs(sim: Sim, p: Player): void {
  if (p.queue.length === 0) {
    p.credit = Math.min(p.credit + 1, MAX_CATCHUP_CREDIT);
    return;
  }
  let steps = 1;
  if (p.queue.length > 1 && p.credit > 0) {
    steps = 2;
    p.credit--;
  }
  for (let i = 0; i < steps; i++) {
    const msg = p.queue.shift();
    if (!msg) break;
    p.lastCmd = msg;
    p.ack = msg.seq;
    if (p.alive) stepMovement(p.state, msg as InputCmd, TICK_DT, sim.solids);
  }
}
