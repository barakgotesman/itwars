/**
 * Grenades: throwing, flight, and detonation (frag damage or flash blindness for everyone in range with line of sight).
 */
import { CHEST_Y, EYE_HEIGHT, THROW_COOLDOWN_TICKS, TICK_DT } from '@shared/core/constants';
import { lookDir } from '@shared/core/physics';
import { FRAG_MIN_MUL, GRENADES, SELF_DAMAGE_MUL } from '@shared/rules/weapons';
import { explosionSeesPlayer, stepProjectile, type Projectile } from './combat';
import { damage } from './damage';
import type { Player } from './player';
import type { Sim } from './state';
import { round2 } from './util';

/** A grenade in flight. */
export interface Grenade extends Projectile {
  id: number;
  slot: number;
  owner: number;
  explodeAt: number;
}

/** Throws a grenade from the given slot if the player has one and is off cooldown. */
export function throwGrenade(sim: Sim, p: Player, slot: number): void {
  if (p.gren[slot]! <= 0 || sim.tick < p.nextThrow) return;
  const def = GRENADES[slot]!;
  p.gren[slot]!--;
  if (sim.rules.mode === 'range') p.gren[slot] = def.maxCarry;
  p.nextThrow = sim.tick + THROW_COOLDOWN_TICKS;
  // Aim a little above the crosshair, like a lobbed throw.
  const [dx, dy, dz] = lookDir(p.state.yaw, p.state.pitch);
  const ay = dy + 0.2;
  const l = Math.hypot(dx, ay, dz);
  sim.grenades.push({
    id: sim.nextGrenadeId++, slot, owner: p.id,
    x: p.state.x, y: p.state.y + EYE_HEIGHT, z: p.state.z,
    vx: (dx / l) * def.speed + p.state.vx * def.inheritVel,
    vy: (ay / l) * def.speed + p.state.vy * def.inheritVel,
    vz: (dz / l) * def.speed + p.state.vz * def.inheritVel,
    explodeAt: sim.tick + def.fuseTicks,
  });
  sim.events.push({ k: 'throw', id: p.id, s: slot });
}

/** Moves live grenades and detonates the ones whose fuse ran out. */
export function tickGrenades(sim: Sim): void {
  if (sim.grenades.length === 0) return;
  const alive: Grenade[] = [];
  for (const g of sim.grenades) {
    stepProjectile(g, GRENADES[g.slot]!, TICK_DT, sim.solids);
    if (sim.tick >= g.explodeAt) explode(sim, g);
    else alive.push(g);
  }
  sim.grenades = alive;
}

/** Resolves a detonation: frag damage or flash blindness for everyone in range with line of sight. */
function explode(sim: Sim, g: Grenade): void {
  const def = GRENADES[g.slot]!;
  sim.events.push({ k: 'boom', s: g.slot, x: round2(g.x), y: round2(g.y), z: round2(g.z) });
  const owner = sim.players.get(g.owner);
  for (const p of sim.players.values()) {
    if (!p.alive) continue;
    const cx = p.state.x, cy = p.state.y + CHEST_Y, cz = p.state.z;
    const dist = Math.hypot(cx - g.x, cy - g.y, cz - g.z);
    if (dist >= def.radius || !explosionSeesPlayer(sim.solids, g.x, g.y, g.z, { id: p.id, ...p.state })) continue;
    const falloff = 1 - dist / def.radius;
    if (def.kind === 'frag') {
      const mul = Math.max(FRAG_MIN_MUL, falloff) * (p.id === g.owner ? SELF_DAMAGE_MUL : 1);
      damage(sim, p, def.damage * mul, owner ?? p, 'frag', false);
    } else {
      // Looking at the blast hurts most; a flash behind you still dazzles a bit.
      const [lx, ly, lz] = lookDir(p.state.yaw, p.state.pitch);
      const facing = dist > 1e-6 ? (lx * (g.x - cx) + ly * (g.y - cy) + lz * (g.z - cz)) / dist : 1;
      const ticks = Math.round(def.blindTicks * falloff * (0.3 + 0.7 * Math.max(0, facing)));
      if (ticks > 0 && sim.tick + ticks > p.blindEnd) {
        p.blindEnd = sim.tick + ticks;
        p.blindMax = ticks;
      }
    }
  }
}
