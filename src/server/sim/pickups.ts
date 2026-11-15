/**
 * Pickup boxes (HP, ammo, grenades): respawn timers and collection by walking over them.
 * A box is left alone unless it would actually help the player.
 */
import { MAX_HP } from '@shared/core/constants';
import { isStarter } from '@shared/rules/loadout';
import { GRENADES, PICKUP_DEFS, WEAPONS, type PickupKind } from '@shared/rules/weapons';
import type { PickupSpot } from '@shared/world/map/pickups';
import { ammoFull, giveAmmo, giveGun, owns } from './arsenal';
import type { Player } from './player';
import type { Sim } from './state';

/** What taking a pickup did: nothing (it stays), or something, with the gun involved for weapon pickups. */
type Taken = false | { w?: number; got?: 'gun' | 'ammo' };

/** Re-enables pickups whose timer ran out and lets living players collect nearby ones. */
export function tickPickups(sim: Sim): void {
  sim.spots.forEach((s, i) => {
    // Gun pickups are pointless when everyone spawns with every gun: they stay switched off.
    if (!spotEnabled(sim, s)) return;
    const ready = sim.pickupReady[i]!;
    if (ready === sim.tick) sim.events.push({ k: 'pk', i, on: true });
    if (ready > sim.tick) return;
    const def = PICKUP_DEFS[s.kind];
    for (const p of sim.players.values()) {
      if (!p.alive || Math.abs(p.state.y) > 1.6) continue;
      if (Math.hypot(p.state.x - s.x, p.state.z - s.z) > def.radius) continue;
      const taken = applyPickup(p, s);
      if (!taken) continue;
      sim.events.push({ k: 'pickup', id: p.id, i, kind: s.kind, ...taken });
      // The range's armory table (guns and grenade crates) is never emptied; everywhere else the box goes away for a while.
      if (!((s.kind === 'weapon' || s.kind === 'grenade') && sim.rules.mode === 'range')) {
        sim.pickupReady[i] = sim.tick + (s.respawnTicks ?? def.respawnTicks);
        sim.events.push({ k: 'pk', i, on: false });
      }
      break;
    }
  });
}

/** Whether a spot exists for the room's loadout: a gun pickup is off when everyone already spawns with that gun. */
export function spotEnabled(sim: Sim, s: PickupSpot): boolean {
  return s.kind !== 'weapon' || !isStarter(sim.rules.loadout, s.weapon ?? 0);
}

/** Whether a bot may walk to a spot on purpose (to roam or to fetch): it must exist, and guns that are left for humans to hunt (the RPG) do not count. */
export function botSpot(sim: Sim, s: PickupSpot): boolean {
  return spotEnabled(sim, s) && !(s.kind === 'weapon' && WEAPONS[s.weapon ?? 0]?.botsSeek === false);
}

/** Gives a pickup's contents to a player. @returns False if they could not use it (so it stays). */
function applyPickup(p: Player, s: PickupSpot): Taken {
  const kind: PickupKind = s.kind;
  const def = PICKUP_DEFS[kind];
  if (kind === 'hp') {
    if (p.hp >= MAX_HP) return false;
    p.hp = Math.min(MAX_HP, p.hp + def.amount);
    return {};
  }
  if (kind === 'weapon') {
    const w = s.weapon ?? 0;
    // A gun you already carry is just ammo for that gun; one you do not is the gun itself.
    if (!owns(p, w)) return giveGun(p, w) ? { w, got: 'gun' } : false;
    return giveAmmo(p, w, def.amount) ? { w, got: 'ammo' } : false;
  }
  if (kind === 'ammo') {
    if (ammoFull(p)) return false;
    WEAPONS.forEach((w, i) => { if (w.boxAmmo !== false) giveAmmo(p, i, def.amount); });
    return {};
  }
  if (GRENADES.every((g, i) => p.gren[i]! >= g.maxCarry)) return false;
  GRENADES.forEach((g, i) => {
    p.gren[i] = Math.min(g.maxCarry, p.gren[i]! + def.amount);
  });
  return {};
}
