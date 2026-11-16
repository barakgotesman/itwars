/**
 * The small JSON API: `/api/info` tells the menu this machine's LAN addresses so it can show friends where to connect, and
 * `/api/rooms` lists the open rooms for the lobby browser.
 */
import type { ServerResponse } from 'node:http';
import { MAX_PLAYERS } from '@shared/core/constants';
import type { InfoResponse, RoomListResponse, RoomSummary, ServerStatus } from '@shared/net/info';
import { lanAddresses } from './lan';

/**
 * Writes the `/api/info` response.
 * @param res - The HTTP response.
 * @param port - The port the server listens on.
 * @param status - Rooms, players, bots and what the server can still take (from the startup capacity check).
 */
export function sendInfo(res: ServerResponse, port: number, status: ServerStatus): void {
  const body: InfoResponse = { name: 'IT Wars', port, lan: lanAddresses(), maxPlayers: MAX_PLAYERS, rooms: status.rooms, status };
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/**
 * Writes the `/api/rooms` response: the rooms the lobby browser lists.
 * @param res - The HTTP response.
 * @param rooms - Listed rooms from `RoomManager.list`.
 */
export function sendRooms(res: ServerResponse, rooms: RoomSummary[]): void {
  const body: RoomListResponse = { rooms };
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
