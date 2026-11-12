/**
 * What a bot knows. It sees an enemy only inside its field of view, within sight range and with a clear line
 * (the same ray test the game uses for grenades), and it hears shots, explosions and attacks within a radius.
 * No wallhacks: a hidden enemy is known only by where it was last seen or heard.
 */
import { CHEST_Y, EYE_HEIGHT, HEAD_Y } from '@shared/core/constants';
import type { BotTuning } from '@shared/rules/bots';
import { hasLineOfSight } from '../combat';
import type { Player } from '../player';
import type { Sim } from '../state';
import type { BotState } from './state';

/** A new fight begins when an enemy is spotted after at least this many ticks without seeing anyone. */
const QUIET_BEFORE_FIGHT = 60;
/** Enemies this close are noticed even outside the field of view (footsteps, a shadow at the edge of vision). */
const NOTICE_RADIUS = 2.5;
/** Score bonuses when choosing a target: whoever just shot the bot, and the current target (so it does not flip-flop). */
const ATTACKER_BONUS = 0.5;
const CURRENT_BONUS = 0.3;
/** A protected (just spawned) enemy cannot be hurt, so the bot would rather watch someone else. */
const PROTECTED_PENALTY = 0.5;

/**
 * Updates what the bot sees and hears this tick.
 * @remarks Hearing is read every tick (events are cheap); sight runs every second tick per bot, interleaved by id,
 * and the result is kept in between.
 */
export function perceive(sim: Sim, p: Player, st: BotState, tune: BotTuning): void {
  hear(sim, p, st, tune);
  if ((sim.tick + p.id) % 2 === 0) look(sim, p, st, tune);
}

/** Notes gunshots, explosions and attacks near enough to hear. */
function hear(sim: Sim, p: Player, st: BotState, tune: BotTuning): void {
  for (const e of sim.events) {
    let x: number, z: number;
    if (e.k === 'shot' && e.id !== p.id) {
      const who = sim.players.get(e.id);
      if (!who) continue;
      x = who.state.x; z = who.state.z;
    } else if (e.k === 'boom') {
      x = e.x; z = e.z;
    } else if (e.k === 'hit' && e.to === p.id && e.by !== p.id) {
      const who = sim.players.get(e.by);
      if (!who) continue;
      x = who.state.x; z = who.state.z;
    } else {
      continue;
    }
    // Being hit is felt wherever the attacker is; everything else must be within earshot.
    const near = Math.hypot(x - p.state.x, z - p.state.z) <= tune.hearRange;
    if (near || e.k === 'hit') st.heard = { x, z, tick: sim.tick };
  }
}

/** Finds the enemies in view and picks the one to watch. */
function look(sim: Sim, p: Player, st: BotState, tune: BotTuning): void {
  const s = p.state;
  const ex = s.x, ey = s.y + EYE_HEIGHT, ez = s.z;
  const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const o of sim.players.values()) {
    if (o === p || !o.alive || !o.playing) continue;
    const dx = o.state.x - s.x, dz = o.state.z - s.z;
    const dist = Math.hypot(dx, dz);
    if (dist > tune.sightRange) continue;
    if (dist > NOTICE_RADIUS && Math.acos(Math.min(1, Math.max(-1, (dx * fx + dz * fz) / dist))) > tune.fovHalf) continue;
    if (!hasLineOfSight(sim.solids, ex, ey, ez, o.state.x, o.state.y + CHEST_Y, o.state.z) &&
        !hasLineOfSight(sim.solids, ex, ey, ez, o.state.x, o.state.y + HEAD_Y, o.state.z)) continue;
    let score = 1 / Math.max(1, dist);
    if (o.id === st.targetId) score += CURRENT_BONUS;
    if (st.heard && st.heard.tick > sim.tick - 120 && Math.hypot(st.heard.x - o.state.x, st.heard.z - o.state.z) < 1) score += ATTACKER_BONUS;
    if (sim.tick < o.protectUntil) score -= PROTECTED_PENALTY;
    if (score > bestScore) { bestScore = score; best = o; }
  }

  if (!best) {
    st.visible = false;
    return;
  }
  if (!st.visible || st.targetId !== best.id) {
    st.visibleSince = sim.tick;
    // A fresh fight (not a flicker behind a pillar) restarts the reaction delay.
    if (!st.seen || sim.tick - st.seen.tick > QUIET_BEFORE_FIGHT || st.targetId !== best.id) st.engageStart = sim.tick;
  }
  st.visible = true;
  st.targetId = best.id;
  st.seen = { x: best.state.x, y: best.state.y, z: best.state.z, vx: best.state.vx, vz: best.state.vz, tick: sim.tick };
  st.chasing = false;
}
