/**
 * Client-side prediction for the local player: each fixed tick the input is sent to the server AND applied
 * locally with the shared movement code; each snapshot resets to the server's state and replays the inputs
 * the server has not acknowledged yet.
 */
import { TICK_DT } from '@shared/core/constants';
import { newPlayerState, stepMovement, type Aabb } from '@shared/core/physics';
import type { InputMsg, MeState, SnapMsg } from '@shared/net/protocol';
import type { Doors } from '@shared/world/doors';
import type { Net } from '@client/platform/net';
import type { Input } from '@client/platform/input';

/** Unconfirmed inputs kept for replay; the server acks within a few ticks, this is just a safety cap. */
const MAX_PENDING = 180;
/** A reconcile error above this (metres) skips render smoothing and snaps the view. */
const SNAP_DISTANCE = 1.5;

/** The predicted local player and the bookkeeping that keeps it in sync with the server. */
export class LocalPlayer {
  /** Predicted position and velocity. */
  readonly me = newPlayerState(0, 0, 0);
  /** Position one tick ago, for render interpolation. */
  prev = { x: 0, y: 0, z: 0 };
  alive = false;
  /** The newest private block from the server, for the HUD and viewmodel. */
  lastMe: MeState | null = null;
  /** When `lastMe` arrived (ms). */
  lastSnapAt = performance.now();

  private gotSnapshot = false;
  private seq = 0;
  private readonly pending: InputMsg[] = [];

  /** @param solids - Collision boxes, including the doors' moving boxes. */
  constructor(private readonly solids: readonly Aabb[]) {}

  /**
   * Runs one fixed tick: samples input, sends it, and predicts it.
   * @param input - Keyboard and mouse state.
   * @param net - Connection to the server.
   * @param doors - The shared door simulation (doors push the player, so they step with them).
   */
  tick(input: Input, net: Net, doors: Doors): void {
    const me = this.me;
    this.prev = { x: me.x, y: me.y, z: me.z };
    const cmd: InputMsg = { t: 'input', seq: ++this.seq, ...input.sample() };
    net.send(cmd);
    if (!this.gotSnapshot) return;
    doors.step(TICK_DT, this.alive ? [me] : [], this.solids);
    if (this.alive) stepMovement(me, cmd, TICK_DT, this.solids);
    this.pending.push(cmd);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
  }

  /** Applies a server snapshot: reset to the authoritative state, then replay unacked inputs. */
  reconcile(snap: SnapMsg): void {
    const me = this.me;
    const m = snap.me;
    while (this.pending.length > 0 && this.pending[0]!.seq <= m.ack) this.pending.shift();
    const before = { x: me.x, y: me.y, z: me.z };
    me.x = m.x; me.y = m.y; me.z = m.z;
    me.vx = m.vx; me.vy = m.vy; me.vz = m.vz;
    me.onGround = m.onGround;
    if (m.alive) for (const cmd of this.pending) stepMovement(me, cmd, TICK_DT, this.solids);
    if (!this.gotSnapshot || Math.hypot(me.x - before.x, me.y - before.y, me.z - before.z) > SNAP_DISTANCE) {
      this.prev = { x: me.x, y: me.y, z: me.z };
    }
    this.gotSnapshot = true;
    this.alive = m.alive;
    this.lastMe = m;
    this.lastSnapAt = performance.now();
  }

  /** The server dropped its input queue at spawn; old inputs must not be replayed. */
  onSpawn(): void {
    this.pending.length = 0;
  }
}
