/**
 * Dev page script behind `tools/maps.html`: builds every selectable map with the game's own world builder, renders
 * it from the map's `shot` camera and POSTs the JPEG to the dev server, which writes `public/maps/<id>.jpg`
 * (see the `save-maps` plugin in `vite.config.ts`). The setup screen's map cards show these pictures.
 */
import * as THREE from 'three';
import { MAPS } from '@shared/world/map/maps';
import { setActiveMap } from '@client/render/active-map';
import { buildWorld } from '@client/render/world';

/** Picture size in pixels (3:2, drawn at about half this on the cards so it stays sharp on dense screens). */
const W = 960;
const H = 640;

const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

const status = document.getElementById('status')!;
const strip = document.getElementById('strip')!;

for (const map of MAPS) {
  // No wall scoreboards in the pictures: they would show an empty standings table. The shots also look away from them.
  setActiveMap({ ...map, boards: [] });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(map.backdrop.background);
  // Thinner fog than the menu backdrop's: a picture should show the whole room.
  scene.fog = new THREE.FogExp2(map.backdrop.fog.color, map.backdrop.fog.density * 0.6);
  const world = buildWorld(scene);
  const camera = new THREE.PerspectiveCamera(map.shot.fov, W / H, 0.1, 140);
  camera.position.set(...map.shot.pos);
  camera.rotation.set(map.shot.pitch, map.shot.yaw, 0, 'YXZ');
  world.update(0.4);
  renderer.render(scene, camera);

  const jpeg = canvas.toDataURL('image/jpeg', 0.88);
  const img = new Image();
  img.src = jpeg;
  strip.append(img);
  const res = await fetch(`/__save-map/${map.id}`, { method: 'POST', body: jpeg });
  status.textContent = res.ok ? `Saved ${map.id}.jpg` : `Failed to save ${map.id}: ${res.status}`;
  if (!res.ok) throw new Error(status.textContent);
  world.dispose();
}
status.textContent = `Saved ${MAPS.length} pictures to public/maps/`;
document.title = 'DONE';
