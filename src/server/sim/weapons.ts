/**
 * Weapon system: trigger handling, reloads, weapon switching and hitscan shots (spread, falloff,
 * headshots, bullet-hole events). All numbers come from the tables in `shared/rules/weapons.ts`.
 */
import { EYE_HEIGHT, Key, SWITCH_TICKS } from '@shared/core/constants';
import { lookDir } from '@shared/core/physics';
import { MAX_RANGE, WEAPONS, type WeaponDef } from '@shared/rules/weapons';
import { castRay, type Target } from './combat';
import { damage } from './damage';
import { useDoor } from './doors';
import { throwGrenade } from './grenades';
import type { Player } from './player';
import { useSpray } from './spray';
import type { Sim } from './state';
import { round2 } from './util';

/** Reload completion, trigger handling and grenade throws for one living player. */
export function tickWeapons(sim: Sim, p: Player): void {
  const cmd = p.lastCmd;
  if (!cmd) return;
  const keys = cmd.keys;

  if (p.reloadEnd && sim.tick >= p.reloadEnd) {
    const w = WEAPONS[p.weapon]!;
    const take = Math.min(w.magSize - p.mag[p.weapon]!, p.reserve[p.weapon]!);
    p.mag[p.weapon]! += take;
    p.reserve[p.weapon]! -= take;
    p.reloadEnd = 0;
  }

  // Using a door works any time you are alive, even between matches.
  if ((keys & Key.Interact) !== 0 && (p.prevKeys & Key.Interact) === 0) useDoor(sim, p);

  if (sim.phase !== 'play') {
    p.prevKeys = keys;
    return;
  }

  if (cmd.weapon !== p.weapon) {
    p.weapon = cmd.weapon;
    p.reloadEnd = 0;
    p.fireLatch = false;
    p.nextFire = Math.max(p.nextFire, sim.tick + SWITCH_TICKS);
  }
  const w = WEAPONS[p.weapon]!;

  const pressed = (bit: number) => (keys & bit) !== 0 && (p.prevKeys & bit) === 0;
  if (pressed(Key.Reload)) startReload(sim, p);
  if (pressed(Key.Fire)) p.fireLatch = true;
  if (!(keys & Key.Fire)) p.fireLatch = false;
  const wantsFire = w.auto ? (keys & Key.Fire) !== 0 : p.fireLatch;
  if (wantsFire && sim.tick >= p.nextFire && !p.reloadEnd) {
    if (p.mag[p.weapon]! <= 0) startReload(sim, p);
    else fire(sim, p, w, (keys & Key.Aim) !== 0);
  }

  if (pressed(Key.Grenade1)) throwGrenade(sim, p, 0);
  if (pressed(Key.Grenade2)) throwGrenade(sim, p, 1);
  if (pressed(Key.Spray)) useSpray(sim, p);
  p.prevKeys = keys;
}

/** Begins a reload if there is room in the magazine and spare ammo. */
function startReload(sim: Sim, p: Player): void {
  const w = WEAPONS[p.weapon]!;
  if (p.reloadEnd || p.mag[p.weapon]! >= w.magSize || p.reserve[p.weapon]! <= 0) return;
  p.reloadEnd = sim.tick + w.reloadTicks;
  sim.events.push({ k: 'reload', id: p.id });
}

/** Fires one shot: spends a round and resolves every pellet against world and players. */
function fire(sim: Sim, p: Player, w: WeaponDef, aiming: boolean): void {
  p.mag[p.weapon]!--;
  p.nextFire = sim.tick + w.interval;
  p.fireLatch = false;

  const ox = p.state.x, oy = p.state.y + EYE_HEIGHT, oz = p.state.z;
  const base = lookDir(p.state.yaw, p.state.pitch);
  const spread = aiming ? w.aimSpread : w.spread;
  const targets: Target[] = [];
  for (const o of sim.players.values()) if (o !== p && o.alive) targets.push({ id: o.id, ...o.state });

  const dealt = new Map<number, { dmg: number; head: boolean }>();
  let endX = 0, endY = 0, endZ = 0;
  let firstKind: 'none' | 'world' | 'player' = 'none';
  for (let i = 0; i < w.pellets; i++) {
    const [dx, dy, dz] = perturb(sim.rng, base, spread);
    const hit = castRay(sim.solids, targets, ox, oy, oz, dx, dy, dz, MAX_RANGE);
    if (i === 0) {
      endX = ox + dx * hit.t; endY = oy + dy * hit.t; endZ = oz + dz * hit.t;
      firstKind = hit.player >= 0 ? 'player' : hit.t < MAX_RANGE ? 'world' : 'none';
    }
    if (hit.player < 0) {
      // A bullet that struck a surface leaves a hole there; the event goes to everyone in the room.
      if (hit.axis >= 0 && hit.t < MAX_RANGE) {
        sim.events.push({ k: 'hole', x: round2(ox + dx * hit.t), y: round2(oy + dy * hit.t), z: round2(oz + dz * hit.t), a: hit.axis, s: hit.sign });
      }
      continue;
    }
    const fall = hit.t <= w.falloffStart ? 1
      : hit.t >= w.falloffEnd ? w.minMul
        : 1 - (1 - w.minMul) * ((hit.t - w.falloffStart) / (w.falloffEnd - w.falloffStart));
    const dmg = w.damage * fall * (hit.head ? w.headMul : 1);
    const prev = dealt.get(hit.player) ?? { dmg: 0, head: false };
    dealt.set(hit.player, { dmg: prev.dmg + dmg, head: prev.head || hit.head });
  }
  sim.events.push({ k: 'shot', id: p.id, w: p.weapon, ex: round2(endX), ey: round2(endY), ez: round2(endZ), hit: firstKind });
  for (const [id, d] of dealt) {
    const victim = sim.players.get(id);
    if (victim) damage(sim, victim, d.dmg, p, p.weapon, d.head);
  }
}

/** Random direction inside a cone of half-angle `spread` around `dir`. */
function perturb(rng: () => number, dir: readonly [number, number, number], spread: number): [number, number, number] {
  if (spread <= 0) return [dir[0], dir[1], dir[2]];
  // Orthonormal basis (r, u) perpendicular to dir; fall back to X when looking straight up/down.
  let rx = dir[2], ry = 0, rz = -dir[0];
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-6) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
  const ux = dir[1] * rz - dir[2] * ry;
  const uy = dir[2] * rx - dir[0] * rz;
  const uz = dir[0] * ry - dir[1] * rx;
  const ang = rng() * Math.PI * 2;
  const rad = Math.tan(spread) * Math.sqrt(rng());
  const a = Math.cos(ang) * rad, b = Math.sin(ang) * rad;
  const x = dir[0] + rx * a + ux * b;
  const y = dir[1] + ry * a + uy * b;
  const z = dir[2] + rz * a + uz * b;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
