/**
 * Bot grenades: when an enemy ducked behind cover a moment ago, lob a Coffee Bomb (frag) to where they were.
 * The bot turns to the right angle at its normal turn rate and presses the throw key, like a person would.
 * Only the frag is used for now; the flash (Fire Alarm) is a later addition.
 */
import { EYE_HEIGHT, Key, TICK_DT } from '@shared/core/constants';
import { lookDir, type Aabb } from '@shared/core/physics';
import type { BotTuning } from '@shared/rules/bots';
import { GRENADES } from '@shared/rules/weapons';
import { stepProjectile, worldDistance } from '../combat';
import type { Player } from '../player';
import type { Sim } from '../state';
import { turnToward, yawTo } from './angles';
import type { BotState } from './state';

/** Frag slot (the first grenade). */
const FRAG = 0;
/** An enemy seen between these many ticks ago is "just ducked out of sight". */
const MIN_AGE = 10;
const MAX_AGE = 120;
/** Throw range (m): closer is dangerous to the thrower, farther than a lob can reach is wasted. */
const MIN_RANGE = 8;
const MAX_RANGE = 12;
/** The first metres of the throw must be open, or the bomb bounces back off a wall. */
const CLEAR_AHEAD = 4;
/** Ticks the bot may spend lining up before giving up, and the wait before its next throw. */
const LINE_UP_TICKS = 90;
const COOLDOWN_TICKS = 900;
/** How closely (rad) it must be lined up to throw. */
const LINED_UP = 0.08;
/** Pitches tried when working out how far each one throws, in radians. */
const PITCH_MIN = -0.1;
const PITCH_MAX = 1.1;
const PITCH_STEP = 0.02;
/** The server throws a little above the crosshair (`throwGrenade` adds this to the vertical direction). */
const SERVER_LOFT = 0.2;

/**
 * How far a frag ends up from the thrower, by throwing pitch, once its whole fuse has run: it flies, bounces and
 * rolls. Worked out once by running the game's own projectile step over an open floor.
 */
const RANGE_BY_PITCH: { pitch: number; range: number }[] = (() => {
  const def = GRENADES[FRAG]!;
  const floor: Aabb = { minX: -1e4, maxX: 1e4, minY: -1, maxY: 0, minZ: -1e4, maxZ: 1e4 };
  const table: { pitch: number; range: number }[] = [];
  for (let pitch = PITCH_MIN; pitch <= PITCH_MAX; pitch += PITCH_STEP) {
    const [dx, dy, dz] = lookDir(0, pitch);
    const ay = dy + SERVER_LOFT;
    const l = Math.hypot(dx, ay, dz);
    const g = { x: 0, y: EYE_HEIGHT, z: 0, vx: (dx / l) * def.speed, vy: (ay / l) * def.speed, vz: (dz / l) * def.speed };
    for (let t = 0; t < def.fuseTicks; t++) stepProjectile(g, def, TICK_DT, [floor]);
    table.push({ pitch, range: Math.hypot(g.x, g.z) });
  }
  return table;
})();

/** The pitch whose throw ends up closest to the given distance (the table is not monotonic once it rolls). */
function lobPitch(dist: number): number {
  let best = RANGE_BY_PITCH[0]!;
  for (const e of RANGE_BY_PITCH) if (Math.abs(e.range - dist) < Math.abs(best.range - dist)) best = e;
  return best.pitch;
}

/** Maybe decides to throw a frag at the last place an enemy was seen. Called on decision ticks only. */
export function considerGrenade(sim: Sim, p: Player, st: BotState, tune: BotTuning): void {
  if (st.throwAt || st.visible || !st.seen || sim.tick < st.grenadeReadyAt || (p.gren[FRAG] ?? 0) <= 0) return;
  const age = sim.tick - st.seen.tick;
  if (age < MIN_AGE || age > MAX_AGE) return;
  const dx = st.seen.x - p.state.x, dz = st.seen.z - p.state.z;
  const d = Math.hypot(dx, dz);
  if (d < MIN_RANGE || d > MAX_RANGE || sim.rng() > tune.grenadeChance) return;
  const open = worldDistance(sim.solids, p.state.x, p.state.y + EYE_HEIGHT, p.state.z, dx / d, 0, dz / d, CLEAR_AHEAD);
  if (open < CLEAR_AHEAD) return;
  st.throwAt = { x: st.seen.x, z: st.seen.z, tick: sim.tick };
}

/**
 * Turns toward the throw and lets go once lined up.
 * @returns The view and keys for this tick, or null when there is no throw in progress.
 */
export function lineUpThrow(sim: Sim, p: Player, st: BotState, tune: BotTuning): { yaw: number; pitch: number; keys: number } | null {
  const t = st.throwAt;
  if (!t) return null;
  if (st.visible || sim.tick - t.tick > LINE_UP_TICKS || (p.gren[FRAG] ?? 0) <= 0) {
    st.throwAt = null; // the enemy reappeared, or it is taking too long
    return null;
  }
  const dx = t.x - p.state.x, dz = t.z - p.state.z;
  const step = tune.turnRate * (1 / 60);
  const yaw = turnToward(p.state.yaw, yawTo(dx, dz), step);
  const pitch = turnToward(p.state.pitch, lobPitch(Math.hypot(dx, dz)), step);
  const ready = Math.abs(yaw - yawTo(dx, dz)) < LINED_UP && Math.abs(pitch - lobPitch(Math.hypot(dx, dz))) < LINED_UP;
  if (!ready) return { yaw, pitch, keys: 0 };
  st.throwAt = null;
  st.grenadeReadyAt = sim.tick + COOLDOWN_TICKS;
  return { yaw, pitch, keys: Key.Grenade1 };
}
