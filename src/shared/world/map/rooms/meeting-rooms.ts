/**
 * Meeting rooms A (x -34..-20) and B (x -20..-6), joined by a door at z=-27.5.
 *
 * A is the formal boardroom (big table, lockers and a partition by the door); B is the war room
 * (table pushed north, staggered whiteboards, sofa corner). Both give the door fight some cover.
 */
import { box, sign } from '../builder';
import { boardTable, cabinets, chandelier, coffeeTable, plant, screenPanel, sofa } from '../furniture';

/** Builds both meeting rooms. */
export function buildMeetingRooms(): void {
  // ---- Room A: boardroom
  box('rug', -27.5, 0, -28, 11, 0.03, 5.5, false);
  boardTable(-27.5, -28, 7, 2.4, 5, true, false);
  box('wood', -27.5, 0, -34.4, 4.5, 0.9, 0.6); // credenza under the screen
  box('white', -27.5, 0.9, -34.4, 0.3, 0.2, 0.3, false);
  cabinets(-33.5, -21.6, 4, true); // lockers: full-height cover west of the door
  screenPanel(-23, -23.8, 2.5, false); // partition east of the door
  plant(-33.2, -34.2);
  plant(-20.9, -34.2);
  sign('white', -33.72, 1.2, -29, 3.2, 1.2, 'z'); // whiteboard
  sign('white', -27, 1.5, -34.7, 5, 1.5, 'x');
  sign('red', -22, 1.7, -19.7, 2, 1.2, 'x');
  chandelier(-27.5, -28, 1.0);

  // ---- Room B: war room
  box('rug', -13, 0, -29, 8.5, 0.03, 4.5, false);
  boardTable(-13, -29.5, 6, 2.2, 4, false, true);
  screenPanel(-16, -23.5, 2.4, true, 'white'); // rolling whiteboards, staggered
  screenPanel(-10, -22.4, 2.4, true, 'white');
  cabinets(-9.4, -34.3, 4, true);
  sofa(-6.9, -24.2, 3, 'w', 'sofa2');
  coffeeTable(-8.9, -24.2, 0.8, 1.4);
  plant(-19.2, -34.2);
  plant(-6.9, -21);
  sign('screenSaver', -13, 1.4, -34.7, 4, 2.2, 'x');
  chandelier(-13, -29.5, 0.9);
}
