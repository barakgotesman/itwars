/**
 * Melee: the A4 paper's two swings. A swing is announced at the click (so everyone sees the wind-up) and lands a
 * few ticks later, when the server looks at who is in front of the attacker at that moment, so a target that steps
 * out of the cone in time is missed. Numbers come from `WeaponDef.melee` in `shared/rules/weapons.ts`.
 */
import { CHEST_Y, EYE_HEIGHT, HEAD_Y, PLAYER_RADIUS } from '@shared/core/constants';
import { lookDir } from '@shared/core/physics';
import { MELEE_WEAPON, type MeleeAttack, type MeleeDef } from '@shared/rules/weapons';
import { hasLineOfSight } from './combat';
import { damage } from './damage';
import type { Player } from './player';
import type { Sim } from './state';

/** Heights above a target's feet that the swing tests: legs, chest and head. */
const BODY_POINTS: readonly number[] = [0.3, CHEST_Y, HEAD_Y];

/** The attack a swing of this kind uses. */
function attackOf(def: MeleeDef, heavy: boolean): MeleeAttack {
  return heavy ? def.heavy : def.slash;
}

/**
 * Starts a swing: spends the cooldown, remembers when it lands and tells everyone so the wind-up can be drawn.
 * @param heavy - True for the right-click attack.
 */
export function startMelee(sim: Sim, p: Player, def: MeleeDef, heavy: boolean): void {
  const atk = attackOf(def, heavy);
  p.meleeAt = sim.tick + atk.windup;
  p.meleeHeavy = heavy;
  p.nextFire = sim.tick + atk.interval;
  p.meleeWant = 0;
  sim.events.push({ k: 'melee', id: p.id, heavy, r: 0, to: -1 });
}

/** Drops a swing that has not landed yet (the player switched weapons). */
export function cancelMelee(p: Player): void {
  p.meleeAt = 0;
  p.meleeWant = 0;
}

/**
 * Lands the swing in progress once its wind-up is over. The nearest living player inside the reach and the cone
 * in front of the crosshair, with a clear line from the eye, takes the damage.
 */
export function resolveMelee(sim: Sim, p: Player, def: MeleeDef): void {
  if (p.meleeAt === 0 || sim.tick < p.meleeAt) return;
  p.meleeAt = 0;
  const atk = attackOf(def, p.meleeHeavy);
  const [lx, ly, lz] = lookDir(p.state.yaw, p.state.pitch);
  const ox = p.state.x, oy = p.state.y + EYE_HEIGHT, oz = p.state.z;
  const minCos = Math.cos(atk.halfArc);

  let victim: Player | null = null;
  let nearest = Infinity;
  for (const o of sim.players.values()) {
    if (o === p || !o.alive) continue;
    for (const h of BODY_POINTS) {
      const vx = o.state.x - ox, vy = o.state.y + h - oy, vz = o.state.z - oz;
      const d = Math.hypot(vx, vy, vz);
      if (d - PLAYER_RADIUS > atk.reach || d >= nearest) continue;
      // Anything this close is "in front" whatever the angle (the point is inside the swing's own arm).
      if (d > 0.2 && (vx * lx + vy * ly + vz * lz) / d < minCos) continue;
      if (!hasLineOfSight(sim.solids, ox, oy, oz, o.state.x, o.state.y + h, o.state.z)) continue;
      nearest = d;
      victim = o;
    }
  }
  if (!victim) {
    sim.events.push({ k: 'melee', id: p.id, heavy: p.meleeHeavy, r: 2, to: -1 });
    return;
  }
  sim.events.push({ k: 'melee', id: p.id, heavy: p.meleeHeavy, r: 1, to: victim.id });
  damage(sim, victim, atk.damage, p, MELEE_WEAPON, false);
}
