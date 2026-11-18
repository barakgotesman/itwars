/**
 * The map registry. A `MapDef` bundles everything one map is made of (collision, visuals, lights, signs, doors,
 * pickups, spawns, lighting zones, podium and menu-backdrop camera) so the server, the in-game client and the menu
 * backdrop all read one value instead of switching on the mode. The office and the Data Center are selectable
 * (`MatchRules.map` indexes `MAP_INFO` and `MAPS` alike); the shooting range is its own map, chosen by the range mode.
 * Importing this module builds every map once.
 */
import type { Aabb } from '@shared/core/physics';
import type { MatchRules } from '@shared/rules/modes';
import * as datacenter from './datacenter';
import { DOORS, type DoorDef } from './door-layout';
import * as office from './index';
import { MAP_INFO } from './map-info';
import type { PickupSpot } from './pickups';
import * as range from './range';
import type { BoardSpec, LabelSpec, LightSource, MapBox } from './types';
import { ZONES as OFFICE_ZONES, zoneAt as officeZoneAt, type Zone } from './zones';
import { X0, X1, Z0, Z1 } from './builder';

/** A point or direction as `[x, y, z]`. */
export type Vec3 = readonly [number, number, number];

/** Where the post-match podium stands and how it is filmed. */
export interface PodiumSpec {
  /** Floor point the podium is built around (it needs about 11 m x 5 m of clear floor). */
  origin: { x: number; z: number };
  camPos: Vec3;
  camLook: Vec3;
  /** Held fog while the podium is up, a little darker and thicker than the room's own. */
  fogColor: number;
  fogDensity: number;
}

/** The menu backdrop's camera: a slow lane between two points with a sway, plus the sky it sees. */
export interface BackdropSpec {
  /** Ends of the lane the camera drifts along (ping-pong, eased). */
  from: Vec3;
  to: Vec3;
  /** Seconds for one full there-and-back drift. */
  period: number;
  /** Base pitch (radians, negative looks down) and the yaw sway amplitude. */
  pitch: number;
  sway: number;
  /** Background and fog the menu scene uses for this map (the map's own atmosphere reads too dark for a backdrop). */
  background: number;
  fog: { color: number; density: number };
}

/** A still camera pose, used to render the map's picture for the setup screen (`tools/maps.html`). */
export interface ShotSpec {
  pos: Vec3;
  /** Radians; 0 looks toward -z, positive turns left. */
  yaw: number;
  pitch: number;
  fov: number;
}

/** Everything one map is made of. */
export interface MapDef {
  id: string;
  name: string;
  solids: readonly Aabb[];
  boxes: readonly MapBox[];
  lights: readonly LightSource[];
  labels: readonly LabelSpec[];
  boards: readonly BoardSpec[];
  pickups: readonly PickupSpot[];
  spawns: readonly (readonly [number, number])[];
  /** Sliding doors in wire order (empty for a map without any). */
  doors: readonly DoorDef[];
  zones: readonly Zone[];
  /** The zone containing a point; falls back to a sensible one outside every rectangle. */
  zoneAt(x: number, z: number): Zone;
  /** Bounding box for the client's light-field grid. */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  podium: PodiumSpec;
  backdrop: BackdropSpec;
  /** Where the setup screen's picture of the map is taken from. */
  shot: ShotSpec;
}

/** Zone lookup shared by the small maps: first match wins, the last zone is the fallback. */
function zoneLookup(zones: readonly Zone[]): (x: number, z: number) => Zone {
  return (x, z) => zones.find((q) => x >= q.x0 && x < q.x1 && z >= q.z0 && z < q.z1) ?? zones[zones.length - 1]!;
}

/** The big office (the default). */
const OFFICE: MapDef = {
  id: 'office', name: 'The Office',
  solids: office.SOLIDS, boxes: office.MAP_BOXES, lights: office.LIGHTS, labels: office.LABELS, boards: office.BOARDS,
  pickups: office.PICKUP_SPOTS, spawns: office.SPAWNS, doors: DOORS,
  zones: OFFICE_ZONES, zoneAt: officeZoneAt, bounds: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
  // The lobby's open waiting area, between its two pillars and clear of the reception desk.
  podium: { origin: { x: 0, z: 20 }, camPos: [0, 2.3, 12.5], camLook: [0, 1.3, 20], fogColor: 0x242a36, fogDensity: 0.016 },
  backdrop: { from: [-28, 2.2, -1], to: [28, 2.2, -1], period: 150, pitch: -0.1, sway: 0.5, background: 0x9bb0c4, fog: { color: 0x8e9bab, density: 0.012 } },
  shot: { pos: [-14, 2.3, 4], yaw: -0.55, pitch: -0.12, fov: 70 },
};

/** The small server hall. */
const DATACENTER: MapDef = {
  id: 'datacenter', name: 'Data Center',
  solids: datacenter.SOLIDS, boxes: datacenter.MAP_BOXES, lights: datacenter.LIGHTS, labels: datacenter.LABELS, boards: datacenter.BOARDS,
  pickups: datacenter.PICKUP_SPOTS, spawns: datacenter.SPAWNS, doors: datacenter.MAP_DOORS,
  zones: datacenter.ZONES, zoneAt: zoneLookup(datacenter.ZONES), bounds: datacenter.BOUNDS,
  // The central bay, filmed from the north lane with the south rack blocks lit behind the pedestals.
  podium: { origin: { x: 0, z: 0 }, camPos: [0, 2.3, -7.5], camLook: [0, 1.3, 0], fogColor: 0x141c2c, fogDensity: 0.02 },
  backdrop: { from: [-13, 1.8, 3.5], to: [13, 1.8, 3.5], period: 90, pitch: -0.06, sway: 0.35, background: 0x0f1626, fog: { color: 0x16213a, density: 0.03 } },
  shot: { pos: [-4, 1.9, 4.5], yaw: -0.35, pitch: -0.06, fov: 70 },
};

/** The shooting range: not selectable, used by `rules.mode === 'range'`. It has no podium and no menu backdrop of its own. */
export const RANGE_MAP: MapDef = {
  id: 'range', name: 'Shooting Range',
  solids: range.SOLIDS, boxes: range.MAP_BOXES, lights: range.LIGHTS, labels: range.LABELS, boards: range.BOARDS,
  pickups: range.PICKUP_SPOTS, spawns: range.SPAWNS, doors: [],
  zones: range.ZONES, zoneAt: zoneLookup(range.ZONES), bounds: range.BOUNDS,
  podium: OFFICE.podium, backdrop: OFFICE.backdrop, shot: OFFICE.shot,
};

/** The selectable maps, indexed by the `map` rule (the same order as `MAP_INFO`). */
export const MAPS: readonly MapDef[] = [OFFICE, DATACENTER];

if (MAPS.length !== MAP_INFO.length) throw new Error('MAPS and MAP_INFO must list the same maps in the same order');

/**
 * The map a room plays on.
 * @param rules - The room's rules: the range mode always uses the range, anything else the chosen `map` (unknown = office).
 */
export function mapFor(rules: Pick<MatchRules, 'mode' | 'map'>): MapDef {
  return rules.mode === 'range' ? RANGE_MAP : (MAPS[rules.map] ?? OFFICE);
}
