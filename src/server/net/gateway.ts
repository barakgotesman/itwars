/**
 * WebSocket gateway: accepts game connections on `/ws`, rate-limits and validates every message, and
 * routes it to the player's room. One `Session` per socket remembers which room and player it controls.
 */
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseC2S, type C2S, type HostMsg, type JoinMsg, type S2C } from '@shared/net/protocol';
import type { Room } from '@server/rooms/room';
import type { RoomManager } from '@server/rooms/manager';

/** Largest accepted message; a real input is ~100 bytes. */
const MAX_PAYLOAD = 2048;
/** Messages per second before a client is cut off (inputs are 60/s). */
const MAX_MSG_PER_SEC = 150;

/** Per-socket session: which room and player id it controls, plus its rate-limit window. */
interface Session {
  room: Room | null;
  id: number;
  windowStart: number;
  count: number;
}

/** Sends a message if the socket is open. */
function send(ws: WebSocket, msg: S2C): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/**
 * Starts accepting game connections.
 * @param server - The HTTP server to attach the WebSocket endpoint to.
 * @param rooms - The registry of live rooms.
 */
export function createGateway(server: Server, rooms: RoomManager): void {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_PAYLOAD });

  /** Attaches the socket to a room (hosting or joining) and records the session. */
  const enter = (ws: WebSocket, s: Session, room: Room, msg: HostMsg | JoinMsg): void => {
    const id = room.join({ send: (m) => send(ws, m) }, msg.name, { model: msg.model, color: msg.color, spray: msg.spray });
    if (id === null) {
      send(ws, { t: 'error', reason: 'room-full' });
      rooms.prune(room);
      return;
    }
    s.room = room;
    s.id = id;
  };

  /** Handles one validated message from a socket. */
  const handle = (ws: WebSocket, s: Session, msg: C2S): void => {
    switch (msg.t) {
      case 'host':
        if (!s.room) {
          const room = rooms.create(msg.rules);
          if (room) enter(ws, s, room, msg);
          else send(ws, { t: 'error', reason: 'server-full' });
        }
        break;
      case 'join': {
        if (s.room) break;
        const room = rooms.get(msg.code);
        if (!room) send(ws, { t: 'error', reason: 'bad-code' });
        else if (!rooms.admit(room)) send(ws, { t: 'error', reason: 'server-full' });
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
  };

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
}
