/**
 * Blocky visual effects to match the voxel look of the game: a pooled system of tumbling cube debris
 * (sparks, smoke, paper, gibs) that bounce on the floor and shrink in steps, and stepped, growing
 * cube blasts for grenade explosions.
 */
import * as THREE from 'three';

/** Shrink happens in this many chunky steps instead of smoothly. */
const SHRINK_STEPS = 4;

/** Pooled instanced cubes. Dead cubes are scaled to zero. */
export class Particles {
  /** Set false to skip emitting (the "particles" graphics option). */
  enabled = true;
  private readonly mesh: THREE.InstancedMesh;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly gravity: Float32Array;
  private readonly spin: Float32Array;
  private readonly spinVel: Float32Array;
  private readonly dummy = new THREE.Object3D();
  private next = 0;

  /**
   * @param scene - Scene to add the cubes to.
   * @param max - Pool size; the oldest cube is recycled when full.
   */
  constructor(scene: THREE.Scene, private readonly max = 900) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.size = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.spinVel = new Float32Array(max);
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      // Lit so each cube shows light and dark faces; a little emissive keeps sparks bright in dark rooms.
      new THREE.MeshLambertMaterial({ emissive: 0x303030 }),
      max,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    scene.add(this.mesh);
  }

  /**
   * Spawns a burst of cubes flying out in random directions.
   * @param color - 0xRRGGBB colour of the cubes.
   * @param speed - Typical outward speed in m/s.
   * @param life - Seconds each cube lives.
   * @param gravity - Downward acceleration in m/s^2 (negative makes smoke rise).
   * @param bias - Optional extra velocity (e.g. away from a surface).
   * @param size - Cube edge in metres (each cube varies a bit around this).
   */
  emit(
    x: number, y: number, z: number, count: number, color: number, speed: number, life: number, gravity = 9,
    bias?: THREE.Vector3, size = 0.07,
  ): void {
    if (!this.enabled) return;
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      // Uniform random direction on a sphere.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.35 + Math.random() * 0.65);
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = r * Math.cos(a) * s + (bias?.x ?? 0);
      this.vel[i * 3 + 1] = u * s + (bias?.y ?? 0);
      this.vel[i * 3 + 2] = r * Math.sin(a) * s + (bias?.z ?? 0);
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.4);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.gravity[i] = gravity;
      this.spin[i] = Math.random() * Math.PI;
      this.spinVel[i] = (Math.random() - 0.5) * 14;
      // Slight per-cube brightness variation gives debris a chunky, textured look.
      this.mesh.setColorAt(i, c.clone().multiplyScalar(0.8 + Math.random() * 0.4));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Moves, tumbles and shrinks every live cube. @param dt - Seconds since last frame. */
  update(dt: number): void {
    const d = this.dummy;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        d.scale.setScalar(0);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        continue;
      }
      const g = this.gravity[i]!;
      this.vel[i * 3 + 1]! -= g * dt;
      this.pos[i * 3]! += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1]! += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2]! += this.vel[i * 3 + 2]! * dt;
      // Debris bounces off the floor and skids to a stop.
      if (g > 0 && this.pos[i * 3 + 1]! < 0.03 && this.vel[i * 3 + 1]! < 0) {
        this.pos[i * 3 + 1] = 0.03;
        this.vel[i * 3 + 1] = Math.abs(this.vel[i * 3 + 1]!) > 1.2 ? -this.vel[i * 3 + 1]! * 0.35 : 0;
        this.vel[i * 3]! *= 0.6;
        this.vel[i * 3 + 2]! *= 0.6;
        this.spinVel[i]! *= 0.5;
      }
      this.spin[i]! += this.spinVel[i]! * dt;
      const steps = Math.ceil((this.life[i]! / this.maxLife[i]!) * SHRINK_STEPS) / SHRINK_STEPS;
      d.position.set(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!);
      d.rotation.set(this.spin[i]! * 0.7, this.spin[i]!, this.spin[i]! * 0.4);
      d.scale.setScalar(this.size[i]! * steps);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** One growing, fading cube. */
interface Blast {
  mesh: THREE.Mesh;
  age: number;
  duration: number;
  maxScale: number;
}

/** Number of visible "frames" in a blast's growth, for a chunky stop-motion feel. */
const BLAST_FRAMES = 5;

/** Expanding cube fireballs and flash bursts for grenade detonations. */
export class Blasts {
  private readonly blasts: Blast[] = [];
  private readonly geo = new THREE.BoxGeometry(1, 1, 1);

  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Adds a detonation at a point.
   * @param radius - Gameplay blast radius; the visual is a fraction of it.
   * @param color - Outer colour of the blast.
   * @param duration - Seconds until it is gone.
   */
  add(x: number, y: number, z: number, radius: number, color: number, duration: number): void {
    const mk = (c: number, scale: number, dur: number, turn: number) => {
      const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      mesh.position.set(x, y, z);
      mesh.rotation.set(0, turn, 0);
      mesh.scale.setScalar(0.1);
      this.scene.add(mesh);
      this.blasts.push({ mesh, age: 0, duration: dur, maxScale: scale });
    };
    mk(color, radius * 0.8, duration, Math.PI / 4);
    mk(0xffffff, radius * 0.45, duration * 0.6, 0);
  }

  /** Grows and fades every blast in discrete steps, removing finished ones. @param dt - Seconds since last frame. */
  update(dt: number): void {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i]!;
      b.age += dt;
      const t = b.age / b.duration;
      if (t >= 1) {
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.blasts.splice(i, 1);
        continue;
      }
      // Quantised growth: the block jumps from size to size instead of sliding.
      const frame = Math.min(BLAST_FRAMES, Math.floor(t * BLAST_FRAMES) + 1) / BLAST_FRAMES;
      b.mesh.scale.setScalar(Math.max(0.1, b.maxScale * (1 - (1 - frame) ** 2)));
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    }
  }
}
