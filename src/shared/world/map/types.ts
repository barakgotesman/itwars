/**
 * Plain types shared by every map module: material keys, boxes, baked lights and door nameplates.
 */
import type { Aabb } from '@shared/core/physics';

/** Material key; the client merges all boxes of one material into a single mesh. */
export type MaterialId =
  | 'carpet' | 'tile' | 'wood' | 'concrete' | 'floorDark' | 'rug'
  | 'wall' | 'trim' | 'frame' | 'ceiling' | 'light' | 'lightFlicker' | 'glass' | 'sky' | 'brick' | 'cork' | 'duct' | 'hazard'
  | 'wainSlate' | 'wainNavy' | 'wainGreen' | 'wainTeal' | 'wainOrange' | 'wainWine' | 'wainBrown' | 'wainGray'
  | 'accentBlue' | 'accentGreen' | 'accentOrange' | 'accentRed'
  | 'posterA' | 'posterB' | 'posterC'
  | 'desk' | 'chair' | 'sofa' | 'sofa2' | 'shelf' | 'metal' | 'rack' | 'white' | 'dark'
  | 'red' | 'blue' | 'green' | 'pot' | 'cardboard' | 'crate' | 'paper'
  | 'screen' | 'screenTerm' | 'screenDesk' | 'screenSheet' | 'screenSaver' | 'screenBsod' | 'screenOff'
  | 'led' | 'ledBlink' | 'ledBlinkB' | 'signGreen' | 'signBlue' | 'signOrange' | 'signRed';

/** A box with a material; non-solid boxes are decoration only and never collide. */
export interface MapBox extends Aabb {
  mat: MaterialId;
  solid: boolean;
}

/** A point light the client bakes into vertex colours (no runtime cost, soft occlusion by walls). */
export interface LightSource {
  x: number; y: number; z: number;
  /** sRGB hex colour. */
  color: number;
  intensity: number;
  radius: number;
}

/** A live scoreboard screen on a wall; the client draws the standings onto a plane at this place. */
export interface BoardSpec {
  /** 'x' for a wall running along X (screen faces ±z), 'z' for one along Z (screen faces ±x). */
  axis: 'x' | 'z';
  /** Centre of the screen. */
  x: number; y: number; z: number;
  facing: 1 | -1;
  w: number; h: number;
}

/** A door nameplate; the client draws `text` on a plane at this position, facing `facing` along the wall normal. */
export interface LabelSpec {
  text: string;
  x: number; y: number; z: number;
  /** 'x' for a wall running along X (plate faces ±z), 'z' for one along Z (plate faces ±x). */
  axis: 'x' | 'z';
  facing: 1 | -1;
  w: number; h: number;
  /** Accent material whose colour tints the plate. */
  accent: MaterialId;
}

/**
 * `[centre, width, doorColourMaterial?, nameplateText?, hasSlidingDoor?]` of a gap cut into a wall.
 * The last flag means a working sliding door covers the gap, so the decorative static door leaves are not drawn.
 */
export type Gap = readonly [number, number, MaterialId?, string?, boolean?];
/** Cardinal direction a piece of furniture faces. */
export type Facing = 'n' | 's' | 'e' | 'w';
