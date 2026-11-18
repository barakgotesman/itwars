/**
 * Builder for the small standalone maps (everything except the office): a fresh set of box, light, label and
 * board registries per map, plus the primitives the office builder offers, so two maps never mix their geometry
 * (the office's own registries in `builder.ts` are shared module state and are left alone).
 */
import type { BoardSpec, LabelSpec, LightSource, MapBox, MaterialId } from './types';

/** The registries and primitives of one map under construction. */
export interface LocalMap {
  readonly boxes: MapBox[];
  readonly lights: LightSource[];
  readonly labels: LabelSpec[];
  readonly boards: BoardSpec[];
  /** Adds a box given centre x/z, base y and size; `solid` false is decoration that never collides. */
  box(mat: MaterialId, cx: number, y: number, cz: number, w: number, h: number, d: number, solid?: boolean): void;
  /** Floor slab whose top face is y = 0. */
  floor(mat: MaterialId, x0: number, x1: number, z0: number, z1: number): void;
  /** A thin, non-solid painted stripe lying flush on the floor. */
  stripe(mat: MaterialId, x0: number, x1: number, z0: number, z1: number): void;
  /** Registers a baked point light. */
  lamp(x: number, y: number, z: number, color: number, intensity: number, radius: number): void;
  /** A wall-mounted plaque; `glow` makes it a self-lit sign. */
  plaque(text: string, x: number, y: number, z: number, axis: 'x' | 'z', facing: 1 | -1, w: number, h: number, accent: MaterialId, glow?: boolean): void;
  /** A live scoreboard screen on a wall, with its dark frame and a wash of light on the floor in front. */
  scoreboard(axis: 'x' | 'z', along: number, face: number, facing: 1 | -1, yc: number, w: number, h: number): void;
}

/** Creates empty registries and the primitives bound to them. */
export function createLocalMap(): LocalMap {
  const boxes: MapBox[] = [];
  const lights: LightSource[] = [];
  const labels: LabelSpec[] = [];
  const boards: BoardSpec[] = [];

  const box: LocalMap['box'] = (mat, cx, y, cz, w, h, d, solid = true) => {
    boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minY: y, maxY: y + h, minZ: cz - d / 2, maxZ: cz + d / 2, mat, solid });
  };
  const lamp: LocalMap['lamp'] = (x, y, z, color, intensity, radius) => {
    lights.push({ x, y, z, color, intensity, radius });
  };
  return {
    boxes, lights, labels, boards, box, lamp,
    floor: (mat, x0, x1, z0, z1) => box(mat, (x0 + x1) / 2, -1, (z0 + z1) / 2, x1 - x0, 1, z1 - z0),
    stripe: (mat, x0, x1, z0, z1) => box(mat, (x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, false),
    plaque: (text, x, y, z, axis, facing, w, h, accent, glow = false) => { labels.push({ text, x, y, z, axis, facing, w, h, accent, glow }); },
    scoreboard: (axis, along, face, facing, yc, w, h) => {
      const n = face + facing * 0.05;
      if (axis === 'x') box('dark', along, yc - h / 2 - 0.12, n, w + 0.24, h + 0.24, 0.1, false);
      else box('dark', n, yc - h / 2 - 0.12, along, 0.1, h + 0.24, w + 0.24, false);
      const sx = axis === 'x' ? along : face + facing * 0.11;
      const sz = axis === 'x' ? face + facing * 0.11 : along;
      boards.push({ axis, x: sx, y: yc, z: sz, facing, w, h });
      lamp(axis === 'x' ? along : face + facing * 2.2, yc - 0.2, axis === 'x' ? face + facing * 2.2 : along, 0xcfe2ff, 0.55, 7);
    },
  };
}
