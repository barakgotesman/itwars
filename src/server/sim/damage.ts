/**
 * Applying damage: spawn protection, hit and kill events, loot drops, scores and the kill-limit win check.
 */
import { RESPAWN_TICKS } from '@shared/core/constants';
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
  if (sim.phase !== 'play' || !victim.alive || sim.tick < victim.protectUntil) return;
  const dmg = Math.max(1, Math.round(amount));
  victim.hp = Math.max(0, victim.hp - dmg);
  sim.events.push({ k: 'hit', by: attacker.id, to: victim.id, dmg, head });
  if (victim.hp > 0) return;

  victim.alive = false;
  victim.deaths++;
  victim.respawnAt = sim.tick + RESPAWN_TICKS;
  dropLoot(sim, victim);
  victim.reloadEnd = 0;
  if (attacker !== victim) attacker.kills++;
  sim.rosterDirty = true;
  sim.events.push({ k: 'kill', by: attacker.id, to: victim.id, w: weapon });
  if (attacker !== victim && attacker.kills >= sim.rules.killLimit) endMatch(sim, attacker.id, 'kills');
}
