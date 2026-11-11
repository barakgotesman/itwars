/**
 * Loot bags: a dead player's ammo and grenades, left where they fell for anyone to walk over.
 */
import { GRENADES, LOOT_FRACTION, LOOT_LIFETIME_TICKS, LOOT_RADIUS, MAX_LOOT, WEAPONS } from '@shared/rules/weapons';
import type { Player } from './player';
import type { Sim } from './state';
import { round2 } from './util';

/** A dead player's ammo lying on the floor, waiting to be looted. */
export interface Loot {
  id: number;
  from: number;
  x: number; y: number; z: number;
  /** Rounds left per weapon (magazine plus reserve when dropped). */
  ammo: number[];
  /** Grenades left per slot. */
  gren: number[];
  expiresAt: number;
}

/** Leaves a bag with a share (`LOOT_FRACTION`) of what the victim was carrying, where they died. */
export function dropLoot(sim: Sim, victim: Player): void {
  const ammo = WEAPONS.map((_, i) => Math.floor(((victim.mag[i] ?? 0) + (victim.reserve[i] ?? 0)) * LOOT_FRACTION));
  const gren = GRENADES.map((_, i) => Math.ceil((victim.gren[i] ?? 0) * LOOT_FRACTION));
  if (ammo.every((n) => n === 0) && gren.every((n) => n === 0)) return;
  const s = victim.state;
  const bag: Loot = { id: sim.nextLootId++, from: victim.id, x: s.x, y: s.y, z: s.z, ammo, gren, expiresAt: sim.tick + LOOT_LIFETIME_TICKS };
  sim.loot.push(bag);
  sim.events.push({ k: 'lootDrop', id: bag.id, from: bag.from, x: round2(bag.x), y: round2(bag.y), z: round2(bag.z) });
  // Too many bags on the floor: the oldest goes first.
  while (sim.loot.length > MAX_LOOT) sim.events.push({ k: 'lootGone', id: sim.loot.shift()!.id });
}

/** Expires old bags and lets living players loot ones they stand next to. */
export function tickLoot(sim: Sim): void {
  if (sim.loot.length === 0) return;
  const keep: Loot[] = [];
  for (const bag of sim.loot) {
    if (sim.tick >= bag.expiresAt) {
      sim.events.push({ k: 'lootGone', id: bag.id });
      continue;
    }
    let takenBy = -1;
    for (const p of sim.players.values()) {
      if (!p.alive || Math.abs(p.state.y - bag.y) > 1.6) continue;
      if (Math.hypot(p.state.x - bag.x, p.state.z - bag.z) > LOOT_RADIUS) continue;
      if (takeLoot(p, bag)) {
        takenBy = p.id;
        break;
      }
    }
    if (takenBy >= 0) sim.events.push({ k: 'lootTake', id: bag.id, by: takenBy, from: bag.from });
    // A bag that was emptied disappears; one that only partly fit stays for the next player.
    if (takenBy >= 0 && bag.ammo.every((n) => n === 0) && bag.gren.every((n) => n === 0)) {
      sim.events.push({ k: 'lootGone', id: bag.id });
      continue;
    }
    keep.push(bag);
  }
  sim.loot = keep;
}

/**
 * Moves as much of a bag as fits into a player's reserves (never above the usual maximums).
 * @returns True if the player got anything.
 */
function takeLoot(p: Player, bag: Loot): boolean {
  let took = false;
  WEAPONS.forEach((w, i) => {
    const n = Math.min(w.maxReserve - p.reserve[i]!, bag.ammo[i]!);
    if (n > 0) {
      p.reserve[i]! += n;
      bag.ammo[i]! -= n;
      took = true;
    }
  });
  GRENADES.forEach((g, i) => {
    const n = Math.min(g.maxCarry - p.gren[i]!, bag.gren[i]!);
    if (n > 0) {
      p.gren[i]! += n;
      bag.gren[i]! -= n;
      took = true;
    }
  });
  return took;
}
