/**
 * Which map the client is currently rendering. Map data is otherwise a set of frozen module-level
 * exports (the office in `@shared/world/map`, the practice range in `@shared/world/map/range`); this
 * module holds live, swappable bindings to the active one so `world.ts`, `lighting.ts`, `atmosphere.ts`,
 * `light-field.ts`, `signs.ts` and `score-wall.ts` don't need the map threaded through every call.
 * `scene.ts` calls `setActiveMap` once, before anything else reads map data.
 */
import type { Aabb } from '@shared/core/physics';
import type { ModeId } from '@shared/rules/modes';
import * as office from '@shared/world/map';
import { X0, X1, Z0, Z1 } from '@shared/world/map/builder';
import * as range from '@shared/world/map/range';
import { zoneAt as officeZoneAt, type Zone } from '@shared/world/map/zones';

const OFFICE_BOUNDS = { x0: X0, x1: X1, z0: Z0, z1: Z1 };

/** Collision boxes; what `stepMovement` receives (the range's firing-line barrier is a plain `Aabb`, not a `MapBox`, since it is never drawn). */
export let SOLIDS: readonly Aabb[] = office.SOLIDS;
/** Every box in the active map, solid or decorative. */
export let MAP_BOXES = office.MAP_BOXES;
/** Baked light sources the client turns into vertex lighting. */
export let LIGHTS = office.LIGHTS;
/** Door nameplates, banners, wall plaques and (for the range) distance markers. */
export let LABELS = office.LABELS;
/** Live scoreboard screens. */
export let BOARDS = office.BOARDS;
/** Pickup spots, in protocol order. */
export let PICKUP_SPOTS = office.PICKUP_SPOTS;

let mode: ModeId = 'dm';
let bounds = OFFICE_BOUNDS;

/** Switches every export above to the given mode's map. Call once, before any map data is read. */
export function setActiveMap(next: ModeId): void {
  mode = next;
  const m = mode === 'range' ? range : office;
  SOLIDS = m.SOLIDS;
  MAP_BOXES = m.MAP_BOXES;
  LIGHTS = m.LIGHTS;
  LABELS = m.LABELS;
  BOARDS = m.BOARDS;
  PICKUP_SPOTS = m.PICKUP_SPOTS;
  bounds = mode === 'range' ? range.BOUNDS : OFFICE_BOUNDS;
}

/** The active map's bounding box, for the client's light-field grid. */
export function mapBounds(): { x0: number; x1: number; z0: number; z1: number } {
  return bounds;
}

/** The zone containing a point, in the active map. */
export function zoneAt(x: number, z: number): Zone {
  if (mode === 'range') return range.ZONES.find((z0) => x >= z0.x0 && x < z0.x1 && z >= z0.z0 && z < z0.z1) ?? range.ZONES[0]!;
  return officeZoneAt(x, z);
}
