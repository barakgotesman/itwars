/**
 * Rockets: the projectile an RPG-style weapon fires. A rocket flies straight, explodes on the first wall, door or
 * player body it reaches (or when its flight time runs out) and damages everyone near the blast through `blast`.
 */
import { EYE_HEIGHT, TICK_DT } from '@shared/core/constants';
import { ROCKET_BOOM } from '@shared/net/protocol';
import { WEAPONS, type WeaponDef } from '@shared/rules/weapons';
import { castRay, type Target } from './combat';
import { blast } from './grenades';
import type { Player } from './player';
import type { Sim } from './state';
import { round2 } from './util';

/** How far in front of the eye a rocket starts, so it leaves the tube and not the player's face. */
const MUZZLE_OFFSET = 0.6;
/** The blast goes off this far before the surface it hit, so its line-of-sight rays start in open air and not inside the wall. */
const BLAST_BACKOFF = 0.1;

/** A rocket in flight. */
export interface Rocket {
  id: number;
  owner: number;
  /** Weapon index, credited in the kill feed. */
  weapon: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** The tick it fizzles out at. */
  endAt: number;
}

/**
 * Launches a rocket.
 * @param w - The launcher; must have a `rocket` entry.
 * @param dir - Unit direction to fly: the view direction, already scattered by the weapon's spread.
 */
export function fireRocket(sim: Sim, p: Player, w: WeaponDef, dir: readonly [number, number, number]): void {
  const def = w.rocket;
  if (!def) return;
  const [dx, dy, dz] = dir;
  const ox = p.state.x, oy = p.state.y + EYE_HEIGHT, oz = p.state.z;
  // Start a little ahead, unless a wall is closer: then it goes off right there (point-blank into a wall hurts).
  const clear = castRay(sim.solids, [], ox, oy, oz, dx, dy, dz, MUZZLE_OFFSET).t;
  const lead = Math.max(0, Math.min(MUZZLE_OFFSET, clear - BLAST_BACKOFF));
  sim.rockets.push({
    id: sim.nextRocketId++, owner: p.id, weapon: p.weapon,
    x: ox + dx * lead, y: oy + dy * lead, z: oz + dz * lead,
    vx: dx * def.speed, vy: dy * def.speed, vz: dz * def.speed,
    endAt: sim.tick + def.lifeTicks,
  });
  sim.events.push({ k: 'shot', id: p.id, w: p.weapon, ex: round2(ox + dx * 2), ey: round2(oy + dy * 2), ez: round2(oz + dz * 2), hit: 'none' });
}

/** Moves every rocket one tick and detonates the ones that hit something or ran out of time. */
export function tickRockets(sim: Sim): void {
  if (sim.rockets.length === 0) return;
  const alive: Rocket[] = [];
  for (const r of sim.rockets) {
    const def = WEAPONS[r.weapon]?.rocket;
    if (!def) continue;
    const step = def.speed * TICK_DT;
    const dir: [number, number, number] = [r.vx / def.speed, r.vy / def.speed, r.vz / def.speed];
    // Everyone alive can stop it, the shooter included (a rocket fired at your own feet hurts).
    const targets: Target[] = [];
    for (const o of sim.players.values()) if (o.alive) targets.push({ id: o.id, ...o.state });
    const hit = castRay(sim.solids, targets, r.x, r.y, r.z, dir[0], dir[1], dir[2], step);
    if (hit.t < step || sim.tick >= r.endAt) {
      const t = Math.max(0, Math.min(hit.t, step) - BLAST_BACKOFF);
      detonate(sim, r, def.radius, def.damage, r.x + dir[0] * t, r.y + dir[1] * t, r.z + dir[2] * t);
      continue;
    }
    r.x += r.vx * TICK_DT;
    r.y += r.vy * TICK_DT;
    r.z += r.vz * TICK_DT;
    alive.push(r);
  }
  sim.rockets = alive;
}

/** Explodes a rocket at a point: the blast event for every client, then damage. */
function detonate(sim: Sim, r: Rocket, radius: number, amount: number, x: number, y: number, z: number): void {
  sim.events.push({ k: 'boom', s: ROCKET_BOOM, x: round2(x), y: round2(y), z: round2(z) });
  blast(sim, x, y, z, radius, amount, r.owner, r.weapon);
}
