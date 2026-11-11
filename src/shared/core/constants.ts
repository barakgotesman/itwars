/**
 * Constants shared by client and server: tick rate, player body, movement tuning, input bits, match rules.
 */
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

export const PLAYER_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;

export const WALK_SPEED = 7.5;
export const SPRINT_SPEED = 11.5;
// Jump height = v^2 / 2g = 1.39 m: enough to hop desks (0.75) and cubicle partitions (1.3).
export const JUMP_SPEED = 8.5;
export const GRAVITY = 26;
// Air control is weaker so jumps feel committed, but not locked.
export const GROUND_ACCEL = 110;
export const AIR_ACCEL = 28;

export const MAX_PITCH = Math.PI / 2 - 0.01;

/** Input key bits sent every tick. */
export const Key = {
  Forward: 1 << 0,
  Back: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Jump: 1 << 4,
  Sprint: 1 << 5,
  Fire: 1 << 6,
  Aim: 1 << 7,
  Reload: 1 << 8,
  Grenade1: 1 << 9,
  Grenade2: 1 << 10,
  Interact: 1 << 11,
} as const;
/** Bits the server accepts from clients; anything else is stripped. */
export const KEY_MASK = (1 << 12) - 1;

/** Server sends a snapshot every this many ticks (60 Hz / 2 = 30 Hz). */
export const SNAPSHOT_EVERY = 2;

export const MAX_HP = 100;
/** Height above the feet at and over which a hit counts as a headshot. */
export const HEAD_Y = 1.4;
/** Height above the feet used as the body centre for explosions and line-of-sight. */
export const CHEST_Y = 1.0;

export const MAX_PLAYERS = 8;
export const KILLS_TO_WIN = 50;
export const RESPAWN_TICKS = 3 * TICK_RATE;
export const SPAWN_PROTECT_TICKS = 2 * TICK_RATE;
export const INTERMISSION_TICKS = 10 * TICK_RATE;
/** Delay between switching weapons and being able to fire. */
export const SWITCH_TICKS = 15;
/** Minimum ticks between two grenade throws by one player. */
export const THROW_COOLDOWN_TICKS = 30;
/** Longest accepted callsign. */
export const MAX_NAME_LEN = 16;
/** Room code alphabet: no 0/O/1/I so codes survive being read aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 4;
