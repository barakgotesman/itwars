/**
 * Draws the sliding doors: blocky wooden slabs with raised panels, or glass doors in a coloured frame, each
 * with a metal pull bar. Positions come straight from the shared door collision boxes, so what you see is
 * exactly what you collide with.
 */
import * as THREE from 'three';
import type { Doors } from '../shared/doors';
import { DOOR_HEIGHT, DOOR_THICKNESS, type DoorDef } from '../shared/map/doors';

const matCache = new Map<number, THREE.MeshLambertMaterial>();
/** Shared flat-shaded material per colour. */
function lam(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.12 });
    matCache.set(color, m);
  }
  return m;
}

/** Tinted, see-through glass with a faint frosted band at eye height. */
const GLASS = new THREE.MeshPhongMaterial({
  color: 0x9fdcff, transparent: true, opacity: 0.32, shininess: 140, specular: 0xffffff, depthWrite: false,
});
const FROST = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });

/** Adds a box to a group, centred at (x, y, z). */
function box(g: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): void {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  g.add(m);
}

/**
 * Builds one door panel centred on the origin, long side along X, thin side along Z.
 * @param length - Panel length (doorway plus overlap).
 */
function buildPanel(def: DoorDef, length: number): THREE.Group {
  const g = new THREE.Group();
  const t = DOOR_THICKNESS;
  const metal = lam(0xb9bfc7);
  const dark = lam(0x30343c);
  if (def.style === 'wood') {
    const wood = lam(def.color);
    const inset = lam(new THREE.Color(def.color).multiplyScalar(0.78).getHex());
    box(g, wood, length, DOOR_HEIGHT, t, 0, DOOR_HEIGHT / 2, 0);
    // Raised panels on both faces: two columns of two, each a few mm proud of the slab.
    for (const face of [1, -1]) {
      for (const cx of [-length * 0.24, length * 0.24]) {
        for (const cy of [DOOR_HEIGHT * 0.27, DOOR_HEIGHT * 0.72]) {
          box(g, inset, length * 0.38, DOOR_HEIGHT * 0.36, 0.02, cx, cy, face * (t / 2 + 0.006));
        }
      }
    }
    box(g, dark, length, 0.08, t + 0.02, 0, 0.04, 0);
    box(g, dark, length, 0.08, t + 0.02, 0, DOOR_HEIGHT - 0.04, 0);
  } else {
    const frame = lam(def.color);
    const bar = 0.14;
    box(g, GLASS, length - bar * 2, DOOR_HEIGHT - bar * 2, 0.03, 0, DOOR_HEIGHT / 2, 0);
    box(g, FROST, length - bar * 2, 0.35, 0.036, 0, DOOR_HEIGHT * 0.5, 0);
    box(g, frame, length, bar, t, 0, bar / 2, 0);
    box(g, frame, length, bar, t, 0, DOOR_HEIGHT - bar / 2, 0);
    box(g, frame, bar, DOOR_HEIGHT, t, -length / 2 + bar / 2, DOOR_HEIGHT / 2, 0);
    box(g, frame, bar, DOOR_HEIGHT, t, length / 2 - bar / 2, DOOR_HEIGHT / 2, 0);
    box(g, frame, 0.06, DOOR_HEIGHT, t, 0, DOOR_HEIGHT / 2, 0);
  }
  // Pull bars on both faces, on the edge you grab to slide it open.
  const handleX = -def.dir * (length / 2 - 0.35);
  for (const face of [1, -1]) {
    box(g, metal, 0.05, 0.6, 0.05, handleX, 1.05, face * (t / 2 + 0.05));
    box(g, dark, 0.03, 0.04, 0.05, handleX, 1.38, face * (t / 2 + 0.025));
    box(g, dark, 0.03, 0.04, 0.05, handleX, 0.72, face * (t / 2 + 0.025));
  }
  return g;
}

/** All the door models, kept in step with the door state. */
export class DoorVisuals {
  private readonly panels: THREE.Group[];

  /**
   * @param scene - Scene to add the doors to.
   * @param doors - The shared door state whose boxes the models follow.
   */
  constructor(scene: THREE.Scene, private readonly doors: Doors) {
    this.panels = doors.defs.map((def) => {
      const length = def.gap + 0.2;
      // Panels for walls running along Z are turned a quarter so their long side follows the wall.
      const g = buildPanel(def, length);
      if (def.axis === 'z') g.rotation.y = Math.PI / 2;
      scene.add(g);
      return g;
    });
    this.update();
  }

  /** Moves every model to its door's current box. Call once a frame. */
  update(): void {
    this.panels.forEach((g, i) => {
      const b = this.doors.boxes[i]!;
      g.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    });
  }
}
