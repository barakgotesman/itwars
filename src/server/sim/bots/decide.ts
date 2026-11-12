/**
 * What a bot wants to do when it is not in a fight: heal when hurt, restock when low, loot a fallen player's bag,
 * check out a noise, otherwise wander. Each wish gets a score and the highest wins, with a margin before the bot
 * changes its mind so it does not dither. Pickups are read from the same tables the server uses.
 */
import { GRENADES, WEAPONS } from '@shared/rules/weapons';
import { MAX_HP } from '@shared/core/constants';
import type { BotTuning } from '@shared/rules/bots';
import type { Loot } from '../loot';
import type { Player } from '../player';
import type { Sim } from '../state';
import { setGoal } from './navigate';
import type { BotState, GoalKind } from './state';

/** Ticks between decisions (staggered per bot). */
const DECIDE_EVERY = 10;
/** The bot only looks for health below this much HP. */
const HEAL_BELOW = 70;
/** The bot only looks for ammo below this share of its total capacity. */
const LOW_AMMO = 0.35;
/** Pickups and bags farther than this (m) are not worth the trip. */
const PICKUP_RANGE = 60;
const LOOT_RANGE = 20;
/** Base scores. A noise is worth checking out but not worth dying of thirst for. */
const ROAM_SCORE = 0.25;
const INVESTIGATE_SCORE = 0.45;
const LOOT_SCORE = 0.5;
const GRENADE_CRATE_WEIGHT = 0.3;
/** A new wish must beat the current one by this much. */
const SWITCH_MARGIN = 0.1;
/** Extra weight on the wish being acted on, so a long trip is not dropped half way as the news gets old. */
const COMMIT_BONUS = 0.2;
/** A noise already being investigated never counts for less than this share of its starting score. */
const INVESTIGATE_FLOOR = 0.3;
/** Two goals closer than this (m) are the same place. */
const SAME_PLACE = 2;

/** One thing the bot could do. `roam` has no place: navigation picks the next waypoint itself. */
interface Wish {
  kind: GoalKind;
  score: number;
  x: number;
  z: number;
}

/** Share of the bot's total ammo capacity it carries (magazines plus reserves, over every weapon). */
export function ammoShare(p: Player): number {
  let have = 0, cap = 0;
  WEAPONS.forEach((w, i) => { have += (p.mag[i] ?? 0) + (p.reserve[i] ?? 0); cap += w.magSize + w.maxReserve; });
  return have / cap;
}

/** True if looting the bag would give the bot something (the server leaves what does not fit). */
function bagHelps(p: Player, bag: Loot): boolean {
  return WEAPONS.some((w, i) => bag.ammo[i]! > 0 && (p.reserve[i] ?? 0) < w.maxReserve) ||
    GRENADES.some((g, i) => bag.gren[i]! > 0 && (p.gren[i] ?? 0) < g.maxCarry);
}

/** The closest active pickup of a kind, as a wish scored by `need` (0..1) and distance. */
function nearestSpot(sim: Sim, p: Player, kind: 'hp' | 'ammo' | 'grenade', need: number, as: GoalKind, weight = 1): Wish | null {
  let best: Wish | null = null;
  sim.spots.forEach((spot, i) => {
    if (spot.kind !== kind || sim.pickupReady[i]! > sim.tick) return;
    const d = Math.hypot(spot.x - p.state.x, spot.z - p.state.z);
    if (d > PICKUP_RANGE) return;
    const score = need * weight * Math.max(0.2, 1 - d / PICKUP_RANGE);
    if (!best || score > best.score) best = { kind: as, score, x: spot.x, z: spot.z };
  });
  return best;
}

/**
 * Re-decides where the bot should go. Does nothing between decision ticks or while it is chasing a sighting.
 */
export function decide(sim: Sim, p: Player, st: BotState, tune: BotTuning): void {
  if ((sim.tick + p.id) % DECIDE_EVERY !== 0 || st.chasing) return;
  // A noise that was checked out (the goal finished) is old news.
  if (!st.goal && st.goalKind === 'investigate') st.heard = null;

  const wishes: Wish[] = [{ kind: 'roam', score: ROAM_SCORE, x: 0, z: 0 }];
  if (p.hp < HEAL_BELOW) {
    const w = nearestSpot(sim, p, 'hp', (MAX_HP - p.hp) / MAX_HP, 'heal');
    if (w) wishes.push(w);
  }
  const share = ammoShare(p);
  if (share < LOW_AMMO) {
    const w = nearestSpot(sim, p, 'ammo', 1 - share, 'ammo');
    if (w) wishes.push(w);
  }
  if (p.gren.every((g) => g <= 0)) {
    const w = nearestSpot(sim, p, 'grenade', 1, 'ammo', GRENADE_CRATE_WEIGHT);
    if (w) wishes.push(w);
  }
  if (share < 1) {
    let bag: Wish | null = null;
    for (const l of sim.loot) {
      const d = Math.hypot(l.x - p.state.x, l.z - p.state.z);
      if (d > LOOT_RANGE || !bagHelps(p, l)) continue;
      const score = LOOT_SCORE * (1 - d / LOOT_RANGE) * (1 - share);
      if (!bag || score > bag.score) bag = { kind: 'loot', score, x: l.x, z: l.z };
    }
    if (bag) wishes.push(bag);
  }
  if (st.heard) {
    // Fresh news starts an investigation; once under way it stands until the bot gets there.
    const age = sim.tick - st.heard.tick;
    const underWay = st.goal !== null && st.goalKind === 'investigate';
    if (age < tune.memoryTicks || underWay) {
      const fresh = Math.max(INVESTIGATE_FLOOR, 1 - age / tune.memoryTicks);
      wishes.push({ kind: 'investigate', score: INVESTIGATE_SCORE * fresh, x: st.heard.x, z: st.heard.z });
    }
  }

  const top = wishes.reduce((a, b) => (b.score > a.score ? b : a));
  const current = wishes.find((w) => w.kind === st.goalKind);
  if (st.goal) {
    const holds = top.kind === st.goalKind && (top.kind === 'roam' || Math.hypot(top.x - st.goal.x, top.z - st.goal.z) < SAME_PLACE);
    // A wish that is still valid gets a bonus for being under way; one that vanished (the box was taken) gets none.
    const keep = current ? current.score + SWITCH_MARGIN + (current.kind === 'roam' ? 0 : COMMIT_BONUS) : SWITCH_MARGIN;
    if (holds || top.score <= keep) return;
  }
  if (top.kind === 'roam') {
    st.goal = null; // navigation picks the next waypoint
    st.goalKind = 'roam';
  } else {
    setGoal(st, { x: top.x, z: top.z }, top.kind);
  }
}
