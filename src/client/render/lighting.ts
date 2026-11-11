/**
 * Bakes the map's point lights into per-vertex colours at load time. Wall occlusion and a cheap
 * contact-shadow term give soft shading with zero per-frame cost, so the renderer can use unlit materials.
 */
import * as THREE from 'three';
import type { LightSource } from '@shared/world/map';
import { rayVsAabb, type Aabb } from '@shared/core/physics';

/** Brightest a baked vertex may get; keeps ordinary surfaces below the bloom threshold. */
const MAX_LIGHT = 1.15;
const AO_RAY = 0.6;
const AO_DIRS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

interface PreparedLight {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  radius: number;
  /** Occluders that can block rays inside this light's radius. */
  near: Aabb[];
}

/**
 * Creates a function that writes a `color` attribute onto a geometry.
 * @param lights - Baked light sources.
 * @param occluders - Boxes that block light and cast contact shadows (walls, shelves, partitions).
 * @returns A baker to call on each geometry before merging.
 */
export function makeBaker(lights: readonly LightSource[], occluders: readonly Aabb[]): (g: THREE.BufferGeometry) => void {
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

  return (geo) => {
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      // Hemisphere ambient: sky-ish from above, floor bounce from below.
      const amb = 0.22 + 0.09 * (ny * 0.5 + 0.5);
      let r = amb * 0.96, g = amb, b = amb * 1.06;

      const ox = px + nx * 0.04, oy = py + ny * 0.04, oz = pz + nz * 0.04;
      for (const L of prepared) {
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

      // Contact shadow: upward faces darken next to tall geometry; side faces darken near the floor.
      let ao = 1;
      if (ny > 0.5) {
        for (const [ax, az] of AO_DIRS) {
          for (const o of occluders) {
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
