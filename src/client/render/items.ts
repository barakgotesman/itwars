/**
 * 3D pickups (HP box, ammo box, grenade crate with a light beam) and in-flight grenade models.
 * Pure rendering: the server decides who picks up what and where grenades are.
 */
import * as THREE from 'three';
import type { PickupSpot } from '@shared/world/map';
import type { SnapGrenade } from '@shared/net/protocol';
import type { PickupKind } from '@shared/rules/weapons';

const matCache = new Map<number, THREE.MeshLambertMaterial>();
/** Shared flat-shaded material per colour. */
function lam(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    // Unlit-looking so pickups stay readable in dark rooms; the world itself is baked.
    m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 });
    matCache.set(color, m);
  }
  return m;
}

/** Adds a box to a group at a centre position. */
function box(g: THREE.Object3D, color: number, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** White box with a red cross on every side. */
function buildHpBox(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0xf4f4f1, 0.5, 0.36, 0.5, 0, 0, 0);
  for (const turn of [0, Math.PI / 2]) {
    const face = new THREE.Group();
    // Bars are 2 cm longer than the box so they stand clear of both faces.
    box(face, 0xd62828, 0.26, 0.08, 0.54, 0, 0, 0);
    box(face, 0xd62828, 0.08, 0.24, 0.54, 0, 0, 0);
    face.rotation.y = turn;
    g.add(face);
  }
  return g;
}

/** Olive ammo box with a yellow stripe and a lid ridge. */
function buildAmmoBox(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0x6b7a3a, 0.56, 0.32, 0.4, 0, 0, 0);
  box(g, 0xf2c230, 0.58, 0.06, 0.42, 0, 0.04, 0);
  box(g, 0x55612e, 0.5, 0.04, 0.34, 0, 0.18, 0);
  box(g, 0x2a2d33, 0.1, 0.05, 0.06, 0, 0.1, -0.22);
  return g;
}

/** Dark pad holding a coffee mug and an alarm clock. */
function buildGrenadeCrate(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0x2b2f36, 0.62, 0.08, 0.62, 0, -0.14, 0);
  box(g, 0xf4f4f1, 0.15, 0.17, 0.15, -0.12, -0.01, 0);
  box(g, 0x6a3d1f, 0.12, 0.02, 0.12, -0.12, 0.08, 0);
  box(g, 0xf4f4f1, 0.05, 0.09, 0.03, -0.21, -0.01, 0);
  box(g, 0xd62828, 0.17, 0.17, 0.09, 0.13, -0.01, 0);
  box(g, 0xf2c230, 0.05, 0.05, 0.05, 0.08, 0.1, 0);
  box(g, 0xf2c230, 0.05, 0.05, 0.05, 0.18, 0.1, 0);
  return g;
}

const BEAM_COLOR: Record<PickupKind, number> = { hp: 0xff4a4a, ammo: 0xffd34a, grenade: 0x4ac8ff };

/** Rotating, bobbing pickups that switch on and off with the server's state. */
export class PickupVisuals {
  private readonly items: { group: THREE.Group; phase: number }[] = [];

  /**
   * @param scene - Scene to add pickups to.
   * @param spots - Fixed pickup placements (same order as the server).
   * @param initial - One char per spot: '1' active, '0' taken.
   */
  constructor(scene: THREE.Scene, spots: readonly PickupSpot[], initial: string) {
    const beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 4.1, 10, 1, true);
    const ringGeo = new THREE.RingGeometry(0.45, 0.6, 28);
    spots.forEach((spot, i) => {
      const root = new THREE.Group();
      root.position.set(spot.x, 0, spot.z);
      const body = spot.kind === 'hp' ? buildHpBox() : spot.kind === 'ammo' ? buildAmmoBox() : buildGrenadeCrate();
      body.position.y = 0.7;
      root.add(body);
      const color = BEAM_COLOR[spot.kind];
      const glow = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(beamGeo, glow);
      beam.position.y = 2.05;
      root.add(beam);
      const ring = new THREE.Mesh(ringGeo, glow);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      root.add(ring);
      root.visible = initial[i] !== '0';
      scene.add(root);
      this.items.push({ group: body, phase: i * 1.3 });
      (body.userData as { root: THREE.Group }).root = root;
    });
  }

  /** Shows or hides one pickup. @param i - Spot index. */
  setActive(i: number, on: boolean): void {
    const item = this.items[i];
    if (item) (item.group.userData as { root: THREE.Group }).root.visible = on;
  }

  /** Spins and bobs every pickup. @param t - Time in seconds. */
  update(t: number): void {
    for (const it of this.items) {
      it.group.rotation.y = t * 1.6 + it.phase;
      it.group.position.y = 0.7 + Math.sin(t * 2.2 + it.phase) * 0.08;
    }
  }
}

/** Builds a coffee mug ("Coffee Bomb") or an alarm clock ("Fire Alarm"). */
function buildGrenade(slot: number): THREE.Group {
  const g = new THREE.Group();
  if (slot === 0) {
    box(g, 0xf4f4f1, 0.12, 0.14, 0.12, 0, 0, 0);
    box(g, 0x6a3d1f, 0.1, 0.01, 0.1, 0, 0.075, 0);
    box(g, 0xf4f4f1, 0.05, 0.08, 0.03, 0.085, 0, 0);
    // A glowing fuse so players can spot it mid-air.
    const fuse = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
    fuse.position.set(0, 0.11, 0);
    g.add(fuse);
  } else {
    box(g, 0xd62828, 0.14, 0.14, 0.08, 0, 0, 0);
    box(g, 0xf2c230, 0.05, 0.04, 0.05, -0.05, 0.09, 0);
    box(g, 0xf2c230, 0.05, 0.04, 0.05, 0.05, 0.09, 0);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    light.position.set(0, 0, 0.05);
    g.add(light);
  }
  return g;
}

/** Grenades in flight, smoothed between 30 Hz snapshots. */
export class GrenadeVisuals {
  private readonly live = new Map<number, { mesh: THREE.Group; target: THREE.Vector3 }>();

  constructor(private readonly scene: THREE.Scene) {}

  /** Creates, retargets or removes meshes to match the snapshot. */
  sync(grenades: readonly SnapGrenade[]): void {
    const seen = new Set<number>();
    for (const g of grenades) {
      seen.add(g.id);
      let entry = this.live.get(g.id);
      if (!entry) {
        const mesh = buildGrenade(g.s);
        mesh.position.set(g.x, g.y, g.z);
        this.scene.add(mesh);
        entry = { mesh, target: new THREE.Vector3() };
        this.live.set(g.id, entry);
      }
      entry.target.set(g.x, g.y, g.z);
    }
    for (const [id, e] of this.live) {
      if (seen.has(id)) continue;
      this.scene.remove(e.mesh);
      this.live.delete(id);
    }
  }

  /** Eases meshes toward their targets and tumbles them. @param dt - Seconds since last frame. */
  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 25);
    for (const e of this.live.values()) {
      e.mesh.position.lerp(e.target, k);
      e.mesh.rotation.x += dt * 9;
      e.mesh.rotation.z += dt * 5;
    }
  }
}

/** A leather satchel with a buckle and an ammo tin: what a defeated player leaves behind. */
function buildLootBag(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0x7a5a36, 0.36, 0.28, 0.2, 0, 0, 0);
  box(g, 0x5a3f22, 0.38, 0.08, 0.22, 0, 0.16, 0);
  box(g, 0xf2c230, 0.08, 0.08, 0.04, 0, 0.1, -0.12);
  box(g, 0x6b7a3a, 0.14, 0.1, 0.12, 0.22, -0.08, 0);
  box(g, 0x3a2a18, 0.04, 0.3, 0.22, -0.12, 0, 0);
  return g;
}

/** Loot bags on the floor: a spinning satchel with a short orange beam, so they are easy to spot. */
export class LootVisuals {
  private readonly bags = new Map<number, { root: THREE.Group; body: THREE.Group; phase: number }>();
  private readonly beamGeo = new THREE.BoxGeometry(0.12, 2, 0.12);
  private readonly beamMat = new THREE.MeshBasicMaterial({
    color: 0xffb347, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Puts a bag on the floor.
   * @param id - Server's loot id.
   * @param x - World position of the body it came from; `y` is the floor height there.
   */
  add(id: number, x: number, y: number, z: number): void {
    if (this.bags.has(id)) return;
    const root = new THREE.Group();
    root.position.set(x, y, z);
    const body = buildLootBag();
    body.position.y = 0.4;
    root.add(body);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    beam.position.y = 1;
    root.add(beam);
    this.scene.add(root);
    this.bags.set(id, { root, body, phase: id * 1.7 });
  }

  /** Removes a bag (looted, expired or the match restarted). */
  remove(id: number): void {
    const bag = this.bags.get(id);
    if (!bag) return;
    this.scene.remove(bag.root);
    this.bags.delete(id);
  }

  /** Spins and bobs every bag. @param t - Time in seconds. */
  update(t: number): void {
    for (const b of this.bags.values()) {
      b.body.rotation.y = t * 1.4 + b.phase;
      b.body.position.y = 0.4 + Math.sin(t * 2.4 + b.phase) * 0.06;
    }
  }
}
