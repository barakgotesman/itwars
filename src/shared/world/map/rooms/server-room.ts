/**
 * Server room (x -6..10, z -35..-20): the high-risk, high-reward room.
 *
 * Shooter layout: two ways in (main door south at x=2, service door east at z=-27), staggered rack
 * rows so no aisle is a straight shooting gallery, a glass-topped control cage as a nest in the NE
 * corner, and heavy hardware (UPS, cooling unit, crash cart) as entry cover just inside the door.
 */
import { box, banner, lamp, sign } from '../builder';
import { chair, deskFrame, monitor, rackSegment } from '../furniture';

/** Rack rows as `[x, [z0, z1][]]`; the gaps are offset between rows so lanes zig-zag. */
const RACK_ROWS: readonly (readonly [number, readonly (readonly [number, number])[]])[] = [
  [-3.2, [[-34.2, -30.0], [-28.5, -24.0]]],
  [1.0, [[-34.2, -31.5], [-29.5, -25.5]]],
  [5.0, [[-33.5, -28.0], [-26.5, -23.5]]],
];

/** Builds the server room contents. */
export function buildServerRoom(): void {
  for (const [x, segs] of RACK_ROWS) for (const [a, b] of segs) rackSegment(x, a, b);

  // Raised-floor tile seams.
  for (let x = -5.4; x < 9.8; x += 1.2) box('dark', x, 0, -27.5, 0.03, 0.012, 14.5, false);
  for (let z = -34.4; z < -20.2; z += 1.2) box('dark', 2, 0, z, 15.5, 0.012, 0.03, false);
  // Hot/cold aisle markings and the hazard apron inside the door.
  box('accentRed', -1.1, 0, -27.5, 0.12, 0.016, 13, false);
  box('accentBlue', 3.0, 0, -27.5, 0.12, 0.016, 13, false);
  for (let i = 0; i < 10; i++) box(i % 2 ? 'dark' : 'hazard', 2 + (i - 4.5) * 0.4, 0, -22.5, 0.4, 0.02, 1.6, false);

  // Entry cover just inside the main door: UPS bank (west), crash cart, cooling unit (east).
  box('dark', -5.25, 0, -22.6, 1.0, 1.9, 3.0);
  box('led', -4.74, 1.5, -22.6, 0.03, 0.08, 2.4, false);
  box('ledBlink', -4.74, 0.4, -22.6, 0.03, 0.08, 2.4, false);
  box('white', 9.0, 0, -22.3, 1.2, 2.0, 2.4); // CRAC
  box('metal', 8.39, 0.3, -22.3, 0.03, 1.4, 2.0, false); // CRAC louvres
  box('metal', -1.2, 0.5, -22.6, 0.8, 0.4, 0.6); // crash cart
  box('dark', -1.2, 0, -22.6, 0.7, 0.5, 0.5);
  monitor(-1.2, 0.9, -22.6, 1, 'screenTerm');
  for (const x of [-5.4, -4.9]) box('red', x, 0, -20.75, 0.4, 1.4, 0.4); // fire-suppression bottles

  // Control cage in the NE corner: waist-high mesh wall, glass above, one opening to the south.
  box('metal', 6.6, 0, -33.6, 0.1, 1.1, 2.2);
  box('glass', 6.6, 1.1, -33.6, 0.06, 1.1, 2.2, false);
  box('metal', 7.4, 0, -31.5, 1.6, 1.1, 0.1);
  box('glass', 7.4, 1.1, -31.5, 1.6, 1.1, 0.06, false);
  deskFrame(8.5, -34.2, 2.4, 0.8);
  for (const dx of [-0.7, 0, 0.7]) monitor(8.5 + dx, 0.76, -34.4, 1, dx === 0 ? 'screenTerm' : 'screenBsod');
  chair(8.5, -33.0, 'n', 'meeting');
  box('dark', 9.4, 0, -32.2, 0.6, 0.6, 0.6); // spare UPS to crouch behind
  lamp(8.2, 2.0, -33, 0x4a86ff, 0.9, 5);

  // Overhead cable trays follow the rack rows, with cross trays over the aisles.
  for (const [x] of RACK_ROWS) box('dark', x, 2.45, -28.5, 0.45, 0.07, 12, false);
  for (const z of [-32.5, -29, -25]) box('metal', 2, 2.75, z, 14.5, 0.07, 0.35, false);
  box('metal', 2, 3.6, -27, 14, 0.15, 0.15, false);

  // North wall: patch-panel field with blinking ports.
  box('dark', 1.5, 0.9, -34.62, 4.5, 1.6, 0.1, false);
  for (let i = 0; i < 6; i++) box(i % 2 ? 'ledBlink' : 'ledBlinkB', 0 + i * 0.6, 1.1, -34.55, 0.4, 0.06, 0.03, false);
  for (let i = 0; i < 6; i++) box('led', 0 + i * 0.6, 1.4, -34.55, 0.4, 0.06, 0.03, false);

  sign('signRed', 2, 2.4, -19.7, 4, 0.5, 'x');
  banner('AUTHORIZED PERSONNEL ONLY', 2, 2.95, -24.5, 4.4, 0.45, 'accentRed');

  lamp(2, 2.0, -21.5, 0xff3030, 0.8, 5);
}
