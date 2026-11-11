/**
 * First-person weapon models, drawn in a second pass on their own camera so they never clip into walls.
 * Handles sway, bob, recoil, aim-down-sights, reload, weapon switch and grenade-throw animation, and the
 * moving parts of each gun: pistol slide, SMG bolt and tape reel, shotgun pump, sniper bolt, magazines and ejected casings.
 */
import * as THREE from 'three';
import { WEAPONS } from '@shared/rules/weapons';
import { WEAPON_FX } from './weapon-fx';

/** Per-frame inputs the viewmodel needs from the game. */
export interface ViewState {
  weapon: number;
  aiming: boolean;
  /** Horizontal speed in m/s. */
  speed: number;
  onGround: boolean;
  /** Reload progress 0..1, or 0 when not reloading. */
  reloadFrac: number;
  alive: boolean;
  /** View rotation speed in rad/s, for weapon sway. */
  yawRate: number;
  pitchRate: number;
  /** The selected gun's magazine is empty: the slide, bolt or pump stays open. */
  magEmpty: boolean;
}

/** Parts of a gun that move on their own. Each group's origin is its rest position. */
interface Parts {
  slide?: THREE.Group;
  trigger?: THREE.Group;
  mag?: THREE.Group;
  bolt?: THREE.Group;
  reel?: THREE.Group;
  pump?: THREE.Group;
}

/** What a gun spits out when it cycles. */
interface CasingStyle {
  color: number;
  size: readonly [number, number, number];
}

/** One gun's meshes and where its hands and muzzle are (all in the gun's local space, forward is -Z). */
interface GunRig {
  group: THREE.Group;
  muzzle: THREE.Vector3;
  handR: THREE.Vector3;
  handL: THREE.Vector3;
  /** Gun position when aiming down the sights. */
  ads: THREE.Vector3;
  parts: Parts;
  /** Where a casing leaves the gun (gun space). */
  port: THREE.Vector3;
  casing: CasingStyle;
  /** Seconds after the shot when the casing is thrown (pump and bolt guns eject on the next stroke). */
  ejectAt: number;
  /** Where the support hand grips; defaults to the gun itself, the shotgun uses its pump so the hand moves with it. */
  handLParent?: THREE.Object3D;
}

const matCache = new Map<number, THREE.MeshLambertMaterial>();
/** Shared flat-shaded material per colour. */
function lam(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}

/** Adds a box to a group at a position (centre), with optional X rotation. */
function box(g: THREE.Object3D, color: number, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
  m.position.set(x, y, z);
  m.rotation.x = rx;
  g.add(m);
  return m;
}

/** A bright, unlit box for lenses, LEDs and screens, so they glow whatever the lighting. */
function glow(g: THREE.Object3D, color: number, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Painted once: a soft diagonal reflection streak and a bright glint spot, used on every glass lens. */
function glintTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const band = g.createLinearGradient(0, 128, 128, 0);
  band.addColorStop(0.3, 'rgba(255,255,255,0)');
  band.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  band.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  band.addColorStop(0.7, 'rgba(255,255,255,0)');
  g.fillStyle = band;
  g.fillRect(0, 0, 128, 128);
  const spot = g.createRadialGradient(96, 30, 0, 96, 30, 14);
  spot.addColorStop(0, 'rgba(255,255,255,0.95)');
  spot.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spot;
  g.fillRect(70, 4, 56, 56);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * A pane of glass: a thin tinted translucent box with a moving reflection on its surface. The reflection's
 * texture is registered in `glints` so the viewmodel can slide it as the weapon sways, which sells the glass.
 * @param tint - Colour of the glass.
 * @param opacity - 0 clear .. 1 solid.
 * @param w - Width of the pane.
 * @param h - Height of the pane.
 * @param rotY - Which way the pane faces: 0 faces the player (+Z), -PI/2 faces left (-X).
 */
function lens(
  g: THREE.Object3D, glints: THREE.Texture[], tint: number, opacity: number,
  w: number, h: number, x: number, y: number, z: number, rotY = 0,
): void {
  const pane = new THREE.Group();
  pane.position.set(x, y, z);
  pane.rotation.y = rotY;
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.004),
    new THREE.MeshPhongMaterial({ color: tint, transparent: true, opacity, shininess: 160, specular: 0xffffff, depthWrite: false }),
  );
  pane.add(glass);
  const tex = glintTexture();
  glints.push(tex);
  const glint = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.92, h * 0.92),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glint.position.z = 0.0034;
  pane.add(glint);
  g.add(pane);
}

/**
 * Builds the model for one of the four weapons. Details are small stacked boxes in a handful of colours so
 * each gun reads as its office-supply self and stays blocky. Parts that sit on another are 2-4 mm proud of it
 * so no two faces share a plane.
 */
function buildGun(weapon: number, glints: THREE.Texture[]): GunRig {
  const g = new THREE.Group();
  switch (weapon) {
    case 0: {
      // Stapler .45: chrome slide that really slides, a barrel that shows when it does, black frame, red nose,
      // brass ejection port, rubber-striped grip and a magazine that can drop out.
      const slide = new THREE.Group();
      const mag = new THREE.Group();
      const trigger = new THREE.Group();
      g.add(slide, mag, trigger);
      box(g, 0x23262c, 0.044, 0.045, 0.2, 0, 0, -0.1);
      box(slide, 0xc4cbd3, 0.05, 0.04, 0.22, 0, 0.043, -0.11);
      box(slide, 0xeef2f6, 0.03, 0.006, 0.2, 0, 0.066, -0.11);
      for (const z of [-0.02, -0.036, -0.052, -0.068]) box(slide, 0x8d949c, 0.054, 0.034, 0.007, 0, 0.043, z);
      box(slide, 0x15171a, 0.054, 0.018, 0.05, 0, 0.05, -0.1);
      box(slide, 0xd4af37, 0.056, 0.006, 0.036, 0, 0.058, -0.1);
      box(slide, 0xc0392b, 0.054, 0.032, 0.04, 0, 0.043, -0.236);
      // The silver barrel stays put, so more of it shows as the slide goes back.
      box(g, 0x9aa3ad, 0.02, 0.02, 0.05, 0, 0.04, -0.262);
      box(slide, 0x15171a, 0.008, 0.014, 0.008, 0, 0.076, -0.226);
      box(slide, 0x15171a, 0.032, 0.014, 0.008, 0, 0.076, -0.024);
      glow(slide, 0xffffff, 0.004, 0.004, 0.004, 0, 0.082, -0.226);
      box(g, 0x23262c, 0.044, 0.006, 0.055, 0, -0.037, -0.075);
      box(g, 0x23262c, 0.044, 0.03, 0.006, 0, -0.022, -0.1);
      box(trigger, 0x8d949c, 0.008, 0.02, 0.008, 0, -0.018, -0.058);
      box(g, 0x15171a, 0.012, 0.02, 0.012, 0, 0.05, 0.006);
      box(g, 0x23262c, 0.046, 0.1, 0.056, 0, -0.075, 0.01, 0.2);
      box(g, 0xb03a2e, 0.052, 0.07, 0.04, 0, -0.075, 0.012, 0.2);
      for (const y of [-0.052, -0.072, -0.092]) box(g, 0x5c1f19, 0.056, 0.006, 0.042, 0, y, 0.012, 0.2);
      // Magazine: a body hidden inside the grip and a metal base plate; both drop out on reload.
      box(mag, 0x2a2d33, 0.034, 0.08, 0.044, 0, -0.095, 0.02, 0.2);
      box(mag, 0x8d949c, 0.04, 0.012, 0.05, 0, -0.128, 0.025, 0.2);
      return {
        group: g, muzzle: new THREE.Vector3(0, 0.045, -0.285), handR: new THREE.Vector3(0, -0.09, 0.02), handL: new THREE.Vector3(-0.03, -0.085, 0),
        ads: new THREE.Vector3(0, -0.08, -0.3), parts: { slide, trigger, mag }, port: new THREE.Vector3(0.03, 0.058, -0.1),
        casing: { color: 0xd4af37, size: [0.012, 0.012, 0.03] }, ejectAt: 0,
      };
    }
    case 1: {
      // Label Gun SMG: teal body, orange stripe, a tape reel that spins as it fires, a charging handle that cycles,
      // keypad, a glass-covered LCD, an open red-dot sight and a yellow label cartridge that drops out on reload.
      const bolt = new THREE.Group();
      const reel = new THREE.Group();
      const mag = new THREE.Group();
      g.add(bolt, reel, mag);
      box(g, 0x2b6d72, 0.062, 0.082, 0.34, 0, 0, -0.17);
      box(g, 0x1d4a4d, 0.064, 0.03, 0.34, 0, -0.03, -0.17);
      box(g, 0xf39c12, 0.066, 0.01, 0.2, 0, 0.004, -0.2);
      box(g, 0x15171a, 0.036, 0.014, 0.3, 0, 0.048, -0.17);
      for (const z of [-0.06, -0.1, -0.14, -0.18, -0.22, -0.26]) box(g, 0x2a2d33, 0.042, 0.006, 0.012, 0, 0.056, z);
      // Tape reel on the left flank (not on top, where it would cover the crosshair when aiming); a dark tab shows it turning.
      reel.position.set(-0.046, 0.012, -0.09);
      box(reel, 0xf4f4f1, 0.022, 0.07, 0.07, 0, 0, 0);
      box(reel, 0x2a2d33, 0.026, 0.03, 0.03, -0.001, 0, 0);
      box(reel, 0xc9c9c4, 0.024, 0.012, 0.03, -0.0005, 0.026, 0);
      box(g, 0xfff3a0, 0.03, 0.006, 0.04, 0, 0.058, -0.12);
      for (const y of [0.018, -0.006]) for (const z of [-0.1, -0.13, -0.16]) box(g, 0xd9dde2, 0.005, 0.014, 0.017, -0.033, y, z);
      box(g, 0x15171a, 0.006, 0.026, 0.048, -0.0325, 0.032, -0.235);
      glow(g, 0x7dffb0, 0.006, 0.018, 0.04, -0.0335, 0.032, -0.235);
      lens(g, glints, 0x9affd0, 0.3, 0.042, 0.02, -0.0372, 0.032, -0.235, -Math.PI / 2);
      box(g, 0x2a2d33, 0.034, 0.034, 0.12, 0, 0.01, -0.4);
      for (const z of [-0.36, -0.385, -0.41]) box(g, 0x15171a, 0.038, 0.012, 0.01, 0, 0.024, z);
      box(g, 0xf39c12, 0.046, 0.046, 0.03, 0, 0.01, -0.468);
      // Open-frame red-dot sight: a mount and four thin bars round an empty glass window, so you can see the target
      // through it. When aiming, the red dot is lined up with the crosshair.
      box(g, 0x15171a, 0.034, 0.008, 0.04, 0, 0.059, -0.28);
      box(g, 0x15171a, 0.034, 0.004, 0.04, 0, 0.09, -0.28);
      box(g, 0x15171a, 0.004, 0.028, 0.04, -0.015, 0.078, -0.28);
      box(g, 0x15171a, 0.004, 0.028, 0.04, 0.015, 0.078, -0.28);
      glow(g, 0xff3a3a, 0.007, 0.007, 0.004, 0, 0.078, -0.2575);
      lens(g, glints, 0x7fe9ff, 0.22, 0.026, 0.02, 0, 0.078, -0.2545);
      // Ejection port and the charging handle that runs back and forth in it.
      box(g, 0x15171a, 0.004, 0.024, 0.05, 0.033, 0.018, -0.16);
      box(bolt, 0x8d949c, 0.016, 0.02, 0.045, 0.042, 0.03, -0.15);
      box(bolt, 0xd9dde2, 0.018, 0.008, 0.02, 0.043, 0.042, -0.15);
      // Yellow label cartridge as the magazine, then the trigger guard and ribbed grip.
      box(mag, 0xf2c230, 0.036, 0.12, 0.05, 0, -0.105, -0.13);
      box(mag, 0x1c1e23, 0.04, 0.012, 0.054, 0, -0.168, -0.13);
      box(mag, 0xb98a14, 0.038, 0.02, 0.052, 0, -0.1, -0.13);
      box(g, 0x2a2d33, 0.046, 0.09, 0.05, 0, -0.07, 0, 0.15);
      for (const y of [-0.05, -0.07, -0.09]) box(g, 0xf39c12, 0.05, 0.006, 0.052, 0, y, 0, 0.15);
      box(g, 0x2a2d33, 0.044, 0.006, 0.05, 0, -0.04, -0.06);
      return {
        group: g, muzzle: new THREE.Vector3(0, 0.01, -0.5), handR: new THREE.Vector3(0, -0.09, 0.02), handL: new THREE.Vector3(0, -0.06, -0.26),
        ads: new THREE.Vector3(0, -0.078, -0.3), parts: { bolt, reel, mag }, port: new THREE.Vector3(0.036, 0.02, -0.16),
        casing: { color: 0xd4af37, size: [0.01, 0.01, 0.025] }, ejectAt: 0,
      };
    }
    case 2: {
      // Paper Shredder: grey office machine with a paper slot, hazard stripes, a drum barrel, a wooden stock and a
      // wooden pump that slides back and forth to rack each shell (your support hand moves with it).
      const pump = new THREE.Group();
      g.add(pump);
      box(g, 0x7a828c, 0.092, 0.1, 0.4, 0, 0, -0.2);
      box(g, 0x4f565e, 0.094, 0.04, 0.4, 0, -0.035, -0.2);
      box(g, 0x14161a, 0.07, 0.012, 0.22, 0, 0.056, -0.2);
      box(g, 0xf4f4f1, 0.06, 0.03, 0.004, 0, 0.074, -0.2);
      box(g, 0xe2e2dc, 0.056, 0.028, 0.004, 0.006, 0.072, -0.215);
      box(g, 0xc0392b, 0.03, 0.004, 0.006, 0, 0.083, -0.2);
      glow(g, 0xff3b30, 0.012, 0.006, 0.012, 0.03, 0.058, -0.09);
      glow(g, 0x39ff6a, 0.008, 0.006, 0.008, -0.03, 0.058, -0.09);
      [-0.1, -0.145, -0.19, -0.235, -0.28].forEach((z, i) => box(g, i % 2 ? 0x14161a : 0xf2c230, 0.096, 0.016, 0.03, 0, 0.002, z));
      // Shell ejection port on the right side.
      box(g, 0x15171a, 0.004, 0.03, 0.06, 0.048, 0.02, -0.12);
      box(g, 0x2a2d33, 0.052, 0.052, 0.5, 0, 0.02, -0.65);
      for (const z of [-0.5, -0.58, -0.66, -0.74, -0.82]) box(g, 0x7a828c, 0.064, 0.064, 0.02, 0, 0.02, z);
      box(g, 0x15171a, 0.072, 0.072, 0.04, 0, 0.02, -0.91);
      glow(g, 0xff7a1a, 0.04, 0.04, 0.004, 0, 0.02, -0.932);
      // Wooden pump with grooves and metal end caps.
      box(pump, 0x7a4f2c, 0.082, 0.07, 0.16, 0, -0.035, -0.5);
      for (const z of [-0.44, -0.47, -0.5, -0.53, -0.56]) box(pump, 0x4a2f19, 0.086, 0.012, 0.01, 0, -0.035, z);
      box(pump, 0x4f565e, 0.086, 0.076, 0.012, 0, -0.035, -0.585);
      box(g, 0x7a4f2c, 0.06, 0.1, 0.25, 0, -0.03, 0.2);
      box(g, 0x9a6a3c, 0.05, 0.01, 0.24, 0, 0.026, 0.2);
      box(g, 0x15171a, 0.064, 0.11, 0.02, 0, -0.03, 0.33);
      box(g, 0x7a4f2c, 0.046, 0.1, 0.055, 0, -0.08, -0.02, 0.2);
      return {
        group: g, muzzle: new THREE.Vector3(0, 0.02, -0.94), handR: new THREE.Vector3(0, -0.1, -0.01), handL: new THREE.Vector3(0, -0.06, -0.5),
        ads: new THREE.Vector3(0, -0.092, -0.28), parts: { pump }, port: new THREE.Vector3(0.052, 0.02, -0.12),
        casing: { color: 0xc0392b, size: [0.024, 0.024, 0.055] }, ejectAt: 0.2, handLParent: pump,
      };
    }
    default: {
      // Laser Pointer: black anodised sniper with red accents, a big glass scope, a muzzle brake, a folded bipod, a
      // magazine that drops out on reload and a bolt handle you can see being worked after every shot.
      const bolt = new THREE.Group();
      const mag = new THREE.Group();
      g.add(bolt, mag);
      box(g, 0x1d1f26, 0.06, 0.09, 0.4, 0, 0, -0.15);
      box(g, 0xc0392b, 0.062, 0.012, 0.3, 0, -0.012, -0.15);
      box(g, 0x0e0e12, 0.03, 0.012, 0.36, 0, 0.052, -0.17);
      box(g, 0x14161a, 0.05, 0.06, 0.3, 0, 0, -0.5);
      for (const z of [-0.4, -0.45, -0.5, -0.55, -0.6]) box(g, 0x30343c, 0.054, 0.02, 0.016, 0, 0.012, z);
      box(g, 0x0e0e12, 0.026, 0.026, 0.3, 0, 0.01, -0.78);
      box(g, 0x2a2d33, 0.044, 0.044, 0.06, 0, 0.01, -0.9);
      for (const z of [-0.885, -0.9, -0.915]) box(g, 0x0e0e12, 0.048, 0.012, 0.01, 0, 0.01, z);
      glow(g, 0xff3030, 0.022, 0.022, 0.012, 0, 0.01, -0.936);
      box(g, 0x2a2d33, 0.05, 0.1, 0.26, 0, -0.03, 0.22);
      box(g, 0x3a3e46, 0.052, 0.03, 0.14, 0, 0.04, 0.22);
      box(g, 0xc0392b, 0.054, 0.11, 0.02, 0, -0.03, 0.35);
      box(g, 0x2a2d33, 0.046, 0.1, 0.055, 0, -0.08, -0.02, 0.2);
      // Bolt: a body inside the receiver and an L-shaped handle that comes out through a slot on the right and hangs
      // down against the side of the gun, like a real closed bolt. Working it lifts the handle and slides it back along the slot.
      bolt.position.set(0, 0.03, -0.05);
      box(bolt, 0x555a63, 0.016, 0.016, 0.06, 0, 0, -0.01);
      box(bolt, 0x8d949c, 0.03, 0.01, 0.012, 0.035, 0, 0);
      box(bolt, 0x8d949c, 0.01, 0.04, 0.012, 0.05, -0.02, 0);
      box(bolt, 0xc0392b, 0.016, 0.016, 0.016, 0.05, -0.045, 0);
      box(g, 0x0e0e12, 0.004, 0.022, 0.15, 0.031, 0.03, -0.025);
      // Magazine with a red stripe.
      box(mag, 0x2a2d33, 0.04, 0.09, 0.07, 0, -0.09, -0.2);
      box(mag, 0xc0392b, 0.042, 0.012, 0.072, 0, -0.07, -0.2);
      // Scope: tube, bell, eyepiece with a blue glass lens, rings, turret and a glowing red front lens.
      box(g, 0x2a2d33, 0.05, 0.05, 0.26, 0, 0.09, -0.16);
      box(g, 0x14161a, 0.062, 0.062, 0.05, 0, 0.09, -0.3);
      box(g, 0x14161a, 0.056, 0.056, 0.04, 0, 0.09, -0.01);
      box(g, 0x06101a, 0.04, 0.04, 0.004, 0, 0.09, 0.0115);
      lens(g, glints, 0x4aa8ff, 0.5, 0.04, 0.04, 0, 0.09, 0.0155);
      for (const z of [-0.08, -0.24]) box(g, 0x555a63, 0.058, 0.014, 0.02, 0, 0.062, z);
      box(g, 0x30343c, 0.02, 0.02, 0.02, 0, 0.125, -0.15);
      box(g, 0xc0392b, 0.022, 0.006, 0.022, 0, 0.138, -0.15);
      glow(g, 0xff3030, 0.046, 0.046, 0.004, 0, 0.09, -0.326);
      for (const x of [-0.024, 0.024]) {
        box(g, 0x3a3e46, 0.008, 0.008, 0.12, x, -0.05, -0.56);
        box(g, 0x555a63, 0.012, 0.012, 0.014, x, -0.03, -0.5);
      }
      return {
        group: g, muzzle: new THREE.Vector3(0, 0.01, -0.95), handR: new THREE.Vector3(0, -0.1, -0.01), handL: new THREE.Vector3(0, -0.07, -0.3),
        ads: new THREE.Vector3(0, -0.12, -0.3), parts: { bolt, mag }, port: new THREE.Vector3(0.036, 0.03, -0.07),
        casing: { color: 0xd4af37, size: [0.016, 0.016, 0.06] }, ejectAt: 0.55,
      };
    }
  }
}

/** 0 -> 1 over `attack` seconds, then back to 0 over `release` seconds; 0 before and after. */
function pulse(t: number, attack: number, release: number): number {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  const u = (t - attack) / release;
  return u < 1 ? 1 - u : 0;
}

/** Smooth 0..1 ease. */
function ease(x: number): number {
  const c = THREE.MathUtils.clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
}

/**
 * How far a magazine has dropped (0 seated .. 1 fully out) for a reload progress 0..1: it falls out, stays out
 * for a moment, then is pushed back in.
 */
function magDrop(r: number): number {
  if (r <= 0) return 0;
  if (r < 0.25) return ease(r / 0.25);
  if (r < 0.5) return 1;
  if (r < 0.8) return 1 - ease((r - 0.5) / 0.3);
  return 0;
}

/** A spent casing flying out of the gun. */
interface Casing {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
}

/** The local player's weapon, hands and sleeves, plus all their animation state. */
export class ViewModel {
  /** Overlay scene; render it after the world with the depth buffer cleared. */
  readonly scene = new THREE.Scene();
  /** Fixed-FOV camera so the gun does not stretch when the player zooms. */
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  private readonly rigs: GunRig[];
  /** Reflection textures of every glass lens; slid each frame so the glass shimmers as the gun moves. */
  private readonly glints: THREE.Texture[] = [];
  private readonly root = new THREE.Group();
  private readonly flash = new THREE.Group();
  private readonly flashMat = new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  private readonly flashLight = new THREE.PointLight(0xffd070, 0, 1.5, 2);
  private flashLife = 0.05;
  private flashPeak = 1;
  private current = -1;
  private time = 0;
  private kick = 0;
  private flashT = 0;
  private switchT = 0;
  private throwT = 0;
  private aimT = 0;
  private swayX = 0;
  private swayY = 0;
  private bob = 0;
  /** Seconds since the last shot; drives every moving part. */
  private shotT = 99;
  /** The casing for the last shot has already been thrown. */
  private ejected = true;
  private reelVel = 0;
  private reelAngle = 0;
  private readonly casings: Casing[] = [];
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x9aa0aa, 2.4);
  private readonly sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
  private readonly sunBase = new THREE.Color(0xfff2dd);

  /**
   * Tints the weapon and hands to the light of the room the player stands in.
   * @param r - Red multiplier (1 = normally lit).
   * @param g - Green multiplier.
   * @param b - Blue multiplier.
   */
  setTint(r: number, g: number, b: number): void {
    this.hemi.color.setRGB(r, g, b);
    this.sun.color.copy(this.sunBase).multiply(new THREE.Color(r, g, b));
  }

  /**
   * @param sleeveColor - Colour of the local player's sleeves.
   * @param skinColor - Hand colour.
   */
  constructor(sleeveColor: number, skinColor: number) {
    this.scene.add(this.hemi);
    const sun = this.sun;
    sun.position.set(0.5, 1, 0.8);
    this.scene.add(sun);
    this.scene.add(this.root);

    this.rigs = WEAPONS.map((_, i) => {
      const rig = buildGun(i, this.glints);
      // Hands and forearms ride on the gun so they move with every animation.
      const hand = (parent: THREE.Object3D, p: THREE.Vector3, side: number) => {
        box(parent, skinColor, 0.065, 0.075, 0.09, p.x, p.y, p.z);
        box(parent, sleeveColor, 0.085, 0.085, 0.5, p.x + side * 0.02, p.y - 0.045, p.z + 0.3, 0.32);
      };
      hand(rig.group, rig.handR, 1);
      hand(rig.handLParent ?? rig.group, rig.handL, -1);
      rig.group.visible = false;
      this.root.add(rig.group);
      return rig;
    });

    // Muzzle flash: a star made of two crossed planes plus a long streak, lit by a short-lived point light.
    const star = new THREE.PlaneGeometry(0.22, 0.22);
    const a = new THREE.Mesh(star, this.flashMat);
    const b = new THREE.Mesh(star, this.flashMat);
    b.rotation.z = Math.PI / 4;
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.4), this.flashMat);
    this.flash.add(a, b, streak);
    this.flash.visible = false;
    this.root.add(this.flash, this.flashLight);
  }

  /** Matches the overlay camera to the window shape. */
  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Kicks the gun back and shows the muzzle flash. @param weapon - Weapon index that fired. */
  fire(weapon: number): void {
    const fx = WEAPON_FX[weapon]!;
    this.kick = Math.min(1.4, this.kick + fx.kick);
    this.flashT = this.flashLife = fx.flashLife;
    this.flashMat.color.setHex(fx.flashColor);
    this.flashLight.color.setHex(fx.flashColor);
    this.flashPeak = fx.flashLight;
    this.flash.scale.setScalar(fx.flashSize * (0.8 + Math.random() * 0.4));
    this.flash.rotation.z = Math.random() * Math.PI;
    // Restart the gun's own cycle: slide back, bolt run, pump stroke, bolt work.
    this.shotT = 0;
    this.ejected = false;
    if (weapon === 1) this.reelVel = Math.min(this.reelVel + 5, 24);
  }

  /** Throws a spent casing out of the gun's ejection port. */
  private eject(rig: GunRig): void {
    this.root.updateMatrixWorld(true);
    const [w, h, d] = rig.casing.size;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(rig.casing.color));
    mesh.position.copy(rig.group.localToWorld(rig.port.clone()));
    this.scene.add(mesh);
    // Out to the right, up and a little back towards the player, tumbling.
    this.casings.push({
      mesh,
      vel: new THREE.Vector3(0.9 + Math.random() * 0.5, 1.0 + Math.random() * 0.5, 0.3 + Math.random() * 0.4),
      spin: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
      age: 0,
    });
  }

  /** Moves and fades every flying casing, removing the old ones. */
  private updateCasings(dt: number): void {
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i]!;
      c.age += dt;
      if (c.age > 0.9) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        this.casings.splice(i, 1);
        continue;
      }
      c.vel.y -= 7 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      // Shrink away over the last quarter second.
      c.mesh.scale.setScalar(c.age > 0.65 ? Math.max(0.01, 1 - (c.age - 0.65) / 0.25) : 1);
    }
  }

  /**
   * Poses the moving parts of the current gun from the time since the last shot and the reload progress.
   * @param s - Current player state (reload progress, empty magazine).
   * @param dt - Seconds since last frame.
   */
  private animateParts(rig: GunRig, s: ViewState, dt: number): void {
    const p = rig.parts;
    const t = this.shotT;
    const r = s.reloadFrac;
    if (p.mag) {
      const k = magDrop(r);
      // The pistol magazine slides down along the raked grip; the others drop straight down.
      p.mag.position.set(0, -0.13 * k * (this.current === 0 ? 0.98 : 1), this.current === 0 ? 0.026 * k : 0);
    }
    switch (this.current) {
      case 0: {
        // Slide: snaps back and returns after each shot, stays locked open when empty, drops forward when the reload finishes.
        const locked = s.magEmpty && r < 0.85 ? 0.028 : 0;
        p.slide?.position.set(0, 0, Math.max(locked, 0.03 * pulse(t, 0.025, 0.07)));
        p.trigger?.position.set(0, 0, 0.006 * pulse(t, 0.02, 0.06));
        break;
      }
      case 1: {
        // Charging handle runs back and forth; the label reel spins faster the longer you hold fire.
        const open = s.magEmpty && r < 0.85 ? 0.045 : 0;
        p.bolt?.position.set(0, 0, Math.max(open, 0.045 * pulse(t, 0.02, 0.035)));
        this.reelAngle += this.reelVel * dt;
        this.reelVel *= Math.exp(-dt * 4);
        if (p.reel) p.reel.rotation.x = this.reelAngle;
        break;
      }
      case 2: {
        // Pump: racks back and forward after the shot, and twice while reloading.
        const stroke = r > 0 ? 0.075 * Math.abs(Math.sin(r * Math.PI * 3)) : 0.075 * pulse(t - 0.12, 0.15, 0.25);
        p.pump?.position.set(0, 0, s.magEmpty && r === 0 ? 0.075 : stroke);
        break;
      }
      default: {
        // Bolt: handle lifts, bolt slides back, forward, handle drops; open when empty.
        const c = t - 0.35;
        let lift = 0;
        let back = 0;
        if (c >= 0 && c < 0.6) {
          lift = c < 0.12 ? ease(c / 0.12) : c < 0.45 ? 1 : 1 - ease((c - 0.45) / 0.15);
          back = c < 0.12 ? 0 : c < 0.3 ? ease((c - 0.12) / 0.18) : c < 0.45 ? 1 - ease((c - 0.3) / 0.15) : 0;
        }
        if (s.magEmpty && r < 0.85 && c >= 0.6) back = 1;
        p.bolt?.position.set(0, 0.03, -0.05 + 0.1 * back);
        if (p.bolt) p.bolt.rotation.z = lift * 1.0;
      }
    }
    // Casings: pistol and SMG throw theirs at once; the pump and bolt guns on the next stroke.
    if (!this.ejected && t >= rig.ejectAt) {
      this.ejected = true;
      this.eject(rig);
    }
  }

  /**
   * World-space point from which a tracer should start so it appears to leave the barrel tip.
   * @param main - The main world camera.
   * @remarks The gun is drawn by its own camera with a different FOV, so its position is projected to
   * the screen and un-projected through the main camera, about 0.4 m ahead of the eye.
   * While scoped (gun hidden) the tracer starts just below the crosshair instead.
   */
  muzzleWorld(main: THREE.PerspectiveCamera): THREE.Vector3 {
    const rig = this.rigs[this.current];
    this.root.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    main.updateMatrixWorld();
    const ndc = this.root.visible && rig
      ? rig.muzzle.clone().applyMatrix4(rig.group.matrixWorld).project(this.camera)
      : new THREE.Vector3(0, -0.05, 0);
    return new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(main);
  }

  /** Plays the quick lower-and-lob animation for a grenade throw. */
  throwGrenade(): void {
    this.throwT = 1;
  }

  /** Current aim-down-sights blend 0..1 (for zoom and scope). */
  get aim(): number {
    return this.aimT;
  }

  /**
   * Advances every animation and poses the gun.
   * @param dt - Seconds since last frame.
   * @param s - Current player state.
   */
  update(dt: number, s: ViewState): void {
    this.time += dt;
    this.shotT += dt;
    if (s.weapon !== this.current) {
      if (this.current >= 0) this.switchT = 1;
      this.current = s.weapon;
      this.rigs.forEach((r, i) => { r.group.visible = i === s.weapon; });
    }
    const rig = this.rigs[this.current]!;
    const sniper = this.current === 3;
    this.animateParts(rig, s, dt);
    this.updateCasings(dt);

    this.aimT += ((s.aiming && s.alive ? 1 : 0) - this.aimT) * Math.min(1, dt * 14);
    this.kick *= Math.exp(-dt * 14);
    this.switchT = Math.max(0, this.switchT - dt * 4);
    this.throwT = Math.max(0, this.throwT - dt * 2.8);
    this.flashT = Math.max(0, this.flashT - dt);

    // Sway lags behind view rotation; bob follows footsteps and fades while aiming.
    const targetX = THREE.MathUtils.clamp(-s.yawRate * 0.004, -0.04, 0.04);
    const targetY = THREE.MathUtils.clamp(s.pitchRate * 0.004, -0.04, 0.04);
    this.swayX += (targetX - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (targetY - this.swayY) * Math.min(1, dt * 8);
    // Reflections drift slowly on their own and slide with sway, like light moving across real glass.
    this.glints.forEach((tex, i) => {
      tex.offset.set(Math.sin(this.time * 0.7 + i * 1.7) * 0.18 + this.swayX * 5, Math.cos(this.time * 0.5 + i) * 0.06 + this.swayY * 5);
    });
    const moving = s.onGround ? Math.min(s.speed / 7.5, 1.5) : 0;
    this.bob += dt * (6 + s.speed * 0.6);
    const bobAmt = moving * (1 - this.aimT * 0.85);

    const hip = new THREE.Vector3(0.18, -0.17, -0.4);
    const pos = hip.lerp(new THREE.Vector3(rig.ads.x, rig.ads.y, rig.ads.z), this.aimT);
    pos.x += this.swayX + Math.sin(this.bob) * 0.008 * bobAmt;
    pos.y += this.swayY + Math.abs(Math.cos(this.bob)) * 0.01 * bobAmt - Math.sin(this.time * 1.6) * 0.0015;
    pos.z += this.kick * 0.05;

    const reloadDip = s.reloadFrac > 0 ? Math.sin(s.reloadFrac * Math.PI) : 0;
    const throwDip = this.throwT > 0 ? Math.sin((1 - this.throwT) * Math.PI) : 0;
    pos.y -= reloadDip * 0.16 + this.switchT * 0.25 + throwDip * 0.3;
    pos.z -= throwDip * 0.08;
    this.root.position.copy(pos);
    this.root.rotation.set(
      this.kick * 0.1 - reloadDip * 0.55 - this.switchT * 0.5 - throwDip * 0.6,
      -this.swayX * 1.5,
      reloadDip * 0.35 + this.swayX * 2,
    );

    // The scoped sniper is drawn through a DOM scope overlay instead.
    this.root.visible = s.alive && !(sniper && this.aimT > 0.85);

    // The flash fades over its life; the light fades with it so the gun and hands glow briefly.
    const glow = this.flashT / this.flashLife;
    this.flash.visible = this.flashT > 0;
    this.flashMat.opacity = glow;
    this.flashLight.intensity = this.flashPeak * glow;
    this.flash.position.copy(rig.muzzle).add(new THREE.Vector3(0, 0, -0.03));
    this.flashLight.position.copy(rig.muzzle).add(new THREE.Vector3(0, 0.03, 0.05));
  }
}
