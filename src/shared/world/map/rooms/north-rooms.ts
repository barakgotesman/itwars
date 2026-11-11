/**
 * Executive office, print room and IT helpdesk (the other rooms of the north row).
 */
import { box, lamp, sign } from '../builder';
import {
  cabinets, chair, chandelier, coffeeTable, crateStack, deskFrame, deskWithMonitor, monitor, plant,
  planterWall, screenPanel, sofa,
} from '../furniture';
import type { MaterialId } from '../types';

/** Executive office (x -50..-34): L-shaped desk, guest seating, privacy screen by the door. */
export function buildExecutive(): void {
  deskFrame(-42, -31, 3.2, 1.4); // main desk
  deskFrame(-39.8, -29.7, 1.6, 0.8, false); // return
  monitor(-42, 0.76, -31.2, -1, 'screenSheet');
  box('dark', -40.9, 0.76, -30.6, 0.4, 0.03, 0.14, false); // keyboard tray items
  chair(-42, -32.4, 's', 'meeting');
  chair(-43, -28.6, 'n', 'guest');
  chair(-41, -28.6, 'n', 'guest');
  box('shelf', -49.4, 0, -27, 0.5, 2.2, 7);
  box('shelf', -39, 0, -34.5, 6, 2.2, 0.5);
  box('wood', -45.5, 0, -34.4, 2.4, 0.9, 0.6); // credenza / bar
  box('rug', -41, 0, -27, 7, 0.03, 5, false);
  sofa(-35.2, -25.5, 3, 'w', 'sofa2');
  coffeeTable(-37.6, -25.5, 0.9, 1.4);
  screenPanel(-45.2, -22.8, 2.4, true, 'wainBrown'); // cover beside the door
  plant(-48.5, -21.5);
  plant(-35.2, -33.5);
  chandelier(-41, -28, 1.1);
}

/** Print room (x 10..24): printers on the north wall, paper pallets as cover, service door west. */
export function buildPrintRoom(): void {
  for (const x of [13, 17, 21]) {
    box('white', x, 0, -34.2, 1.2, 1.0, 0.9);
    box('paper', x, 1.0, -34.2, 0.8, 0.15, 0.5, false);
  }
  deskFrame(17, -27, 3, 1.2);
  box('paper', 16, 0.76, -27, 0.6, 0.35, 0.45, false);
  box('paper', 18, 0.76, -27, 0.6, 0.2, 0.45, false);
  box('shelf', 23.4, 0, -28, 0.5, 2.0, 7);
  box('blue', 22.5, 0, -21.6, 0.6, 0.8, 0.6);
  box('blue', 11.5, 0, -21.6, 0.6, 0.8, 0.6);
  // Paper-ream pallets: staggered waist-high cover between the door and the printers.
  box('cardboard', 13.2, 0, -24.2, 1.4, 1.1, 1.0);
  box('cardboard', 20.6, 0, -23.4, 1.4, 1.1, 1.0);
  box('cardboard', 20.6, 1.1, -23.4, 0.9, 0.5, 0.8);
  box('crate', 12.0, 0, -31.0, 1.0, 0.9, 1.0);
}

/** IT Helpdesk (x 24..50): counter with a gap, workstations on the north wall, parts piles. */
export function buildHelpdesk(): void {
  box('wood', 31, 0, -24, 8, 1.1, 0.6);
  box('wood', 43, 0, -24, 8, 1.1, 0.6);
  box('dark', 31, 1.1, -24, 8.1, 0.04, 0.7, false);
  box('dark', 43, 1.1, -24, 8.1, 0.04, 0.7, false);
  monitor(29, 1.14, -24, -1, 'screenTerm');
  monitor(45, 1.14, -24, -1, 'screenDesk');
  const screens: readonly MaterialId[] = ['screenTerm', 'screenTerm', 'screenBsod', 'screenTerm', 'screenSaver', 'screenTerm'];
  [28, 32, 36, 40, 44, 48].forEach((x, i) => {
    deskWithMonitor(x, -33.9, -0.15, screens[i]);
    chair(x, -32.6, 'n');
  });
  box('metal', 49.4, 0, -29, 0.5, 2.3, 9);
  crateStack(26.5, -22.5, 5);
  crateStack(47.5, -22.5, 4);
  crateStack(26.5, -31, 6);
  box('rack', 25.2, 0, -27, 0.8, 1.6, 0.8);
  // Mid-room cover so the counter gap is not the only way to cross the room.
  cabinets(35.4, -28.5, 3, true);
  planterWall(41, -28, 3.4, true);
  screenPanel(46, -27, 2.4, false, 'wainGreen');
  sign('signGreen', 38, 2.1, -34.7, 9, 1.4, 'x');
  sign('white', 38, 0.5, -34.7, 6, 0.9, 'x');
  lamp(38, 2.2, -33.5, 0x35ff7a, 1.0, 8);
}
