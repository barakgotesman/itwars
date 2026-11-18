/**
 * Applying damage: spawn protection, hit and kill events, loot drops, scores and the kill-limit win check. Also the
 * other way to die: falling off a map with a void.
 */
import { FALL_CREDIT_TICKS, RESPAWN_TICKS } from '@shared/core/constants';
import { dropLoot } from './loot';
import { endMatch } from './match';
import type { Player } from './player';
import type { Sim } from './state';

/**
 * Applies damage, handling spawn protection, kills and the win check.
 * @param victim - Who is hurt.
 * @param amount - Raw damage before rounding.
 * @param attacker - Who dealt it (a victim hitting themselves counts as a suicide).
 * @param weapon - Weapon index, or `'frag'` for explosions.
 * @param head - Whether it was a headshot.
 */
export function damage(sim: Sim, victim: Player, amount: number, attacker: Player, weapon: number | 'frag', head: boolean): void {
  // Practice only: the one human there is invulnerable (no self-kill by a wild grenade); range targets
  // still take damage normally, so they can be hit and "killed" (and come back a few seconds later).
  if (sim.rules.mode === 'range' && !victim.rangeDummy) return;
  if (sim.phase !== 'play' || !victim.alive || sim.tick < victim.protectUntil) return;
  const dmg = Math.max(1, Math.round(amount));
  victim.hp = Math.max(0, victim.hp - dmg);
  if (attacker !== victim) {
    victim.lastHurtBy = attacker.id;
    victim.lastHurtTick = sim.tick;
  }
  sim.events.push({ k: 'hit', by: attacker.id, to: victim.id, dmg, head });
  if (victim.hp > 0) return;
  registerDeath(sim, victim, attacker, weapon, head, true);
}

/**
 * Kills a player who dropped below the map's `killY`. Spawn protection does not save them (they would fall forever),
 * and no loot bag is dropped (it would hang in the void, out of everyone's reach). Whoever damaged them in the last
 * `FALL_CREDIT_TICKS` gets the kill; otherwise it is a plain death with no score penalty.
 * @param victim - The player who fell.
 */
export function killByFall(sim: Sim, victim: Player): void {
  if (!victim.alive || sim.phase !== 'play') return;
  victim.hp = 0;
  const pusher = victim.lastHurtBy >= 0 && sim.tick - victim.lastHurtTick <= FALL_CREDIT_TICKS ? sim.players.get(victim.lastHurtBy) : undefined;
  registerDeath(sim, victim, pusher ?? victim, 'fall', false, false);
}

/**
 * The bookkeeping every death shares: state, loot, the kill event, the score and the kill-limit win check.
 * @param loot - Whether the victim drops a loot bag.
 */
function registerDeath(sim: Sim, victim: Player, attacker: Player, weapon: number | 'frag' | 'fall', head: boolean, loot: boolean): void {
  victim.alive = false;
  victim.deaths++;
  victim.respawnAt = sim.tick + RESPAWN_TICKS;
  if (loot) dropLoot(sim, victim);
  victim.reloadEnd = 0;
  sim.events.push({ k: 'kill', by: attacker.id, to: victim.id, w: weapon, head });
  // A target's "death" is not a match kill: it should not count toward the kill limit or end practice.
  if (victim.rangeDummy) return;
  if (attacker !== victim) attacker.kills++;
  sim.rosterDirty = true;
  if (attacker !== victim && attacker.kills >= sim.rules.killLimit) endMatch(sim, attacker.id, 'kills');
}
