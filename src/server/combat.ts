/**
 * Pure combat geometry: line of sight, hitscan ray casts and grenade projectile stepping.
 * No room state lives here, so it can be unit-tested and reused.
 */
import { CHEST_Y, HEAD_Y, PLAYER_HEIGHT, PLAYER_RADIUS } from '../shared/constants';
import { rayVsAabb, rayVsAabbFace, type Aabb } from '../shared/physics';
import { GRENADE_GRAVITY, GRENADE_RADIUS, type GrenadeDef } from '../shared/weapons';

/** Result of a ray cast against the world and a set of players. */
export interface RayHit {
  /** Distance along the ray. */
  t: number;
  /** Id of the player hit, or -1 for world / nothing. */
  player: number;
  head: boolean;
  /** For a world hit: the axis (0-2) and sign (+1/-1) of the surface normal, so a bullet hole can be placed. -1 otherwise. */
  axis: number;
  sign: number;
}

/** A player's hit box, as the ray caster sees it. */
export interface Target {
  id: number;
  x: number; y: number; z: number;
}

/**
 * Builds the body box of a player standing with feet at (x, y, z).
 * @returns An AABB matching the movement collision cylinder.
 */
export function bodyBox(x: number, y: number, z: number): Aabb {
  return {
    minX: x - PLAYER_RADIUS, maxX: x + PLAYER_RADIUS,
    minY: y, maxY: y + PLAYER_HEIGHT,
    minZ: z - PLAYER_RADIUS, maxZ: z + PLAYER_RADIUS,
  };
}

/**
 * Distance to the nearest solid along a ray.
 * @returns Distance, or `maxDist` if nothing is closer.
 */
export function worldDistance(
  solids: readonly Aabb[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number,
): number {
  let best = maxDist;
  for (const b of solids) {
    const t = rayVsAabb(ox, oy, oz, dx, dy, dz, b);
    if (t !== null && t < best) best = t;
  }
  return best;
}

/**
 * Casts a ray against the world and players; the nearest thing wins.
 * @param targets - Players that can be hit (callers exclude the shooter and the dead).
 * @param maxDist - Furthest distance to consider.
 */
export function castRay(
  solids: readonly Aabb[], targets: readonly Target[],
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number,
): RayHit {
  // Nearest solid, remembering which face it was so the hit can leave a bullet hole facing the right way.
  let best: RayHit = { t: maxDist, player: -1, head: false, axis: -1, sign: 1 };
  for (const b of solids) {
    const h = rayVsAabbFace(ox, oy, oz, dx, dy, dz, b);
    if (h !== null && h.t < best.t) best = { t: h.t, player: -1, head: false, axis: h.axis, sign: h.sign };
  }
  for (const p of targets) {
    const t = rayVsAabb(ox, oy, oz, dx, dy, dz, bodyBox(p.x, p.y, p.z));
    if (t !== null && t < best.t) {
      best = { t, player: p.id, head: oy + dy * t >= p.y + HEAD_Y, axis: -1, sign: 1 };
    }
  }
  return best;
}

/**
 * True if a straight line between two points is not blocked by any solid.
 * @remarks Explosions test several body points so a player peeking round a corner still counts.
 */
export function hasLineOfSight(
  solids: readonly Aabb[], ax: number, ay: number, az: number, bx: number, by: number, bz: number,
): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  return worldDistance(solids, ax, ay, az, dx / dist, dy / dist, dz / dist, dist) >= dist - 1e-3;
}

/**
 * True if an explosion at a point can see any of a player's feet, chest or head.
 */
export function explosionSeesPlayer(
  solids: readonly Aabb[], ex: number, ey: number, ez: number, p: Target,
): boolean {
  return (
    hasLineOfSight(solids, ex, ey, ez, p.x, p.y + CHEST_Y, p.z) ||
    hasLineOfSight(solids, ex, ey, ez, p.x, p.y + HEAD_Y, p.z) ||
    hasLineOfSight(solids, ex, ey, ez, p.x, p.y + 0.3, p.z)
  );
}

/** Mutable grenade projectile. */
export interface Projectile {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

/** True if a grenade sphere centred at the point overlaps the box. */
function sphereHits(b: Aabb, x: number, y: number, z: number): boolean {
  return (
    x + GRENADE_RADIUS > b.minX && x - GRENADE_RADIUS < b.maxX &&
    y + GRENADE_RADIUS > b.minY && y - GRENADE_RADIUS < b.maxY &&
    z + GRENADE_RADIUS > b.minZ && z - GRENADE_RADIUS < b.maxZ
  );
}

/**
 * Advances a grenade one step: gravity, then per-axis movement that bounces off solids.
 * @remarks Axis-by-axis like the player controller; at 16 m/s a tick moves 0.27 m, less than any wall.
 */
export function stepProjectile(g: Projectile, def: GrenadeDef, dt: number, solids: readonly Aabb[]): void {
  g.vy -= GRENADE_GRAVITY * dt;

  g.x += g.vx * dt;
  for (const b of solids) {
    if (!sphereHits(b, g.x, g.y, g.z)) continue;
    g.x -= g.vx * dt;
    g.vx *= -def.bounce;
    g.vz *= def.floorFriction;
    break;
  }
  g.z += g.vz * dt;
  for (const b of solids) {
    if (!sphereHits(b, g.x, g.y, g.z)) continue;
    g.z -= g.vz * dt;
    g.vz *= -def.bounce;
    g.vx *= def.floorFriction;
    break;
  }
  g.y += g.vy * dt;
  for (const b of solids) {
    if (!sphereHits(b, g.x, g.y, g.z)) continue;
    g.y -= g.vy * dt;
    g.vy *= -def.bounce;
    // Resting contact: stop tiny hops and scrub horizontal speed so grenades roll to a halt.
    if (Math.abs(g.vy) < 1) g.vy = 0;
    g.vx *= def.floorFriction;
    g.vz *= def.floorFriction;
    break;
  }
}
