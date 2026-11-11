/**
 * The small JSON API: `/api/info` tells the menu this machine's LAN addresses so it can show friends where to connect.
 */
import type { ServerResponse } from 'node:http';
import { MAX_PLAYERS } from '@shared/core/constants';
import { lanAddresses } from './lan';

/**
 * Writes the `/api/info` response.
 * @param res - The HTTP response.
 * @param port - The port the server listens on.
 * @param roomCount - Number of live rooms.
 */
export function sendInfo(res: ServerResponse, port: number, roomCount: number): void {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ name: 'IT Wars', port, lan: lanAddresses(), maxPlayers: MAX_PLAYERS, rooms: roomCount }));
}
