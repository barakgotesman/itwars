/**
 * Dev page script behind `tools/characters.html`: renders every character with the game's own `PlayerModel`
 * (each in its own shirt colour, on a transparent background) and POSTs the PNGs to the dev server, which
 * writes them to `public/characters/<slug>.png` (see the `save-characters` plugin in `vite.config.ts`).
 */
import * as THREE from 'three';
import { CHARACTERS, PLAYER_COLORS } from '@shared/core/characters';
import { PlayerModel } from '@client/render/players';

/** Portrait size in pixels (2x the footer's display size so it stays sharp on dense screens); wide enough for a gun. */
const W = 320;
const H = 360;
/** Each character's turn from straight-on (0 faces the camera), so the lineup does not all point the same way: both profiles and 3/4 views. */
const YAW_OF = [0.9, -0.75, 0.25, 1.25, -0.35, 0.6, -1.15] as const;
/** The weapon each character holds (indices into `WEAPONS`: pistol, SMG, shotgun, sniper, RPG), so the lineup shows all five. */
const WEAPON_OF = [0, 1, 2, 3, 4, 2, 0] as const;

const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x5a5f6c, 2.2));
const key = new THREE.DirectionalLight(0xfff2dc, 2.2);
key.position.set(2.5, 4, 4);
scene.add(key);

// A portrait is about 1.85 m tall; the camera frames it from the feet up, with room for a gun at arm's length.
const camera = new THREE.OrthographicCamera(-0.87, 0.87, 1.0, -0.95, 0.1, 20);
camera.position.set(0, 0.95, 8);
camera.lookAt(0, 0.95, 0);

const status = document.getElementById('status')!;
const strip = document.getElementById('strip')!;

for (const [i, def] of CHARACTERS.entries()) {
  const color = PLAYER_COLORS[i % PLAYER_COLORS.length]!;
  const model = new PlayerModel({ id: 0, name: '', model: i, color, spray: 0, kills: 0, deaths: 0 }, 0);
  model.tagVisible(false);
  // `update` raises the gun and poses the arms for it (the RPG goes on the shoulder).
  model.update(0, 0, true, 0, true, WEAPON_OF[i % WEAPON_OF.length]!, false);
  model.root.rotation.y = Math.PI + YAW_OF[i % YAW_OF.length]!;
  scene.add(model.root);
  renderer.render(scene, camera);
  scene.remove(model.root);

  const png = canvas.toDataURL('image/png');
  const img = new Image(W / 2, H / 2);
  img.src = png;
  strip.append(img);
  const res = await fetch(`/__save-character/${def.slug}`, { method: 'POST', body: png });
  status.textContent = res.ok ? `Saved ${def.slug}.png` : `Failed to save ${def.slug}: ${res.status}`;
  if (!res.ok) throw new Error(status.textContent);
}
status.textContent = `Saved ${CHARACTERS.length} portraits to public/characters/`;
document.title = 'DONE';
