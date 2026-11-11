/**
 * A coarse map of the baked light at chest height, so characters and weapons can be tinted by the room they
 * stand in (dark and blue in the server room, warm in the lobby) instead of glowing under one global light.
 * Built once at load from the same light model as the map's vertex colours; a lookup is a bilinear blend of four
 * cells, so it costs almost nothing per frame.
 */
import { X0, X1, Z0, Z1 } from '@shared/world/map/builder';
import { zoneAt } from '@shared/world/map/zones';
import type { LightModel } from './lighting';

/** Cell size (m) of the grid. */
const CELL = 2;
/** Height (m) the light is sampled at: the middle of a standing player. */
const SAMPLE_Y = 1.3;
/** Light level that counts as "normally lit" (a tint of 1): the open plan under its panels. */
const REFERENCE = 0.6;
/** How much of a room's colour cast characters keep (1 = all of it). */
const HUE_KEEP = 0.7;
/** Brightest tint, so a lamp-lit spot does not blow players out. */
const MAX_TINT = 1.25;

/** An RGB triple filled in by `sample`. */
export interface Tint { r: number; g: number; b: number }

/** Baked light by position. */
export class LightField {
  private readonly nx = Math.ceil((X1 - X0) / CELL) + 1;
  private readonly nz = Math.ceil((Z1 - Z0) / CELL) + 1;
  private readonly data: Float32Array;

  /** @param model - The light model the map was baked with. */
  constructor(model: LightModel) {
    this.data = new Float32Array(this.nx * this.nz * 3);
    for (let i = 0; i < this.nx; i++) {
      for (let j = 0; j < this.nz; j++) {
        const [r, g, b] = model.irradiance(X0 + i * CELL, SAMPLE_Y, Z0 + j * CELL, 0, 1, 0);
        const k = (j * this.nx + i) * 3;
        this.data[k] = r; this.data[k + 1] = g; this.data[k + 2] = b;
      }
    }
  }

  /**
   * Tint for something standing at a point: the local light relative to a normal room, never below the zone's
   * brightness floor, so a player in the dark is dim but never invisible.
   * @param out - Receives the tint.
   */
  sample(x: number, z: number, out: Tint): void {
    const fx = Math.min(Math.max((x - X0) / CELL, 0), this.nx - 1.001);
    const fz = Math.min(Math.max((z - Z0) / CELL, 0), this.nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const at = (a: number, b: number, c: number) => this.data[((j + b) * this.nx + (i + a)) * 3 + c]!;
    const floor = zoneAt(x, z).floor;
    const ch = (c: number) => (at(0, 0, c) * (1 - tx) + at(1, 0, c) * tx) * (1 - tz) + (at(0, 1, c) * (1 - tx) + at(1, 1, c) * tx) * tz;
    let r = ch(0) / REFERENCE, g = ch(1) / REFERENCE, bl = ch(2) / REFERENCE;
    // Dark rooms are lifted to the zone's floor as a whole, keeping the colour balance instead of clipping each channel.
    const peak = Math.max(r, g, bl, 1e-4);
    if (peak < floor) {
      const k = floor / peak;
      r *= k; g *= k; bl *= k;
    }
    // Soften the colour a little: a room's hue should lean on the character, not dye it.
    const mean = (r + g + bl) / 3;
    out.r = Math.min(MAX_TINT, mean + (r - mean) * HUE_KEEP);
    out.g = Math.min(MAX_TINT, mean + (g - mean) * HUE_KEEP);
    out.b = Math.min(MAX_TINT, mean + (bl - mean) * HUE_KEEP);
  }
}
