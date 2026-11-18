/**
 * Which map the client is currently rendering. Map data is a `MapDef` in `@shared/world/map/maps`; this module
 * holds live, swappable bindings to the active one so `world.ts`, `lighting.ts`, `atmosphere.ts`,
 * `light-field.ts`, `signs.ts` and `score-wall.ts` don't need the map threaded through every call.
 * `scene.ts` calls `setActiveMap` once, before anything else reads map data; the menu backdrop calls it again
 * before building each of its maps (always set the map immediately before `buildWorld`).
 */
import type { Aabb } from '@shared/core/physics';
import { MAPS, type MapDef } from '@shared/world/map/maps';
import type { Zone } from '@shared/world/map/zones';

let active: MapDef = MAPS[0]!;

/** Collision boxes; what `stepMovement` receives. */
export let SOLIDS: readonly Aabb[] = active.solids;
/** Every box in the active map, solid or decorative. */
export let MAP_BOXES = active.boxes;
/** Baked light sources the client turns into vertex lighting. */
export let LIGHTS = active.lights;
/** Door nameplates, banners, wall plaques and (for the range) distance markers. */
export let LABELS = active.labels;
/** Live scoreboard screens. */
export let BOARDS = active.boards;
/** Pickup spots, in protocol order. */
export let PICKUP_SPOTS = active.pickups;
/** True when the world draws a mirrored copy under a glossy floor (see `MapDef.glossy`). */
export let GLOSSY = active.glossy === true;

/**
 * Switches every export above to the given map. Call before any map data is read, and again immediately before
 * building a different map's world.
 */
export function setActiveMap(next: MapDef): void {
  active = next;
  SOLIDS = next.solids;
  MAP_BOXES = next.boxes;
  LIGHTS = next.lights;
  LABELS = next.labels;
  BOARDS = next.boards;
  PICKUP_SPOTS = next.pickups;
  GLOSSY = next.glossy === true;
}

/** The map currently active. */
export function activeMap(): MapDef {
  return active;
}

/** The active map's bounding box, for the client's light-field grid. */
export function mapBounds(): { x0: number; x1: number; z0: number; z1: number } {
  return active.bounds;
}

/** The zone containing a point, in the active map. */
export function zoneAt(x: number, z: number): Zone {
  return active.zoneAt(x, z);
}
