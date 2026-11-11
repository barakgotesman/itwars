/** Headless sanity checks for shared movement against the real map. Run with `npx tsx scripts/physics-check.ts`. */
import { Key, TICK_DT } from '../src/shared/constants';
import { SOLIDS } from '../src/shared/map';
import { newPlayerState, stepMovement } from '../src/shared/physics';

/** Runs `ticks` fixed steps with constant input. */
function run(s: ReturnType<typeof newPlayerState>, keys: number, ticks: number): void {
  for (let i = 0; i < ticks; i++) stepMovement(s, { keys, yaw: 0, pitch: 0 }, TICK_DT, SOLIDS);
}

let failed = 0;
function check(ok: boolean, msg: string, val: unknown): void {
  if (!ok) { failed++; console.error('FAIL', msg, val); }
}

const a = newPlayerState(-33, 2, -8);
run(a, 0, 120);
check(a.onGround && Math.abs(a.y) < 1e-6, 'settles on floor', a.y);

// North wall at z = -20 has no door at x = -33, so the player must stop in front of it.
const b = newPlayerState(-33, 0, 2);
run(b, Key.Forward | Key.Sprint, 600);
check(b.z > -19.5 && b.z < -19.3, 'wall blocks at z=-19.45', b.z);

// Meeting room B door at x = -13 must be passable.
const c = newPlayerState(-13, 0, -16);
run(c, Key.Forward | Key.Sprint, 120);
check(c.z < -22, 'passes door into meeting room', c.z);

// Hop onto the 1.1 m reception desk from the north (walking south = Key.Back).
const d = newPlayerState(0, 0, 25.5);
d.onGround = true;
run(d, Key.Back | Key.Jump, 1);
run(d, Key.Back, 16);
run(d, 0, 60);
check(Math.abs(d.y - 1.1) < 1e-3 && d.onGround, 'stands on reception desk', { y: d.y, z: d.z });

console.log('physics-check', failed ? `${failed} FAILED` : 'OK', { floorY: a.y, wallZ: b.z, doorZ: c.z, deskY: d.y, deskZ: d.z });
if (failed) process.exit(1);
