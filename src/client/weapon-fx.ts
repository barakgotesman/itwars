/**
 * Per-weapon visual identity (muzzle flash, tracer, impact) and the tracer renderer.
 * Every gun looks different: pistol white pops, SMG orange stream, shotgun fiery cone with pellet
 * streaks, and the Laser Pointer's red beam that lingers and fades.
 */
import * as THREE from 'three';

/** Visual tuning for one weapon. Times are seconds, sizes metres. */
export interface WeaponFx {
  /** Tracer colour. */
  tracerColor: number;
  /** How long the tracer stays visible while fading. */
  tracerLife: number;
  /** Draw a thick glowing beam instead of a thin line. */
  beam: boolean;
  /** Beam radius for the glow (core is thinner). */
  beamRadius: number;
  /** Extra pellet streaks drawn around the real one (visual only). */
  extraTracers: number;
  /** Muzzle flash colour. */
  flashColor: number;
  /** Muzzle flash scale (1 = pistol). */
  flashSize: number;
  flashLife: number;
  /** Strength of the light the flash casts on the gun and hands. */
  flashLight: number;
  /** Camera/gun kick added per shot. */
  kick: number;
  /** Impact spark colour, count and speed. */
  impactColor: number;
  impactCount: number;
  impactSpeed: number;
  /** Extra white paper bits thrown from the impact. */
  impactBits: number;
  /** Smoke puffs left at the muzzle. */
  smoke: number;
}

/** One entry per weapon, in the same order as `WEAPONS`. */
export const WEAPON_FX: readonly WeaponFx[] = [
  // Stapler .45: a crisp white-yellow pop with silver staple sparks.
  { tracerColor: 0xe8f0ff, tracerLife: 0.1, beam: false, beamRadius: 0, extraTracers: 0, flashColor: 0xfff3b0, flashSize: 0.8, flashLife: 0.05, flashLight: 1.5, kick: 0.5, impactColor: 0xd8e4ff, impactCount: 8, impactSpeed: 3, impactBits: 0, smoke: 0 },
  // Label Gun SMG: hot orange stream, label scraps on impact.
  { tracerColor: 0xff9a2e, tracerLife: 0.08, beam: false, beamRadius: 0, extraTracers: 0, flashColor: 0xff8a1f, flashSize: 0.9, flashLife: 0.045, flashLight: 1.8, kick: 0.26, impactColor: 0xffa347, impactCount: 7, impactSpeed: 3.4, impactBits: 3, smoke: 0 },
  // Paper Shredder: big fire cone, a fan of pellet streaks, shredded paper everywhere, smoke.
  { tracerColor: 0xffc766, tracerLife: 0.12, beam: false, beamRadius: 0, extraTracers: 7, flashColor: 0xff6a1a, flashSize: 2.1, flashLife: 0.09, flashLight: 4, kick: 1.1, impactColor: 0xffd28a, impactCount: 10, impactSpeed: 4, impactBits: 16, smoke: 8 },
  // Laser Pointer: a glowing red beam that hangs in the air and fades, with a bloom-y flash.
  { tracerColor: 0xff2a3a, tracerLife: 0.85, beam: true, beamRadius: 0.028, extraTracers: 0, flashColor: 0xff2a4a, flashSize: 1.7, flashLife: 0.16, flashLight: 3.5, kick: 1.25, impactColor: 0xff4a5a, impactCount: 22, impactSpeed: 5, impactBits: 0, smoke: 5 },
];

/** A live tracer: its meshes plus fade state. */
interface Tracer {
  objects: THREE.Object3D[];
  materials: THREE.Material[];
  baseOpacity: number[];
  age: number;
  life: number;
  /** Beams thin out as they fade. */
  shrink: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Draws and fades bullet tracers; beams (sniper) glow and linger, lines (others) flick past. */
export class Tracers {
  private readonly live: Tracer[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Adds a tracer from the muzzle to the impact point, in the weapon's style.
   * @param from - Barrel tip.
   * @param to - Where the shot ended.
   * @param fx - The weapon's visual settings.
   */
  add(from: THREE.Vector3, to: THREE.Vector3, fx: WeaponFx): void {
    if (fx.beam) this.addBeam(from, to, fx);
    else this.addLine(from, to, fx.tracerColor, fx.tracerLife);
    // Shotgun: a fan of pellet streaks spread around the real one, widening with distance.
    const reach = from.distanceTo(to);
    for (let i = 0; i < fx.extraTracers; i++) {
      const spread = Math.min(reach, 18) * 0.09;
      const end = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      this.addLine(from, end, fx.tracerColor, fx.tracerLife * 0.8);
    }
  }

  /** Thin square-section streak that fades out (blocky, like everything else). */
  private addLine(from: THREE.Vector3, to: THREE.Vector3, color: number, life: number): void {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    dir.normalize();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.014, len, 0.014), mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, dir);
    this.scene.add(mesh);
    this.live.push({ objects: [mesh], materials: [mat], baseOpacity: [0.9], age: 0, life, shrink: false });
  }

  /** Thick glowing square beam: a hot white core inside a wide red glow. */
  private addBeam(from: THREE.Vector3, to: THREE.Vector3, fx: WeaponFx): void {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    dir.normalize();
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const objects: THREE.Object3D[] = [];
    const materials: THREE.Material[] = [];
    const baseOpacity: number[] = [];
    for (const [radius, color, opacity] of [[fx.beamRadius, fx.tracerColor, 0.45], [fx.beamRadius * 0.35, 0xffffff, 0.95]] as const) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(radius * 2, len, radius * 2), mat);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(UP, dir);
      this.scene.add(mesh);
      objects.push(mesh);
      materials.push(mat);
      baseOpacity.push(opacity);
    }
    this.live.push({ objects, materials, baseOpacity, age: 0, life: fx.tracerLife, shrink: true });
  }

  /** Fades every tracer and removes finished ones. @param dt - Seconds since last frame. */
  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const t = this.live[i]!;
      t.age += dt;
      const k = t.age / t.life;
      if (k >= 1) {
        for (const o of t.objects) {
          this.scene.remove(o);
          (o as THREE.Mesh).geometry?.dispose();
        }
        for (const m of t.materials) m.dispose();
        this.live.splice(i, 1);
        continue;
      }
      // Quick bright start, long soft tail.
      const fade = (1 - k) ** 2;
      t.materials.forEach((m, j) => {
        (m as THREE.Material & { opacity: number }).opacity = t.baseOpacity[j]! * fade;
      });
      if (t.shrink) for (const o of t.objects) o.scale.set(0.3 + 0.7 * (1 - k), 1, 0.3 + 0.7 * (1 - k));
    }
  }
}
