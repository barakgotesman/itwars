/**
 * The room session: owns the pointer-locked `Input`, the connection and the running game, and mirrors what the
 * screens need into `appStore`. React components call these functions; none of the game loop runs through React.
 */
import { startGame, type GameHandle } from '@client/game';
import { Input } from '@client/platform/input';
import type { JoinedMsg } from '@shared/net/protocol';
import type { Net } from '@client/platform/net';
import { appStore } from './app-store';
import { createHud, type Hud } from './hud/hud-store';

let canvas: HTMLCanvasElement | null = null;
let input: Input | null = null;
let net: Net | null = null;
let hud: Hud | null = null;
let game: GameHandle | null = null;

/** Gives the session the game canvas (pointer lock target); call once after the canvas is mounted. */
export function attachCanvas(el: HTMLCanvasElement): void {
  if (canvas) return;
  canvas = el;
  input = new Input(el, (locked) => {
    appStore.set(locked ? { locked, covered: false } : { locked });
    // The HUD belongs to actual play: hidden in the room screen and while paused.
    if (appStore.get().room) hud?.show(locked);
  });
}

/**
 * Shows the room screen for a joined room and starts the game behind it.
 * @param conn - The open connection.
 * @param joined - The server's welcome message.
 * @param lanUrl - Address friends can open to join.
 */
export function joinRoom(conn: Net, joined: JoinedMsg, lanUrl: string): void {
  if (!canvas || !input) throw new Error('Game canvas is not mounted');
  net = conn;
  hud = createHud(joined.code, joined.rules);
  appStore.set({ room: { joined, lanUrl, players: joined.players }, covered: true, ready: false, entered: false });
  conn.on((m) => {
    const room = appStore.get().room;
    if (m.t === 'roster' && room) appStore.set({ room: { ...room, players: m.players } });
  });
  conn.onClose(() => appStore.set({ disconnected: true }));
  game = startGame({ canvas, input, net: conn, joined, hud });
  // Graphics are measured once, right now, behind the room screen; entering waits until that is done.
  game.whenReady(() => appStore.set({ ready: true }));
}

/** "Enter the office" / "Resume": spawns the player on the first press, then takes the pointer lock. */
export function enterOffice(): void {
  if (!appStore.get().entered) {
    // Tell the server to spawn us; until now we only sat in the room lobby.
    net?.send({ t: 'enter' });
    appStore.set({ entered: true });
  }
  game?.unlockAudio();
  input?.lock();
}

/** Leaves the room and returns to a fresh menu. */
export function leaveRoom(): void {
  net?.close();
  location.reload();
}
