/**
 * The server-side record of one player and the connection it talks through.
 */
import { MAX_HP } from '@shared/core/constants';
import { newPlayerState, type PlayerState } from '@shared/core/physics';
import type { InputMsg, S2C } from '@shared/net/protocol';

/** Where a room sends its messages; the network layer or a test supplies it. */
export interface Conn {
  /** Delivers one message to the player. */
  send(msg: S2C): void;
}

/** Full server-side player record. */
export interface Player {
  id: number;
  name: string;
  model: number;
  color: number;
  /** Spray-paint design, index into `SPRAYS`. */
  spray: number;
  /** Server-controlled bot: set only by server code, never from the network. Its `conn` drops every message. */
  bot: boolean;
  /** A shooting-range target: paces sideways on a fixed line and never fires back (see `range-dummy.ts`). */
  rangeDummy?: { z: number; amp: number; speed: number; phase: number };
  conn: Conn;
  state: PlayerState;
  hp: number;
  alive: boolean;
  /** False until the player enters the map; lobby players are not spawned, drawn, hit or able to pick things up. */
  playing: boolean;
  kills: number;
  deaths: number;
  weapon: number;
  /** Bitmask of owned guns (bit `w` = weapon `w`); see `arsenal.ts`. */
  guns: number;
  mag: number[];
  reserve: number[];
  gren: number[];
  /** Tick the current reload completes, 0 when not reloading. */
  reloadEnd: number;
  nextFire: number;
  nextThrow: number;
  /** Tick the player may spray again. */
  sprayReadyAt: number;
  /** Semi-auto trigger pull waiting for the weapon to be ready. */
  fireLatch: boolean;
  /** Melee click waiting for the weapon to be ready: 0 none, 1 slash (left), 2 heavy (right). */
  meleeWant: 0 | 1 | 2;
  /** Swing in progress: the tick it lands (0 = none) and whether it is the heavy one. */
  meleeAt: number;
  meleeHeavy: boolean;
  protectUntil: number;
  /** Who last damaged this player and when (tick), so a fall off the map can credit the one who pushed them. -1 = nobody. */
  lastHurtBy: number;
  lastHurtTick: number;
  respawnAt: number;
  blindEnd: number;
  blindMax: number;
  queue: InputMsg[];
  lastCmd: InputMsg | null;
  prevKeys: number;
  ack: number;
  credit: number;
}

/**
 * Creates a player who has joined the room but not yet entered the map.
 * @param id - Room-unique player id.
 * @param name - Already-unique callsign.
 * @param conn - Where to send this player's messages.
 * @param model - Character style index.
 * @param color - Shirt colour as 0xRRGGBB.
 * @param spray - Spray-paint design index.
 * @param bot - True for a server-controlled bot.
 */
export function newPlayer(id: number, name: string, conn: Conn, model: number, color: number, spray = 0, bot = false): Player {
  return {
    id, name, conn, model, color, spray, bot, sprayReadyAt: 0,
    state: newPlayerState(0, 0, 0), hp: MAX_HP, alive: false, playing: false, kills: 0, deaths: 0, weapon: 0, guns: 0,
    mag: [], reserve: [], gren: [], reloadEnd: 0, nextFire: 0, nextThrow: 0, fireLatch: false,
    meleeWant: 0, meleeAt: 0, meleeHeavy: false, protectUntil: 0, lastHurtBy: -1, lastHurtTick: 0, respawnAt: 0, blindEnd: 0, blindMax: 0, queue: [], lastCmd: null, prevKeys: 0,
    ack: 0, credit: 0,
  };
}
