/**
 * Per-room atmosphere: the fog colour and thickness (and the sky colour behind the fog) ease toward the values of
 * the room the camera is in, so walking from the lobby into the server room feels like entering colder, denser air.
 * Only uniform colour changes each frame, so it costs nothing, and it never touches graphics quality.
 */
import * as THREE from 'three';
import { zoneAt } from './active-map';

/** Seconds for roughly two thirds of a change of atmosphere. */
const EASE_S = 0.8;

/** Eases a scene's fog toward the room around the camera. */
export class Atmosphere {
  private readonly target = new THREE.Color();

  /**
   * @param scene - Scene whose `fog` (exponential) and `background` are driven.
   */
  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Advances the blend.
   * @param dt - Frame time in seconds (never negative).
   * @param x - Camera x.
   * @param z - Camera z.
   */
  update(dt: number, x: number, z: number): void {
    const fog = this.scene.fog;
    if (!(fog instanceof THREE.FogExp2)) return;
    const zone = zoneAt(x, z);
    const k = 1 - Math.exp(-Math.max(0, dt) / EASE_S);
    this.target.setHex(zone.fog.color);
    fog.color.lerp(this.target, k);
    fog.density += (zone.fog.density - fog.density) * k;
    // The sky behind far geometry matches the fog, or distant rooms would show a seam.
    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(fog.color);
  }
}
