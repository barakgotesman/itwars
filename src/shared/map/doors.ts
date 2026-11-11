/**
 * Which doorways have a working sliding door, and how each one is built. A door is a panel that hangs just in
 * front of the wall and slides along it, so its collision stays a simple box that can be moved and tested.
 */
import { LINTEL_Y, WALL_T } from './builder';

/** Visual style of a door panel. */
export type DoorStyle = 'wood' | 'glass';

/** One sliding door. Coordinates are for the panel when fully closed. */
export interface DoorDef {
  /** Name shown on the prompt. */
  name: string;
  /** Centre of the closed panel. */
  x: number;
  z: number;
  /** Direction of the wall the door slides along: 'x' for a wall running east-west. */
  axis: 'x' | 'z';
  /** Width of the doorway (the gap in the wall). */
  gap: number;
  /** +1 or -1: which way the panel slides when opening. */
  dir: 1 | -1;
  /** +1 or -1: which side of the wall the panel hangs on, along the wall's normal. */
  side: 1 | -1;
  /** Fraction open at the start of a match: 0 closed .. 1 open. */
  initial: number;
  style: DoorStyle;
  /** Panel colour (wood) or frame colour (glass). */
  color: number;
}

/** Panel thickness. */
export const DOOR_THICKNESS = 0.1;
/** Panel height: it fills the doorway up to the lintel. */
export const DOOR_HEIGHT = LINTEL_Y;
/** How far the panel overlaps the wall on each side of the doorway when closed. */
export const DOOR_OVERLAP = 0.1;
/** Distance from the wall's centre line to the panel's centre; keeps clear of the frame trim. */
export const DOOR_OFFSET = WALL_T / 2 + 0.16;

/**
 * Builds a door for a doorway on an east-west wall.
 * @param wallZ - Wall coordinate.
 * @param side - +1 puts the panel on the +z side of the wall, -1 on the -z side.
 */
function onXWall(name: string, x: number, wallZ: number, side: 1 | -1, dir: 1 | -1, initial: number, style: DoorStyle, color: number): DoorDef {
  return { name, x, z: wallZ + side * DOOR_OFFSET, axis: 'x', gap: 3.2, dir, side, initial, style, color };
}

/**
 * The working doors: every north-row room door and three south-row ones, all on the open-plan side of the wall.
 * Four start half-closed; the rest start open. Index in this array is the door's id on the wire.
 */
export const DOORS: readonly DoorDef[] = [
  onXWall('Executive office', -42, -20, 1, 1, 1, 'wood', 0x9a6a3c),
  onXWall('Meeting room A', -27, -20, 1, -1, 1, 'glass', 0x3a5f8f),
  onXWall('Meeting room B', -13, -20, 1, 1, 1, 'glass', 0x3a5f8f),
  onXWall('Server room', 2, -20, 1, -1, 0.5, 'wood', 0x8c2b2b),
  onXWall('Print room', 17, -20, 1, 1, 1, 'wood', 0x3f5f8a),
  onXWall('IT Helpdesk', 30, -20, 1, -1, 0.5, 'glass', 0x2f7a4f),
  onXWall('IT Helpdesk (east)', 44, -20, 1, 1, 1, 'glass', 0x2f7a4f),
  onXWall('Break room', -40, 14, -1, 1, 0.5, 'wood', 0xb8742a),
  onXWall('Storage', -21, 14, -1, -1, 1, 'wood', 0xb8742a),
  onXWall('Conference room', 22, 14, -1, 1, 0.5, 'glass', 0x8c2b2b),
];
