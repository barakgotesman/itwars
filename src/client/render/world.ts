/**
 * Builds the office meshes from the shared map boxes: generated textures, baked vertex lighting,
 * and a few animated materials (failing tubes, blinking LEDs).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LIGHTS, MAP_BOXES, SOLIDS, type MaterialId } from '@shared/world/map';
import { makeBaker } from './lighting';

type TexKind =
  | 'carpet' | 'tile' | 'wood' | 'concrete' | 'floorDark' | 'plaster' | 'brick'
  | 'ceilingTile' | 'grain' | 'brushed' | 'fabric' | 'panel' | 'cork';

/** Visual definition of one map material. */
interface MatDef {
  color: number;
  /** >1 makes the surface self-lit and bright enough for bloom; such surfaces skip baked lighting. */
  glow?: number;
  opacity?: number;
  texture?: TexKind;
}

/** Metres covered by one texture repeat. */
const TILE_M: Record<TexKind, number> = {
  carpet: 2, tile: 1.6, wood: 2, concrete: 3, floorDark: 1.6, plaster: 3, brick: 2,
  ceilingTile: 1.2, grain: 1.2, brushed: 1, fabric: 0.6, panel: 1.2, cork: 1,
};

const MATERIALS: Record<MaterialId, MatDef> = {
  carpet: { color: 0x6f819a, texture: 'carpet' },
  tile: { color: 0xd6dadc, texture: 'tile' },
  wood: { color: 0xb98a58, texture: 'wood' },
  concrete: { color: 0x9a9da0, texture: 'concrete' },
  floorDark: { color: 0x3a4048, texture: 'floorDark' },
  rug: { color: 0xa8523f, texture: 'fabric' },
  wall: { color: 0xece6d6, texture: 'plaster' },
  trim: { color: 0x4d6c8f },
  frame: { color: 0x2a2d33 },
  ceiling: { color: 0xf1f1ef, texture: 'ceilingTile' },
  light: { color: 0xfff6e6, glow: 2 },
  lightFlicker: { color: 0xeaf0ff, glow: 2 },
  glass: { color: 0x9fd6ee, opacity: 0.35 },
  sky: { color: 0xbcdcff, glow: 2.6 },
  brick: { color: 0xb5654a, texture: 'brick' },
  cork: { color: 0xb68a58, texture: 'cork' },
  duct: { color: 0xa9b0b8, texture: 'brushed' },
  hazard: { color: 0xf2c10f },
  wainSlate: { color: 0x66788f, texture: 'panel' },
  wainNavy: { color: 0x33486b, texture: 'panel' },
  wainGreen: { color: 0x3a7d58, texture: 'panel' },
  wainTeal: { color: 0x2f8a88, texture: 'panel' },
  wainOrange: { color: 0xd18435, texture: 'panel' },
  wainWine: { color: 0x84394a, texture: 'panel' },
  wainBrown: { color: 0x70502f, texture: 'panel' },
  wainGray: { color: 0x575d66, texture: 'panel' },
  accentBlue: { color: 0x4f8fe8 },
  accentGreen: { color: 0x4fd186 },
  accentOrange: { color: 0xf0a030 },
  accentRed: { color: 0xe0503f },
  posterA: { color: 0xd64f8d },
  posterB: { color: 0xf2c94c },
  posterC: { color: 0x4cc2c9 },
  desk: { color: 0xb98d5c, texture: 'grain' },
  chair: { color: 0x3a4049, texture: 'fabric' },
  sofa: { color: 0x3a8f97, texture: 'fabric' },
  sofa2: { color: 0xe08a2e, texture: 'fabric' },
  shelf: { color: 0x7d593a, texture: 'grain' },
  metal: { color: 0xa2aab2, texture: 'brushed' },
  rack: { color: 0x23272d, texture: 'brushed' },
  white: { color: 0xf4f4f1 },
  dark: { color: 0x1c1e23 },
  red: { color: 0xc9423a },
  blue: { color: 0x3f78cc },
  green: { color: 0x479a4e },
  pot: { color: 0xbd6a44 },
  cardboard: { color: 0xc29862, texture: 'grain' },
  crate: { color: 0x84623c, texture: 'grain' },
  paper: { color: 0xfafafa },
  screen: { color: 0x3a86ff, glow: 2.2 },
  screenTerm: { color: 0x1d6b3a, glow: 1.6 },
  screenDesk: { color: 0x5f8fd6, glow: 1.8 },
  screenSheet: { color: 0x7fc08a, glow: 1.8 },
  screenSaver: { color: 0x7a4fd6, glow: 1.8 },
  screenBsod: { color: 0x1c4fd0, glow: 2 },
  screenOff: { color: 0x15171b },
  led: { color: 0x39ff6a, glow: 1.5 },
  ledBlink: { color: 0x39ff6a, glow: 1.6 },
  ledBlinkB: { color: 0xffb02e, glow: 1.6 },
  signGreen: { color: 0x2fe06f, glow: 1.8 },
  signBlue: { color: 0x4a8cff, glow: 1.8 },
  signOrange: { color: 0xffa21f, glow: 1.8 },
  signRed: { color: 0xff4a3d, glow: 1.8 },
};

/** Cheap seeded noise so textures are identical on every load. */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Draws a near-white tile that multiplies with the material colour.
 * @param kind - Which pattern to draw.
 */
function makeTexture(kind: TexKind): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = noise(kind.length * 7919 + kind.charCodeAt(0));
  const grey = (v: number): string => `rgb(${v},${v},${v})`;
  const speckle = (n: number, lo: number, hi: number, s: number): void => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = grey(lo + Math.floor(rnd() * (hi - lo)));
      g.fillRect(rnd() * size, rnd() * size, s, s);
    }
  };
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size, size);

  switch (kind) {
    case 'carpet':
      speckle(2600, 205, 255, 2);
      speckle(700, 165, 200, 1);
      break;
    case 'plaster':
      speckle(1800, 240, 255, 2);
      break;
    case 'concrete':
      speckle(2600, 185, 255, 2);
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, size, size);
      break;
    case 'tile':
    case 'floorDark':
      g.fillStyle = grey(kind === 'tile' ? 236 : 222);
      g.fillRect(size / 2, 0, size / 2, size / 2);
      g.fillRect(0, size / 2, size / 2, size / 2);
      speckle(500, 215, 255, 2);
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = 3;
      g.strokeRect(0, 0, size, size);
      g.lineWidth = 2;
      g.strokeRect(size / 2, 0, 1, size);
      g.strokeRect(0, size / 2, size, 1);
      break;
    case 'wood': {
      const plank = size / 4;
      for (let i = 0; i < 4; i++) {
        const v = 215 + Math.floor(rnd() * 40);
        g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        g.fillRect(0, i * plank, size, plank);
        g.fillStyle = 'rgba(90,50,20,0.12)';
        for (let k = 0; k < 6; k++) g.fillRect(rnd() * size, i * plank + rnd() * plank, 30 + rnd() * 40, 1);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(0, i * plank, size, 1.5);
        g.fillRect((i * 37) % size, i * plank, 1.5, plank);
      }
      break;
    }
    case 'brick': {
      g.fillStyle = grey(150);
      g.fillRect(0, 0, size, size);
      const rows = 8;
      const bh = size / rows;
      const bw = size / 4;
      for (let r = 0; r < rows; r++) {
        for (let k = -1; k < 4; k++) {
          const v = 205 + Math.floor(rnd() * 50);
          g.fillStyle = grey(v);
          g.fillRect(k * bw + (r % 2 ? bw / 2 : 0) + 1.5, r * bh + 1.5, bw - 3, bh - 3);
        }
      }
      break;
    }
    case 'ceilingTile':
      speckle(900, 225, 255, 2);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 3;
      g.strokeRect(0, 0, size, size);
      break;
    case 'grain':
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.07})`;
        g.fillRect(0, rnd() * size, size, 1 + rnd() * 2);
      }
      break;
    case 'brushed':
      for (let i = 0; i < 160; i++) {
        g.fillStyle = grey(205 + Math.floor(rnd() * 50));
        g.fillRect(0, rnd() * size, size, 1);
      }
      break;
    case 'fabric':
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < size; i += 4) {
        g.fillRect(i, 0, 1, size);
        g.fillRect(0, i, size, 1);
      }
      speckle(500, 215, 255, 1);
      break;
    case 'panel':
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(0, 0, 3, size);
      g.fillRect(size / 2, 0, 2, size);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(3, 0, 1, size);
      g.fillRect(size / 2 + 2, 0, 1, size);
      break;
    case 'cork':
      speckle(2200, 140, 255, 2);
      break;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Planar UVs chosen by face normal, so one texture tiles at a constant world scale on any box. */
function projectUv(g: THREE.BufferGeometry, tile: number): void {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i));
    if (ay >= ax && ay >= Math.abs(nor.getZ(i))) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
    else if (ax >= Math.abs(nor.getZ(i))) uv.setXY(i, pos.getZ(i) / tile, pos.getY(i) / tile);
    else uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
  }
}

/** Animated bits of the world. */
export interface World {
  /** Advances flicker and blink animation. @param t - Time in seconds. */
  update(t: number): void;
}

/**
 * Builds the office meshes into the scene. Boxes are merged per material, subdivided so baked
 * lighting has enough vertices, and lit once at load.
 * @param scene - Scene to add the office to.
 * @returns Handle for per-frame animation.
 */
export function buildWorld(scene: THREE.Scene): World {
  // Tall solids block light and cast contact shadows; floors and low furniture do not.
  const occluders = SOLIDS.filter((b) => b.maxY - b.minY > 1.0 && b.maxY > 0.5);
  const bake = makeBaker(LIGHTS, occluders);
  const animated: { mat: THREE.MeshBasicMaterial; base: THREE.Color; fn: (t: number) => number }[] = [];

  for (const id of Object.keys(MATERIALS) as MaterialId[]) {
    const def = MATERIALS[id];
    const floorLike = def.texture === 'carpet' || def.texture === 'tile' || def.texture === 'wood' ||
      def.texture === 'concrete' || def.texture === 'floorDark';
    const step = floorLike ? 0.8 : 1.5;
    const baked = def.glow === undefined && def.opacity === undefined;
    const geos: THREE.BufferGeometry[] = [];

    for (const b of MAP_BOXES) {
      if (b.mat !== id) continue;
      const w = b.maxX - b.minX, h = b.maxY - b.minY, d = b.maxZ - b.minZ;
      const seg = (len: number, cap: number): number => (baked ? Math.min(cap, Math.max(1, Math.ceil(len / step))) : 1);
      const g = new THREE.BoxGeometry(w, h, d, seg(w, 70), seg(h, 4), seg(d, 70));
      g.translate((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
      if (def.texture) projectUv(g, TILE_M[def.texture]);
      if (baked) bake(g);
      geos.push(g);
    }
    if (!geos.length) continue;

    const base = new THREE.Color(def.color).multiplyScalar(def.glow ?? 1);
    const mat = new THREE.MeshBasicMaterial({
      color: base,
      vertexColors: baked,
      ...(def.texture ? { map: makeTexture(def.texture) } : {}),
      ...(def.opacity !== undefined ? { transparent: true, opacity: def.opacity, depthWrite: false } : {}),
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, mat);
    if (def.opacity !== undefined) mesh.renderOrder = 1;
    scene.add(mesh);

    if (id === 'lightFlicker') {
      // Mostly on, with brief stutters like a dying tube.
      animated.push({ mat, base, fn: (t) => {
        const slot = Math.floor(t * 14);
        const h = Math.sin(slot * 91.7) * 43758.5453;
        return h - Math.floor(h) > 0.82 ? 0.12 : 1;
      } });
    } else if (id === 'ledBlink') {
      animated.push({ mat, base, fn: (t) => (Math.sin(t * 5) > 0.2 ? 1 : 0.08) });
    } else if (id === 'ledBlinkB') {
      animated.push({ mat, base, fn: (t) => (Math.sin(t * 3.1 + 1.3) > -0.3 ? 1 : 0.08) });
    } else if (id === 'screen') {
      animated.push({ mat, base, fn: (t) => 0.9 + 0.1 * Math.sin(t * 40) });
    }
  }

  return {
    update(t) {
      for (const a of animated) a.mat.color.copy(a.base).multiplyScalar(a.fn(t));
    },
  };
}
