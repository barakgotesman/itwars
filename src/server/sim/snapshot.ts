/**
 * Outgoing state: the public roster, the 30 Hz world snapshot and each player's private `me` block.
 */
import type { MeState, PlayerInfo, SnapGrenade, SnapPlayer } from '@shared/net/protocol';
import { timeLeft } from './match';
import type { Player } from './player';
import type { Sim } from './state';
import { round2, round3 } from './util';

/** Public identity and scores of everyone in the room. */
export function roster(sim: Sim): PlayerInfo[] {
  return [...sim.players.values()].map((p) => ({
    id: p.id, name: p.name, model: p.model, color: p.color, kills: p.kills, deaths: p.deaths,
  }));
}

/** Sends the roster to everyone if it changed since the last call. */
export function flushRoster(sim: Sim): void {
  if (!sim.rosterDirty) return;
  sim.rosterDirty = false;
  const list = roster(sim);
  for (const p of sim.players.values()) p.conn.send({ t: 'roster', players: list });
}

/** Sends each player the shared world state plus their private `me` block, then clears the event list. */
export function sendSnapshots(sim: Sim): void {
  // Lobby players are not in the world yet, so nobody else sees them.
  const snapPlayers: SnapPlayer[] = [...sim.players.values()].filter((p) => p.playing).map((p) => ({
    id: p.id, x: round2(p.state.x), y: round2(p.state.y), z: round2(p.state.z),
    yaw: round3(p.state.yaw), pitch: round3(p.state.pitch),
    hp: p.hp, w: p.weapon, alive: p.alive, prot: sim.tick < p.protectUntil,
  }));
  const snapGrenades: SnapGrenade[] = sim.grenades.map((g) => ({
    id: g.id, s: g.slot, x: round2(g.x), y: round2(g.y), z: round2(g.z),
  }));
  const ev = sim.events;
  sim.events = [];
  const doors = sim.doorsDirty ? sim.doors.wire() : undefined;
  sim.doorsDirty = false;
  for (const p of sim.players.values()) {
    p.conn.send({ t: 'snap', tick: sim.tick, players: snapPlayers, grenades: snapGrenades, me: meState(sim, p), ev, doors });
  }
}

/** The private block for one player. */
function meState(sim: Sim, p: Player): MeState {
  const s = p.state;
  return {
    ack: p.ack, x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, onGround: s.onGround,
    hp: p.hp, alive: p.alive, playing: p.playing, respawnIn: p.alive || !p.playing ? 0 : Math.max(0, p.respawnAt - sim.tick),
    prot: Math.max(0, p.protectUntil - sim.tick), w: p.weapon,
    mag: p.mag, reserve: p.reserve, gren: p.gren,
    reload: p.reloadEnd ? Math.max(0, p.reloadEnd - sim.tick) : 0,
    blind: Math.max(0, p.blindEnd - sim.tick), blindMax: p.blindMax, timeLeft: timeLeft(sim),
  };
}
