/**
 * The render loop: a fixed-step simulation with render interpolation (so movement is frame-rate
 * independent), then first-person weapon, camera, sound, scoreboard and every visual subsystem update.
 */
import { EYE_HEIGHT, Key, TICK_DT, TICK_RATE } from '@shared/core/constants';
import { WEAPONS } from '@shared/rules/weapons';
import type { Hud } from '@client/hud/hud';
import type { Input } from '@client/platform/input';
import type { Net } from '@client/platform/net';
import { settings } from '@client/platform/settings';
import type { CameraFx } from './events';
import type { LocalPlayer } from './prediction';
import type { RosterTracker } from './roster';
import type { SceneHandle } from './scene';

/** Distance walked between footstep sounds. */
const STEP_LENGTH = 2.3;

/** What the loop drives. */
export interface LoopDeps {
  myId: number;
  scene: SceneHandle;
  local: LocalPlayer;
  roster: RosterTracker;
  camFx: CameraFx;
  input: Input;
  net: Net;
  hud: Hud;
  /** Called first every frame with the raw frame time (s) and whether the tab is visible; drives the one-time graphics calibration. */
  beforeFrame: (rawDt: number, visible: boolean) => void;
}

/**
 * Starts the render loop.
 * @param d - The pieces the loop drives.
 */
export function startFrameLoop(d: LoopDeps): void {
  const { myId, scene, local, roster, camFx, input, net, hud } = d;
  const { camera, viewmodel, doors, sfx, view } = scene;
  const me = local.me;

  let last = performance.now();
  let acc = 0;
  let lastYaw = input.yaw;
  let lastPitch = input.pitch;
  let stepAcc = 0;
  let curFov = view.baseFov;
  let scoped = false;
  let fpsFrames = 0;
  let fpsTime = 0;
  let boardShown = false;

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // rAF timestamps can predate `last` (the map build blocks for a while), so never let dt go negative.
    const rawDt = (now - last) / 1000;
    const dt = Math.max(0, Math.min(rawDt, 0.1));
    d.beforeFrame(rawDt, document.visibilityState === 'visible');
    acc += dt;
    last = now;
    while (acc >= TICK_DT) {
      local.tick(input, net, doors);
      acc -= TICK_DT;
    }
    const a = acc / TICK_DT;
    const speed = Math.hypot(me.vx, me.vz);
    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      if (settings.showFps) hud.fps(`${Math.round(fpsFrames / fpsTime)} FPS`);
      hud.standings(roster.players, myId);
      fpsFrames = 0;
      fpsTime = 0;
    }

    // First-person weapon: the aim blend drives zoom, scope and mouse sensitivity.
    const lastMe = local.lastMe;
    let reloadFrac = 0;
    if (lastMe && lastMe.reload > 0) {
      const left = Math.max(0, lastMe.reload - ((now - local.lastSnapAt) / 1000) * TICK_RATE);
      reloadFrac = 1 - left / WEAPONS[lastMe.w]!.reloadTicks;
    }
    const alive = local.alive;
    viewmodel.update(dt, {
      weapon: input.weapon, aiming: (input.keys & Key.Aim) !== 0, speed, onGround: me.onGround, reloadFrac, alive,
      yawRate: dt > 0 ? (input.yaw - lastYaw) / dt : 0, pitchRate: dt > 0 ? (input.pitch - lastPitch) / dt : 0,
      magEmpty: lastMe !== null && (lastMe.mag[input.weapon] ?? 1) === 0,
    });
    lastYaw = input.yaw;
    lastPitch = input.pitch;
    const zoom = 1 + (WEAPONS[input.weapon]!.zoom - 1) * viewmodel.aim;
    const fov = view.baseFov / zoom;
    if (Math.abs(fov - curFov) > 0.01) {
      curFov = fov;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    input.sensScale = fov / view.baseFov;
    const nowScoped = alive && input.weapon === 3 && viewmodel.aim > 0.85;
    if (nowScoped !== scoped) {
      scoped = nowScoped;
      hud.scope(scoped);
    }

    // Camera: interpolated position, view angles, recoil kick and explosion shake.
    camFx.shake *= Math.exp(-dt * 6);
    camFx.kick *= Math.exp(-dt * 9);
    const { shake, kick } = camFx;
    const prev = local.prev;
    const eye = alive ? EYE_HEIGHT : 0.35;
    camera.position.set(
      prev.x + (me.x - prev.x) * a + (Math.random() - 0.5) * shake,
      prev.y + (me.y - prev.y) * a + eye + (Math.random() - 0.5) * shake,
      prev.z + (me.z - prev.z) * a + (Math.random() - 0.5) * shake,
    );
    camera.rotation.set((alive ? input.pitch : -0.3) + kick + (Math.random() - 0.5) * shake * 0.5, input.yaw, 0);

    // Sound: the listener follows the camera; footsteps are by distance walked.
    sfx.setListener(camera.position.x, camera.position.z, input.yaw);
    if (alive && me.onGround && speed > 1.5) {
      stepAcc += speed * dt;
      if (stepAcc > STEP_LENGTH) {
        stepAcc = 0;
        sfx.step();
      }
    }

    if (input.scoreboard !== boardShown || (boardShown && roster.dirty)) {
      boardShown = input.scoreboard;
      roster.dirty = false;
      hud.scoreboard(boardShown, roster.players, myId);
    }

    scene.remotes.update(now, dt);
    scene.particles.update(dt);
    scene.blasts.update(dt);
    scene.grenadeVisuals.update(dt);
    scene.pickups.update(now / 1000);
    scene.bulletHoles.update(dt);
    scene.lootBags.update(now / 1000);
    scene.doorVisuals.update(dt);
    scene.tracers.update(dt);
    scene.world.update(now / 1000);
    scene.dust.update(camera.position, now / 1000);
    scene.fx.render();
  };
  requestAnimationFrame(frame);
}
