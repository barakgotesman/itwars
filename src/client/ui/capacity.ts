/**
 * Type for what the server reports about its free capacity (`/api/info` `status`).
 */

/** What the server can still take, as `/api/info` reports it (measured on the machine the server runs on). */
export interface ServerCapacity {
  /** Bots a room hosted right now could get. */
  botsAvailable: number;
  /** More players that fit before the server is full. */
  playersAvailable: number;
  /** Share (0-1) of the server's budget in use. */
  load: number;
  /** The most players this server could run alone. */
  maxPlayers: number;
  /** The most bots this server could run alone. */
  maxBots: number;
}
