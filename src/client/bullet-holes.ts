/**
 * Bullet holes: small black blocky marks left on any surface a shot hits. The server reports every impact
 * to the whole room, so all players see the same holes. They stay for a while, then shrink away in steps.
 */
import * as THREE from 'three';

/** Most holes alive at once; the oldest is recycled when full. */
const MAX_HOLES = 200;
/** Seconds a hole lasts. */
const LIFE_S = 15;
/** The last this many seconds are spent shrinking away. */
const FADE_S = 3;
/** The shrink happens in this many chunky steps rather than smoothly. */
const SHRINK_STEPS = 4;
/** Thickness of a hole's marks; they sit just off the surface. */
const THICKNESS = 0.004;

/** Pooled instanced decals: a charcoal square crater with a black square hole inside it. */
export class BulletHoles {
  private readonly outer: THREE.InstancedMesh;
  private readonly inner: THREE.InstancedMesh;
  /** Age in seconds, or -1 for an unused slot. */
  private readonly age = new Float32Array(MAX_HOLES).fill(-1);
  private readonly pos = new Float32Array(MAX_HOLES * 3);
  private readonly axis = new Int8Array(MAX_HOLES);
  private readonly sign = new Int8Array(MAX_HOLES);
  private readonly size = new Float32Array(MAX_HOLES);
  /** Small random offset of the black centre inside the crater, so no two holes look identical. */
  private readonly jitter = new Float32Array(MAX_HOLES * 2);
  private readonly shown = new Float32Array(MAX_HOLES).fill(0);
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly n = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private static readonly Z = new THREE.Vector3(0, 0, 1);

  /** @param scene - Scene the decals are added to. */
  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    // Polygon offset keeps the marks from flickering against the wall they sit on.
    const mat = (color: number, offset: number) => new THREE.MeshBasicMaterial({
      color, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset,
    });
    this.outer = new THREE.InstancedMesh(geo, mat(0x2c2f35, -2), MAX_HOLES);
    this.inner = new THREE.InstancedMesh(geo, mat(0x000000, -4), MAX_HOLES);
    for (const mesh of [this.outer, this.inner]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.s.setScalar(0);
      this.m.compose(this.v.set(0, 0, 0), this.q.identity(), this.s);
      for (let i = 0; i < MAX_HOLES; i++) mesh.setMatrixAt(i, this.m);
      scene.add(mesh);
    }
  }

  /**
   * Adds a hole.
   * @param x - Impact point.
   * @param axis - Axis of the surface normal: 0 = x, 1 = y, 2 = z.
   * @param sign - +1 or -1: which way along that axis the surface faces.
   */
  add(x: number, y: number, z: number, axis: number, sign: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_HOLES;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.axis[i] = axis;
    this.sign[i] = sign;
    this.size[i] = 0.07 + Math.random() * 0.04;
    this.jitter[i * 2] = (Math.random() - 0.5) * 0.02;
    this.jitter[i * 2 + 1] = (Math.random() - 0.5) * 0.02;
    this.age[i] = 0;
    this.place(i, 1);
    this.flush();
  }

  /** Removes every hole (a new match starts with clean walls). */
  clear(): void {
    this.age.fill(-1);
    this.shown.fill(0);
    this.s.setScalar(0);
    this.m.compose(this.v.set(0, 0, 0), this.q.identity(), this.s);
    for (let i = 0; i < MAX_HOLES; i++) {
      this.outer.setMatrixAt(i, this.m);
      this.inner.setMatrixAt(i, this.m);
    }
    this.flush();
  }

  /** Ages every hole; old ones shrink away in steps and are then recycled. @param dt - Seconds since last frame. */
  update(dt: number): void {
    let changed = false;
    for (let i = 0; i < MAX_HOLES; i++) {
      if (this.age[i]! < 0) continue;
      this.age[i]! += dt;
      const left = LIFE_S - this.age[i]!;
      if (left <= 0) {
        this.age[i] = -1;
        this.place(i, 0);
        changed = true;
        continue;
      }
      const k = left > FADE_S ? 1 : Math.ceil((left / FADE_S) * SHRINK_STEPS) / SHRINK_STEPS;
      if (k !== this.shown[i]) {
        this.place(i, k);
        changed = true;
      }
    }
    if (changed) this.flush();
  }

  /** Writes one hole's matrices at a given scale factor (0 hides it). */
  private place(i: number, k: number): void {
    this.shown[i] = k;
    this.n.set(0, 0, 0);
    if (this.axis[i] === 0) this.n.x = this.sign[i]!;
    else if (this.axis[i] === 1) this.n.y = this.sign[i]!;
    else this.n.z = this.sign[i]!;
    this.q.setFromUnitVectors(BulletHoles.Z, this.n);
    const size = this.size[i]! * k;
    const base = this.v.set(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!);
    const px = base.x, py = base.y, pz = base.z;

    this.s.set(size, size, THICKNESS * (k > 0 ? 1 : 0));
    this.m.compose(this.v.set(px + this.n.x * 0.004, py + this.n.y * 0.004, pz + this.n.z * 0.004), this.q, this.s);
    this.outer.setMatrixAt(i, this.m);

    // The black centre sits slightly off-centre in the crater's own plane.
    const off = new THREE.Vector3(this.jitter[i * 2]! * k, this.jitter[i * 2 + 1]! * k, 0).applyQuaternion(this.q);
    this.s.set(size * 0.55, size * 0.55, THICKNESS * (k > 0 ? 1 : 0));
    this.m.compose(this.v.set(px + off.x + this.n.x * 0.007, py + off.y + this.n.y * 0.007, pz + off.z + this.n.z * 0.007), this.q, this.s);
    this.inner.setMatrixAt(i, this.m);
  }

  /** Uploads the changed matrices to the GPU. */
  private flush(): void {
    this.outer.instanceMatrix.needsUpdate = true;
    this.inner.instanceMatrix.needsUpdate = true;
  }
}
