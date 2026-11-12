import {
  AIR_ACCEL, GRAVITY, GROUND_ACCEL, JUMP_SPEED, Key, MAX_PITCH, PLAYER_HEIGHT, PLAYER_RADIUS,
  SPRINT_SPEED, WALK_SPEED,
} from './constants';

/** Axis-aligned box in world space (x east, y up, z south). */
export interface Aabb {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

/** Full simulated state of one player; `y` is the feet position. */
export interface PlayerState {
  x: number; y: number; z: number; // y = feet
  vx: number; vy: number; vz: number;
  yaw: number; pitch: number;
  onGround: boolean;
}

/** One tick of player input: key bitmask (see `Key`) plus view angles in radians. */
export interface InputCmd {
  keys: number;
  yaw: number;
  pitch: number;
}

/**
 * Creates a motionless player at a feet position.
 * @param x - World x.
 * @param y - Feet height.
 * @param z - World z.
 */
export function newPlayerState(x: number, y: number, z: number): PlayerState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false };
}

/**
 * Unit view direction. Yaw 0 faces -Z and positive yaw turns left; pitch > 0 looks up.
 * @param yaw - Horizontal angle in radians.
 * @param pitch - Vertical angle in radians.
 * @returns `[x, y, z]` direction vector.
 */
export function lookDir(yaw: number, pitch: number): [number, number, number] {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

/**
 * Ray vs box (slab method).
 * @returns Distance along the (unit) direction to the entry point, 0 if the origin is inside, or null on a miss.
 */
export function rayVsAabb(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Aabb,
): number | null {
  // The three slabs are written out (no temporary arrays): this runs hundreds of times per line-of-sight check,
  // so allocating here made it the server's biggest cost.
  let tMin = 0;
  let tMax = Infinity;
  let t0: number, t1: number, s: number;
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.minX || ox > b.maxX) return null;
  } else {
    t0 = (b.minX - ox) / dx; t1 = (b.maxX - ox) / dx;
    if (t0 > t1) { s = t0; t0 = t1; t1 = s; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin > tMax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.minY || oy > b.maxY) return null;
  } else {
    t0 = (b.minY - oy) / dy; t1 = (b.maxY - oy) / dy;
    if (t0 > t1) { s = t0; t0 = t1; t1 = s; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin > tMax) return null;
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.minZ || oz > b.maxZ) return null;
  } else {
    t0 = (b.minZ - oz) / dz; t1 = (b.maxZ - oz) / dz;
    if (t0 > t1) { s = t0; t0 = t1; t1 = s; }
    if (t0 > tMin) tMin = t0;
    if (t1 < tMax) tMax = t1;
    if (tMin > tMax) return null;
  }
  return tMin;
}

/** Where a ray first enters a box and which way that face points. */
export interface RayFaceHit {
  /** Distance along the (unit) direction. */
  t: number;
  /** Axis of the hit face's normal: 0 = x, 1 = y, 2 = z; -1 if the ray started inside the box. */
  axis: number;
  /** Direction of the normal along that axis: +1 or -1 (it points back toward the ray's origin). */
  sign: number;
}

/**
 * Like `rayVsAabb`, but also reports which face of the box was hit.
 * @returns The hit, or null on a miss.
 */
export function rayVsAabbFace(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Aabb,
): RayFaceHit | null {
  let tMin = 0;
  let tMax = Infinity;
  let axis = -1;
  let sign = 1;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const lo = [b.minX, b.minY, b.minZ];
  const hi = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    const oi = o[i]!;
    const di = d[i]!;
    if (Math.abs(di) < 1e-9) {
      if (oi < lo[i]! || oi > hi[i]!) return null;
      continue;
    }
    let t0 = (lo[i]! - oi) / di;
    let t1 = (hi[i]! - oi) / di;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tMin) {
      tMin = t0;
      axis = i;
      // Entering through the face that looks against the direction of travel.
      sign = di > 0 ? -1 : 1;
    }
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) return null;
  }
  return { t: tMin, axis, sign };
}

const EPS = 1e-4;

/**
 * True if a standing player at `s` (feet position) overlaps a box.
 * @param s - Anything with a feet position, such as a `PlayerState`.
 */
export function overlaps(s: { x: number; y: number; z: number }, b: Aabb): boolean {
  return (
    s.x + PLAYER_RADIUS > b.minX && s.x - PLAYER_RADIUS < b.maxX &&
    s.z + PLAYER_RADIUS > b.minZ && s.z - PLAYER_RADIUS < b.maxZ &&
    s.y + PLAYER_HEIGHT > b.minY && s.y < b.maxY
  );
}

function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return Math.min(v + maxDelta, target);
  return Math.max(v - maxDelta, target);
}

/**
 * Advances one player by one fixed step, mutating `s`. Single source of truth for movement,
 * used by both the client (prediction) and the server.
 * @param s - Player state to update in place.
 * @param cmd - Input for this tick.
 * @param dt - Step length in seconds.
 * @param solids - Static collision boxes.
 */
export function stepMovement(s: PlayerState, cmd: InputCmd, dt: number, solids: readonly Aabb[]): void {
  s.yaw = cmd.yaw;
  s.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cmd.pitch));

  let fwd = 0, side = 0;
  if (cmd.keys & Key.Forward) fwd += 1;
  if (cmd.keys & Key.Back) fwd -= 1;
  if (cmd.keys & Key.Right) side += 1;
  if (cmd.keys & Key.Left) side -= 1;
  const len = Math.hypot(fwd, side) || 1; // normalise so diagonals are not faster
  fwd /= len; side /= len;

  const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
  const speed = cmd.keys & Key.Sprint ? SPRINT_SPEED : WALK_SPEED;
  const wishX = (-sin * fwd + cos * side) * speed;
  const wishZ = (-cos * fwd - sin * side) * speed;

  const accel = (s.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt;
  s.vx = approach(s.vx, wishX, accel);
  s.vz = approach(s.vz, wishZ, accel);

  if (s.onGround && cmd.keys & Key.Jump) {
    s.vy = JUMP_SPEED;
    s.onGround = false;
  }
  s.vy -= GRAVITY * dt;

  s.x += s.vx * dt;
  for (const b of solids) {
    if (!overlaps(s, b)) continue;
    s.x = s.vx > 0 ? b.minX - PLAYER_RADIUS - EPS : b.maxX + PLAYER_RADIUS + EPS;
    s.vx = 0;
  }
  s.z += s.vz * dt;
  for (const b of solids) {
    if (!overlaps(s, b)) continue;
    s.z = s.vz > 0 ? b.minZ - PLAYER_RADIUS - EPS : b.maxZ + PLAYER_RADIUS + EPS;
    s.vz = 0;
  }
  s.y += s.vy * dt;
  s.onGround = false;
  for (const b of solids) {
    if (!overlaps(s, b)) continue;
    if (s.vy > 0) {
      s.y = b.minY - PLAYER_HEIGHT - EPS;
    } else {
      s.y = b.maxY;
      s.onGround = true;
    }
    s.vy = 0;
  }
}
