/**
 * Which screen the app shows. The plain TypeScript game and session code write to it; the React screens read it.
 */
import type { JoinedMsg, PlayerInfo } from '@shared/net/protocol';
import { createStore, useStore } from './hooks/store';

/** The room the player is in (null while on the main menu). */
export interface RoomView {
  /** The server's welcome message: your id, the room code and the rules. */
  joined: JoinedMsg;
  /** Address friends can open to join. */
  lanUrl: string;
  /** Everyone in the room, kept up to date from roster messages. */
  players: readonly PlayerInfo[];
}

/** State shared by all screens. */
export interface AppState {
  room: RoomView | null;
  settingsOpen: boolean;
  /** Whether the pointer is locked, that is, whether the player is actually playing. */
  locked: boolean;
  /** The map stays hidden until the first entry, so the room screen shows nothing of the game. */
  covered: boolean;
  /** False while the one-time graphics calibration runs; the Enter button waits for it. */
  ready: boolean;
  /** Whether the player already pressed "Enter the office" (then the room screen is the pause menu). */
  entered: boolean;
  /** The connection to the server was lost. */
  disconnected: boolean;
  /** The host closed the room from the podium screen; everyone is sent back to the main menu. */
  closedByHost: boolean;
}

/** The app-wide store. */
export const appStore = createStore<AppState>({
  room: null, settingsOpen: false, locked: false, covered: true, ready: true, entered: false, disconnected: false,
  closedByHost: false,
});

/** Reads the app state in a component. */
export function useApp(): AppState {
  return useStore(appStore);
}
