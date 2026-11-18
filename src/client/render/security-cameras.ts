/**
 * The Data Center's ceiling security cameras: blocky dome-less cameras hung from the ceiling that slowly pan back and
 * forth, each with a blinking red light. Unlit flat colours (the map's baked lighting does not touch them) and one
 * rotation per camera per frame, so they cost next to nothing. On a glossy-floor map every camera also has a flipped
 * copy under the floor that pans in step, so the reflection moves with it.
 */
import * as THREE from 'three';
import type { CameraSpec } from '@shared/world/map/types';

/** Flat colours: dark plastic, a lens, a glint on the lens and the recording light. */
const BODY = new THREE.MeshBasicMaterial({ color: 0x23272e });
const MOUNT = new THREE.MeshBasicMaterial({ color: 0x3a4049 });
const LENS = new THREE.MeshBasicMaterial({ color: 0x090f18 });
const GLINT = new THREE.MeshBasicMaterial({ color: 0x6f9cff });
const REC = new THREE.MeshBasicMaterial({ color: 0xff3a3a });

/** Adds a box mesh to a group. */
function part(g: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** One camera: a ceiling plate and stem that stay put, and a pivot with the body that turns. */
function buildCamera(spec: CameraSpec, ceilingY: number): { root: THREE.Group; pivot: THREE.Group; led: THREE.Mesh } {
  const root = new THREE.Group();
  root.position.set(spec.x, spec.y, spec.z);
  part(root, MOUNT, 0.22, 0.04, 0.22, 0, ceilingY - spec.y - 0.02, 0);
  part(root, MOUNT, 0.06, ceilingY - spec.y - 0.04, 0.06, 0, (ceilingY - spec.y - 0.04) / 2, 0);
  const pivot = new THREE.Group();
  // Bigger than a real camera, so players notice the movement from across the hall.
  pivot.scale.setScalar(1.7);
  root.add(pivot);
  // The body looks down a little; its front (the lens) is toward -z, the same way a player at yaw 0 looks.
  const tilt = new THREE.Group();
  tilt.rotation.x = -0.32;
  pivot.add(tilt);
  part(tilt, BODY, 0.16, 0.14, 0.38, 0, -0.05, -0.12);
  part(tilt, BODY, 0.2, 0.04, 0.3, 0, 0.04, -0.12);
  part(tilt, LENS, 0.1, 0.1, 0.04, 0, -0.05, -0.33);
  part(tilt, GLINT, 0.03, 0.03, 0.03, -0.02, -0.03, -0.355);
  const led = part(tilt, REC, 0.03, 0.03, 0.03, 0.06, 0.03, -0.31);
  return { root, pivot, led };
}

/** All the cameras of one map. */
export class SecurityCameras {
  private readonly rigs: { spec: CameraSpec; pivots: THREE.Group[]; leds: THREE.Mesh[] }[] = [];

  /**
   * @param parent - Group the cameras are added to.
   * @param specs - The map's cameras.
   * @param ceilingY - Height of the ceiling the cameras hang from.
   * @param mirror - Also add a flipped copy under the floor (a glossy-floor map).
   */
  constructor(parent: THREE.Object3D, specs: readonly CameraSpec[], ceilingY: number, mirror: boolean) {
    for (const spec of specs) {
      const real = buildCamera(spec, ceilingY);
      parent.add(real.root);
      const pivots = [real.pivot];
      const leds = [real.led];
      if (mirror) {
        const copy = buildCamera(spec, ceilingY);
        copy.root.position.y = -spec.y;
        copy.root.scale.y = -1;
        parent.add(copy.root);
        pivots.push(copy.pivot);
        leds.push(copy.led);
      }
      this.rigs.push({ spec, pivots, leds });
    }
  }

  /**
   * Pans every camera and blinks its light.
   * @param t - Time in seconds.
   */
  update(t: number): void {
    for (const { spec, pivots, leds } of this.rigs) {
      // A slow, eased sweep either side of the camera's resting direction.
      const yaw = spec.yaw + Math.sin(t * spec.speed + spec.phase) * spec.sweep;
      const on = Math.sin(t * 2.4 + spec.phase) > -0.2;
      for (const p of pivots) p.rotation.y = yaw;
      for (const l of leds) l.visible = on;
    }
  }
}
