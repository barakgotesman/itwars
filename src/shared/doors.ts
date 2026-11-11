/**
 * Door simulation shared by the server and every client: door state, the moving collision boxes, pushing
 * players out of a door's way, and choosing which door a player is facing. Both sides run the same code, so
 * client-side movement prediction matches the server.
 */
import { PLAYER_RADIUS } from './constants';
import { DOORS, DOOR_HEIGHT, DOOR_OVERLAP, DOOR_THICKNESS, type DoorDef } from './map/doors';
import { overlaps, type Aabb } from './physics';

/** Fraction of a door's travel covered per second (2 s from closed to open). */
export const DOOR_SPEED = 0.5;
/** How far from the doorway a player can use it. */
export const DOOR_REACH = 3.2;
/** Seconds before a door can be toggled again, so a held key does not make it stutter. */
const TOGGLE_COOLDOWN_S = 0.3;
/** Smallest dot product between facing and the doorway for a door to count as "looked at". */
const FACING_MIN = 0.35;
/** Gap left between a pushed player and the door, so they are not left touching it. */
const PUSH_MARGIN = 0.002;

/** A door's moving state. */
export interface DoorState {
  /** How open it is right now: 0 closed .. 1 open. */
  open: number;
  /** Where it is heading. A half-closed door rests at 0.5. */
  target: number;
}

/** Anything that can be pushed: a player's feet position (mutated in place). */
export interface Pushable {
  x: number;
  y: number;
  z: number;
}

/** Moves `v` toward `target` by at most `maxDelta`. */
function approach(v: number, target: number, maxDelta: number): number {
  return v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target);
}

/** All the doors of one match: their states and live collision boxes. */
export class Doors {
  readonly defs: readonly DoorDef[];
  readonly states: DoorState[];
  /**
   * One collision box per door, mutated in place as the door moves. Add these to the list of solids once
   * (`[...SOLIDS, ...doors.boxes]`) and movement and bullets will respect the doors automatically.
   */
  readonly boxes: Aabb[];
  private readonly cooldown: number[];

  /** @param defs - Door layout; defaults to the office's doors. */
  constructor(defs: readonly DoorDef[] = DOORS) {
    this.defs = defs;
    this.states = defs.map((d) => ({ open: d.initial, target: d.initial }));
    this.cooldown = defs.map(() => 0);
    this.boxes = defs.map((_, i) => this.boxAt(i, defs[i]!.initial, {} as Aabb));
  }

  /** True while at least one door is moving. */
  get moving(): boolean {
    return this.states.some((s) => s.open !== s.target);
  }

  /** Puts every door back to its starting state (a new match). */
  reset(): void {
    this.defs.forEach((d, i) => {
      this.states[i] = { open: d.initial, target: d.initial };
      this.cooldown[i] = 0;
      this.boxAt(i, d.initial, this.boxes[i]!);
    });
  }

  /** Writes door `i`'s collision box for a given openness into `out` (and returns it). */
  private boxAt(i: number, open: number, out: Aabb): Aabb {
    const d = this.defs[i]!;
    // Panel is a little wider than the doorway so it overlaps the wall; it slides by gap + overlap to clear it.
    const length = d.gap + DOOR_OVERLAP * 2;
    const shift = d.dir * (d.gap + DOOR_OVERLAP) * open;
    const half = length / 2;
    const t = DOOR_THICKNESS / 2;
    if (d.axis === 'x') {
      out.minX = d.x + shift - half; out.maxX = d.x + shift + half;
      out.minZ = d.z - t; out.maxZ = d.z + t;
    } else {
      out.minZ = d.z + shift - half; out.maxZ = d.z + shift + half;
      out.minX = d.x - t; out.maxX = d.x + t;
    }
    out.minY = 0;
    out.maxY = DOOR_HEIGHT;
    return out;
  }

  /**
   * Advances every moving door by one step, nudging players out of its way. A player who cannot be moved
   * (wedged against a wall) makes the door stop for this step instead of crushing them.
   * @param dt - Step length in seconds.
   * @param bodies - Players that doors can push.
   * @param solids - Every collision box, doors included, used to check that a pushed player has room.
   * @returns True if any door moved.
   */
  step(dt: number, bodies: readonly Pushable[], solids: readonly Aabb[]): boolean {
    let moved = false;
    for (let i = 0; i < this.states.length; i++) {
      this.cooldown[i] = Math.max(0, this.cooldown[i]! - dt);
      const st = this.states[i]!;
      if (st.open === st.target) continue;
      const next = approach(st.open, st.target, DOOR_SPEED * dt);
      const box = this.boxAt(i, next, { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
      const pushes = this.pushesFor(i, box, bodies, solids);
      if (pushes === null) continue; // someone is wedged: hold the door where it is
      for (const [body, axis, value] of pushes) body[axis] = value;
      st.open = next;
      this.boxAt(i, next, this.boxes[i]!);
      moved = true;
    }
    return moved;
  }

  /**
   * Works out where each body overlapping a door's next position must go to be clear of it.
   * @returns The moves to apply, or null if any body has nowhere to go.
   */
  private pushesFor(i: number, box: Aabb, bodies: readonly Pushable[], solids: readonly Aabb[]): [Pushable, 'x' | 'z', number][] | null {
    const d = this.defs[i]!;
    const own = this.boxes[i]!;
    const out: [Pushable, 'x' | 'z', number][] = [];
    for (const b of bodies) {
      if (!overlaps(b, box)) continue;
      // The panel's face is flat, so push along the wall's normal: away from the wall on the panel's side
      // if the player is in front of the panel's centre, otherwise the other way.
      const normal: 'x' | 'z' = d.axis === 'x' ? 'z' : 'x';
      const centre = normal === 'z' ? (box.minZ + box.maxZ) / 2 : (box.minX + box.maxX) / 2;
      const hi = normal === 'z' ? box.maxZ : box.maxX;
      const lo = normal === 'z' ? box.minZ : box.minX;
      const forward = (b[normal] - centre) * d.side >= 0;
      const target = forward === (d.side > 0)
        ? hi + PLAYER_RADIUS + PUSH_MARGIN
        : lo - PLAYER_RADIUS - PUSH_MARGIN;
      const moved = { x: b.x, y: b.y, z: b.z };
      moved[normal] = target;
      // Does the player fit there? Everything but this door's own (old) box counts.
      if (solids.some((s) => s !== own && overlaps(moved, s))) return null;
      out.push([b, normal, target]);
    }
    return out;
  }

  /**
   * Which door a player is facing and close enough to use.
   * @param x - Player's x.
   * @param z - Player's z.
   * @param yaw - View direction (0 faces -Z).
   * @returns Door index, or -1 if none.
   */
  pick(x: number, z: number, yaw: number): number {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    let best = -1;
    let bestScore = -Infinity;
    this.defs.forEach((d, i) => {
      // Nearest point along the doorway to the player, so standing beside a wide door still counts.
      const half = d.gap / 2;
      const px = d.axis === 'x' ? Math.min(d.x + half, Math.max(d.x - half, x)) : d.x;
      const pz = d.axis === 'z' ? Math.min(d.z + half, Math.max(d.z - half, z)) : d.z;
      const dx = px - x;
      const dz = pz - z;
      const dist = Math.hypot(dx, dz);
      if (dist > DOOR_REACH) return;
      const dot = dist < 0.01 ? 1 : (dx * fx + dz * fz) / dist;
      if (dot < FACING_MIN) return;
      const score = dot * 2 - dist * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  /** What using door `i` would do right now: closing if it is fully open, opening otherwise. */
  willClose(i: number): boolean {
    return this.states[i]!.target >= 1;
  }

  /**
   * Starts a door opening or closing.
   * @returns False if it was toggled too recently.
   */
  toggle(i: number): boolean {
    if (this.cooldown[i]! > 0) return false;
    const st = this.states[i]!;
    st.target = this.willClose(i) ? 0 : 1;
    this.cooldown[i] = TOGGLE_COOLDOWN_S;
    return true;
  }

  /** Sets one door from a received event (open and target in whole percent). */
  setState(i: number, open: number, target: number): void {
    const s = this.states[i];
    if (!s) return;
    s.open = open / 100;
    s.target = target / 100;
    this.boxAt(i, s.open, this.boxes[i]!);
  }

  /** All states as `[open, target, open, target, ...]` in whole percent, for the wire. */
  wire(): number[] {
    return this.states.flatMap((s) => [Math.round(s.open * 100), Math.round(s.target * 100)]);
  }

  /**
   * Applies states received from the server (the inverse of `wire`).
   * @param w - The `[open, target, ...]` list.
   * @param tolerance - A door whose local openness is within this of the server's keeps its own value. A client
   * runs the same simulation, so snapping every door to the server's slightly older value on every update would
   * make it jitter back and forth; only real drift (a missed event, a different push) is corrected.
   */
  applyWire(w: readonly number[], tolerance = 0): void {
    this.states.forEach((s, i) => {
      const open = (w[i * 2] ?? s.open * 100) / 100;
      s.target = (w[i * 2 + 1] ?? s.target * 100) / 100;
      if (Math.abs(s.open - open) > tolerance) {
        s.open = open;
        this.boxAt(i, s.open, this.boxes[i]!);
      }
    });
  }
}
