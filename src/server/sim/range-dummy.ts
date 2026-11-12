/**
 * Shooting-range targets: ordinary bot `Player`s that never fire back, paced sideways on a fixed line
 * by this file instead of the real bot brain (`sim/bots/*`). They have HP and can be killed like any
 * player (`damage.ts` lets a hit through only for these, so the one human in the room stays
 * invulnerable) and come back a few seconds later, so practice never runs out of targets.
 */
import { PLAYER_COLORS, CHARACTERS } from '@shared/core/characters';
import { MAX_HP, TICK_RATE } from '@shared/core/constants';
import type { Room } from '@server/rooms/room';
import { NOOP_CONN } from './bots';
import type { Sim } from './state';

/** How far (m) either side of its distance a target paces. */
const SWAY_AMP = 2.3;

/**
 * Adds one target per distance, already standing and ready to be shot (ranges have no lobby to wait in).
 * @param room - A freshly built range room; call from its constructor, before any human joins.
 * @param targets - Distances down the range (see `shared/world/map/range.ts`'s `TARGETS`).
 */
export function addRangeDummies(room: Room, targets: readonly { z: number }[]): void {
  for (const t of targets) {
    const id = room.join(NOOP_CONN, 'Target', {
      model: Math.floor(room.rng() * CHARACTERS.length),
      color: Math.floor(room.rng() * PLAYER_COLORS.length),
    }, { bot: true });
    if (id === null) break;
    const p = room.players.get(id);
    if (!p) continue;
    p.playing = true;
    p.alive = true;
    p.hp = MAX_HP;
    p.state.x = 0;
    p.state.z = t.z;
    p.state.onGround = true;
    p.rangeDummy = { z: t.z, amp: SWAY_AMP, speed: 0.4 + room.rng() * 0.5, phase: room.rng() * Math.PI * 2 };
  }
}

/** Paces every living target and revives a dead one once its respawn timer is up; all of them face the one human. */
export function stepRangeDummies(sim: Sim): void {
  let hx = 0, hz = -1;
  for (const h of sim.players.values()) if (!h.rangeDummy) { hx = h.state.x; hz = h.state.z; break; }

  for (const p of sim.players.values()) {
    const d = p.rangeDummy;
    if (!d) continue;
    if (!p.alive) {
      if (sim.tick < p.respawnAt) continue;
      p.alive = true;
      p.hp = MAX_HP;
      p.protectUntil = 0;
    }
    const w = (sim.tick / TICK_RATE) * d.speed + d.phase;
    p.state.vx = Math.cos(w) * d.amp * d.speed;
    p.state.x = Math.sin(w) * d.amp;
    p.state.y = 0;
    p.state.z = d.z;
    // Face the human, not the direction of travel (yaw 0 faces -z; atan2(-dx,-dz) turns to face a point).
    p.state.yaw = Math.atan2(p.state.x - hx, p.state.z - hz);
  }
}
