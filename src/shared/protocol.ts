/**
 * Wire protocol: typed client-to-server (C2S) and server-to-client (S2C) messages, plus the
 * validator that turns untrusted JSON into a safe C2S message.
 */
import { CHARACTERS, PLAYER_COLORS } from './characters';
import { CODE_ALPHABET, CODE_LEN, KEY_MASK, MAX_NAME_LEN, MAX_PITCH } from './constants';
import type { PickupKind } from './weapons';

/** Client asks to create a room and join it. */
export interface HostMsg { t: 'host'; name: string; model: number; color: number }
/** Client asks to join an existing room by code. */
export interface JoinMsg { t: 'join'; code: string; name: string; model: number; color: number }
/** One tick of player input; `seq` increases by one per message so the server can ack it. */
export interface InputMsg {
  t: 'input';
  seq: number;
  keys: number;
  yaw: number;
  pitch: number;
  /** Selected weapon index 0-3. */
  weapon: number;
}
/** The player clicked "Enter the office": spawn them into the match. Until then they only sit in the room lobby. */
export interface EnterMsg { t: 'enter' }
/** Everything a client may send. */
export type C2S = HostMsg | JoinMsg | InputMsg | EnterMsg;

/** Public identity of a player in a room. */
export interface PlayerInfo {
  id: number;
  name: string;
  /** Character style, index into `CHARACTERS`. */
  model: number;
  /** Shirt colour as 0xRRGGBB. */
  color: number;
  kills: number;
  deaths: number;
}

/** Per-player state in a snapshot (what other players can see). */
export interface SnapPlayer {
  id: number;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  hp: number;
  /** Selected weapon index. */
  w: number;
  alive: boolean;
  /** Spawn protection active. */
  prot: boolean;
}

/** In-flight grenade in a snapshot. */
export interface SnapGrenade {
  id: number;
  /** Grenade slot (0 frag, 1 flash). */
  s: number;
  x: number; y: number; z: number;
}

/** Private state sent only to the owning player. Position/velocity are exact for reconciliation. */
export interface MeState {
  /** Sequence number of the last input the server applied. */
  ack: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  onGround: boolean;
  hp: number;
  alive: boolean;
  /** False while still in the room lobby (not yet entered the map). */
  playing: boolean;
  /** Ticks until respawn while dead, else 0. */
  respawnIn: number;
  /** Ticks of spawn protection left. */
  prot: number;
  w: number;
  /** Rounds in each weapon's magazine. */
  mag: number[];
  /** Spare rounds per weapon. */
  reserve: number[];
  /** Grenades carried per slot. */
  gren: number[];
  /** Ticks left of the current reload, 0 if not reloading. */
  reload: number;
  /** Ticks of flashbang blindness left. */
  blind: number;
  /** Peak blindness duration of the current flash (for fading). */
  blindMax: number;
}

/** One-off things that happened since the last snapshot. */
export type GameEvent =
  | { k: 'shot'; id: number; w: number; ex: number; ey: number; ez: number; hit: 'none' | 'world' | 'player' }
  | { k: 'hit'; by: number; to: number; dmg: number; head: boolean }
  | { k: 'kill'; by: number; to: number; w: number | 'frag' }
  | { k: 'spawn'; id: number; yaw: number }
  | { k: 'pickup'; id: number; i: number; kind: PickupKind }
  | { k: 'pk'; i: number; on: boolean }
  | { k: 'throw'; id: number; s: number }
  | { k: 'boom'; s: number; x: number; y: number; z: number }
  | { k: 'reload'; id: number }
  | { k: 'matchEnd'; winner: number; restartIn: number }
  | { k: 'door'; i: number; o: number; t: number }
  | { k: 'hole'; x: number; y: number; z: number; a: number; s: number }
  | { k: 'lootDrop'; id: number; from: number; x: number; y: number; z: number }
  | { k: 'lootTake'; id: number; by: number; from: number }
  | { k: 'lootGone'; id: number }
  | { k: 'matchStart' };

/** A loot bag lying on the floor. */
export interface LootInfo {
  id: number;
  /** Player the bag came from. */
  from: number;
  x: number; y: number; z: number;
}

/** Reply to a successful host/join. */
export interface JoinedMsg {
  t: 'joined';
  id: number;
  code: string;
  players: PlayerInfo[];
  /** One char per pickup spot: '1' active, '0' taken. */
  pickups: string;
  /** Loot bags already on the floor. */
  loot: LootInfo[];
  /** Every door as `[open, target, ...]` in whole percent (see `Doors.wire`). */
  doors: number[];
  tick: number;
}
/** Join/host failure. */
export interface ErrorMsg { t: 'error'; reason: 'bad-code' | 'room-full' | 'bad-request' | 'rate-limit' }
/** Roster or score change. */
export interface RosterMsg { t: 'roster'; players: PlayerInfo[] }
/** Periodic world state at 30 Hz. */
export interface SnapMsg {
  t: 'snap';
  tick: number;
  players: SnapPlayer[];
  grenades: SnapGrenade[];
  me: MeState;
  ev: GameEvent[];
  /** Door states, present only while a door is moving or just stopped. */
  doors?: number[];
}
/** Everything the server may send. */
export type S2C = JoinedMsg | ErrorMsg | RosterMsg | SnapMsg;

/** Reads the character and colour choice; colour -1 means "server picks". */
function parseLook(m: Record<string, unknown>): { model: number; color: number } {
  return { model: parseIndex(m.model, CHARACTERS.length, 0), color: parseIndex(m.color, PLAYER_COLORS.length, -1) };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Generates a placeholder callsign like `Guest4821`.
 * @returns A valid name for someone who did not pick one.
 */
export function guestName(): string {
  return `Guest${1000 + Math.floor(Math.random() * 9000)}`;
}

/**
 * Cleans a callsign: printable characters only, trimmed, length-capped.
 * @param raw - Untrusted value.
 * @returns A non-empty name; a guest name if nothing usable is left.
 */
export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, MAX_NAME_LEN) : '';
  return s || guestName();
}

/**
 * Normalises a room code the user typed (case, whitespace).
 * @returns The upper-cased code, or null if it cannot be a valid code.
 */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  if (c.length !== CODE_LEN) return null;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null;
  return c;
}

/**
 * Reads an integer index from untrusted input.
 * @param raw - Untrusted value.
 * @param count - Number of valid choices.
 * @param fallback - Returned when `raw` is not a valid index.
 */
function parseIndex(raw: unknown, count: number, fallback: number): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < count ? raw : fallback;
}

/**
 * Validates untrusted JSON from a client: checks types, finiteness, masks keys, clamps pitch,
 * sanitises names.
 * @param raw - Parsed JSON of unknown shape.
 * @returns A safe message, or null if it is malformed.
 */
export function parseC2S(raw: unknown): C2S | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case 'host':
      return { t: 'host', name: sanitizeName(m.name), ...parseLook(m) };
    case 'join': {
      const code = normalizeCode(m.code);
      return code ? { t: 'join', code, name: sanitizeName(m.name), ...parseLook(m) } : null;
    }
    case 'enter':
      return { t: 'enter' };
    case 'input': {
      if (!isNum(m.seq) || !isNum(m.keys) || !isNum(m.yaw) || !isNum(m.pitch) || !isNum(m.weapon)) return null;
      if (!Number.isInteger(m.seq) || m.seq < 0 || !Number.isInteger(m.keys)) return null;
      return {
        t: 'input',
        seq: m.seq,
        keys: m.keys & KEY_MASK,
        yaw: Math.max(-1e4, Math.min(1e4, m.yaw)),
        pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, m.pitch)),
        weapon: Math.max(0, Math.min(3, Math.trunc(m.weapon))),
      };
    }
    default:
      return null;
  }
}
