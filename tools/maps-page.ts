/**
 * Dev page script behind `tools/maps.html`: builds every selectable map with the game's own world builder, renders
 * it from the map's cameras with the game's High graphics (bloom, 4x MSAA) and POSTs the JPEGs to the dev server, which writes `public/maps/<id>.jpg`
 * (see the `save-maps` plugin in `vite.config.ts`). The setup screen's map cards show these pictures.
 */
import * as THREE from 'three';
import { MAPS } from '@shared/world/map/maps';
import { setActiveMap } from '@client/render/active-map';
import { createPostFx } from '@client/render/renderer';
import { buildWorld } from '@client/render/world';

/** Setup picture size in pixels (3:2, shown at about half this on the cards so it stays sharp on dense screens). */
const W = 1200;
const H = 800;
/** Showcase picture size (16:9, full HD: the landing page shows it smaller, so it stays crisp on dense screens). */
const GW = 1920;
const GH = 1080;
/** JPEG quality of every picture. */
const QUALITY = 0.92;

// The pictures are taken with the game's "High" graphics preset (see `platform/quality.ts`): its own post-processing
// pipeline with bloom and 4x multisampling, so they look like the game does on a good PC. The dust motes are left
// out: at this size they read as grey squares.
const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

// Exposed so extra shots can be tried from the console with the page's own module instances (a console import can
// load a second copy of `active-map`, whose map switch the world builder would never see).
(window as unknown as { __maps: object }).__maps = { THREE, MAPS, setActiveMap, buildWorld };

const status = document.getElementById('status')!;
const strip = document.getElementById('strip')!;

for (const map of MAPS) {
  // No wall scoreboards in the pictures (an empty standings table looks bad), and no dark frames left behind:
  // a frame is a dark box under 0.2 m thick and over 5.5 m long standing against a wall (see `scoreboard()`).
  const isFrame = (b: (typeof map.boxes)[number]) => b.mat === 'dark' && (b.maxX - b.minX < 0.2 || b.maxZ - b.minZ < 0.2) && Math.max(b.maxX - b.minX, b.maxZ - b.minZ) > 5.5;
  setActiveMap({ ...map, boards: [], boxes: map.boxes.filter((b) => !isFrame(b)) });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(map.backdrop.background);
  // Thinner fog than the menu backdrop's: a picture should show the whole room.
  scene.fog = new THREE.FogExp2(map.backdrop.fog.color, map.backdrop.fog.density * 0.6);
  const world = buildWorld(scene);
  const camera = new THREE.PerspectiveCamera(map.shot.fov, W / H, 0.1, 140);
  const fx = createPostFx(renderer, scene, camera);
  fx.setPixelRatio(1);

  /** Renders one picture at a size from a camera pose through the full post-processing chain and returns it as a JPEG. */
  const shoot = (w: number, h: number, shot: { pos: readonly [number, number, number]; yaw: number; pitch: number; fov: number }): string => {
    renderer.setSize(w, h, false);
    fx.resize(w, h);
    camera.aspect = w / h;
    camera.fov = shot.fov;
    camera.updateProjectionMatrix();
    camera.position.set(...shot.pos);
    camera.rotation.set(shot.pitch, shot.yaw, 0, 'YXZ');
    world.update(0.4);
    fx.render();
    return canvas.toDataURL('image/jpeg', QUALITY);
  };

  const jpeg = shoot(W, H, map.shot);
  const img = new Image();
  img.src = jpeg;
  strip.append(img);
  const res = await fetch(`/__save-map/${map.id}`, { method: 'POST', body: jpeg });
  status.textContent = res.ok ? `Saved ${map.id}.jpg` : `Failed to save ${map.id}: ${res.status}`;
  if (!res.ok) throw new Error(status.textContent);

  // The landing page's showcase pictures: 16:9, same scene, one per gallery camera.
  for (const g of map.gallery) {
    const pic = shoot(GW, GH, g.shot);
    const img2 = new Image();
    img2.src = pic;
    strip.append(img2);
    const r2 = await fetch(`/__save-map/${map.id}-${g.slug}`, { method: 'POST', body: pic });
    if (!r2.ok) throw new Error(`Failed to save ${map.id}-${g.slug}: ${r2.status}`);
  }
  world.dispose();
}
status.textContent = `Saved ${MAPS.length} setup pictures and the showcase gallery to public/maps/`;
document.title = 'DONE';
