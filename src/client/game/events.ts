/**
 * Turns the server's one-off events (shots, hits, kills, pickups, explosions, door toggles, match flow)
 * into particles, sound, HUD feedback, feed lines and camera kicks.
 */
import * as THREE from 'three';
import { EYE_HEIGHT } from '@shared/core/constants';
import type { GameEvent } from '@shared/net/protocol';
import { GRENADES, WEAPONS } from '@shared/rules/weapons';
import type { Feed } from '@client/hud/feed';
import type { Hud } from '@client/hud/hud';
import type { Input } from '@client/platform/input';
import { WEAPON_FX } from '@client/render/weapon-fx';
import type { LocalPlayer } from './prediction';
import type { RosterTracker } from './roster';
import type { SceneHandle } from './scene';

/** Explosions closer than this (m) shake the camera. */
const SHAKE_RANGE = 16;

/** Camera effects that events trigger and the frame loop decays. */
export interface CameraFx {
  /** Random jitter amplitude from nearby explosions. */
  shake: number;
  /** Upward kick from recoil (radians). */
  kick: number;
}

/** Everything the handler reacts with. */
export interface EventDeps {
  myId: number;
  scene: SceneHandle;
  local: LocalPlayer;
  input: Input;
  hud: Hud;
  feed: Feed;
  roster: RosterTracker;
  camFx: CameraFx;
}

/**
 * Builds the handler for server events.
 * @returns A function to call once per event, in order.
 */
export function createEventHandler(d: EventDeps): (e: GameEvent) => void {
  const { myId, scene, local, input, hud, feed, roster, camFx } = d;
  const { camera, viewmodel, remotes, particles, blasts, pickups, lootBags, bulletHoles, tracers, doors, sfx } = scene;
  const me = local.me;
  const who = (id: number) => roster.who(id);

  /** Position of another player for sound placement, or undefined if unknown. */
  const posOf = (id: number) => {
    const p = remotes.eyeOf(id);
    return p ? { x: p.x, z: p.z } : undefined;
  };

  return (e) => {
    switch (e.k) {
      case 'spawn':
        if (e.id !== myId) break;
        local.onSpawn();
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
          camFx.kick += WEAPONS[e.w]!.recoil * 0.6;
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
          const shirt = roster.colorOf(e.to) ?? 0xcc3333;
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
        const dist = Math.hypot(e.x - me.x, e.y - (me.y + EYE_HEIGHT), e.z - me.z);
        if (frag && dist < SHAKE_RANGE) camFx.shake = Math.max(camFx.shake, (1 - dist / SHAKE_RANGE) * 0.07);
        break;
      }
      case 'matchEnd':
        if (e.winner < 0) {
          feed.push([{ text: 'Time is up: it is a draw!', tone: 'kill' }]);
          hud.banner('Draw!', 'Time is up and the top scores are tied');
        } else {
          feed.push([who(e.winner), { text: e.reason === 'time' ? ' won on time!' : ' won the match!', tone: 'kill' }]);
          hud.banner(`${e.winner === myId ? 'You' : (roster.nameOf(e.winner) ?? 'Someone')} won!`, e.reason === 'time' ? 'Time is up. Most kills wins.' : 'Next match starts shortly');
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
}
