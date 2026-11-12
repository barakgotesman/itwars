/**
 * Bakes the map's point lights into per-vertex colours at load time. Wall occlusion and a cheap
 * contact-shadow term give soft shading with zero per-frame cost, so the renderer can use unlit materials.
 * The ambient light comes from the room's entry in the lighting design (`zones.ts`), so every room has its own
 * colour and darkness. The same light maths also feeds the `LightField` that tints players.
 */
import * as THREE from 'three';
import type { LightSource } from '@shared/world/map';
import { rayVsAabb, type Aabb } from '@shared/core/physics';
import { zoneAt } from './active-map';

/** Brightest a baked vertex may get; keeps ordinary surfaces below the bloom threshold. */
export const MAX_LIGHT = 1.15;
const AO_RAY = 0.6;
const AO_DIRS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** How far (m) an ambient sample is moved off a surface and sideways, so rooms blend softly at doorways. */
const AMBIENT_BLEND = 1.3;
/** Edge length (m) of the cells of the occluder lookup grid. */
const GRID_CELL = 6;

interface PreparedLight {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  radius: number;
  /** Occluders that can block rays inside this light's radius. */
  near: Aabb[];
}

/** Colour channels (0-1) of a hex colour, scaled so the brightest channel is 1 (only the hue is kept). */
function hue(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const m = Math.max(r, g, b, 0.001);
  return [r / m, g / m, b / m];
}

/** Ambient colour channels at a point (zone hue times zone level), before the up/down bounce shaping. */
function ambientBase(x: number, z: number): [number, number, number] {
  const zone = zoneAt(x, z);
  const [r, g, b] = hue(zone.ambient.color);
  const k = zone.ambient.level;
  return [r * k, g * k, b * k];
}

/** A light evaluator over a set of lamps and occluders, shared by the vertex baker and the player light field. */
export interface LightModel {
  /**
   * Total baked light arriving at a point on a surface.
   * @param nx - Surface normal (unit); pass (0, 1, 0) for an open point in a room.
   * @returns Linear RGB, before the contact-shadow term and the brightness clamp.
   */
  irradiance(px: number, py: number, pz: number, nx: number, ny: number, nz: number): [number, number, number];
  /** Occluders (walls, shelves) near a point, for the contact-shadow term. */
  occluders: readonly Aabb[];
}

/**
 * Prepares lamps and occluders for repeated light queries.
 * @param lights - Baked light sources.
 * @param occluders - Boxes that block light and cast contact shadows (walls, shelves, partitions).
 */
export function makeLightModel(lights: readonly LightSource[], occluders: readonly Aabb[]): LightModel {
  const tmp = new THREE.Color();
  const prepared: PreparedLight[] = lights.map((l) => {
    tmp.setHex(l.color);
    const k = l.intensity;
    return {
      x: l.x, y: l.y, z: l.z, r: tmp.r * k, g: tmp.g * k, b: tmp.b * k, radius: l.radius,
      near: occluders.filter((o) =>
        o.maxX > l.x - l.radius && o.minX < l.x + l.radius &&
        o.maxY > l.y - l.radius && o.minY < l.y + l.radius &&
        o.maxZ > l.z - l.radius && o.minZ < l.z + l.radius),
    };
  });

  // A flat grid over the map lists the lamps near each cell, so a point only tests the lamps that can reach it.
  const cells = new Map<number, PreparedLight[]>();
  const key = (cx: number, cz: number) => cx * 4096 + cz;
  for (const L of prepared) {
    const x0 = Math.floor((L.x - L.radius) / GRID_CELL), x1 = Math.floor((L.x + L.radius) / GRID_CELL);
    const z0 = Math.floor((L.z - L.radius) / GRID_CELL), z1 = Math.floor((L.z + L.radius) / GRID_CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        (cells.get(k) ?? cells.set(k, []).get(k)!).push(L);
      }
    }
  }

  return {
    occluders,
    irradiance(px, py, pz, nx, ny, nz) {
      // Ambient: this room's own colour, brighter on upward faces (sky bounce). A floor or ceiling point samples the
      // room around it too, so the change of mood between two rooms is a soft gradient through the doorway.
      let ar = 0, ag = 0, ab = 0;
      const bounce = 1 + 0.4 * (ny * 0.5 + 0.5);
      if (Math.abs(ny) > 0.5) {
        for (const [ox, oz] of [[0, 0], [AMBIENT_BLEND, 0], [-AMBIENT_BLEND, 0], [0, AMBIENT_BLEND], [0, -AMBIENT_BLEND]] as const) {
          const [r, g, b] = ambientBase(px + ox, pz + oz);
          ar += r; ag += g; ab += b;
        }
        ar /= 5; ag /= 5; ab /= 5;
      } else {
        // A wall face takes the ambient of the air in front of it, never of the room behind it.
        [ar, ag, ab] = ambientBase(px + nx * 0.5, pz + nz * 0.5);
      }
      let r = ar * bounce, g = ag * bounce, b = ab * bounce;

      const ox = px + nx * 0.04, oy = py + ny * 0.04, oz = pz + nz * 0.04;
      const list = cells.get(key(Math.floor(ox / GRID_CELL), Math.floor(oz / GRID_CELL)));
      if (list) {
        for (const L of list) {
          const dx = L.x - ox, dy = L.y - oy, dz = L.z - oz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= L.radius * L.radius) continue;
          const dist = Math.sqrt(d2);
          const ux = dx / dist, uy = dy / dist, uz = dz / dist;
          // Wrap lighting: surfaces edge-on to a light still catch a little, so walls do not go black.
          const ndl = Math.max(0, nx * ux + ny * uy + nz * uz) * 0.8 + 0.2;
          const k = (1 - dist / L.radius) ** 1.7 * ndl;
          if (k < 0.01) continue;
          let blocked = false;
          for (const o of L.near) {
            const t = rayVsAabb(ox, oy, oz, ux, uy, uz, o);
            if (t !== null && t < dist - 0.05) { blocked = true; break; }
          }
          if (blocked) continue;
          r += L.r * k; g += L.g * k; b += L.b * k;
        }
      }
      return [r, g, b];
    },
  };
}

/**
 * Creates a function that writes a `color` attribute onto a geometry.
 * @param model - Light model built from the map's lamps (shared with the player light field).
 * @param occluders - Boxes that block light and cast contact shadows (walls, shelves, partitions).
 * @returns A baker to call on each geometry before merging.
 */
export function makeBaker(model: LightModel, occluders: readonly Aabb[]): (g: THREE.BufferGeometry) => void {
  // Contact shadows only need occluders near a point, so index them by cell too.
  const grid = new Map<number, Aabb[]>();
  const key = (cx: number, cz: number) => cx * 4096 + cz;
  for (const o of occluders) {
    for (let cx = Math.floor((o.minX - AO_RAY) / GRID_CELL); cx <= Math.floor((o.maxX + AO_RAY) / GRID_CELL); cx++) {
      for (let cz = Math.floor((o.minZ - AO_RAY) / GRID_CELL); cz <= Math.floor((o.maxZ + AO_RAY) / GRID_CELL); cz++) {
        const k = key(cx, cz);
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(o);
      }
    }
  }

  return (geo) => {
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      const [r, g, b] = model.irradiance(px, py, pz, nx, ny, nz);

      // Contact shadow: upward faces darken next to tall geometry; side faces darken near the floor.
      let ao = 1;
      const ox = px + nx * 0.04, oy = py + ny * 0.04, oz = pz + nz * 0.04;
      if (ny > 0.5) {
        const near = grid.get(key(Math.floor(ox / GRID_CELL), Math.floor(oz / GRID_CELL))) ?? [];
        for (const [ax, az] of AO_DIRS) {
          for (const o of near) {
            const t = rayVsAabb(ox, oy + 0.1, oz, ax, 0, az, o);
            if (t !== null && t < AO_RAY) { ao *= 0.86; break; }
          }
        }
      } else if (Math.abs(ny) <= 0.5) {
        ao = 0.8 + 0.2 * Math.min(1, py / 0.9);
        if (py > 3.7) ao *= 0.9;
      }

      col[i * 3] = Math.min(r * ao, MAX_LIGHT);
      col[i * 3 + 1] = Math.min(g * ao, MAX_LIGHT);
      col[i * 3 + 2] = Math.min(b * ao, MAX_LIGHT);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  };
}
