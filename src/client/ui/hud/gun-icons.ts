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
};

/**
 * The pixel blocks of an icon (the 48 x 24 grid), for the `GunIcon` component to draw.
 * @param kind - Weapon index or grenade type.
 */
export function iconBlocks(kind: IconKind): readonly Block[] {
  return ICONS[String(kind)] ?? ICONS['0']!;
}
