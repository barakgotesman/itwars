/**
 * Door system: moves the shared sliding doors each tick (pushing players out of the way) and lets
 * a player toggle the door they face.
 */
import { TICK_DT } from '@shared/core/constants';
import type { Player } from './player';
import type { Sim } from './state';

/** Moves the doors one tick, pushing players out of their way, and flags a snapshot to carry the new state. */
export function stepDoors(sim: Sim): void {
  const bodies = [...sim.players.values()].filter((p) => p.alive).map((p) => p.state);
  if (sim.doors.step(TICK_DT, bodies, sim.solids) || sim.doors.moving) sim.doorsDirty = true;
}

/** Opens or closes the door the player is facing, if any, and tells everyone. */
export function useDoor(sim: Sim, p: Player): void {
  const i = sim.doors.pick(p.state.x, p.state.z, p.state.yaw);
  if (i < 0 || !sim.doors.toggle(i)) return;
  const s = sim.doors.states[i]!;
  sim.events.push({ k: 'door', i, o: Math.round(s.open * 100), t: Math.round(s.target * 100) });
  sim.doorsDirty = true;
}
