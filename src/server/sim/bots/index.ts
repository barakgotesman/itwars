/**
 * Bots: server-controlled players. A bot is an ordinary `Player` whose connection drops every message and whose
 * input is written here each tick instead of arriving from a browser, so movement, weapons, doors, pickups,
 * damage and every future system treat it exactly like a human. This file creates bots and steps their brains.
 */
import { PLAYER_COLORS, CHARACTERS } from '@shared/core/characters';
import { TICK_DT } from '@shared/core/constants';
import type { InputMsg } from '@shared/net/protocol';
import { SPRAY_COUNT } from '@shared/rules/sprays';
import { botTuning, pickBotName, type BotTuning } from '@shared/rules/bots';
import type { Room } from '@server/rooms/room';
import { queueInput } from '../movement';
import type { Conn, Player } from '../player';
import type { Sim } from '../state';
import { turnToward, yawTo } from './angles';
import { decide } from './decide';
import { fight } from './fight';
import { considerGrenade, lineUpThrow } from './grenade';
import { chooseWeapon, reloadKey } from './gun';
import { navigate, setGoal } from './navigate';
import { perceive } from './perception';
import { newBotState, resetCombat, resetNavigation, type BotState } from './state';

/** The part of an input message a brain decides (the rest is the sequence number). */
type BotInput = Omit<InputMsg, 't' | 'seq'>;

/** Distance (m) assumed when choosing a weapon with no enemy in sight. */
const IDLE_DISTANCE = 15;

/** Ticks after hearing something during which a roaming bot keeps glancing toward it. */
const GLANCE_TICKS = 45;

/** The connection every bot uses: nothing is ever sent to a bot. */
export const NOOP_CONN: Conn = { send() { /* bots read the simulation directly */ } };

/**
 * Adds the room's bots (as many as `rules.bots`, while seats remain) to the lobby, alongside any human.
 * They wait there like a human would: `Room.enter` puts them into the match once the first human enters,
 * so nobody watches bots fight each other in an empty room before anyone is actually playing.
 * @param room - A room that has just been built; call before any human joins.
 * @param playImmediately - Skip the lobby and spawn each bot as it joins (see `RoomOptions.botsPlayImmediately`).
 * @remarks Names and looks come from the room's seeded random numbers, so a seeded test room is reproducible.
 */
export function addBots(room: Room, playImmediately: boolean): void {
  for (let i = 0; i < room.rules.bots && !room.isFull; i++) {
    const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
    const name = pickBotName(taken, room.rng);
    const id = room.join(NOOP_CONN, name, {
      model: Math.floor(room.rng() * CHARACTERS.length),
      color: Math.floor(room.rng() * PLAYER_COLORS.length),
      spray: Math.floor(room.rng() * SPRAY_COUNT),
    }, { bot: true });
    if (id === null) break;
    room.bots.set(id, newBotState(room.doors.defs.length));
    if (playImmediately) room.enter(id);
  }
}

/**
 * Runs every bot's brain for one tick and queues the input it produces.
 * @param sim - The room state.
 */
export function stepBots(sim: Sim): void {
  const tune = botTuning(sim.rules.botSkill);
  for (const p of sim.players.values()) {
    if (!p.bot) continue;
    const st = sim.bots.get(p.id);
    if (!st) continue;
    if (!p.alive) {
      // Dead (or not spawned yet): the old route and fight no longer apply where the bot will reappear.
      resetNavigation(st);
      resetCombat(st);
      queueInput(p, { t: 'input', seq: ++st.seq, keys: 0, yaw: p.state.yaw, pitch: p.state.pitch, weapon: p.weapon });
      continue;
    }
    perceive(sim, p, st, tune);
    const input = st.visible ? fightInput(sim, p, st, tune) : null;
    queueInput(p, { t: 'input', seq: ++st.seq, ...(input ?? roamInput(sim, p, st, tune)) });
  }
}

/** The input for a tick spent fighting, or null if there is nobody left to fight. */
function fightInput(sim: Sim, p: Player, st: BotState, tune: BotTuning): BotInput | null {
  const f = fight(sim, p, st, tune);
  if (!f) return null;
  st.throwAt = null;
  if (!st.wasFighting) {
    // Entering a fight: stop following the route (the keys are the fight's now).
    st.wasFighting = true;
    st.keys = 0; st.pendKeys = 0; st.checkAt = 0;
  }
  return { keys: f.keys, yaw: f.yaw, pitch: f.pitch, weapon: f.weapon };
}

/** The input for a tick spent travelling: chase the last sighting, or roam; glance toward noises. */
function roamInput(sim: Sim, p: Player, st: BotState, tune: BotTuning): BotInput {
  if (st.wasFighting) {
    // The fight ended: the old route starts somewhere the bot no longer is.
    st.wasFighting = false;
    st.forceReplan = true;
  }
  if (st.chasing && st.goal === null) {
    // Reached where the enemy was last seen and nobody is here: forget them.
    st.chasing = false; st.seen = null; st.targetId = -1;
  } else if (st.seen && sim.tick - st.seen.tick >= tune.memoryTicks) {
    st.chasing = false; st.seen = null; st.targetId = -1;
  } else if (st.seen && !st.chasing) {
    // Lost sight of an enemy: go and look where they were.
    setGoal(st, { x: st.seen.x, z: st.seen.z }, 'chase');
    st.chasing = true;
  }
  decide(sim, p, st, tune);
  if ((sim.tick + p.id) % 10 === 5) considerGrenade(sim, p, st, tune);
  // Lining up a grenade throw takes over the view (and the legs) for a moment.
  const lob = lineUpThrow(sim, p, st, tune);
  if (lob) return { keys: lob.keys, yaw: lob.yaw, pitch: lob.pitch, weapon: chooseWeapon(sim, p, st, IDLE_DISTANCE) };
  const nav = navigate(sim, p, st, tune);
  let face = nav.faceYaw;
  if (st.heard && sim.tick - st.heard.tick < GLANCE_TICKS) {
    const dx = st.heard.x - p.state.x, dz = st.heard.z - p.state.z;
    if (Math.hypot(dx, dz) > 1) face = yawTo(dx, dz);
  }
  const step = tune.turnRate * TICK_DT;
  const weapon = chooseWeapon(sim, p, st, IDLE_DISTANCE);
  return {
    keys: nav.keys | reloadKey(p, st, false),
    yaw: turnToward(p.state.yaw, face, step),
    pitch: turnToward(p.state.pitch, 0, step * 0.5),
    weapon,
  };
}
