/**
 * Builds everything you can see and hear in a room: renderer, scene, camera, lights, the office, the
 * visual subsystems (players, pickups, particles, doors, ...) and sound. Also keeps the renderer in step
 * with the settings screen. Nothing here knows about the network or the simulation.
 */
import * as THREE from 'three';
import type { Aabb } from '@shared/core/physics';
import type { JoinedMsg } from '@shared/net/protocol';
import { Doors } from '@shared/world/doors';
import { Sfx } from '@client/platform/audio';
import { effectiveGraphics, initQuality } from '@client/platform/quality';
import { onSettingsChange, settings } from '@client/platform/settings';
import { DoorVisuals } from '@client/render/door-visuals';
import { GrenadeVisuals, LootVisuals, PickupVisuals } from '@client/render/items';
import { BulletHoles } from '@client/render/bullet-holes';
import { Sprays } from '@client/render/sprays';
import { Blasts, Particles } from '@client/render/particles';
import { createDust, createPostFx } from '@client/render/renderer';
import { RemotePlayers, SKIN_TONES } from '@client/render/players';
import { ViewModel } from '@client/render/viewmodel';
import { Tracers } from '@client/render/weapon-fx';
import { Atmosphere } from '@client/render/atmosphere';
import { PICKUP_SPOTS, SOLIDS, setActiveMap } from '@client/render/active-map';
import { buildWorld } from '@client/render/world';
import type { Hud } from './ports';

/** Everything the loop and the event handler draw with. */
export interface SceneHandle {
  camera: THREE.PerspectiveCamera;
  world: ReturnType<typeof buildWorld>;
  /** Eases fog and sky toward the room the camera is in. */
  atmosphere: Atmosphere;
  dust: ReturnType<typeof createDust>;
  viewmodel: ViewModel;
  fx: ReturnType<typeof createPostFx>;
  remotes: RemotePlayers;
  particles: Particles;
  blasts: Blasts;
  pickups: PickupVisuals;
  grenadeVisuals: GrenadeVisuals;
  lootBags: LootVisuals;
  bulletHoles: BulletHoles;
  sprays: Sprays;
  tracers: Tracers;
  doorVisuals: DoorVisuals;
  /** The same door simulation the server runs, so doors are predicted correctly. */
  doors: Doors;
  /** Every collision box: the static office plus the doors' moving boxes. */
  solids: readonly Aabb[];
  sfx: Sfx;
  /** Field of view before aim zoom; follows the settings screen. */
  view: { baseFov: number };
  /** True when no graphics tier is saved yet and a one-time calibration should run. */
  needsCalibration: boolean;
}

/** Static solids followed by the doors' moving boxes. */
const concatSolids = (doors: Doors): readonly Aabb[] => [...SOLIDS, ...doors.boxes];

/**
 * Creates the renderer and every visual subsystem for a room.
 * @param canvas - The game canvas.
 * @param joined - The server's welcome message (roster, pickups, loot, doors).
 * @param hud - The HUD, so the FPS counter follows the settings.
 */
export function createScene(canvas: HTMLCanvasElement, joined: JoinedMsg, hud: Hud): SceneHandle {
  setActiveMap(joined.rules.mode);
  const myId = joined.id;
  const view = { baseFov: settings.fov };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // A saved preset is simply used; otherwise a one-time calibration runs on the room screen.
  const needsCalibration = initQuality(renderer.getContext()) && settings.autoQuality;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bb0c4);
  const camera = new THREE.PerspectiveCamera(view.baseFov, 1, 0.1, 200);
  camera.rotation.order = 'YXZ';
  // Light haze gives distance cues and ties far rooms to the ambient colour.
  scene.fog = new THREE.FogExp2(0x8e9bab, 0.006);
  // The office is unlit baked vertex colour; these lights only shade the player models.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0aa, 2.2));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
  sun.position.set(0.4, 1, 0.6);
  scene.add(sun);

  const world = buildWorld(scene, joined.rules, myId);
  const atmosphere = new Atmosphere(scene);
  const dust = createDust(scene);
  const myInfo = joined.players.find((p) => p.id === myId);
  const viewmodel = new ViewModel(myInfo?.color ?? 0x2980b9, SKIN_TONES[myId % SKIN_TONES.length]!);
  const fx = createPostFx(renderer, scene, camera, { scene: viewmodel.scene, camera: viewmodel.camera });
  const remotes = new RemotePlayers(scene, myId);
  remotes.setRoster(joined.players);
  remotes.lightField = world.lightField;
  const particles = new Particles(scene);
  const blasts = new Blasts(scene);
  const pickups = new PickupVisuals(scene, PICKUP_SPOTS, joined.pickups);
  const grenadeVisuals = new GrenadeVisuals(scene);
  const lootBags = new LootVisuals(scene);
  const bulletHoles = new BulletHoles(scene);
  const sprays = new Sprays(scene);
  const doors = new Doors();
  doors.applyWire(joined.doors);
  const doorVisuals = new DoorVisuals(scene, doors);
  const solids = concatSolids(doors);
  for (const l of joined.loot) lootBags.add(l.id, l.x, l.y, l.z);
  const sfx = new Sfx();
  const tracers = new Tracers(scene);

  const resize = () => {
    const ratio = Math.min(devicePixelRatio, 2) * effectiveGraphics().renderScale;
    renderer.setPixelRatio(ratio);
    fx.setPixelRatio(ratio);
    renderer.setSize(innerWidth, innerHeight, false);
    fx.resize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    viewmodel.setAspect(camera.aspect);
  };
  addEventListener('resize', resize);
  resize();

  let antialiasOn = true;
  /** Pushes the current settings into the renderer, effects, audio and HUD. */
  const applySettings = () => {
    view.baseFov = settings.fov;
    // Either the automatic preset (kept at ~60 FPS) or the player's manual choices.
    const g = effectiveGraphics();
    resize();
    fx.setBloom(g.bloom);
    if (g.antialias !== antialiasOn) {
      antialiasOn = g.antialias;
      fx.setAntialias(g.antialias);
    }
    dust.setEnabled(g.dust);
    particles.enabled = g.particles;
    sfx.setVolume(settings.volume);
    hud.fps(settings.showFps ? '-- FPS' : null);
  };
  onSettingsChange(applySettings);
  applySettings();

  return {
    camera, world, dust, viewmodel, fx, remotes, particles, blasts, pickups, grenadeVisuals, lootBags,
    atmosphere, bulletHoles, sprays, tracers, doorVisuals, doors, solids, sfx, view, needsCalibration,
  };
}
