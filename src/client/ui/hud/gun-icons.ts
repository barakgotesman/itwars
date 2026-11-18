/**
 * Flat 2D, pixel-block icons for the four guns and two grenades, stored as pixel blocks so they need no
 * image files. The `GunIcon` component draws them; used by the kill feed and the weapon bar.
 */
import type { IconKind } from '@client/game/ports';

export type { IconKind };

/** One filled rectangle: x, y, width, height, colour. The icon grid is 48 x 24. */
export type Block = readonly [number, number, number, number, string];

const ICONS: Record<string, readonly Block[]> = {
  // Stapler .45: chrome slide with serrations and a brass port, red nose, red-panelled grip.
  '0': [
    [8, 6, 28, 5, '#c4cbd3'], [10, 7, 22, 1, '#eef2f6'], [10, 8, 3, 3, '#8d949c'], [15, 8, 1, 3, '#8d949c'], [20, 7, 4, 2, '#d4af37'],
    [8, 11, 26, 4, '#23262c'], [34, 6, 4, 5, '#c0392b'], [38, 7, 2, 2, '#9aa3ad'], [10, 15, 6, 8, '#23262c'], [11, 16, 4, 5, '#b03a2e'],
    [18, 15, 3, 3, '#15171a'], [9, 22, 7, 1, '#8d949c'], [24, 4, 1, 2, '#15171a'],
  ],
  // Label Gun SMG: teal body with an orange stripe, white tape reel, yellow label strip, green LCD, red-dot sight and a yellow cartridge.
  '1': [
    [6, 8, 30, 7, '#2b6d72'], [6, 12, 30, 3, '#1d4a4d'], [10, 10, 16, 1, '#f39c12'], [8, 6, 26, 2, '#15171a'], [14, 1, 9, 6, '#f4f4f1'],
    [17, 3, 3, 2, '#2a2d33'], [14, 6, 14, 1, '#fff3a0'], [9, 9, 3, 2, '#7dffb0'], [13, 12, 1, 1, '#d9dde2'], [15, 12, 1, 1, '#d9dde2'],
    [30, 4, 4, 4, '#15171a'], [31, 5, 2, 2, '#ff3a3a'], [36, 9, 8, 3, '#2a2d33'], [44, 8, 3, 5, '#f39c12'],
    [14, 15, 4, 8, '#f2c230'], [14, 21, 4, 2, '#1c1e23'], [24, 15, 5, 7, '#2a2d33'], [24, 17, 5, 1, '#f39c12'], [24, 20, 5, 1, '#f39c12'],
  ],
  // Paper Shredder: grey body with hazard stripes and a paper sheet, toothed drum barrel, wooden pump and stock, LEDs.
  '2': [
    [10, 8, 16, 6, '#7a828c'], [10, 12, 16, 2, '#4f565e'], [12, 6, 12, 2, '#14161a'], [14, 3, 6, 3, '#f4f4f1'], [16, 3, 3, 1, '#c0392b'],
    [12, 9, 2, 2, '#f2c230'], [16, 9, 2, 2, '#14161a'], [20, 9, 2, 2, '#f2c230'], [22, 7, 1, 1, '#ff3b30'], [11, 7, 1, 1, '#39ff6a'],
    [26, 8, 19, 3, '#2a2d33'], [30, 7, 1, 5, '#7a828c'], [35, 7, 1, 5, '#7a828c'], [40, 7, 1, 5, '#7a828c'], [45, 8, 2, 3, '#15171a'], [46, 9, 1, 1, '#ff7a1a'],
    [28, 11, 9, 4, '#7a4f2c'], [30, 12, 1, 2, '#4a2f19'], [33, 12, 1, 2, '#4a2f19'], [1, 9, 9, 6, '#7a4f2c'], [1, 9, 2, 6, '#15171a'], [3, 9, 6, 1, '#9a6a3c'], [12, 14, 4, 7, '#7a4f2c'],
  ],
  // Laser Pointer: black sniper with red accents, a scope with a blue-tinted lens, muzzle brake and bipod.
  '3': [
    [20, 10, 24, 2, '#0e0e12'], [42, 9, 3, 4, '#2a2d33'], [45, 9, 2, 4, '#ff3030'], [8, 8, 16, 6, '#1d1f26'], [10, 13, 12, 1, '#c0392b'],
    [0, 9, 8, 6, '#2a2d33'], [0, 9, 1, 6, '#c0392b'], [14, 3, 12, 4, '#2a2d33'], [14, 2, 2, 6, '#14161a'], [24, 3, 2, 4, '#4aa8ff'], [19, 3, 1, 4, '#14161a'],
    [20, 7, 8, 1, '#0e0e12'], [12, 14, 4, 7, '#2a2d33'], [20, 14, 4, 4, '#2a2d33'], [21, 15, 4, 1, '#c0392b'], [30, 12, 8, 1, '#3a3e46'],
  ],
  // RPG: olive launch tube with a flared rear cone, a red-and-yellow warhead poking out of the front, grip and sight.
  '4': [
    [10, 8, 26, 6, '#5c6b3a'], [10, 8, 26, 1, '#7d8c52'], [10, 13, 26, 1, '#3f4a26'], [4, 6, 6, 10, '#3a4224'], [2, 5, 2, 12, '#23281a'],
    [36, 7, 3, 8, '#2a2d33'], [39, 8, 3, 6, '#c0392b'], [42, 9, 3, 4, '#d62828'], [45, 10, 2, 2, '#f2c230'], [38, 5, 2, 2, '#23281a'], [38, 15, 2, 2, '#23281a'],
    [16, 5, 2, 3, '#14161a'], [30, 6, 1, 2, '#14161a'], [18, 14, 5, 8, '#2a2d33'], [19, 15, 3, 2, '#14161a'], [27, 14, 3, 4, '#2a2d33'],
  ],
  // A4 Paper: a white sheet with grey text lines, a folded corner and a red stamp, tilted like a blade.
  '5': [
    [8, 4, 30, 16, '#f4f4f1'], [8, 4, 30, 1, '#ffffff'], [8, 19, 30, 1, '#c9c9c4'], [34, 4, 4, 4, '#c9c9c4'], [34, 4, 1, 4, '#8d949c'],
    [12, 8, 16, 1, '#8d949c'], [12, 11, 20, 1, '#8d949c'], [12, 14, 14, 1, '#8d949c'], [28, 13, 7, 4, '#c0392b'], [29, 14, 5, 2, '#f4f4f1'],
    [38, 8, 8, 6, '#d9a273'],
  ],
  // Coffee Bomb: a mug with a lit fuse.
  frag: [
    [14, 9, 14, 13, '#f4f4f1'], [15, 9, 12, 2, '#6a3d1f'], [28, 11, 5, 2, '#f4f4f1'], [31, 11, 2, 8, '#f4f4f1'], [28, 17, 5, 2, '#f4f4f1'],
    [20, 4, 2, 5, '#ff7a1a'], [19, 1, 4, 3, '#ffd34a'], [15, 20, 12, 2, '#d8d8d2'],
  ],
  // Fire Alarm: a red alarm clock with yellow bells.
  flash: [
    [12, 6, 24, 16, '#d62828'], [15, 9, 18, 10, '#f4f4f1'], [23, 10, 2, 5, '#222222'], [23, 14, 5, 2, '#222222'],
    [12, 2, 8, 4, '#f2c230'], [28, 2, 8, 4, '#f2c230'], [14, 22, 4, 2, '#222222'], [30, 22, 4, 2, '#222222'],
  ],
  // Headshot: a blocky white skull with a red cracked cross, shown next to a kill feed line for a headshot kill.
  head: [
    [17, 2, 14, 11, '#f4f4f1'], [15, 7, 2, 4, '#f4f4f1'], [31, 7, 2, 4, '#f4f4f1'],
    [20, 6, 3, 3, '#14161a'], [25, 6, 3, 3, '#14161a'], [23, 9, 2, 2, '#14161a'],
    [17, 13, 14, 4, '#d9dde2'], [19, 13, 1, 4, '#14161a'], [22, 13, 1, 4, '#14161a'], [25, 13, 1, 4, '#14161a'], [28, 13, 1, 4, '#14161a'],
    [23, 0, 2, 6, '#c0392b'], [20, 3, 8, 2, '#c0392b'],
  ],
  // Fall: a blocky figure tumbling head-down off an edge, with speed streaks above it (a death by falling off the map).
  fall: [
    [10, 0, 2, 9, '#5d6872'], [16, 0, 2, 7, '#5d6872'], [34, 0, 2, 9, '#5d6872'], [38, 0, 2, 6, '#5d6872'],
    [20, 8, 8, 8, '#f1c9a5'], [21, 12, 6, 2, '#14161a'],
    [18, 16, 12, 5, '#2f7fd8'], [14, 16, 4, 2, '#2f7fd8'], [30, 16, 4, 2, '#2f7fd8'], [12, 14, 2, 4, '#f1c9a5'], [34, 14, 2, 4, '#f1c9a5'],
    [20, 21, 3, 3, '#3a3f48'], [25, 21, 3, 3, '#3a3f48'],
  ],
};

/**
 * The pixel blocks of an icon (the 48 x 24 grid), for the `GunIcon` component to draw.
 * @param kind - Weapon index or grenade type.
 */
export function iconBlocks(kind: IconKind): readonly Block[] {
  return ICONS[String(kind)] ?? ICONS['0']!;
}
