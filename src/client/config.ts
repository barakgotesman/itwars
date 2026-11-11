/**
 * Where the game server lives. By default the page's own origin (the Node server serves the client, or Vite
 * proxies to it in dev). Set `VITE_SERVER_URL` at build time (e.g. `https://play.example.com`) to host the
 * client on a different address than the server.
 */
const configured = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();

/** Base HTTP URL of the game server, without a trailing slash. */
export const SERVER_HTTP: string = configured ? configured.replace(/\/+$/, '') : location.origin;

/** WebSocket URL of the game endpoint. */
export const SERVER_WS: string = `${SERVER_HTTP.replace(/^http/, 'ws')}/ws`;
