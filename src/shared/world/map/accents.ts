/**
 * Accent lights: the small, local light sources that give each room its character on top of the ceiling panels
 * (rack LEDs, monitor glow, desk lamps, vending machines, neon, bare bulbs, sunlit window patches). They are
 * baked like every other lamp, so they cost nothing at runtime. Positions sit in free air above furniture.
 */
import { lamp } from './builder';

/** One accent light: position, sRGB colour, strength and reach in metres. */
type Accent = readonly [x: number, y: number, z: number, color: number, intensity: number, radius: number];

/** Accent lights by room, in the same order as the zone table. */
const ACCENTS: Readonly<Record<string, readonly Accent[]>> = {
  // Sunlit patches near the outer windows and a warm neon wash in the lounge.
  open: [
    [-46, 2.6, -12, 0xfff0c8, 0.75, 7], [-46, 2.6, 4, 0xfff0c8, 0.75, 7],
    [46, 2.6, -12, 0xfff0c8, 0.75, 7], [46, 2.6, 4, 0xfff0c8, 0.75, 7],
    [-20, 2.4, 13, 0xe4f0ff, 0.5, 6], [20, 2.4, 13, 0xe4f0ff, 0.5, 6],
  ],
  lounge: [[0, 2.8, -17, 0xff8ac8, 0.55, 6], [-6, 1.2, -6, 0xffb060, 0.6, 5]],
  // Desk lamps and wall sconces: pools of amber in an otherwise dim wood-panelled room.
  executive: [
    [-42, 1.5, -30, 0xffb050, 0.95, 6.5], [-48, 2.4, -25, 0xffb870, 0.7, 5], [-37, 2.4, -33, 0xffb870, 0.7, 5],
    [-46, 2.0, -32, 0xffa040, 0.5, 4.5],
  ],
  // A cool projector bounce against the warm chandeliers.
  meeting: [[-13, 2.2, -22.4, 0xbcd8ff, 0.55, 5.5], [-27.5, 2.0, -22.4, 0xbcd8ff, 0.4, 5]],
  // Almost no ceiling light: racks glow, one red emergency lamp throws a hard colour across the aisle.
  server: [
    [-2.1, 1.5, -31, 0x35ff7a, 0.9, 5], [3, 1.5, -31, 0x4a86ff, 0.9, 5], [-2.1, 1.5, -26, 0xffa030, 0.8, 4.5],
    [4.5, 1.5, -25, 0x35ff7a, 0.8, 4.5], [2, 3.5, -28, 0xff2a20, 0.9, 8], [-3, 1.5, -22, 0x4a86ff, 0.6, 4],
  ],
  print: [[17, 1.3, -30, 0xaaf0ff, 0.6, 4.5], [20, 1.3, -24, 0xfff4cc, 0.35, 4]],
  // Monitor glow and a couple of warm desk lamps.
  helpdesk: [
    [29, 1.4, -26, 0x5a8cff, 0.85, 5], [45, 1.4, -26, 0x5a8cff, 0.85, 5], [37, 1.4, -31, 0x5a8cff, 0.6, 5],
    [36, 1.6, -29, 0xffc47a, 0.55, 5],
  ],
  break: [[-33, 1.5, 33, 0xff9a40, 0.85, 5], [-46, 1.4, 30, 0xcfeeff, 0.5, 4.5], [-40, 2.2, 20, 0xffffff, 0.4, 6]],
  // Bare bulbs in a stockroom: yellowish pools with deep shadow between the racks.
  storage: [[-24, 3.4, 20, 0xffe08a, 0.85, 7], [-17, 3.2, 28, 0xd8e890, 0.65, 6]],
  // Daylight pours through the glass entrance; warm lamps at the reception desk.
  lobby: [[0, 2.8, 33, 0xdceaff, 1.0, 9], [-6, 1.8, 30, 0xffd9a0, 0.6, 5], [6, 1.8, 30, 0xffd9a0, 0.6, 5]],
  conference: [[22, 3.3, 24, 0xffe2b0, 1.0, 8], [22, 1.8, 33.5, 0x8ab4ff, 0.65, 5]],
  // Purple and pink neon in the phone lounge.
  phones: [[44, 2.0, 18, 0xb070ff, 0.85, 6], [38, 1.8, 30, 0xff6ad0, 0.65, 5], [46, 1.6, 26, 0x70a8ff, 0.5, 4.5]],
};

/** Places every accent light. Call once while the map is built, after the rooms exist. */
export function placeAccents(): void {
  for (const list of Object.values(ACCENTS)) for (const [x, y, z, color, intensity, radius] of list) lamp(x, y, z, color, intensity, radius);
}

/** Number of accent lights, for the lamp budget check in the tests. */
export const ACCENT_COUNT = Object.values(ACCENTS).reduce((n, list) => n + list.length, 0);
