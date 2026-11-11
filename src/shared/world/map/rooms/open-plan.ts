/**
 * Open-plan floor (z -20..14): cubicle pods, central lounge, set pieces and the cover that breaks
 * the long sightlines. Servers do not live here; they stay in the server room.
 */
import { banner, box, EDGE, lamp, poster, wallPlaque, X0, X1 } from '../builder';
import {
  arcade, beanbag, cabinets, chandelier, coffeeBar, coffeeTable, cone, cooler, copierHub, cubicleRuin, deskFort, eWaste,
  foosball, kanban, lowWall, pillar, plant, planterTree, planterWall, pod, screenPanel, sofa, vending, wetFloor,
} from '../furniture';
import type { MaterialId } from '../types';

/** Cubicle pods in four columns; lanes between them are filled by the set pieces below. */
function pods(): void {
  for (const cx of [-40, -26, 26, 40]) {
    for (const cz of [-13, -3, 7]) pod(cx, cz);
  }
}

/** Central lounge: rug, sofas around a coffee table, low walls, columns, plants, coolers, posters. */
function lounge(): void {
  box('rug', 0, 0, -4, 9, 0.03, 6, false);
  sofa(0, -7.2, 3.4, 's');
  sofa(0, -0.8, 3.4, 'n', 'sofa2');
  sofa(-4.3, -4, 2.2, 'e', 'sofa2');
  sofa(4.3, -4, 2.2, 'w');
  coffeeTable(0, -4, 2.2, 1.0);
  for (const [x, z] of [[-10, -12], [10, -12], [-10, 4], [10, 4]] as const) lowWall(x, z, 4.5, true);
  lowWall(0, 10, 6, true);
  chandelier(0, -4, 1.5);
  for (const [x, z] of [[-18, -7], [18, -7], [-18, 1], [18, 1]] as const) pillar(x, z, 0.9);
  for (const [x, z] of [[-14, -17], [14, -17], [-14, 11], [14, 11], [-6, -15], [6, -15], [-6, 8], [6, 8]] as const) plant(x, z);
  for (const [x, z] of [[-15, -18.8], [15, -18.8], [-15, 12.8], [15, 12.8]] as const) cooler(x, z);
  const posters: readonly MaterialId[] = ['posterA', 'posterB', 'posterC'];
  [-47, -34, -8, 8, 34, 47].forEach((x, i) => poster(posters[i % 3]!, x, 1.7, -19.7, 2.0, 1.4, 'x'));
}

/** Cover pass: staggered full-height screens, columns and low walls so no lane is a shooting gallery. */
function coverPass(): void {
  // Mid-lane columns (peek corners) between lounge and pods.
  pillar(-12, -4);
  pillar(12, -4);
  // Wall vending machines double as flank cover on the north side.
  vending(-5.2, -19.3, 1, 'signBlue');
  vending(5.2, -19.3, 1, 'signOrange');
  // West corridor.
  screenPanel(-35.5, -8, 3, false, 'wainNavy');
  lowWall(-30, 3.5, 3, false);
  pillar(-33, 8.5);
  // East corridor.
  pillar(35, -9);
  screenPanel(36, 1, 3, false, 'wainTeal');
  lowWall(30, 9, 3, true);
  // Outer lanes along the windows: long and narrow, so break them up.
  screenPanel(-46, -8, 4, false, 'wainTeal');
  planterWall(-46, 0, 4, false);
  pillar(-46, 9);
  screenPanel(46, -2, 4, false, 'wainTeal');
  planterWall(46, 6, 4, false);
  pillar(46, -10);
}

/** West "standup corner" and east "games corner" plus the stage that replaces the old open-plan racks. */
function setPieces(): void {
  // West lane: standup corner
  kanban(-33, -12.5);
  beanbag(-34.6, -4.6, 'sofa2');
  beanbag(-31.9, -3.9, 'sofa');
  beanbag(-33.6, -2.3, 'sofa2');
  cabinets(-32.75, 12, 6);
  cubicleRuin(-20, -3);
  cone(-22.5, 5);
  wetFloor(-35.5, 5.5);

  // East lane: games corner
  for (const [i, x] of [30.4, 31.6, 32.8].entries()) arcade(x, -6.0, -1, i === 1 ? 'signOrange' : 'signBlue', i === 1 ? 0xffa21f : 0x4a8cff);
  foosball(33, -2.4);
  foosball(33, 5.2);
  deskFort(20.5, -3);
  cone(24.5, 12);
  cone(25.2, 12.6);
  wetFloor(36, 6.8);

  // Lounge flanks
  coffeeBar(-14, -9);
  banner('COFFEE = FUEL', -14, 3.1, -9, 2.2, 0.4, 'accentOrange');
  copierHub(14, -9);
  eWaste(-15, 5);
  planterTree(-19.5, -15);
  planterTree(19.5, -15);
  planterTree(-19.5, 9.5);
  planterTree(19.5, 9.5);
  cone(7.5, -6.5);
  wetFloor(-2, -12.5);
  cone(12.5, 1);
  wetFloor(-12.5, 8);

  // Town-hall stage: a 0.6 m platform with a podium, high ground for the east side.
  box('dark', 15.5, 0, 4.6, 6.4, 0.6, 2.6);
  box('wood', 15.5, 0.6, 4.6, 6.0, 0.04, 2.4, false);
  box('wood', 15.5, 0.64, 4.8, 0.8, 1.1, 0.6);
  box('screenDesk', 15.5, 1.55, 4.4, 0.25, 0.15, 0.02, false);
  lamp(15.5, 2.6, 5.2, 0xfff1dc, 0.9, 7);
}

/** Hanging banners, wall plaques and floor lamps that give the floor a voice. */
function signage(): void {
  banner('HAVE YOU TRIED TURNING THEM OFF?', 0, 2.9, -8.4, 6, 0.7, 'accentBlue');
  banner('Q4 TARGET: 50 KILLS', 0, 2.9, 6.5, 5, 0.6, 'accentRed');
  banner('SECURITY BEGINS WITH U', -30, 3.0, 12.6, 4, 0.5, 'accentGreen');
  banner('PLEASE DO NOT CLICK', 30, 3.0, 12.6, 4, 0.5, 'accentRed');
  banner('TOWN HALL: 15:00', 15.5, 2.9, 4.6, 3.2, 0.45, 'accentOrange');
  [[-12, 'REBOOT FIRST'], [-4, 'NO PASSWORDS ON POST-ITS'], [4, 'ASK IT, NOT GOOGLE']].forEach(([z, t]) =>
    wallPlaque(t as string, X0 + EDGE + 0.04, 3.55, z as number, 1, 4.4, 'accentBlue'));
  [[-10, 'THIS IS FINE'], [-2, 'SAVE YOUR WORK'], [6, 'MEETING COULD BE AN EMAIL']].forEach(([z, t]) =>
    wallPlaque(t as string, X1 - EDGE - 0.04, 3.55, z as number, -1, 4.4, 'accentOrange'));

  for (const [x, z] of [[-5.9, -7.6], [5.9, -0.4], [-5.9, -0.4], [5.9, -7.6]] as const) {
    box('dark', x, 0, z, 0.15, 1.5, 0.15, false);
    box('light', x, 1.5, z, 0.45, 0.35, 0.45, false);
    lamp(x, 1.7, z, 0xffc47a, 0.9, 7);
  }
  lamp(-14, 2.2, -8.2, 0xffc47a, 0.8, 6);
  lamp(-30.5, 1.5, 19, 0xff5a4a, 0.8, 3.5);
  lamp(-30.5, 1.5, 21, 0x4a8cff, 0.8, 3.5);
}

/** Builds everything on the open-plan floor. */
export function buildOpenPlan(): void {
  pods();
  lounge();
  coverPass();
  setPieces();
  signage();
}
