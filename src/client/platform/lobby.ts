/**
 * Talking to the server before a room exists: hosting or joining, and asking `/api/info` what the server
 * can take and where friends can reach it. Used by the Menu screen.
 */
import type { InfoResponse } from '@shared/net/info';
import type { ErrorMsg, HostMsg, JoinedMsg, JoinMsg } from '@shared/net/protocol';
import { SERVER_HTTP } from '@client/config';
import { Net } from './net';

/** Player-facing text for each server error. */
export const ERROR_TEXT: Record<ErrorMsg['reason'], string> = {
  'bad-code': 'No room with that code. Check it and try again.',
  'room-full': 'That room is full.',
  'server-full': 'This server is at its limit right now. Try again in a moment.',
  'bad-request': 'The server did not understand the request.',
  'rate-limit': 'Too many requests. Slow down.',
};

/** What `/api/info` tells the menu. */
export type ServerInfo = InfoResponse;

/** Sends a host/join request on a fresh connection and waits for the reply. */
export function request(msg: HostMsg | JoinMsg): Promise<{ net: Net; joined: JoinedMsg }> {
  return Net.connect().then((net) => new Promise((resolve, reject) => {
    const off = net.on((m) => {
      if (m.t === 'joined') {
        off();
        resolve({ net, joined: m });
      } else if (m.t === 'error') {
        off();
        net.close();
        reject(new Error(ERROR_TEXT[m.reason]));
      }
    });
    net.send(msg);
  }));
}

/** Asks the server what it can take and where friends can reach it. */
export function fetchInfo(): Promise<ServerInfo | null> {
  return fetch(`${SERVER_HTTP}/api/info`).then((r) => r.json() as Promise<ServerInfo>).catch(() => null);
}
