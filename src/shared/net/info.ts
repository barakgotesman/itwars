/**
 * The wire shape of `/api/info`: what the server can still take, and where friends can reach it. Used by
 * `server/http/api.ts` (writes it), `server/rooms/manager.ts` (computes `ServerStatus`) and the client menu
 * and setup screen (reads it to grey out bot counts and show capacity).
 */

/** What the server can still take, measured on the machine it runs on. */
export interface ServerStatus {
  rooms: number;
  humans: number;
  bots: number;
  /** Share (0-1) of the budget in use. */
  load: number;
  /** Bots a room hosted right now could get (after the host's own seat). */
  botsAvailable: number;
  /** More players that fit before the server is full. */
  playersAvailable: number;
  /** The most players, or the most bots, this server could run alone (from the startup measurement). */
  maxPlayers: number;
  maxBots: number;
}

/** The full `/api/info` response body. */
export interface InfoResponse {
  name: string;
  port: number;
  /** This machine's LAN addresses, real adapters first. */
  lan: string[];
  maxPlayers: number;
  rooms: number;
  status: ServerStatus;
}
