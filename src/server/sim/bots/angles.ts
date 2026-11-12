/**
 * Angle helpers for bot aiming and steering. Yaw 0 faces -Z and positive yaw turns left, matching `lookDir`.
 */

/** Wraps an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}

/**
 * Yaw that looks along the horizontal vector (dx, dz).
 * @remarks Inverse of `lookDir`: `lookDir(yawTo(dx, dz), 0)` points the same way.
 */
export function yawTo(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/**
 * Turns an angle toward a goal by at most `maxStep`, the short way round.
 * @param current - Current angle.
 * @param goal - Angle to reach.
 * @param maxStep - Largest change allowed this tick (radians, >= 0).
 * @returns The new angle.
 */
export function turnToward(current: number, goal: number, maxStep: number): number {
  const diff = wrapAngle(goal - current);
  return Math.abs(diff) <= maxStep ? current + diff : current + Math.sign(diff) * maxStep;
}
