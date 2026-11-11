/**
 * Building shell: floors, ceiling and light panels, outer walls, and the interior walls with
 * their door gaps. Door lists are exported so wall dressing can skip doorways.
 */
import {
  box, CEILING_H, DOOR_W, EDGE, floor, lamp, wallX, wallZ, X0, X1, Z0, Z1,
} from './builder';
import type { Gap } from './types';

/** Door gaps on the wall between the north row and the open plan. */
export const NORTH_DOORS: readonly Gap[] = [
  [-42, 3.2, 'accentOrange', 'EXECUTIVE'], [-27, 3.2, 'accentBlue', 'MEETING A'], [-13, 3.2, 'accentBlue', 'MEETING B'],
  [2, 3.2, 'accentRed', 'SERVER ROOM'], [17, 3.2, 'accentBlue', 'PRINT'],
  [30, 3.2, 'accentGreen', 'IT HELPDESK'], [44, 3.2, 'accentGreen', 'IT HELPDESK'],
];
/** Door gaps on the wall between the open plan and the south row. */
export const SOUTH_DOORS: readonly Gap[] = [
  [-40, 3.2, 'accentOrange', 'BREAK ROOM'], [-21, 3.2, 'accentOrange', 'STORAGE'],
  [0, 16, 'accentOrange', 'LOBBY'], [22, 3.2, 'accentRed', 'CONFERENCE'], [41, 8, 'accentBlue', 'PHONE BOOTHS'],
];
/** Connecting door between the two meeting rooms (on the wall at x = -20). */
export const MEETING_LINK: readonly Gap[] = [[-27.5, DOOR_W, 'accentBlue']];
/** Service door from the server room into the print room (on the wall at x = 10); a second way in. */
export const SERVER_SERVICE: readonly Gap[] = [[-27, DOOR_W, 'accentRed', 'SERVICE']];

/** How one ceiling panel behaves: colour and strength, flickering, or dead (dark pocket). */
interface PanelLight { color: number; intensity: number; flicker?: boolean; dead?: boolean }

/** Panels that are out, chosen to leave dark corners and alcoves away from main routes. */
const DEAD_PANELS = new Set([
  '-45,-8', '-45,8', '-36,0', '45,0', '36,8', '-27,8', '27,-16', // open-plan lanes
  '0,-32', '-45,-32', '45,-32', '-27,32', '-9,24', '45,32', '-36,-32', // server back, exec, helpdesk, storage, phones
]);

/**
 * Lighting character per room, so rooms do not all look the same: warm and dim for offices,
 * cold and sparse for the server room and storage, bright and white for the break room and lobby.
 */
function zoneLight(x: number, z: number): PanelLight {
  if (DEAD_PANELS.has(`${x},${z}`)) return { color: 0, intensity: 0, dead: true };
  if (z < -20) {
    if (x < -34) return { color: 0xffd9a8, intensity: 0.55 }; // executive
    if (x < -6) return { color: 0xffe2bd, intensity: 0.5 }; // meeting rooms: chandeliers do the rest
    if (x < 10) return { color: 0xbcd0ff, intensity: 0.3, flicker: true }; // server room
    if (x < 24) return { color: 0xeaf2ff, intensity: 0.7 }; // print
    return { color: 0xd8e6ff, intensity: 0.7 }; // helpdesk
  }
  if (z < 14) {
    if (Math.abs(x) <= 9 && z >= -16 && z <= 0) return { color: 0xffcf9a, intensity: 0.8 }; // lounge
    if (Math.abs(x) >= 36) return { color: 0xfff1dc, intensity: 0.5 }; // outer lanes
    return { color: 0xfff1dc, intensity: 0.75 };
  }
  if (x < -30) return { color: 0xffffff, intensity: 0.95 }; // break room
  if (x < -12) return { color: 0xdfe8ff, intensity: 0.4, flicker: x === -18 && z === 24 }; // storage
  if (x < 12) return { color: 0xffe6c0, intensity: 0.6 }; // lobby: chandeliers add warmth
  if (x < 32) return { color: 0xffd9a8, intensity: 0.45 }; // conference
  return { color: 0xd8d0ff, intensity: 0.5 }; // phone lounge
}

/** Lays floors, ceiling, lights and every wall. */
export function buildShell(): void {
  floor('carpet', X0, X1, -20, 14); // open plan
  floor('wood', X0, -34, Z0, -20); // executive
  floor('carpet', -34, -6, Z0, -20); // meeting rooms
  floor('floorDark', -6, 10, Z0, -20); // server room
  floor('concrete', 10, 24, Z0, -20); // print room
  floor('carpet', 24, X1, Z0, -20); // IT helpdesk
  floor('tile', X0, -30, 14, Z1); // break room
  floor('concrete', -30, -12, 14, Z1); // storage
  floor('tile', -12, 12, 14, Z1); // lobby
  floor('wood', 12, 32, 14, Z1); // conference
  floor('carpet', 32, X1, 14, Z1); // phone booth lounge

  box('ceiling', 0, CEILING_H, 0, X1 - X0 + 1, 0.2, Z1 - Z0 + 1, false);
  for (let x = -45; x <= 45; x += 9) {
    for (let z = -32; z <= 32; z += 8) {
      const f = zoneLight(x, z);
      const mat = f.dead ? 'dark' : f.flicker ? 'lightFlicker' : 'light';
      box(mat, x, CEILING_H - 0.06, z, 2.4, 0.06, 1.2, false);
      // Dead panels cast nothing: those spots are the dark pockets campers can use.
      if (!f.dead) lamp(x, CEILING_H - 0.3, z, f.color, f.intensity, 10.5);
    }
  }

  wallX(Z0, X0 - EDGE, X1 + EDGE);
  wallZ(X0, Z0, Z1);
  wallZ(X1, Z0, Z1);
  wallX(Z1, X0 - EDGE, X1 + EDGE, [[0, 6, 'accentOrange', 'ENTRANCE']], -1);
  // Lobby entrance: glass double doors with a centre split, push bars and a threshold mat.
  box('glass', 0, 0, Z1, 6, 3.0, 0.15);
  box('metal', 0, 0, Z1, 0.08, 3.0, 0.2, false);
  for (const x of [-0.35, 0.35]) box('metal', x, 0.95, Z1 - 0.15, 0.04, 0.9, 0.04, false);
  box('dark', 0, 0, Z1 - 1.0, 4.6, 0.02, 1.4, false);

  // North row: one door per room onto the open plan, two for the helpdesk.
  wallX(-20, X0 - EDGE, X1 + EDGE, NORTH_DOORS, -1);
  for (const x of [-34, -6, 24]) wallZ(x, Z0, -20);
  wallZ(10, Z0, -20, SERVER_SERVICE, 1);
  wallZ(-20, Z0, -20, MEETING_LINK, 1);

  // South row: Lobby is an open 16 m gap; the phone zone opens wide too.
  wallX(14, X0 - EDGE, X1 + EDGE, SOUTH_DOORS, 1);
  for (const x of [-30, -12, 12, 32]) wallZ(x, 14, Z1);
}
