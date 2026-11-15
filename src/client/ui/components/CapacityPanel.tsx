/**
 * What the server measured about itself and how much of it is free, as the one line the Game setup screen shows
 * under the Bots row (and the same figures spelled out for its tooltip).
 */
import type { ServerStatus } from '@shared/net/info';

/**
 * One short line, and whether it is a limit worth the host's attention.
 * @param capacity - The server's status from `/api/info`.
 */
export function capacityNote(capacity: ServerStatus): { text: string; warn: boolean } {
  const pct = Math.round(capacity.load * 100);
  const limited = capacity.botsAvailable < 7;
  return {
    text: limited
      ? `Server is ${pct}% busy: up to ${capacity.botsAvailable} bots right now. Players who join take priority over bots.`
      : `Server is ${pct}% busy: room for a full set of bots.`,
    warn: limited,
  };
}
