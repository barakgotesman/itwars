/**
 * Server entry: one Node process serving the built client, `/api/info`, and the game WebSocket on `/ws`.
 * Binds 0.0.0.0 so other machines on the LAN can connect, and drives all rooms at a fixed 60 Hz.
 */
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendInfo } from '@server/http/api';
import { lanAddresses } from '@server/http/lan';
import { serveStatic } from '@server/http/static';
import { SERVER_BUDGET_MS, describeCapacity, measureCapacity } from '@server/capacity';
import { startLoop } from '@server/loop';
import { createGateway } from '@server/net/gateway';
import { RoomManager } from '@server/rooms/manager';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));

// What this machine can carry: measured now, every time the server starts, so a different host gets its own limits.
const budget = Number(process.env.LOAD_BUDGET_MS) > 0 ? Number(process.env.LOAD_BUDGET_MS) : SERVER_BUDGET_MS;
const capacity = measureCapacity(undefined, undefined, budget);
console.log(describeCapacity(capacity));
const botCap = process.env.MAX_BOTS === undefined ? Infinity : Math.max(0, Number(process.env.MAX_BOTS) || 0);

const rooms = new RoomManager(capacity, botCap);

const http = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]!;
  if (path === '/api/info') sendInfo(res, PORT, rooms.status());
  else serveStatic(ROOT, path, res);
});

createGateway(http, rooms);
startLoop(rooms);

http.listen(PORT, '0.0.0.0', () => {
  console.log(`IT Wars server listening on port ${PORT}`);
  console.log(`  local:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  network: http://${ip}:${PORT}`);
  console.log('Share a network URL with players on your LAN. Windows may ask to allow Node through the firewall.');
});
