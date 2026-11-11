/**
 * The lighting design of the office, one entry per room: how bright and what colour its ambient light is, how
 * its ceiling panels behave, how thick and what colour its air is, and how bright a player standing there stays.
 * This table is the single source of truth: the map builder places panels from it, the baker reads the ambient
 * level, and the client's fog and player tinting look the zone up by position. Pure data, no three.js.
 */
import { X0, X1, Z0, Z1 } from './builder';

/** Ambient (unlit-by-lamps) light baked into every surface of a zone. */
export interface ZoneAmbient {
  /** sRGB hex; only its hue matters, the brightness is `level`. */
  color: number;
  /** Brightness of a floor-facing surface; upward surfaces get up to 40% more (sky bounce). */
  level: number;
}

/** How a zone's ceiling panels are lit. */
export interface ZonePanels {
  color: number;
  intensity: number;
  radius: number;
  /** When set, only panels at these `x,z` cells are on; the rest are dark housings. */
  onlyAt?: readonly string[];
  /** Panels at these `x,z` cells flicker like a dying tube. */
  flickerAt?: readonly string[];
}

/** One room (or part of one). */
export interface Zone {
  id: string;
  name: string;
  x0: number; x1: number; z0: number; z1: number;
  ambient: ZoneAmbient;
  panels: ZonePanels;
  /** Fog colour (sRGB hex) and exponential density in this zone's air. */
  fog: { color: number; density: number };
  /** Lowest brightness (0-1) players and weapons are tinted down to here, so nobody vanishes in the dark. */
  floor: number;
}

/**
 * Zones in lookup order: the first match wins, so sub-areas (the lounge) come before the room around them.
 * The rectangles are the floor areas laid in `buildShell`.
 */
export const ZONES: readonly Zone[] = [
  { id: 'lounge', name: 'Lounge', x0: -9, x1: 9, z0: -16, z1: 0,
    ambient: { color: 0xffc890, level: 0.17 },
    panels: { color: 0xffbd80, intensity: 0.62, radius: 9 },
    fog: { color: 0x9a8f86, density: 0.0065 }, floor: 0.55 },
  { id: 'open', name: 'Open plan', x0: X0, x1: X1, z0: -20, z1: 14,
    ambient: { color: 0xe6efff, level: 0.27 },
    panels: { color: 0xeef4ff, intensity: 0.7, radius: 10.5 },
    fog: { color: 0x8e9bab, density: 0.006 }, floor: 0.7 },
  { id: 'executive', name: 'Executive office', x0: X0, x1: -34, z0: Z0, z1: -20,
    ambient: { color: 0xffb774, level: 0.11 },
    panels: { color: 0xffb870, intensity: 0.4, radius: 9, onlyAt: ['-45,-24'] },
    fog: { color: 0x7d6a58, density: 0.008 }, floor: 0.5 },
  { id: 'meeting', name: 'Meeting rooms', x0: -34, x1: -6, z0: Z0, z1: -20,
    ambient: { color: 0xffd9b0, level: 0.15 },
    panels: { color: 0xffdcb0, intensity: 0.42, radius: 9, onlyAt: ['-27,-24', '-18,-32', '-9,-24'] },
    fog: { color: 0x8a7d70, density: 0.007 }, floor: 0.55 },
  { id: 'server', name: 'Server room', x0: -6, x1: 10, z0: Z0, z1: -20,
    ambient: { color: 0x5878c0, level: 0.075 },
    panels: { color: 0xa9c4ff, intensity: 0.3, radius: 7, onlyAt: ['0,-24'], flickerAt: ['0,-24'] },
    fog: { color: 0x39465e, density: 0.011 }, floor: 0.42 },
  { id: 'print', name: 'Print room', x0: 10, x1: 24, z0: Z0, z1: -20,
    ambient: { color: 0xdbe9ff, level: 0.23 },
    panels: { color: 0xe4f0ff, intensity: 0.95, radius: 9.5, flickerAt: ['18,-32'] },
    fog: { color: 0x8998a8, density: 0.0065 }, floor: 0.65 },
  { id: 'helpdesk', name: 'IT helpdesk', x0: 24, x1: X1, z0: Z0, z1: -20,
    ambient: { color: 0x6f95e8, level: 0.1 },
    panels: { color: 0xbcd4ff, intensity: 0.48, radius: 9, onlyAt: ['27,-24', '36,-32', '45,-24'] },
    fog: { color: 0x46566e, density: 0.0095 }, floor: 0.5 },
  { id: 'break', name: 'Break room', x0: X0, x1: -30, z0: 14, z1: Z1,
    ambient: { color: 0xffffff, level: 0.3 },
    panels: { color: 0xffffff, intensity: 1.05, radius: 10.5 },
    fog: { color: 0x9fa8b3, density: 0.0055 }, floor: 0.72 },
  { id: 'storage', name: 'Storage', x0: -30, x1: -12, z0: 14, z1: Z1,
    ambient: { color: 0xb6d28a, level: 0.085 },
    panels: { color: 0xd8e2a0, intensity: 0.5, radius: 8.5, onlyAt: ['-18,16', '-27,24', '-18,32'], flickerAt: ['-18,16'] },
    fog: { color: 0x4f5946, density: 0.0105 }, floor: 0.45 },
  { id: 'lobby', name: 'Lobby', x0: -12, x1: 12, z0: 14, z1: Z1,
    ambient: { color: 0xffe2b8, level: 0.2 },
    panels: { color: 0xffe0b4, intensity: 0.62, radius: 10 },
    fog: { color: 0x9a9288, density: 0.0058 }, floor: 0.62 },
  { id: 'conference', name: 'Conference room', x0: 12, x1: 32, z0: 14, z1: Z1,
    ambient: { color: 0xffbf86, level: 0.11 },
    panels: { color: 0xffcc96, intensity: 0.4, radius: 9, onlyAt: ['18,16', '27,32'] },
    fog: { color: 0x7a6b5e, density: 0.0085 }, floor: 0.5 },
  { id: 'phones', name: 'Phone lounge', x0: 32, x1: X1, z0: 14, z1: Z1,
    ambient: { color: 0xb69cff, level: 0.13 },
    panels: { color: 0xd2c4ff, intensity: 0.5, radius: 9, onlyAt: ['36,16', '45,24', '36,32'] },
    fog: { color: 0x585072, density: 0.0085 }, floor: 0.55 },
];

/**
 * The zone containing a point.
 * @returns The first matching zone; the open plan if the point is somehow outside every rectangle.
 */
export function zoneAt(x: number, z: number): Zone {
  for (const zone of ZONES) if (x >= zone.x0 && x < zone.x1 && z >= zone.z0 && z < zone.z1) return zone;
  return ZONES[1]!;
}
