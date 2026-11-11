/**
 * Pickup boxes (HP, ammo, grenades): respawn timers and collection by walking over them.
 * A box is left alone unless it would actually help the player.
 */
import { MAX_HP } from '@shared/core/constants';
import { GRENADES, PICKUP_DEFS, WEAPONS, type PickupKind } from '@shared/rules/weapons';
import type { Player } from './player';
import type { Sim } from './state';

/** Re-enables pickups whose timer ran out and lets living players collect nearby ones. */
export function tickPickups(sim: Sim): void {
  sim.spots.forEach((s, i) => {
    const ready = sim.pickupReady[i]!;
    if (ready === sim.tick) sim.events.push({ k: 'pk', i, on: true });
    if (ready > sim.tick) return;
    const def = PICKUP_DEFS[s.kind];
    for (const p of sim.players.values()) {
      if (!p.alive || Math.abs(p.state.y) > 1.6) continue;
      if (Math.hypot(p.state.x - s.x, p.state.z - s.z) > def.radius) continue;
      if (!applyPickup(p, s.kind)) continue;
      sim.pickupReady[i] = sim.tick + def.respawnTicks;
      sim.events.push({ k: 'pickup', id: p.id, i, kind: s.kind }, { k: 'pk', i, on: false });
      break;
    }
  });
}

/** Gives a pickup's contents to a player. @returns False if they could not use it (so it stays). */
function applyPickup(p: Player, kind: PickupKind): boolean {
  const def = PICKUP_DEFS[kind];
  if (kind === 'hp') {
    if (p.hp >= MAX_HP) return false;
    p.hp = Math.min(MAX_HP, p.hp + def.amount);
    return true;
  }
  if (kind === 'ammo') {
    if (WEAPONS.every((w, i) => p.reserve[i]! >= w.maxReserve)) return false;
    WEAPONS.forEach((w, i) => {
      p.reserve[i] = Math.min(w.maxReserve, p.reserve[i]! + Math.ceil(w.maxReserve * def.amount));
    });
    return true;
  }
  if (GRENADES.every((g, i) => p.gren[i]! >= g.maxCarry)) return false;
  GRENADES.forEach((g, i) => {
    p.gren[i] = Math.min(g.maxCarry, p.gren[i]! + def.amount);
  });
  return true;
}
