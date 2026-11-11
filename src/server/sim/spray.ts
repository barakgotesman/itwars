/**
 * Spray paint: lets a living player tag the wall in front of them. The server finds the surface, enforces the
 * cooldown and tells the whole room where the tag goes; the player's chosen design is already known from the
 * roster, so a client can never ask for an arbitrary picture.
 */
import { EYE_HEIGHT, SPRAY_COOLDOWN_TICKS, SPRAY_RANGE } from '@shared/core/constants';
import { lookDir, rayVsAabbFace } from '@shared/core/physics';
import type { Player } from './player';
import type { Sim } from './state';
import { round2 } from './util';

/**
 * Sprays the surface the player is facing, if one is close enough.
 * @remarks Does nothing during the intermission, on cooldown, in open air, or when the nearest surface is a
 * sliding door (a tag there would be left floating when the door moves).
 */
export function useSpray(sim: Sim, p: Player): void {
  if (sim.phase !== 'play' || sim.tick < p.sprayReadyAt) return;
  const ox = p.state.x, oy = p.state.y + EYE_HEIGHT, oz = p.state.z;
  const [dx, dy, dz] = lookDir(p.state.yaw, p.state.pitch);

  let bestT = SPRAY_RANGE;
  let axis = -1;
  let sign = 1;
  let isDoor = false;
  for (const b of sim.solids) {
    const h = rayVsAabbFace(ox, oy, oz, dx, dy, dz, b);
    if (h !== null && h.t < bestT) {
      bestT = h.t;
      axis = h.axis;
      sign = h.sign;
      isDoor = sim.doors.boxes.includes(b);
    }
  }
  if (axis < 0 || isDoor) return;

  p.sprayReadyAt = sim.tick + SPRAY_COOLDOWN_TICKS;
  // Quarter turns of the player's heading, so a tag on the floor or ceiling reads the right way up from where they stand.
  const r = ((Math.round(p.state.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  sim.events.push({
    k: 'spray', id: p.id, x: round2(ox + dx * bestT), y: round2(oy + dy * bestT), z: round2(oz + dz * bestT), a: axis, s: sign, r,
  });
}
