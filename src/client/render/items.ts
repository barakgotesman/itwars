/**
 * 3D pickups (HP box, ammo box, grenade crate with a light beam) and in-flight grenade models.
 * Pure rendering: the server decides who picks up what and where grenades are.
 */
import * as THREE from 'three';
import type { PickupSpot } from '@shared/world/map';
import type { SnapGrenade, SnapRocket } from '@shared/net/protocol';
import { WEAPONS, type PickupKind } from '@shared/rules/weapons';
import type { Particles } from './particles';
import { buildGunProp } from './players';
import { WEAPON_FX } from './weapon-fx';

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

/**
 * An open grenade crate: an olive wooden box with steel corners, a hazard stripe and a yellow label, packed with
 * both grenade types (Coffee Bomb mugs and Fire Alarm clocks) so it is clear what it holds. Details stand at least
 * 1 cm proud of the faces under them so nothing z-fights.
 */
function buildGrenadeCrate(): THREE.Group {
  const g = new THREE.Group();
  // Body, planks and open top rim.
  box(g, 0x4f5a2e, 0.64, 0.3, 0.44, 0, -0.04, 0);
  box(g, 0x3f4824, 0.66, 0.04, 0.46, 0, 0.08, 0);
  box(g, 0x3f4824, 0.66, 0.04, 0.46, 0, -0.12, 0);
  box(g, 0x2a2d33, 0.05, 0.34, 0.5, -0.31, -0.04, 0);
  box(g, 0x2a2d33, 0.05, 0.34, 0.5, 0.31, -0.04, 0);
  // Hazard stripe and a yellow label with a red dot on the front, a handle slot on each end.
  box(g, 0xf2c10f, 0.5, 0.05, 0.47, 0, 0.02, 0);
  box(g, 0xf4e08a, 0.2, 0.12, 0.47, 0, -0.07, 0);
  box(g, 0xd62828, 0.07, 0.07, 0.48, 0, -0.07, 0);
  box(g, 0x1c1e23, 0.02, 0.06, 0.14, -0.345, 0, 0);
  box(g, 0x1c1e23, 0.02, 0.06, 0.14, 0.345, 0, 0);
  // Packing straw showing at the top.
  box(g, 0xd8c37a, 0.56, 0.03, 0.36, 0, 0.115, 0);
  // Coffee Bomb: a white mug with dark coffee, a handle and a short orange fuse.
  for (const [mx, mz] of [[-0.17, -0.07], [-0.2, 0.1]] as const) {
    box(g, 0xf4f4f1, 0.14, 0.17, 0.14, mx, 0.2, mz);
    box(g, 0x3a2418, 0.1, 0.02, 0.1, mx, 0.295, mz);
    box(g, 0xf4f4f1, 0.05, 0.09, 0.03, mx - 0.095, 0.2, mz);
    box(g, 0xf0a030, 0.03, 0.07, 0.03, mx + 0.03, 0.335, mz);
  }
  // Fire Alarm: a red clock-bell with a yellow bell on top and a white face.
  for (const [ax, az] of [[0.17, -0.07], [0.2, 0.1]] as const) {
    box(g, 0xd62828, 0.15, 0.17, 0.15, ax, 0.2, az);
    box(g, 0xf2c230, 0.07, 0.05, 0.07, ax, 0.31, az);
    box(g, 0xfafafa, 0.08, 0.08, 0.16, ax, 0.2, az);
  }
  return g;
}

const BEAM_COLOR: Record<PickupKind, number> = { hp: 0xff4a4a, ammo: 0xffd34a, grenade: 0x4ac8ff, weapon: 0xffffff };

/** A gun on a slim stand, so a weapon pickup reads as "take me", not as a dropped prop. */
function buildGunPickup(w: number): THREE.Group {
  const g = new THREE.Group();
  box(g, 0x2b2f36, 0.5, 0.06, 0.3, 0, -0.2, 0);
  box(g, 0x55606d, 0.06, 0.16, 0.06, 0, -0.1, 0);
  const gun = buildGunProp(w);
  // Guns are modelled around their grip, not their middle; recentre the model over the stand so it spins
  // about the same point the pickup area is centred on.
  const mid = new THREE.Box3().setFromObject(gun).getCenter(new THREE.Vector3());
  gun.position.x -= mid.x;
  gun.position.z -= mid.z;
  g.add(gun);
  return g;
}

/** Beam colour of a spot: a gun's tracer colour, otherwise the kind's own. */
function beamColor(spot: PickupSpot): number {
  return spot.kind === 'weapon' ? (WEAPON_FX[spot.weapon ?? 0]?.tracerColor ?? BEAM_COLOR.weapon) : BEAM_COLOR[spot.kind];
}

/** Rotating, bobbing pickups that switch on and off with the server's state. */
export class PickupVisuals {
  private readonly items: { group: THREE.Group; phase: number; base: number }[] = [];

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
      const body = spot.kind === 'hp' ? buildHpBox() : spot.kind === 'ammo' ? buildAmmoBox()
        : spot.kind === 'weapon' ? buildGunPickup(spot.weapon ?? 0) : buildGrenadeCrate();
      // A spot may sit on a table (`y`); the item floats the same height above it as it would above the floor.
      const base = (spot.y ?? 0) + 0.7;
      body.position.y = base;
      root.add(body);
      const color = beamColor(spot);
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
      this.items.push({ group: body, phase: i * 1.3, base });
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
      it.group.position.y = it.base + Math.sin(t * 2.2 + it.phase) * 0.08;
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

/**
 * A detailed grenade for showing off (the landing page's arsenal): the Coffee Bomb is a striped mug of coffee with a
 * handle and a glowing fuse, the Fire Alarm a red alarm clock with a white face, hands, two bells and a hammer. Layered
 * parts stand at least 0.5 mm proud of what is under them so nothing z-fights. Faces forward along +Z.
 * @param slot - Grenade slot (0 Coffee Bomb, 1 Fire Alarm).
 */
export function buildGrenadeModel(slot: number): THREE.Group {
  const g = new THREE.Group();
  const glow = (color: number, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    g.add(m);
  };
  if (slot === 0) {
    box(g, 0xf4f4f1, 0.1, 0.12, 0.1, 0, 0, 0);
    box(g, 0x3a2418, 0.082, 0.006, 0.082, 0, 0.063, 0);
    box(g, 0xd62828, 0.104, 0.02, 0.104, 0, -0.01, 0);
    box(g, 0xe6e6e1, 0.104, 0.012, 0.104, 0, -0.063, 0);
    // Handle: a loop of four bars on the right.
    box(g, 0xf4f4f1, 0.03, 0.02, 0.022, 0.065, 0.035, 0);
    box(g, 0xf4f4f1, 0.03, 0.02, 0.022, 0.065, -0.035, 0);
    box(g, 0xf4f4f1, 0.02, 0.09, 0.022, 0.085, 0, 0);
    // Fuse: a stick rising out of the coffee with a glowing tip.
    box(g, 0x8a5a2b, 0.012, 0.06, 0.012, 0.005, 0.093, 0);
    glow(0xffd34a, 0.02, 0.02, 0.02, 0.005, 0.128, 0);
    glow(0xff7a1a, 0.012, 0.012, 0.012, 0.005, 0.142, 0);
  } else {
    box(g, 0xd62828, 0.12, 0.12, 0.06, 0, 0, 0);
    // The darker cap stands 2 mm above the body's top (a shared top face is what flickers).
    box(g, 0xa81f1f, 0.126, 0.03, 0.064, 0, 0.048, 0);
    box(g, 0xfafafa, 0.092, 0.092, 0.01, 0, 0, 0.0325);
    for (const [x, y] of [[0, 0.04], [0, -0.04], [0.04, 0], [-0.04, 0]] as const) box(g, 0x23262c, 0.008, 0.008, 0.006, x, y, 0.0385);
    box(g, 0x14161a, 0.008, 0.036, 0.007, 0, 0.016, 0.0415);
    box(g, 0x14161a, 0.028, 0.008, 0.007, 0.012, 0, 0.042);
    box(g, 0xd62828, 0.01, 0.01, 0.009, 0, 0, 0.0425);
    // Bells, hammer, and two legs.
    for (const x of [-0.042, 0.042]) {
      box(g, 0xf2c230, 0.05, 0.034, 0.05, x, 0.082, 0);
      box(g, 0xd6a417, 0.054, 0.008, 0.054, x, 0.098, 0);
    }
    box(g, 0x23262c, 0.01, 0.034, 0.01, 0, 0.082, 0);
    box(g, 0x23262c, 0.018, 0.006, 0.018, 0, 0.101, 0);
    for (const x of [-0.04, 0.04]) box(g, 0x23262c, 0.016, 0.026, 0.02, x, -0.072, 0);
    glow(0xffffff, 0.012, 0.012, 0.004, 0, -0.052, 0.0335);
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

/** A rocket flying along -Z: dark body, red warhead with a yellow nose, tail fins and a glowing exhaust. */
function buildRocket(): THREE.Group {
  const g = new THREE.Group();
  box(g, 0x2a2d33, 0.14, 0.14, 0.7, 0, 0, 0.1);
  box(g, 0xd62828, 0.19, 0.19, 0.16, 0, 0, -0.33);
  box(g, 0xc0392b, 0.13, 0.13, 0.1, 0, 0, -0.46);
  box(g, 0xf2c230, 0.07, 0.07, 0.08, 0, 0, -0.55);
  box(g, 0x8d949c, 0.34, 0.015, 0.16, 0, 0, 0.38);
  box(g, 0x8d949c, 0.015, 0.34, 0.16, 0, 0, 0.38);
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.34), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
  flame.position.set(0, 0, 0.62);
  g.add(flame);
  return g;
}

/** Rockets in flight: smoothed between snapshots, pointed along their travel, leaving a trail of sparks and smoke. */
export class RocketVisuals {
  private readonly live = new Map<number, { mesh: THREE.Group; target: THREE.Vector3; last: THREE.Vector3; aim: THREE.Vector3 }>();
  private readonly tail = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene, private readonly particles: Particles) {}

  /** Creates, retargets or removes meshes to match the snapshot. */
  sync(rockets: readonly SnapRocket[]): void {
    const seen = new Set<number>();
    for (const r of rockets) {
      seen.add(r.id);
      let e = this.live.get(r.id);
      if (!e) {
        const mesh = buildRocket();
        mesh.position.set(r.x, r.y, r.z);
        this.scene.add(mesh);
        e = { mesh, target: new THREE.Vector3(), last: new THREE.Vector3(r.x, r.y, r.z), aim: new THREE.Vector3(0, 0, -1) };
        this.live.set(r.id, e);
      }
      // The direction of travel is the step since the previous snapshot.
      const step = this.tail.set(r.x, r.y, r.z).sub(e.last);
      if (step.lengthSq() > 1e-4) e.aim.copy(step).normalize();
      e.last.set(r.x, r.y, r.z);
      e.target.set(r.x, r.y, r.z);
    }
    for (const [id, e] of this.live) {
      if (seen.has(id)) continue;
      this.scene.remove(e.mesh);
      this.live.delete(id);
    }
  }

  /** Eases meshes toward their targets, points them along their flight and drops trail particles. @param dt - Seconds since last frame. */
  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 25);
    for (const e of this.live.values()) {
      e.mesh.position.lerp(e.target, k);
      e.mesh.lookAt(e.mesh.position.x + e.aim.x, e.mesh.position.y + e.aim.y, e.mesh.position.z + e.aim.z);
      // Exhaust: hot sparks right behind the rocket and a longer-lived grey cloud.
      this.tail.copy(e.aim).multiplyScalar(-0.7).add(e.mesh.position);
      this.particles.emit(this.tail.x, this.tail.y, this.tail.z, 2, 0xffa030, 1.6, 0.25, 0, undefined, 0.1);
      this.particles.emit(this.tail.x, this.tail.y, this.tail.z, 1, 0x8a8f99, 0.7, 0.9, -0.4, undefined, 0.2);
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

/** Loot bags on the floor: a spinning satchel (with the dropped gun resting on it) and a short orange beam, so they are easy to spot. */
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
   * @param w - Gun inside the bag (shown on top), or -1 for ammo only.
   */
  add(id: number, x: number, y: number, z: number, w = -1): void {
    if (this.bags.has(id)) return;
    const root = new THREE.Group();
    root.position.set(x, y, z);
    const body = buildLootBag();
    body.position.y = 0.4;
    if (w >= 0 && WEAPONS[w]) {
      const gun = buildGunProp(w);
      // Laid across the top of the satchel, a touch proud of it so the two never share a face.
      gun.position.y = 0.21;
      body.add(gun);
    }
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
