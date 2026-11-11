/**
 * Glass-walled huddle rooms standing in the open-plan lanes. They split long sightlines while
 * letting players see in; each has one doorway and a small interior to fight over.
 */
import { box } from '../builder';
import { boardTable, chair, coffeeTable, deskFrame, deskWithMonitor, glassRoom, plant, sofa } from '../furniture';

/** Builds the three huddle rooms (west lane, east lane, south-east). */
export function buildGlassRooms(): void {
  // Huddle 1: west lane, door on the corridor side.
  glassRoom(-49, -44, -17, -11, { wall: 'e', c: -14, w: 1.8 });
  boardTable(-46.5, -14, 2.2, 1.2, 2, false, false);
  box('white', -48.9, 1.0, -14, 0.04, 1.2, 2.8, false); // whiteboard on the outer glass

  // Huddle 2: east lane, door facing the pods.
  glassRoom(44.5, 49, 8.5, 13.5, { wall: 'w', c: 11, w: 1.8 });
  deskWithMonitor(47.5, 9.6, 0.2);
  chair(47.5, 10.7, 'n');
  sofa(48.5, 12.4, 2, 'w', 'sofa2');
  coffeeTable(46.4, 12.3, 0.8, 1.1);
  plant(45.2, 9.2);

  // Huddle 3: south-east of the open plan, door on the west.
  glassRoom(27.5, 34, 9.8, 13.6, { wall: 'w', c: 11.7, w: 1.8 });
  deskFrame(30.8, 11.7, 2.4, 1.0);
  for (const dx of [-0.8, 0, 0.8]) chair(30.8 + dx, 12.7, 'n', 'guest');
  chair(30.8, 10.7, 's', 'meeting');
  plant(33.4, 10.4);
}
