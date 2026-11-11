/**
 * The in-room game loop: renders the office, predicts the local player with the shared movement
 * code, reconciles against server snapshots, and turns server events into visuals, sound and HUD.
 */
import * as THREE from 'three';
import { EYE_HEIGHT, Key, TICK_DT, TICK_RATE } from '../shared/constants';
import { Doors } from '../shared/doors';
import { PICKUP_SPOTS, SOLIDS } from '../shared/map';
import { newPlayerState, stepMovement } from '../shared/physics';
import type { GameEvent, InputMsg, JoinedMsg, MeState, PlayerInfo, SnapMsg } from '../shared/protocol';
import { GRENADES, WEAPONS } from '../shared/weapons';
import { Sfx } from './audio';
import { createDust, createPostFx } from './effects';
import { createFeed } from './feed';
import type { Hud } from './hud';
import type { Input } from './input';
import { DoorVisuals } from './door-visuals';
import { GrenadeVisuals, LootVisuals, PickupVisuals } from './items';
import type { Net } from './net';
import { BulletHoles } from './bullet-holes';
import { Blasts, Particles } from './particles';
import { Calibration, effectiveGraphics, initQuality } from './quality';
import { onSettingsChange, settings } from './settings';
import { RemotePlayers, SKIN_TONES } from './players';
import { ViewModel } from './viewmodel';
import { Tracers, WEAPON_FX } from './weapon-fx';
import { buildWorld } from './world';

/** Unconfirmed inputs kept for replay; the server acks within a few ticks, this is just a safety cap. */
const MAX_PENDING = 180;
/** A reconcile error above this (metres) skips render smoothing and snaps the view. */
const SNAP_DISTANCE = 1.5;
/** Distance walked between footstep sounds. */
const STEP_LENGTH = 2.3;
/** Explosions closer than this (m) shake the camera. */
const SHAKE_RANGE = 16;

/** Everything the loop needs from the rest of the client. */
export interface GameContext {
  canvas: HTMLCanvasElement;
  input: Input;
  net: Net;
  joined: JoinedMsg;
  hud: Hud;
}

/** Handle returned to the menu code. */
export interface GameHandle {
  /** Runs `fn` once graphics calibration has finished (immediately if there is none to do). */
  whenReady(fn: () => void): void;
  /** Call from a click so the browser allows sound. */
  unlockAudio(): void;
}

/**
 * Creates the renderer and starts the fixed-step simulation and render loop.
 * @param ctx - Canvas, input, network and HUD handles.
 */
export function startGame(ctx: GameContext): GameHandle {
  const { canvas, input, net, joined, hud } = ctx;
  const myId = joined.id;
  /** Field of view before aim zoom; follows the settings screen. */
  let baseFov = settings.fov;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // A saved preset is simply used; otherwise a one-time calibration runs on the room screen (see below).
  const needsCalibration = initQuality(renderer.getContext()) && settings.autoQuality;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bb0c4);
  const camera = new THREE.PerspectiveCamera(baseFov, 1, 0.1, 200);
  camera.rotation.order = 'YXZ';
  // Light haze gives distance cues and ties far rooms to the ambient colour.
  scene.fog = new THREE.FogExp2(0x8e9bab, 0.006);
  // The office is unlit baked vertex colour; these lights only shade the player models.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0aa, 2.2));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
  sun.position.set(0.4, 1, 0.6);
  scene.add(sun);

  const world = buildWorld(scene);
  const dust = createDust(scene);
  const myInfo = joined.players.find((p) => p.id === myId);
  const viewmodel = new ViewModel(myInfo?.color ?? 0x2980b9, SKIN_TONES[myId % SKIN_TONES.length]!);
  const fx = createPostFx(renderer, scene, camera, { scene: viewmodel.scene, camera: viewmodel.camera });
  const remotes = new RemotePlayers(scene, myId);
  remotes.setRoster(joined.players);
  const particles = new Particles(scene);
  const blasts = new Blasts(scene);
  const pickups = new PickupVisuals(scene, PICKUP_SPOTS, joined.pickups);
  const grenadeVisuals = new GrenadeVisuals(scene);
  const lootBags = new LootVisuals(scene);
  const bulletHoles = new BulletHoles(scene);
  // Doors: the same shared simulation the server runs, so walking into and being pushed by a door is predicted correctly.
  const doors = new Doors();
  doors.applyWire(joined.doors);
  const doorVisuals = new DoorVisuals(scene, doors);
  /** Every collision box: the static office plus the doors' moving boxes. */
  const solids = [...SOLIDS, ...doors.boxes];
  for (const l of joined.loot) lootBags.add(l.id, l.x, l.y, l.z);
  const sfx = new Sfx();

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
    baseFov = settings.fov;
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

  // ---- roster, scoreboard and event feed ----
  const feed = createFeed();
  let roster: PlayerInfo[] = [...joined.players];
  /** Every name ever seen, so a kill by someone who just left still reads correctly. */
  const names = new Map<number, string>(joined.players.map((p) => [p.id, p.name]));
  let knownIds = new Set(joined.players.map((p) => p.id));
  let boardShown = false;
  let boardDirty = true;
  /** Name piece for the feed; the local player is highlighted. */
  const who = (id: number) => ({ text: id === myId ? 'You' : (names.get(id) ?? 'Someone'), tone: id === myId ? 'me' as const : 'name' as const });
  /** Announces joins and leaves by comparing the new roster with the last one. */
  const onRoster = (players: readonly PlayerInfo[]) => {
    roster = [...players];
    boardDirty = true;
    const ids = new Set(players.map((p) => p.id));
    for (const p of players) {
      names.set(p.id, p.name);
      if (!knownIds.has(p.id) && p.id !== myId) feed.push([who(p.id), { text: ' joined the session' }]);
    }
    for (const id of knownIds) if (!ids.has(id)) feed.push([who(id), { text: ' left the session' }]);
    knownIds = ids;
  };

  /**
   * One-time graphics calibration, run while the player is still on the room screen with the map hidden.
   * It picks the preset, saves it and is then finished for good: graphics never change during play.
   */
  const readyCallbacks: (() => void)[] = [];
  let calibration: Calibration | null = needsCalibration
    ? new Calibration(() => {
      calibration = null;
      for (const fn of readyCallbacks.splice(0)) fn();
    })
    : null;

  // ---- local player: prediction ----
  const me = newPlayerState(0, 0, 0);
  let prev = { x: me.x, y: me.y, z: me.z };
  let alive = false;
  let gotSnapshot = false;
  let seq = 0;
  const pending: InputMsg[] = [];
  let lastMe: MeState | null = null;
  let lastSnapAt = performance.now();

  /** Applies a server snapshot: reset to the authoritative state, then replay unacked inputs. */
  const reconcile = (snap: SnapMsg) => {
    const m = snap.me;
    while (pending.length > 0 && pending[0]!.seq <= m.ack) pending.shift();
    const before = { x: me.x, y: me.y, z: me.z };
    me.x = m.x; me.y = m.y; me.z = m.z;
    me.vx = m.vx; me.vy = m.vy; me.vz = m.vz;
    me.onGround = m.onGround;
    if (m.alive) for (const cmd of pending) stepMovement(me, cmd, TICK_DT, solids);
    if (!gotSnapshot || Math.hypot(me.x - before.x, me.y - before.y, me.z - before.z) > SNAP_DISTANCE) {
      prev = { x: me.x, y: me.y, z: me.z };
    }
    gotSnapshot = true;
    alive = m.alive;
  };

  // ---- effects ----
  const tracers = new Tracers(scene);
  let shake = 0;
  let camKick = 0;

  /** Position of another player for sound placement, or undefined if unknown. */
  const posOf = (id: number) => {
    const p = remotes.eyeOf(id);
    return p ? { x: p.x, z: p.z } : undefined;
  };

  /** Reacts to one-off server events: visuals, sound, HUD and the feed. */
  const onEvent = (e: GameEvent) => {
    switch (e.k) {
      case 'spawn':
        if (e.id !== myId) break;
        pending.length = 0; // The server dropped its queue at spawn; old inputs must not be replayed.
        input.yaw = e.yaw;
        input.pitch = 0;
        break;
      case 'shot': {
        const to = new THREE.Vector3(e.ex, e.ey, e.ez);
        const fx = WEAPON_FX[e.w]!;
        let muzzle: THREE.Vector3 | null;
        if (e.id === myId) {
          muzzle = viewmodel.muzzleWorld(camera);
          viewmodel.fire(e.w);
          camKick += WEAPONS[e.w]!.recoil * 0.6;
          sfx.shot(e.w);
        } else {
          muzzle = remotes.muzzleOf(e.id) ?? remotes.eyeOf(e.id);
          // Other players' guns get a flash burst at the barrel in the weapon's colour.
          if (muzzle) particles.emit(muzzle.x, muzzle.y, muzzle.z, 6, fx.flashColor, 2 + fx.flashSize, fx.flashLife * 3, 0, undefined, 0.06);
          sfx.shot(e.w, posOf(e.id));
        }
        if (muzzle) {
          tracers.add(muzzle, to, fx);
          if (fx.smoke > 0) {
            // Your own smoke starts a little down the barrel line, or it would balloon over the camera.
            const at = e.id === myId ? muzzle.clone().add(to.clone().sub(muzzle).normalize().multiplyScalar(1.2)) : muzzle;
            particles.emit(at.x, at.y, at.z, fx.smoke, 0x8a8f99, 0.9, 0.9, -0.6, undefined, 0.16);
          }
        }
        // Impact: weapon-coloured sparks, plus blood puffs on players and paper bits for the shredder.
        particles.emit(e.ex, e.ey, e.ez, fx.impactCount, fx.impactColor, fx.impactSpeed, 0.35, 9);
        if (fx.impactBits > 0) particles.emit(e.ex, e.ey, e.ez, fx.impactBits, 0xffffff, 3, 0.8, 5, undefined, 0.05);
        if (e.hit === 'player') {
          particles.emit(e.ex, e.ey, e.ez, 12, 0xff4a4a, 3, 0.45, 9, undefined, 0.08);
        } else if (e.hit === 'world' && e.w === 3) {
          // The beam leaves a glowing scorch where it lands.
          if (particles.enabled) blasts.add(e.ex, e.ey, e.ez, 1.2, 0xff2a3a, 0.5);
        }
        break;
      }
      case 'hit':
        if (e.by === myId && e.to !== myId) {
          hud.hitMarker(e.head ? 'head' : 'hit');
          sfx.hitMarker(e.head ? 'head' : 'hit');
        }
        if (e.to === myId) {
          hud.hurt();
          sfx.hurt();
          const from = e.by !== myId ? remotes.eyeOf(e.by) : null;
          if (from) {
            // Angle of the attacker relative to where we face: 0 = ahead, positive = to the right.
            const dx = from.x - me.x, dz = from.z - me.z;
            const len = Math.hypot(dx, dz) || 1;
            const ahead = (dx * -Math.sin(input.yaw) + dz * -Math.cos(input.yaw)) / len;
            const right = (dx * Math.cos(input.yaw) + dz * -Math.sin(input.yaw)) / len;
            hud.damageFrom(Math.atan2(right, ahead));
          }
        }
        break;
      case 'kill': {
        // "X [weapon icon] Y"; a self-kill reads "X [icon] X".
        feed.push([who(e.by), { icon: e.w }, who(e.to)]);
        if (e.by === myId && e.to !== myId) {
          hud.hitMarker('kill');
          sfx.hitMarker('kill');
        }
        if (e.to === myId) sfx.death();
        // The victim bursts into cubes of their shirt colour.
        {
          const at = e.to === myId ? new THREE.Vector3(me.x, me.y + 1.1, me.z) : remotes.eyeOf(e.to)?.sub(new THREE.Vector3(0, 0.5, 0));
          const shirt = roster.find((p) => p.id === e.to)?.color ?? 0xcc3333;
          if (at && e.to !== myId) {
            particles.emit(at.x, at.y, at.z, 26, shirt, 5, 1.4, 14, new THREE.Vector3(0, 2.5, 0), 0.13);
            particles.emit(at.x, at.y, at.z, 10, 0xf1c9a5, 4, 1.2, 14, new THREE.Vector3(0, 2.5, 0), 0.1);
          }
        }
        break;
      }
      case 'reload':
        sfx.reload(e.id === myId ? undefined : posOf(e.id));
        break;
      case 'pickup':
        if (e.id === myId) sfx.pickup();
        break;
      case 'pk':
        pickups.setActive(e.i, e.on);
        break;
      case 'hole': {
        // Every player's hits arrive here, so everyone sees the same holes. A few grey chips fly off the surface.
        bulletHoles.add(e.x, e.y, e.z, e.a, e.s);
        const push = new THREE.Vector3(e.a === 0 ? e.s : 0, e.a === 1 ? e.s : 0, e.a === 2 ? e.s : 0).multiplyScalar(1.4);
        particles.emit(e.x, e.y, e.z, 3, 0x7a7f87, 1.6, 0.4, 9, push, 0.035);
        break;
      }
      case 'lootDrop':
        lootBags.add(e.id, e.x, e.y, e.z);
        // A little puff of brown and gold cubes where the bag lands.
        particles.emit(e.x, e.y + 0.3, e.z, 8, 0xc8a24a, 2.5, 0.6, 9, undefined, 0.07);
        break;
      case 'lootTake':
        if (e.by !== myId) break;
        sfx.pickup();
        feed.push(e.from === myId
          ? [who(e.by), { text: ' picked up their own ammo', tone: 'dim' }]
          : [who(e.by), { text: ' looted ', tone: 'dim' }, who(e.from), { text: "'s ammo", tone: 'dim' }]);
        break;
      case 'lootGone':
        lootBags.remove(e.id);
        break;
      case 'throw':
        if (e.id === myId) viewmodel.throwGrenade();
        sfx.throwGrenade(e.id === myId ? undefined : posOf(e.id));
        break;
      case 'boom': {
        const def = GRENADES[e.s]!;
        const frag = def.kind === 'frag';
        if (particles.enabled) blasts.add(e.x, e.y, e.z, def.radius, frag ? 0xff8a2a : 0xffffff, frag ? 0.45 : 0.3);
        if (frag) {
          particles.emit(e.x, e.y, e.z, 60, 0xffa040, 9, 0.8, 12, undefined, 0.16);
          particles.emit(e.x, e.y, e.z, 30, 0x9a7a55, 6, 1.1, 14, undefined, 0.2);
        } else {
          particles.emit(e.x, e.y, e.z, 36, 0xffffff, 7, 0.5, 3, undefined, 0.12);
          particles.emit(e.x, e.y, e.z, 18, 0xff4a4a, 5, 0.7, 3, undefined, 0.12);
        }
        sfx.boom(e.s, { x: e.x, z: e.z });
        const d = Math.hypot(e.x - me.x, e.y - (me.y + EYE_HEIGHT), e.z - me.z);
        if (frag && d < SHAKE_RANGE) shake = Math.max(shake, (1 - d / SHAKE_RANGE) * 0.07);
        break;
      }
      case 'matchEnd':
        if (e.winner < 0) {
          feed.push([{ text: 'Time is up: it is a draw!', tone: 'kill' }]);
          hud.banner('Draw!', 'Time is up and the top scores are tied');
        } else {
          feed.push([who(e.winner), { text: e.reason === 'time' ? ' won on time!' : ' won the match!', tone: 'kill' }]);
          hud.banner(`${e.winner === myId ? 'You' : (names.get(e.winner) ?? 'Someone')} won!`, e.reason === 'time' ? 'Time is up. Most kills wins.' : 'Next match starts shortly');
        }
        break;
      case 'door': {
        doors.setState(e.i, e.o, e.t);
        const def = doors.defs[e.i];
        if (def) sfx.door({ x: def.x, z: def.z });
        break;
      }
      case 'matchStart':
        doors.reset();
        bulletHoles.clear();
        feed.push([{ text: 'New match started' }]);
        hud.banner(null);
        break;
    }
  };

  net.on((msg) => {
    if (msg.t === 'roster') {
      remotes.setRoster(msg.players);
      onRoster(msg.players);
    } else if (msg.t === 'snap') {
      if (msg.doors) doors.applyWire(msg.doors, 0.08);
      msg.ev.forEach(onEvent);
      remotes.onSnapshot(msg.players, performance.now());
      grenadeVisuals.sync(msg.grenades);
      reconcile(msg);
      lastMe = msg.me;
      lastSnapAt = performance.now();
      hud.update(msg.me);
    }
  });

  // ---- main loop: fixed-step sim with render interpolation, so movement is frame-rate independent ----
  let last = performance.now();
  let acc = 0;
  let lastYaw = input.yaw;
  let lastPitch = input.pitch;
  let stepAcc = 0;
  let curFov = baseFov;
  let scoped = false;
  let fpsFrames = 0;
  let fpsTime = 0;

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // rAF timestamps can predate `last` (the map build blocks for a while), so never let dt go negative.
    const rawDt = (now - last) / 1000;
    const dt = Math.max(0, Math.min(rawDt, 0.1));
    calibration?.frame(rawDt, document.visibilityState === 'visible');
    acc += dt;
    last = now;
    while (acc >= TICK_DT) {
      prev = { x: me.x, y: me.y, z: me.z };
      const s = input.sample();
      const cmd: InputMsg = { t: 'input', seq: ++seq, ...s };
      net.send(cmd);
      if (gotSnapshot) {
        doors.step(TICK_DT, alive ? [me] : [], solids);
        if (alive) stepMovement(me, cmd, TICK_DT, solids);
        pending.push(cmd);
        if (pending.length > MAX_PENDING) pending.shift();
      }
      acc -= TICK_DT;
    }
    const a = acc / TICK_DT;
    const speed = Math.hypot(me.vx, me.vz);
    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
      if (settings.showFps) hud.fps(`${Math.round(fpsFrames / fpsTime)} FPS`);
      fpsFrames = 0;
      fpsTime = 0;
    }

    // First-person weapon: the aim blend drives zoom, scope and mouse sensitivity.
    let reloadFrac = 0;
    if (lastMe && lastMe.reload > 0) {
      const left = Math.max(0, lastMe.reload - ((now - lastSnapAt) / 1000) * TICK_RATE);
      reloadFrac = 1 - left / WEAPONS[lastMe.w]!.reloadTicks;
    }
    viewmodel.update(dt, {
      weapon: input.weapon, aiming: (input.keys & Key.Aim) !== 0, speed, onGround: me.onGround, reloadFrac, alive,
      yawRate: dt > 0 ? (input.yaw - lastYaw) / dt : 0, pitchRate: dt > 0 ? (input.pitch - lastPitch) / dt : 0,
      magEmpty: lastMe !== null && (lastMe.mag[input.weapon] ?? 1) === 0,
    });
    lastYaw = input.yaw;
    lastPitch = input.pitch;
    const zoom = 1 + (WEAPONS[input.weapon]!.zoom - 1) * viewmodel.aim;
    const fov = baseFov / zoom;
    if (Math.abs(fov - curFov) > 0.01) {
      curFov = fov;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    input.sensScale = fov / baseFov;
    const nowScoped = alive && input.weapon === 3 && viewmodel.aim > 0.85;
    if (nowScoped !== scoped) {
      scoped = nowScoped;
      hud.scope(scoped);
    }

    // Camera: interpolated position, view angles, recoil kick and explosion shake.
    shake *= Math.exp(-dt * 6);
    camKick *= Math.exp(-dt * 9);
    const eye = alive ? EYE_HEIGHT : 0.35;
    camera.position.set(
      prev.x + (me.x - prev.x) * a + (Math.random() - 0.5) * shake,
      prev.y + (me.y - prev.y) * a + eye + (Math.random() - 0.5) * shake,
      prev.z + (me.z - prev.z) * a + (Math.random() - 0.5) * shake,
    );
    camera.rotation.set((alive ? input.pitch : -0.3) + camKick + (Math.random() - 0.5) * shake * 0.5, input.yaw, 0);

    // Sound: the listener follows the camera; footsteps are by distance walked.
    sfx.setListener(camera.position.x, camera.position.z, input.yaw);
    if (alive && me.onGround && speed > 1.5) {
      stepAcc += speed * dt;
      if (stepAcc > STEP_LENGTH) {
        stepAcc = 0;
        sfx.step();
      }
    }

    if (input.scoreboard !== boardShown || (boardShown && boardDirty)) {
      boardShown = input.scoreboard;
      boardDirty = false;
      hud.scoreboard(boardShown, roster, myId);
    }

    remotes.update(now, dt);
    particles.update(dt);
    blasts.update(dt);
    grenadeVisuals.update(dt);
    pickups.update(now / 1000);
    bulletHoles.update(dt);
    lootBags.update(now / 1000);
    doorVisuals.update(dt);
    tracers.update(dt);
    world.update(now / 1000);
    dust.update(camera.position, now / 1000);
    fx.render();
  };
  requestAnimationFrame(frame);

  return {
    unlockAudio: () => sfx.unlock(),
    whenReady: (fn) => {
      if (calibration) readyCallbacks.push(fn);
      else fn();
    },
  };
}
