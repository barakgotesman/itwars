/**
 * WebSocket connection to the game server. Same-origin `/ws`, so it works from the Node server in
 * production and through the Vite proxy in dev.
 */
import type { C2S, S2C } from '../shared/protocol';

/** Thin typed wrapper over a WebSocket that fans messages out to listeners. */
export class Net {
  private readonly listeners = new Set<(m: S2C) => void>();
  private readonly closeListeners = new Set<() => void>();

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (e) => {
      let msg: S2C;
      try {
        msg = JSON.parse(String(e.data)) as S2C;
      } catch {
        return;
      }
      for (const fn of this.listeners) fn(msg);
    });
    ws.addEventListener('close', () => {
      for (const fn of this.closeListeners) fn();
    });
  }

  /**
   * Opens the connection.
   * @returns A connected `Net`; rejects if the server cannot be reached.
   */
  static connect(): Promise<Net> {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.addEventListener('open', () => resolve(new Net(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error('Cannot reach the game server. Is it running? Start it with "npm run dev" or "npm run play".')), { once: true });
    });
  }

  /** Sends a message if the socket is open. */
  send(msg: C2S): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Subscribes to server messages. @returns A function that unsubscribes. */
  on(fn: (m: S2C) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Subscribes to the connection closing. */
  onClose(fn: () => void): void {
    this.closeListeners.add(fn);
  }

  /** Closes the connection (the server then removes the player). */
  close(): void {
    this.ws.close();
  }
}
