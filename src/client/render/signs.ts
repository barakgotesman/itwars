/**
 * Door nameplates: the room names above every doorway ("SERVER ROOM", "BREAK ROOM"...). The map data lists each
 * sign (text, wall, accent colour); here they are drawn into one small texture atlas and merged into a single
 * mesh, so all the signs cost one draw call. They face both sides of the wall, so a room is named from inside and out.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fillRuleTokens } from '@shared/rules/standings';
import type { MaterialId } from '@shared/world/map';
import { LABELS } from './active-map';

/** Atlas cell size in pixels; its 128 : 22 shape matches the 5.6 : 1 signs. */
const CELL_W = 512;
const CELL_H = 90;

/**
 * Adds every door sign to the scene.
 * @param scene - Scene to add the merged sign mesh to.
 * @param colorOf - Colour of an accent material, used as the sign's background.
 * @param rules - The room's rules; `{KILLS}` and `{MINUTES}` in a sign's text become the real numbers.
 */
export function buildSigns(scene: THREE.Scene, colorOf: (m: MaterialId) => number, rules: { killLimit: number; timeLimitMin: number }): void {
  buildSignSet(scene, LABELS.filter((l) => !l.glow), false, colorOf, rules);
  buildSignSet(scene, LABELS.filter((l) => l.glow), true, colorOf, rules);
}

/**
 * Draws one set of signs into its own atlas and mesh. Glowing signs show bright accent-coloured lettering on a
 * near-black plate and render brighter than white, so the bloom pass makes them shine in a dark room.
 */
function buildSignSet(
  scene: THREE.Scene, labels: readonly (typeof LABELS)[number][], glow: boolean,
  colorOf: (m: MaterialId) => number, rules: { killLimit: number; timeLimitMin: number },
): void {
  const textOf = (l: (typeof LABELS)[number]) => fillRuleTokens(l.text, rules);
  // One atlas row per distinct text, accent and sign shape (the shape decides how the text is scaled).
  const keyOf = (l: (typeof LABELS)[number]) => `${l.accent}|${(l.w / l.h).toFixed(2)}|${textOf(l)}`;
  const rows = new Map<string, number>();
  for (const l of labels) {
    const key = keyOf(l);
    if (!rows.has(key)) rows.set(key, rows.size);
  }
  if (rows.size === 0) return;

  const canvas = document.createElement('canvas');
  canvas.width = CELL_W;
  canvas.height = CELL_H * rows.size;
  const g = canvas.getContext('2d')!;
  const seen = new Set<string>();
  for (const l of labels) {
    const key = keyOf(l);
    if (seen.has(key)) continue;
    seen.add(key);
    const y = rows.get(key)! * CELL_H;
    const accent = new THREE.Color(colorOf(l.accent));
    g.fillStyle = glow ? '#0b0906' : `#${accent.clone().multiplyScalar(0.55).getHexString()}`;
    g.fillRect(0, y, CELL_W, CELL_H);
    // A bright accent bar down the left edge and a light inner frame, like an office wayfinding plate.
    g.fillStyle = `#${accent.getHexString()}`;
    g.fillRect(0, y, 18, CELL_H);
    g.fillStyle = glow ? `#${accent.getHexString()}` : 'rgba(255,255,255,0.25)';
    g.fillRect(18, y + 4, CELL_W - 22, 3);
    g.fillRect(18, y + CELL_H - 7, CELL_W - 22, 3);
    // Shrink the text until it fits, so long names such as "PHONE BOOTHS" stay inside the plate.
    // The cell is stretched onto a plane of a different shape (a wide banner), so squeeze the text by the same ratio.
    const sx = (CELL_W / CELL_H) / (l.w / l.h);
    const text = textOf(l);
    let size = 54;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    do {
      g.font = `800 ${size}px "Segoe UI", system-ui, sans-serif`;
      size -= 2;
    } while (g.measureText(text).width * sx > CELL_W - 70 && size > 16);
    g.save();
    g.translate((CELL_W + 18) / 2, y + CELL_H / 2 + 2);
    g.scale(sx, 1);
    g.fillStyle = glow ? `#${accent.clone().lerp(new THREE.Color(0xffffff), 0.35).getHexString()}` : '#ffffff';
    g.fillText(text, 0, 0);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const geos: THREE.BufferGeometry[] = labels.map((l) => {
    const geo = new THREE.PlaneGeometry(l.w, l.h);
    // Point the plane's UVs at this sign's row of the atlas (canvas row 0 is the top, v = 1).
    const row = rows.get(keyOf(l))!;
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + (1 - uv.getY(i))) / rows.size);
    // Planes face +z; turn them to face along the wall normal.
    if (l.axis === 'x') geo.rotateY(l.facing === 1 ? 0 : Math.PI);
    else geo.rotateY(l.facing === 1 ? Math.PI / 2 : -Math.PI / 2);
    geo.translate(l.x, l.y, l.z);
    return geo;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshBasicMaterial({ map: tex, color: glow ? new THREE.Color(2.2, 2.2, 2.2) : 0xffffff, toneMapped: !glow, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.frustumCulled = false;
  scene.add(mesh);
}
