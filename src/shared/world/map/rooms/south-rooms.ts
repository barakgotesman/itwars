/**
 * South row: break room, storage, lobby, conference room and the phone-booth lounge.
 */
import { box, lamp, sign } from '../builder';
import {
  booth, boardTable, cabinets, chair, chandelier, coffeeTable, cooler, crateStack, deskFrame, monitor, pillar,
  plant, planterWall, roundTable, screenPanel, sofa, vending,
} from '../furniture';

/** Break room (x -50..-30): kitchenette, round tables with stools, vending, planter cover. */
export function buildBreakRoom(): void {
  box('wood', -42, 0, 34.3, 14, 0.9, 0.7);
  box('white', -49, 0, 34.2, 1.0, 1.9, 0.9);
  box('metal', -44, 0.9, 34.3, 0.5, 0.3, 0.4, false);
  box('dark', -40, 0.9, 34.3, 0.4, 0.35, 0.35, false);
  box('red', -30.9, 0, 19, 0.9, 1.9, 1.0);
  box('blue', -30.9, 0, 21, 0.9, 1.9, 1.0);
  for (const [x, z] of [[-44, 24], [-38, 24], [-41, 29]] as const) roundTable(x, z, 0.9, 4);
  vending(-33, 34.2, -1, 'signOrange');
  planterWall(-45.5, 18.5, 3, true); // staggered pair of low walls inside the door
  planterWall(-35.5, 19.5, 3, true);
  pillar(-47, 29);
  plant(-48.5, 16);
  cooler(-48.5, 20);
}

/** Storage (x -30..-12): shelf rows with a cross aisle, crates, and a stepped crate platform. */
export function buildStorage(): void {
  for (const x of [-27, -15]) {
    box('shelf', x, 0, 21.5, 0.7, 2.3, 5);
    box('shelf', x, 0, 30.2, 0.7, 2.3, 7);
  }
  crateStack(-21, 28, 6);
  crateStack(-19, 32, 5);
  crateStack(-24, 32.5, 4);
  crateStack(-24, 18, 3);
  crateStack(-13.5, 17, 4);
  // Stair of crates (0.6 / 1.2 / 1.8 m) up to a sniper's perch over the cross aisle.
  box('cardboard', -17.2, 0, 24.8, 1.2, 0.6, 1.2);
  box('crate', -17.2, 0, 26.2, 1.2, 1.2, 1.4);
  box('cardboard', -17.2, 0, 28.6, 2.4, 1.8, 2.4);
  box('hazard', -17.2, 1.8, 28.6, 2.4, 0.02, 0.1, false);
}

/** Lobby (x -12..12): reception desk, waiting area, columns and planter walls for open-floor cover. */
export function buildLobby(): void {
  box('wood', 0, 0, 28, 7, 1.1, 0.9);
  box('wood', 3.3, 0, 26, 0.9, 1.1, 4.5);
  box('dark', 0, 1.1, 28, 7.1, 0.04, 1.0, false);
  monitor(0, 1.14, 27.8, 1, 'screenDesk');
  chair(0, 29.6, 'n', 'task');
  sign('signOrange', 0, 1.8, 34.7, 8, 1.5, 'x');
  sofa(-10, 22, 3.5, 'e');
  sofa(10, 22, 3.5, 'w');
  coffeeTable(-7, 22, 0.9, 1.6);
  coffeeTable(7, 22, 0.9, 1.6);
  box('rug', 0, 0, 20, 8, 0.03, 5, false);
  pillar(-5.5, 17.5);
  pillar(5.5, 17.5);
  planterWall(-6, 25.5, 2.6, false);
  for (const [x, z] of [[-11, 16], [11, 16], [-11, 33.5], [11, 33.5], [-5, 33.5], [5, 33.5]] as const) plant(x, z);
  chandelier(0, 21, 1.4);
  chandelier(-7, 28, 0.7);
  chandelier(7, 28, 0.7);
}

/** Conference room (x 12..32): big board table with head chairs, screens as cover near the door. */
export function buildConference(): void {
  box('rug', 22, 0, 26, 13, 0.03, 6, false);
  boardTable(22, 26, 9, 2.8, 6, true, true);
  screenPanel(17.5, 18.8, 3, true, 'wainWine'); // staggered partitions flank the door line
  screenPanel(26.5, 20.4, 3, true, 'wainWine');
  sign('screenDesk', 22, 1.2, 34.7, 6, 2.4, 'x');
  box('wood', 12.7, 0, 22, 0.6, 0.9, 6);
  box('metal', 12.7, 0.9, 22, 0.3, 0.4, 0.3, false);
  cabinets(30.2, 34.2, 3, true);
  plant(30.5, 16);
  plant(30.5, 33.5);
  plant(13.5, 33.5);
  chandelier(22, 26, 1.3);
}

/** Phone-booth lounge (x 32..50): booths along the east wall, long table, sofas. */
export function buildPhoneLounge(): void {
  for (const z of [17.5, 21.5, 25.5, 29.5, 33]) booth(48.4, z);
  deskFrame(40, 26, 2.7, 1.5, true, 'green');
  box('white', 40, 0.76, 26, 0.03, 0.16, 1.5, false);
  sofa(35, 18, 3, 's', 'sofa2');
  sofa(37, 32.5, 3, 'n');
  sofa(45, 18, 2.4, 's');
  screenPanel(40, 21.5, 3, true, 'wainTeal');
  plant(33.5, 16);
  plant(44, 33.5);
  sign('signBlue', 41, 3.1, 14.3, 5, 0.6, 'x');
}
