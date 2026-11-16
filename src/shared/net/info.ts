/**
 * The wire shape of `/api/info`: what the server can still take, and where friends can reach it. Used by
 * `server/http/api.ts` (writes it), `server/rooms/manager.ts` (computes `ServerStatus`) and the client menu
 * and setup screen (reads it to grey out bot counts and show capacity).
 */
import type { MatchRules } from '@shared/rules/modes';

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

/** Where a listed room is in its life: nobody entered yet, a match running, or the post-match intermission. */
export type RoomPhase = 'lobby' | 'play' | 'over';

/** One row of the lobby browser: a joinable room as everyone on the network sees it. */
export interface RoomSummary {
  code: string;
  /** Callsign of the host. */
  host: string;
  humans: number;
  bots: number;
  /** Seats in a room. */
  capacity: number;
  rules: MatchRules;
  phase: RoomPhase;
  /** False when the room is full of humans or the server has no capacity left. */
  joinable: boolean;
}

/** The `/api/rooms` response body. */
export interface RoomListResponse {
  rooms: RoomSummary[];
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
