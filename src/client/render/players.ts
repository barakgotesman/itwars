/**
 * Other players: a boxy office-worker model with procedural animation, plus the manager that
 * interpolates snapshots about 100 ms in the past so motion looks smooth despite 30 Hz updates.
 */
import type { LightField, Tint } from './light-field';
import * as THREE from 'three';
import type { PlayerInfo, SnapPlayer } from '@shared/net/protocol';

/** How far behind real time remote players are drawn. */
const INTERP_DELAY_MS = 100;
/** Snapshots older than this (relative to the render time) are discarded. */
const BUFFER_MS = 1000;
export const SKIN_TONES = [0xf1c9a5, 0xd9a273, 0xb07a4f, 0x8a5a38, 0xf6d9bd, 0x6b4328];
const HAIR_TONES = [0x2b1d12, 0x4a3320, 0x1a1a1a, 0x8a6a3a, 0xb5651d, 0x777777];
const PANTS = [0x2c3342, 0x3a3a3a, 0x4a4036, 0x23304a];
/** Gun silhouette per weapon index: length along the arm and colour. */
const GUN_LOOK = [
  { len: 0.26, thick: 0.07, color: 0x555a63 },
  { len: 0.42, thick: 0.09, color: 0x2f3a2f },
  { len: 0.62, thick: 0.1, color: 0x6a4a2a },
  { len: 0.85, thick: 0.06, color: 0x1e1e24 },
] as const;

const matCache = new Map<number, THREE.MeshLambertMaterial>();
/** Scratch colour for tint maths. */
const TINT = new THREE.Color();
/** Shared flat-shaded material per colour, so 8 players cost a handful of materials. */
function mat(color: number): THREE.MeshLambertMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}

/** Adds a box mesh to a parent. Sizes in metres, `y` is the box centre relative to the parent. */
function part(parent: THREE.Object3D, color: number, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Draws a callsign onto a sprite that always faces the camera. */
function nameTag(name: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0, 8, 256, 48);
  g.font = 'bold 30px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(name, 128, 33, 240);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.3, 0.325, 1);
  s.position.y = 2.15;
  return s;
}

/** One player's meshes plus the procedural animation state. Origin is at the feet; the face points -Z. */
export class PlayerModel {
  /** Add this to the scene; position it at the feet and set `rotation.y` to the yaw. */
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly gun = new THREE.Group();
  private readonly tag: THREE.Sprite;
  private phase = 0;
  private gunIndex = -1;
  private tagHidden = false;
  /** True once this model has broken into chunks for its current death; cleared on respawn. */
  private shattered = false;
  /** The flying head/arm/leg/torso pieces while shattered, each with its own fall. */
  private chunks: { obj: THREE.Object3D; vel: THREE.Vector3; angVel: THREE.Vector3; grounded: boolean; floorY: number }[] = [];
  /** Each limb's local position relative to the body at rest, so it can be reattached after a respawn. */
  private readonly restPos = new Map<THREE.Object3D, THREE.Vector3>();
  /** This model's own copies of the shared materials, so its tint never leaks onto other players. */
  private readonly own = new Set<THREE.MeshLambertMaterial>();
  private tintR = 1;
  private tintG = 1;
  private tintB = 1;

  /**
   * @param info - Name, character style and shirt colour.
   * @param variant - Any integer; picks skin and hair so players of the same style still differ.
   */
  constructor(info: PlayerInfo, variant: number) {
    const skin = SKIN_TONES[variant % SKIN_TONES.length]!;
    const hair = HAIR_TONES[(variant * 7) % HAIR_TONES.length]!;
    this.root.add(this.body);
    switch (info.model) {
      case 1: this.buildHoodieDev(info, skin); break;
      case 2: this.buildManager(info, skin, hair); break;
      case 3: this.buildIntern(info, skin, hair); break;
      case 4: this.buildHr(info, skin, hair); break;
      case 5: this.buildCto(info, skin, hair); break;
      case 6: this.buildCfo(info, skin); break;
      default: this.buildSysadmin(info, skin, hair, PANTS[variant % PANTS.length]!);
    }
    this.armR.add(this.gun);
    this.gun.position.set(0, -0.58, 0);
    this.tag = nameTag(info.name);
    this.root.add(this.tag);
    this.setWeapon(1);
    this.adopt();
    for (const limb of [this.head, this.legL, this.legR, this.armL, this.armR]) {
      this.restPos.set(limb, limb.position.clone());
    }
  }

  /** Gives every mesh that still uses a shared material its own copy (new gun parts appear when the weapon changes). */
  private adopt(): void {
    this.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshLambertMaterial) || this.own.has(o.material)) return;
      const m = o.material.clone();
      m.userData.base = o.material.color.clone();
      m.color.copy(m.userData.base as THREE.Color).multiply(new THREE.Color(this.tintR, this.tintG, this.tintB));
      o.material = m;
      this.own.add(m);
    });
  }

  /**
   * Tints the model to the light of the room it stands in.
   * @param r - Red multiplier (1 = normally lit).
   * @param g - Green multiplier.
   * @param b - Blue multiplier.
   */
  setTint(r: number, g: number, b: number): void {
    if (Math.abs(r - this.tintR) + Math.abs(g - this.tintG) + Math.abs(b - this.tintB) < 0.01) return;
    this.tintR = r; this.tintG = g; this.tintB = b;
    for (const m of this.own) (m.color.copy(m.userData.base as THREE.Color)).multiply(TINT.set(r, g, b));
  }

  /**
   * Legs, arms and head base shared by every style.
   * @param o - Colours and proportions: trousers, shoes, sleeve colour and length, skin, torso width.
   */
  private base(o: { pants: number; shoes: number; sleeve: number; sleeveLen: number; skin: number; torso: number }): void {
    const b = this.body;
    // Legs hang from the hip so rotating the group swings the whole limb.
    for (const [leg, x] of [[this.legL, -0.13], [this.legR, 0.13]] as const) {
      leg.position.set(x, 0.82, 0);
      part(leg, o.pants, 0.2, 0.74, 0.22, 0, -0.37, 0);
      part(leg, o.shoes, 0.22, 0.1, 0.32, 0, -0.78, -0.06);
      b.add(leg);
    }
    // Arms point at -Z when rotated 90 degrees about X, so a held gun lines up with the aim.
    for (const [arm, x] of [[this.armL, -(o.torso / 2 + 0.12)], [this.armR, o.torso / 2 + 0.12]] as const) {
      arm.position.set(x, 1.4, 0);
      part(arm, o.sleeve, 0.14, o.sleeveLen, 0.14, 0, -o.sleeveLen / 2, 0);
      part(arm, o.skin, 0.12, 0.6 - o.sleeveLen, 0.12, 0, -o.sleeveLen - (0.6 - o.sleeveLen) / 2, 0);
      b.add(arm);
    }
    this.head.position.set(0, 1.46, 0);
    part(this.head, o.skin, 0.26, 0.28, 0.26, 0, 0.15, 0);
    part(this.head, 0x15151a, 0.03, 0.04, 0.02, -0.06, 0.18, -0.13);
    part(this.head, 0x15151a, 0.03, 0.04, 0.02, 0.06, 0.18, -0.13);
    b.add(this.head);
  }

  /** Shirt, tie, glasses and short hair: the IT department classic. */
  private buildSysadmin(info: PlayerInfo, skin: number, hair: number, pants: number): void {
    const b = this.body;
    this.base({ pants, shoes: 0x16161a, sleeve: info.color, sleeveLen: 0.4, skin, torso: 0.5 });
    part(b, info.color, 0.5, 0.62, 0.28, 0, 1.13, 0);
    part(b, 0x2a2a30, 0.52, 0.06, 0.3, 0, 0.84, 0);
    part(b, 0xf4f4f1, 0.2, 0.06, 0.04, 0, 1.43, -0.13);
    part(b, 0x8c1c24, 0.07, 0.4, 0.02, 0, 1.2, -0.15);
    part(this.head, hair, 0.28, 0.08, 0.28, 0, 0.3, 0.02);
    part(this.head, 0x222228, 0.22, 0.025, 0.02, 0, 0.18, -0.14);
  }

  /** Oversized hoodie with the hood up, jeans, sneakers and headphones. */
  private buildHoodieDev(info: PlayerInfo, skin: number): void {
    const b = this.body;
    const shade = new THREE.Color(info.color).multiplyScalar(0.7).getHex();
    this.base({ pants: 0x3b5b8a, shoes: 0xe8e8e8, sleeve: info.color, sleeveLen: 0.6, skin, torso: 0.54 });
    part(b, info.color, 0.54, 0.66, 0.3, 0, 1.12, 0);
    part(b, shade, 0.32, 0.14, 0.03, 0, 0.98, -0.16);
    part(b, 0xf4f4f1, 0.02, 0.14, 0.02, -0.05, 1.3, -0.155);
    part(b, 0xf4f4f1, 0.02, 0.14, 0.02, 0.05, 1.3, -0.155);
    part(b, info.color, 0.36, 0.1, 0.34, 0, 1.46, 0.02);
    // Hood: cap over the head, back flap and cheek pieces framing the face.
    part(this.head, info.color, 0.32, 0.1, 0.34, 0, 0.31, 0.02);
    part(this.head, info.color, 0.33, 0.3, 0.1, 0, 0.14, 0.17);
    part(this.head, info.color, 0.05, 0.3, 0.28, -0.155, 0.14, 0.02);
    part(this.head, info.color, 0.05, 0.3, 0.28, 0.155, 0.14, 0.02);
    part(this.head, 0x1b1b20, 0.07, 0.13, 0.13, -0.2, 0.15, 0.02);
    part(this.head, 0x1b1b20, 0.07, 0.13, 0.13, 0.2, 0.15, 0.02);
    part(this.head, 0x1b1b20, 0.4, 0.03, 0.04, 0, 0.34, 0.02);
  }

  /** Dark suit, white shirt, bold tie and sunglasses. */
  private buildManager(info: PlayerInfo, skin: number, hair: number): void {
    const b = this.body;
    const suit = 0x2b2f3a;
    this.base({ pants: 0x23262e, shoes: 0x0e0e10, sleeve: suit, sleeveLen: 0.5, skin, torso: 0.56 });
    part(b, suit, 0.56, 0.64, 0.3, 0, 1.12, 0);
    part(b, 0xf4f4f1, 0.15, 0.4, 0.02, 0, 1.22, -0.155);
    part(b, 0xf4f4f1, 0.22, 0.06, 0.05, 0, 1.43, -0.145);
    part(b, info.color, 0.07, 0.36, 0.02, 0, 1.18, -0.18);
    part(b, info.color, 0.07, 0.04, 0.02, -0.17, 1.33, -0.16);
    part(b, 0x1b1d24, 0.58, 0.05, 0.32, 0, 0.84, 0);
    part(this.armL, 0xd4af37, 0.15, 0.05, 0.15, 0, -0.55, 0);
    // Slicked-back hair with a side part, plus wide sunglasses.
    part(this.head, hair, 0.28, 0.1, 0.28, 0, 0.3, 0.02);
    part(this.head, hair, 0.28, 0.2, 0.06, 0, 0.2, 0.15);
    part(this.head, 0x0b0b0e, 0.25, 0.05, 0.02, 0, 0.19, -0.138);
  }

  /** Polo, cap, lanyard badge and a backpack. */
  private buildIntern(info: PlayerInfo, skin: number, hair: number): void {
    const b = this.body;
    this.base({ pants: 0xb59f7b, shoes: 0xc0392b, sleeve: info.color, sleeveLen: 0.2, skin, torso: 0.48 });
    part(b, info.color, 0.48, 0.62, 0.27, 0, 1.13, 0);
    part(b, 0xf4f4f1, 0.18, 0.05, 0.04, 0, 1.43, -0.13);
    part(b, 0x1f3a5f, 0.05, 0.5, 0.02, 0, 1.2, -0.145);
    part(b, 0xffffff, 0.12, 0.16, 0.03, 0, 0.98, -0.155);
    part(b, 0x2f80ed, 0.12, 0.04, 0.03, 0, 1.03, -0.165);
    part(b, 0x3d6b4f, 0.34, 0.44, 0.16, 0, 1.14, 0.22);
    part(b, 0x2c4d39, 0.3, 0.12, 0.17, 0, 1.28, 0.22);
    part(this.head, hair, 0.28, 0.1, 0.1, 0, 0.18, 0.15);
    part(this.head, 0x1f3a5f, 0.3, 0.1, 0.3, 0, 0.31, 0.01);
    part(this.head, 0x1f3a5f, 0.26, 0.03, 0.14, 0, 0.28, -0.2);
  }

  /**
   * Fitted blazer with a narrow waist, a pencil skirt over bare legs, red heels, long hair with a bow, lashes, blush and lipstick:
   * the people person. Every cue is chosen to read as female even in a small blocky silhouette.
   */
  private buildHr(info: PlayerInfo, skin: number, hair: number): void {
    const b = this.body;
    const skirt = 0x2b2f3a;
    // Bare legs (the skin tone) and red heels, so the skirt hem shows the legs below it.
    this.base({ pants: skin, shoes: 0xc0392b, sleeve: info.color, sleeveLen: 0.45, skin, torso: 0.44 });
    // Heels: a raised block under each heel, and a slimmer toe.
    for (const leg of [this.legL, this.legR]) part(leg, 0x8e2a20, 0.08, 0.1, 0.08, 0, -0.76, 0.1);
    // Hourglass torso: a chest, a narrow waist, a belt, then hips wider than the shoulders.
    part(b, info.color, 0.44, 0.34, 0.26, 0, 1.27, 0);
    part(b, info.color, 0.34, 0.26, 0.23, 0, 1.0, 0);
    part(b, 0x1f1f26, 0.37, 0.05, 0.25, 0, 0.88, 0);
    part(b, skirt, 0.47, 0.2, 0.28, 0, 0.75, 0);
    part(b, skirt, 0.4, 0.2, 0.26, 0, 0.56, 0);
    // Blouse and a V neckline of skin, a brooch on the lapel.
    part(b, 0xf4f4f1, 0.16, 0.3, 0.02, 0, 1.26, -0.135);
    part(b, skin, 0.1, 0.08, 0.02, 0, 1.4, -0.14);
    part(b, skin, 0.05, 0.05, 0.02, 0, 1.35, -0.14);
    part(b, 0xd4af37, 0.05, 0.05, 0.02, 0.12, 1.33, -0.14);
    // Long hair: crown, a fringe swept to one side, a curtain falling past the shoulders at the back, and side locks to the chest.
    part(this.head, hair, 0.29, 0.1, 0.29, 0, 0.3, 0.02);
    part(this.head, hair, 0.27, 0.06, 0.03, 0.02, 0.26, -0.14);
    part(this.head, hair, 0.14, 0.05, 0.03, -0.08, 0.22, -0.14);
    part(this.head, hair, 0.36, 0.7, 0.1, 0, -0.06, 0.2);
    part(this.head, hair, 0.06, 0.46, 0.2, -0.17, -0.03, 0.03);
    part(this.head, hair, 0.06, 0.46, 0.2, 0.17, -0.03, 0.03);
    // A bow at the side of the head.
    part(this.head, 0xe8508a, 0.07, 0.07, 0.05, 0.13, 0.27, -0.06);
    part(this.head, 0xe8508a, 0.03, 0.03, 0.03, 0.13, 0.27, -0.09);
    // Face details: lashes, blush, red lips and gold earrings.
    part(this.head, 0x15151a, 0.045, 0.015, 0.02, -0.06, 0.215, -0.133);
    part(this.head, 0x15151a, 0.045, 0.015, 0.02, 0.06, 0.215, -0.133);
    part(this.head, 0xe58f8f, 0.04, 0.025, 0.012, -0.09, 0.1, -0.132);
    part(this.head, 0xe58f8f, 0.04, 0.025, 0.012, 0.09, 0.1, -0.132);
    part(this.head, 0xc0392b, 0.08, 0.025, 0.02, 0, 0.07, -0.133);
    part(this.head, 0xd4af37, 0.03, 0.06, 0.03, -0.15, 0.06, -0.02);
    part(this.head, 0xd4af37, 0.03, 0.06, 0.03, 0.15, 0.06, -0.02);
  }

  /** Padded vest over a dark top, round glasses, beard and messy hair: the CTO. */
  private buildCto(info: PlayerInfo, skin: number, hair: number): void {
    const b = this.body;
    const dark = 0x30343c;
    this.base({ pants: 0x2f4a6e, shoes: 0xf4f4f1, sleeve: dark, sleeveLen: 0.5, skin, torso: 0.52 });
    part(b, dark, 0.52, 0.62, 0.28, 0, 1.13, 0);
    part(b, info.color, 0.54, 0.46, 0.32, 0, 1.06, 0);
    part(b, 0x1b1d24, 0.02, 0.4, 0.02, 0, 1.06, -0.17);
    part(b, dark, 0.22, 0.12, 0.22, 0, 1.45, 0);
    part(this.armL, 0x15151a, 0.15, 0.05, 0.15, 0, -0.55, 0);
    // Messy hair with a few cowlicks, plus a full beard and moustache.
    part(this.head, hair, 0.28, 0.07, 0.28, 0, 0.31, 0.02);
    part(this.head, hair, 0.06, 0.08, 0.06, -0.08, 0.38, 0);
    part(this.head, hair, 0.05, 0.1, 0.05, 0.05, 0.39, 0.05);
    part(this.head, hair, 0.07, 0.06, 0.07, 0.1, 0.36, -0.03);
    part(this.head, hair, 0.28, 0.18, 0.06, 0, 0.2, 0.15);
    part(this.head, hair, 0.26, 0.09, 0.03, 0, 0.05, -0.14);
    part(this.head, hair, 0.1, 0.025, 0.03, 0, 0.105, -0.14);
    part(this.head, 0xcfd3d8, 0.24, 0.02, 0.02, 0, 0.19, -0.14);
    part(this.head, 0xcfd3d8, 0.012, 0.07, 0.02, -0.115, 0.18, -0.14);
    part(this.head, 0xcfd3d8, 0.012, 0.07, 0.02, 0.115, 0.18, -0.14);
  }

  /** Navy three-piece with a paunch, gold tie clip, silver moustache and a receding hairline: the CFO. */
  private buildCfo(info: PlayerInfo, skin: number): void {
    const b = this.body;
    const suit = 0x1f2a44;
    this.base({ pants: 0x1a2238, shoes: 0x0e0e10, sleeve: suit, sleeveLen: 0.5, skin, torso: 0.58 });
    part(b, suit, 0.58, 0.64, 0.32, 0, 1.12, 0);
    part(b, 0x7a8499, 0.2, 0.4, 0.02, 0, 1.12, -0.17);
    part(b, 0xf4f4f1, 0.12, 0.12, 0.03, 0, 1.37, -0.175);
    part(b, 0xf4f4f1, 0.24, 0.06, 0.05, 0, 1.43, -0.15);
    part(b, info.color, 0.06, 0.3, 0.02, 0, 1.2, -0.2);
    part(b, 0xd4af37, 0.08, 0.015, 0.03, 0, 1.3, -0.21);
    part(b, 0x1a2238, 0.5, 0.2, 0.1, 0, 0.93, -0.19);
    part(b, 0x15151a, 0.62, 0.05, 0.34, 0, 0.84, 0);
    for (const arm of [this.armL, this.armR]) part(arm, 0xd4af37, 0.16, 0.02, 0.16, 0, -0.5, 0);
    // Bald on top, silver at the sides and back, white moustache, gold half-rim glasses.
    part(this.head, 0xc8ccd2, 0.04, 0.14, 0.24, -0.14, 0.14, 0.03);
    part(this.head, 0xc8ccd2, 0.04, 0.14, 0.24, 0.14, 0.14, 0.03);
    part(this.head, 0xc8ccd2, 0.28, 0.14, 0.05, 0, 0.15, 0.15);
    part(this.head, 0xe8e8e8, 0.12, 0.03, 0.03, 0, 0.1, -0.14);
    part(this.head, 0xd4af37, 0.22, 0.02, 0.02, 0, 0.2, -0.14);
  }

  /** Shows or hides the floating name tag (the menu preview has none). */
  tagVisible(visible: boolean): void {
    this.tagHidden = !visible;
    this.tag.visible = visible;
  }

  /** Swaps the gun silhouette in the right hand. */
  private setWeapon(w: number): void {
    if (w === this.gunIndex) return;
    this.gunIndex = w;
    this.gun.clear();
    const look = GUN_LOOK[w] ?? GUN_LOOK[0];
    // The arm's local -Y points along the aim, so the barrel runs down -Y.
    part(this.gun, look.color, look.thick, look.len, look.thick * 1.3, 0, -look.len / 2 + 0.08, 0);
    part(this.gun, 0x111114, look.thick * 0.7, 0.1, look.thick, 0, 0.0, 0.06);
    this.addGunDetails(w, look.len, look.thick);
    this.adopt();
  }

  /**
   * Signature colours for each held gun, matching the first-person models. In the gun's local space -Y is
   * the barrel direction and -Z is up.
   */
  private addGunDetails(w: number, len: number, t: number): void {
    const g = this.gun;
    switch (w) {
      case 0:
        part(g, 0xc4cbd3, t * 1.05, len * 0.8, t * 0.6, 0, -len * 0.45, -t * 0.55);
        part(g, 0xc0392b, t * 1.1, 0.05, t * 1.4, 0, -len + 0.1, 0);
        break;
      case 1:
        part(g, 0xf4f4f1, t * 1.1, 0.09, 0.08, 0, -0.1, -t * 1.3);
        part(g, 0xf39c12, t * 1.2, 0.04, t * 1.4, 0, -len + 0.08, 0);
        part(g, 0xf2c230, t * 0.9, 0.05, 0.1, 0, -0.12, t * 1.4);
        break;
      case 2:
        part(g, 0x7a4f2c, t * 1.3, 0.12, t * 1.1, 0, -0.32, t * 0.8);
        part(g, 0x7a4f2c, t * 1.1, 0.2, t * 1.4, 0, 0.14, 0);
        part(g, 0xf2c230, t * 1.15, 0.03, t * 1.4, 0, -0.18, 0);
        break;
      default:
        part(g, 0x2a2d33, t * 1.2, 0.2, t * 1.2, 0, -0.28, -t * 1.5);
        part(g, 0x4aa8ff, t * 1.0, 0.02, t * 1.0, 0, -0.18, -t * 1.5);
        part(g, 0xc0392b, t * 1.1, 0.04, t * 1.4, 0, 0.12, 0);
    }
  }

  /**
   * Relaxed standing pose with breathing, weight shift and a wandering gaze, so the menu preview feels alive.
   * @param t - Time in seconds (drives every motion, so no state is needed).
   */
  idle(t: number): void {
    this.gun.visible = false;
    if (this.shattered) this.reassemble();
    const breath = Math.sin(t * 1.8);
    this.body.rotation.set(0, 0, 0);
    this.body.visible = true;
    // Slow weight shift from one foot to the other, with the torso counter-leaning.
    const shift = Math.sin(t * 0.6);
    this.body.position.set(shift * 0.012, 0, 0);
    this.body.rotation.z = shift * 0.012;
    this.body.scale.y = 1 + breath * 0.005;
    this.legL.rotation.x = 0.02 + shift * 0.02;
    this.legR.rotation.x = -0.02 - shift * 0.02;
    // Arms hang with a slight outward angle and move a little with each breath.
    this.armL.rotation.set(0.04 + breath * 0.03, 0, -0.07);
    this.armR.rotation.set(0.04 - breath * 0.03, 0, 0.07);
    // The head turns to look around, with a small nod now and then.
    this.head.rotation.set(Math.sin(t * 0.35) * 0.06, Math.sin(t * 0.5) * 0.28, Math.sin(t * 0.7) * 0.03);
  }

  /**
   * Poses the model for this frame.
   * @param dt - Seconds since last frame.
   * @param speed - Horizontal speed in m/s (drives stride rate and swing).
   * @param onGround - False tucks the legs.
   * @param pitch - View pitch; the head and arms follow it.
   * @param alive - False breaks the model into head/arm/leg/torso chunks that tumble and settle.
   * @param weapon - Selected weapon index.
   * @param blink - Hides the model on alternate frames to show spawn protection.
   */
  update(dt: number, speed: number, onGround: boolean, pitch: number, alive: boolean, weapon: number, blink: boolean): void {
    this.setWeapon(weapon);
    if (!alive) {
      if (!this.shattered) this.shatter();
      this.stepShatter(dt);
      this.tag.visible = false;
      return;
    }
    if (this.shattered) this.reassemble();
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.tag.visible = !this.tagHidden;
    this.body.visible = !blink;

    this.phase += dt * speed * 1.15;
    const amp = Math.min(speed / 7.5, 1.5) * 0.85;
    const swing = Math.sin(this.phase) * amp;
    if (onGround) {
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.body.position.y += Math.abs(Math.sin(this.phase)) * 0.035 * Math.min(speed / 7.5, 1.5);
    } else {
      this.legL.rotation.x = 0.7;
      this.legR.rotation.x = -0.25;
    }
    this.head.rotation.x = pitch * 0.8;
    // Both hands hold the gun forward; the support arm sits a little lower.
    this.armR.rotation.x = Math.PI / 2 + pitch * 0.9;
    this.armL.rotation.x = Math.PI / 2.3 + pitch * 0.9;
    this.armL.rotation.y = 0.35;
  }

  /**
   * Breaks the model apart on death: the head, both arms and both legs detach from the torso (kept
   * as the remaining `body` group) and fly outward with a random tumble, each becoming its own chunk
   * stepped by {@link stepShatter} until the next {@link reassemble}.
   */
  private shatter(): void {
    this.shattered = true;
    this.chunks = [];
    const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    for (const limb of [this.head, this.armL, this.armR, this.legL, this.legR]) {
      this.root.attach(limb); // Reparents under root while keeping its current world position/rotation.
      const out = new THREE.Vector3(rand(-1, 1), rand(0.5, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(1.6, 3.4));
      this.chunks.push({ obj: limb, vel: out, angVel: new THREE.Vector3(rand(-7, 7), rand(-7, 7), rand(-7, 7)), grounded: false, floorY: this.restFloor(limb) });
    }
    // The torso (this.body, now holding only the chest/hip meshes) becomes a flying chunk of its own.
    this.chunks.push({
      obj: this.body,
      vel: new THREE.Vector3(rand(-0.9, 0.9), rand(0.7, 1.5), rand(-0.9, 0.9)),
      angVel: new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4)),
      grounded: false,
      floorY: this.restFloor(this.body),
    });
  }

  /**
   * The root-space y at which a chunk's own lowest point (in its unrotated rest pose, e.g. a shoe sole or the
   * hip line) touches the ground. A chunk's group origin (hip height for a leg, feet height for the torso) is
   * rarely at that lowest point, so falling until the ORIGIN reaches y 0 would float some chunks and sink others.
   */
  private restFloor(obj: THREE.Object3D): number {
    const pos = obj.position.clone();
    const quat = obj.quaternion.clone();
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.updateMatrixWorld(true);
    const bottomWorldY = new THREE.Box3().setFromObject(obj).min.y;
    obj.position.copy(pos);
    obj.quaternion.copy(quat);
    obj.updateMatrixWorld(true);
    // Root only ever yaws (rotation.y), which leaves world Y untouched, so a plain subtraction is exact.
    // The content sits `offset` above (or below) the chunk's own origin, so the origin must fall to
    // -offset for the content's lowest point to reach the floor.
    const offset = bottomWorldY - this.root.position.y;
    return -offset;
  }

  /** Falls, tumbles and settles every chunk of a shattered model (blocky, no round trajectories needed). */
  private stepShatter(dt: number): void {
    const gravity = 9;
    for (const c of this.chunks) {
      if (c.grounded) continue;
      c.vel.y -= gravity * dt;
      c.obj.position.addScaledVector(c.vel, dt);
      c.obj.rotation.x += c.angVel.x * dt;
      c.obj.rotation.y += c.angVel.y * dt;
      c.obj.rotation.z += c.angVel.z * dt;
      if (c.obj.position.y <= c.floorY) {
        c.obj.position.y = c.floorY;
        c.vel.set(0, 0, 0);
        c.angVel.set(0, 0, 0);
        c.grounded = true;
      }
    }
  }

  /** Puts every chunk back onto the torso at its rest pose after a respawn. */
  private reassemble(): void {
    this.shattered = false;
    this.chunks = [];
    for (const limb of [this.head, this.armL, this.armR, this.legL, this.legR]) {
      this.body.add(limb);
      limb.position.copy(this.restPos.get(limb)!);
      limb.rotation.set(0, 0, 0);
    }
  }
}

/** One received snapshot of a remote player, stamped with the local receive time. */
interface Sample {
  t: number;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
}

/** Interpolation state and model for one remote player. */
interface Remote {
  model: PlayerModel;
  samples: Sample[];
  latest: SnapPlayer;
  /** Last drawn position, for speed estimation. */
  lx: number; ly: number; lz: number;
  speed: number;
}

/** Shortest-path angle interpolation. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Owns the models of everyone except the local player and keeps them in sync with snapshots. */
export class RemotePlayers {
  private readonly remotes = new Map<number, Remote>();
  private roster = new Map<number, PlayerInfo>();
  /** Baked light by position; when set, each model is tinted to its room. */
  lightField: LightField | null = null;
  private readonly tint: Tint = { r: 1, g: 1, b: 1 };

  /**
   * @param scene - Scene the models are added to.
   * @param myId - Local player's id (never drawn).
   */
  constructor(private readonly scene: THREE.Scene, private readonly myId: number) {}

  /** Updates names and colours (models are created when their player first appears in a snapshot). */
  setRoster(infos: readonly PlayerInfo[]): void {
    this.roster = new Map(infos.map((i) => [i.id, i]));
  }

  /**
   * Ingests a snapshot's player list.
   * @param players - Everyone in the room.
   * @param now - Local receive time in ms.
   */
  onSnapshot(players: readonly SnapPlayer[], now: number): void {
    const seen = new Set<number>();
    for (const p of players) {
      if (p.id === this.myId) continue;
      seen.add(p.id);
      let r = this.remotes.get(p.id);
      if (!r) {
        const info = this.roster.get(p.id);
        if (!info) continue; // Roster message not here yet; picked up on the next snapshot.
        const model = new PlayerModel(info, p.id);
        this.scene.add(model.root);
        r = { model, samples: [], latest: p, lx: p.x, ly: p.y, lz: p.z, speed: 0 };
        this.remotes.set(p.id, r);
      }
      r.latest = p;
      r.samples.push({ t: now, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
      while (r.samples.length > 2 && r.samples[1]!.t < now - BUFFER_MS) r.samples.shift();
    }
    for (const [id, r] of this.remotes) {
      if (seen.has(id)) continue;
      this.scene.remove(r.model.root);
      this.remotes.delete(id);
    }
  }

  /**
   * Barrel tip of a remote player's gun as currently drawn, so tracers leave the gun, not the eyes.
   * @returns World position, or null if the player is unknown.
   */
  muzzleOf(id: number): THREE.Vector3 | null {
    const r = this.remotes.get(id);
    if (!r) return null;
    const yaw = r.model.root.rotation.y;
    const pitch = r.latest.pitch * 0.9; // The arms follow 90% of the view pitch.
    const reach = 0.5 + (GUN_LOOK[r.latest.w]?.len ?? 0.3);
    const cp = Math.cos(pitch);
    const dir = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    const p = r.model.root.position;
    // Right shoulder: 0.37 m to the right of the body centre, 1.4 m up.
    return new THREE.Vector3(p.x + Math.cos(yaw) * 0.37, p.y + 1.4, p.z - Math.sin(yaw) * 0.37).addScaledVector(dir, reach);
  }

  /** Eye position of a remote player's latest snapshot (for tracers), or null if unknown. */
  eyeOf(id: number): THREE.Vector3 | null {
    const r = this.remotes.get(id);
    return r ? new THREE.Vector3(r.latest.x, r.latest.y + 1.62, r.latest.z) : null;
  }

  /**
   * Moves and poses every model for this frame.
   * @param now - Local time in ms.
   * @param dt - Frame time in seconds.
   */
  update(now: number, dt: number): void {
    const renderT = now - INTERP_DELAY_MS;
    for (const r of this.remotes.values()) {
      const s = r.samples;
      let a = s[0]!;
      let b = s[0]!;
      for (let i = 0; i < s.length; i++) {
        if (s[i]!.t <= renderT) a = s[i]!;
        if (s[i]!.t >= renderT) { b = s[i]!; break; }
        b = s[i]!;
      }
      const f = b.t > a.t ? THREE.MathUtils.clamp((renderT - a.t) / (b.t - a.t), 0, 1) : 1;
      const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
      const yaw = lerpAngle(a.yaw, b.yaw, f);
      const pitch = a.pitch + (b.pitch - a.pitch) * f;

      const moved = Math.hypot(x - r.lx, z - r.lz) / Math.max(dt, 1e-3);
      r.speed += (Math.min(moved, 14) - r.speed) * Math.min(1, dt * 12);
      const airborne = Math.abs(y - r.ly) / Math.max(dt, 1e-3) > 1.5;
      r.lx = x; r.ly = y; r.lz = z;

      r.model.root.position.set(x, y, z);
      r.model.root.rotation.y = yaw;
      if (this.lightField) {
        this.lightField.sample(x, z, this.tint);
        r.model.setTint(this.tint.r, this.tint.g, this.tint.b);
      }
      r.model.update(dt, r.speed, !airborne, pitch, r.latest.alive, r.latest.w, r.latest.prot && Math.floor(now / 100) % 2 === 0);
    }
  }
}
