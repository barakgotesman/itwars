/**
 * Floating damage numbers for the shooting range: a blocky number that pops up where a target was hit,
 * drifts upward and fades. One canvas sprite per hit, recycled when it expires. The size grows with the
 * distance to the camera so a number on the far target is as readable as one on the near target.
 */
import * as THREE from 'three';

/** Seconds a number lives. */
const LIFE = 0.9;
/** Metres a number rises over its life. */
const RISE = 0.9;
/** Most numbers alive at once (an SMG burst on one target stays well under this). */
const MAX_LIVE = 24;
/** Apparent height of a number in metres per metre of camera distance (keeps the on-screen size steady). */
const SIZE_PER_METRE = 0.045;
const MIN_SIZE = 0.3;

interface Live {
  sprite: THREE.Sprite;
  age: number;
  /** Small sideways drift so a burst does not stack its numbers on one spot. */
  dx: number;
  dz: number;
}

/** Draws "n" (with a skull-free "!" for headshots) onto a fresh canvas texture. */
function makeTexture(dmg: number, head: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '900 44px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = String(dmg);
  // Hard black offset "shadow" instead of a blur, to match the cube look.
  g.fillStyle = '#000';
  g.fillText(text, 67, 35);
  g.fillStyle = head ? '#ff4a4a' : '#ffffff';
  g.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/** Pool of rising damage numbers. */
export class DamageNumbers {
  private readonly live: Live[] = [];

  /** @param scene - Scene the sprites are added to. @param camera - Used to scale numbers by distance. */
  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {}

  /**
   * Pops a number at a world position.
   * @param x - World x. @param y - World y. @param z - World z.
   * @param dmg - Damage dealt.
   * @param head - Headshots are red and larger.
   */
  add(x: number, y: number, z: number, dmg: number, head: boolean): void {
    if (this.live.length >= MAX_LIVE) this.drop(this.live[0]!);
    const mat = new THREE.SpriteMaterial({ map: makeTexture(dmg, head), transparent: true, depthWrite: false, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 10;
    sprite.position.set(x, y, z);
    sprite.userData.y0 = y;
    sprite.userData.head = head;
    this.scene.add(sprite);
    this.live.push({ sprite, age: 0, dx: (Math.random() - 0.5) * 0.5, dz: (Math.random() - 0.5) * 0.5 });
    this.size(sprite, head);
  }

  /** Scales a sprite so it keeps a steady apparent size. */
  private size(s: THREE.Sprite, head: boolean): void {
    const dist = s.position.distanceTo(this.camera.position);
    const h = Math.max(MIN_SIZE, dist * SIZE_PER_METRE) * (head ? 1.4 : 1);
    s.scale.set(h * 2, h, 1);
  }

  private drop(l: Live): void {
    this.scene.remove(l.sprite);
    const m = l.sprite.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.dispose();
    this.live.splice(this.live.indexOf(l), 1);
  }

  /** Moves, rescales and fades every number. @param dt - Frame time in seconds. */
  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i]!;
      l.age += dt;
      if (l.age >= LIFE) {
        this.drop(l);
        continue;
      }
      const t = l.age / LIFE;
      // Quick pop up, then a slow drift; fades over the last half.
      const rise = RISE * (1 - (1 - t) * (1 - t));
      l.sprite.position.set(l.sprite.position.x + l.dx * dt, (l.sprite.userData.y0 as number) + rise, l.sprite.position.z + l.dz * dt);
      (l.sprite.material as THREE.SpriteMaterial).opacity = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
      this.size(l.sprite, l.sprite.userData.head === true);
    }
  }
}
