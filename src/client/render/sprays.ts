/**
 * Spray-paint tags: flat pixel-art decals the server places on walls, floors and ceilings. Every player keeps
 * at most a few live tags; a new one replaces their oldest. All tags are cleared when a match restarts.
 */
import * as THREE from 'three';
import { SPRAYS, SPRAY_GRID, SPRAY_PALETTE } from '@shared/rules/sprays';

/** Live tags per player; the oldest is removed when a player sprays one more. */
const PER_PLAYER = 3;
/** Edge length of a tag (m). */
const SIZE = 0.9;
/** How far a tag floats off the surface (m), so its face never shares a plane with the wall. */
const STANDOFF = 0.015;
/** Seconds of the quick grow-in when a tag appears. */
const POP_S = 0.18;

/** One placed tag and its grow-in progress. */
interface Tag {
  mesh: THREE.Mesh;
  age: number;
}

/**
 * Draws one design onto a 16 x 16 canvas (also used by the menu's design picker).
 * @param index - Index into `SPRAYS`.
 */
export function drawSpray(index: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SPRAY_GRID;
  canvas.height = SPRAY_GRID;
  const g = canvas.getContext('2d')!;
  SPRAYS[index]!.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = SPRAY_PALETTE[ch];
      if (!color || x >= SPRAY_GRID || y >= SPRAY_GRID) return;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    });
  });
  return canvas;
}

/** The design as a texture with hard pixel edges. */
function makeTexture(index: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(drawSpray(index));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** All spray tags in the scene. */
export class Sprays {
  private readonly geo = new THREE.PlaneGeometry(SIZE, SIZE);
  /** One material per design, created the first time it is used. */
  private readonly mats = new Map<number, THREE.MeshBasicMaterial>();
  /** Live tags per player id, oldest first. */
  private readonly tags = new Map<number, Tag[]>();
  private readonly n = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly roll = new THREE.Quaternion();
  private static readonly Z = new THREE.Vector3(0, 0, 1);

  /** @param scene - Scene the tags are added to. */
  constructor(private readonly scene: THREE.Scene) {}

  private material(design: number): THREE.MeshBasicMaterial {
    let m = this.mats.get(design);
    if (!m) {
      // Cut-out transparency (no blending) keeps the pixel edges hard; polygon offset wins against the wall.
      m = new THREE.MeshBasicMaterial({
        map: makeTexture(design), transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
      });
      this.mats.set(design, m);
    }
    return m;
  }

  /**
   * Places a tag.
   * @param owner - Player id who sprayed it.
   * @param design - Index into `SPRAYS`.
   * @param axis - Axis of the surface normal: 0 = x, 1 = y, 2 = z.
   * @param sign - +1 or -1: which way along that axis the surface faces.
   * @param roll - Quarter turns of the sprayer's heading, used only for floors and ceilings.
   */
  add(owner: number, design: number, x: number, y: number, z: number, axis: number, sign: number, roll: number): void {
    const mesh = new THREE.Mesh(this.geo, this.material(design));
    this.n.set(axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0);
    mesh.quaternion.setFromUnitVectors(Sprays.Z, this.n);
    if (axis === 1) {
      // Turn about the surface normal so the design's top points where the sprayer was looking.
      const turn = sign > 0 ? roll * (Math.PI / 2) : Math.PI - roll * (Math.PI / 2);
      mesh.quaternion.multiply(this.roll.setFromAxisAngle(Sprays.Z, turn));
    }
    mesh.position.set(x + this.n.x * STANDOFF, y + this.n.y * STANDOFF, z + this.n.z * STANDOFF);
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);

    const list = this.tags.get(owner) ?? [];
    list.push({ mesh, age: 0 });
    while (list.length > PER_PLAYER) this.scene.remove(list.shift()!.mesh);
    this.tags.set(owner, list);
  }

  /** Grows new tags in over a moment. @param dt - Seconds since the last frame. */
  update(dt: number): void {
    for (const list of this.tags.values()) {
      for (const t of list) {
        if (t.age >= POP_S) continue;
        t.age += dt;
        t.mesh.scale.setScalar(Math.min(1, 0.3 + (t.age / POP_S) * 0.7));
      }
    }
  }

  /** Removes every tag (a new match starts with clean walls). */
  clear(): void {
    for (const list of this.tags.values()) for (const t of list) this.scene.remove(t.mesh);
    this.tags.clear();
  }
}
