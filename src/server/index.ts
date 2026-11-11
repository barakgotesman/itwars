/**
 * Server entry: one Node process serving the built client, `/api/info`, and the game WebSocket on `/ws`.
 * Binds 0.0.0.0 so other machines on the LAN can connect, and drives all rooms at a fixed 60 Hz.
 */
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_PLAYERS, TICK_DT } from '../shared/constants';
import { parseC2S, type C2S, type HostMsg, type JoinMsg, type S2C } from '../shared/protocol';
import { lanAddresses } from './lan';
import type { Room } from './room';
import { RoomManager } from './rooms';
import { serveStatic } from './static';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
/** Largest accepted message; a real input is ~100 bytes. */
const MAX_PAYLOAD = 2048;
/** Messages per second before a client is cut off (inputs are 60/s). */
const MAX_MSG_PER_SEC = 150;
/** Cap on catch-up steps if the event loop stalls, so a hiccup cannot spiral. */
const MAX_STEPS_PER_FRAME = 5;

const rooms = new RoomManager();

/** Per-socket session: which room and player id it controls, plus its rate-limit window. */
interface Session {
  room: Room | null;
  id: number;
  windowStart: number;
  count: number;
}

const http = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]!;
  if (path === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ name: 'IT Wars', port: PORT, lan: lanAddresses(), maxPlayers: MAX_PLAYERS, rooms: rooms.count }));
    return;
  }
  serveStatic(ROOT, path, res);
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_PAYLOAD });

/** Sends a message if the socket is open. */
function send(ws: WebSocket, msg: S2C): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** Attaches the socket to a room (hosting or joining) and records the session. */
function enter(ws: WebSocket, s: Session, room: Room, msg: HostMsg | JoinMsg): void {
  const id = room.join({ send: (m) => send(ws, m) }, msg.name, { model: msg.model, color: msg.color });
  if (id === null) {
    send(ws, { t: 'error', reason: 'room-full' });
    rooms.prune(room);
    return;
  }
  s.room = room;
  s.id = id;
}

/** Handles one validated message from a socket. */
function handle(ws: WebSocket, s: Session, msg: C2S): void {
  switch (msg.t) {
    case 'host':
      if (!s.room) enter(ws, s, rooms.create(msg.rules), msg);
      break;
    case 'join': {
      if (s.room) break;
      const room = rooms.get(msg.code);
      if (!room) send(ws, { t: 'error', reason: 'bad-code' });
      else enter(ws, s, room, msg);
      break;
    }
    case 'enter':
      s.room?.enter(s.id);
      break;
    case 'input':
      s.room?.input(s.id, msg);
      break;
  }
}

wss.on('connection', (ws) => {
  const s: Session = { room: null, id: 0, windowStart: Date.now(), count: 0 };
  ws.on('message', (data) => {
    const now = Date.now();
    if (now - s.windowStart >= 1000) { s.windowStart = now; s.count = 0; }
    if (++s.count > MAX_MSG_PER_SEC) {
      send(ws, { t: 'error', reason: 'rate-limit' });
      ws.close(1008, 'rate limit');
      return;
    }
    let msg: C2S | null = null;
    try {
      msg = parseC2S(JSON.parse(data.toString()));
    } catch {
      // Non-JSON falls through to the bad-request reply below.
    }
    if (!msg) {
      send(ws, { t: 'error', reason: 'bad-request' });
      return;
    }
    handle(ws, s, msg);
  });
  ws.on('close', () => {
    if (!s.room) return;
    s.room.leave(s.id);
    rooms.prune(s.room);
  });
  ws.on('error', () => ws.terminate());
});

// Fixed-step loop: a short timer plus an accumulator keeps 60 Hz without drifting like setInterval(16.67).
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

http.listen(PORT, '0.0.0.0', () => {
  console.log(`IT Wars server listening on port ${PORT}`);
  console.log(`  local:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  network: http://${ip}:${PORT}`);
  console.log('Share a network URL with players on your LAN. Windows may ask to allow Node through the firewall.');
});
