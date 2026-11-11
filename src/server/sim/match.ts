/**
 * Match flow: spawning, the match clock, ending a match (by kills or time) and restarting after the intermission.
 */
import { INTERMISSION_TICKS, MAX_HP, SPAWN_PROTECT_TICKS, SWITCH_TICKS, TICK_RATE } from '@shared/core/constants';
import { newPlayerState } from '@shared/core/physics';
import { GRENADES, START_RESERVE_FRACTION, WEAPONS } from '@shared/rules/weapons';
import type { Player } from './player';
import type { Sim } from './state';

/** Puts a player at the spawn point farthest from everyone else, with a full loadout. */
export function spawn(sim: Sim, p: Player): void {
  let best = sim.spawns[0]!;
  let bestScore = -1;
  for (const s of sim.spawns) {
    let nearest = Infinity;
    for (const o of sim.players.values()) {
      if (o === p || !o.alive) continue;
      nearest = Math.min(nearest, Math.hypot(o.state.x - s[0], o.state.z - s[1]));
    }
    // Tiny random term breaks ties (e.g. an empty map) without ever overriding a real distance gap.
    const score = Math.min(nearest, 1e6) + sim.rng() * 0.01;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  p.state = newPlayerState(best[0], 0, best[1]);
  // Face the middle of the map so players do not spawn staring at a wall.
  p.state.yaw = Math.atan2(best[0], best[1]);
  p.hp = MAX_HP;
  p.alive = true;
  p.weapon = 1;
  p.mag = WEAPONS.map((w) => w.magSize);
  p.reserve = WEAPONS.map((w) => Math.floor(w.maxReserve * START_RESERVE_FRACTION));
  p.gren = GRENADES.map((g) => g.startCarry);
  p.reloadEnd = 0;
  p.nextFire = sim.tick + SWITCH_TICKS;
  p.fireLatch = false;
  p.protectUntil = sim.tick + SPAWN_PROTECT_TICKS;
  p.blindEnd = 0;
  // Stale inputs were made for the old position; clients drop their pending list on the 'spawn' event.
  p.queue.length = 0;
  sim.events.push({ k: 'spawn', id: p.id, yaw: Math.round(p.state.yaw * 1000) / 1000 });
}

/** Ends the match and starts the intermission. @param winner - Winning player's id, or -1 for a draw. */
export function endMatch(sim: Sim, winner: number, reason: 'kills' | 'time'): void {
  sim.phase = 'over';
  sim.winner = winner;
  sim.endsAt = 0;
  sim.restartAt = sim.tick + INTERMISSION_TICKS;
  sim.events.push({ k: 'matchEnd', winner, restartIn: INTERMISSION_TICKS, reason });
}

/** The time limit ran out: the player with the most kills wins; a tie for first is a draw. */
export function endByTime(sim: Sim): void {
  let best = -1;
  let winner = -1;
  for (const p of sim.players.values()) {
    if (!p.playing) continue;
    if (p.kills > best) {
      best = p.kills;
      winner = p.id;
    } else if (p.kills === best) {
      winner = -1;
    }
  }
  endMatch(sim, winner, 'time');
}

/** Starts the match clock once there is a game on: a time limit is set and two players are in the match. */
export function startClockIfReady(sim: Sim): void {
  if (sim.rules.timeLimitMin <= 0 || sim.endsAt > 0 || sim.phase !== 'play') return;
  let playing = 0;
  for (const p of sim.players.values()) if (p.playing) playing++;
  if (playing >= 2) sim.endsAt = sim.tick + sim.rules.timeLimitMin * 60 * TICK_RATE;
}

/** Seconds left for the HUD: -1 without a time limit, the full limit while the clock waits, 0 after the match ends. */
export function timeLeft(sim: Sim): number {
  if (sim.rules.timeLimitMin <= 0) return -1;
  if (sim.phase === 'over') return 0;
  if (sim.endsAt === 0) return sim.rules.timeLimitMin * 60;
  return Math.max(0, Math.ceil((sim.endsAt - sim.tick) / TICK_RATE));
}

/** Ends the intermission: resets scores, pickups, doors and grenades, and respawns everyone. */
export function restartMatch(sim: Sim): void {
  sim.doors.reset();
  sim.doorsDirty = true;
  sim.phase = 'play';
  sim.winner = -1;
  sim.grenades = [];
  for (const l of sim.loot) sim.events.push({ k: 'lootGone', id: l.id });
  sim.loot = [];
  sim.spots.forEach((_, i) => {
    if (sim.pickupReady[i]! > sim.tick) sim.events.push({ k: 'pk', i, on: true });
    sim.pickupReady[i] = 0;
  });
  for (const p of sim.players.values()) {
    p.kills = 0;
    p.deaths = 0;
    if (p.playing) spawn(sim, p);
  }
  sim.events.push({ k: 'matchStart' });
  sim.rosterDirty = true;
  startClockIfReady(sim);
}
