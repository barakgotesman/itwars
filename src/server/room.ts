/**
 * One match: the authoritative simulation for up to `MAX_PLAYERS` players. Driven by `step()` at 60 Hz;
 * snapshots go out every `SNAPSHOT_EVERY` ticks through each player's `Conn`.
 */
import { PLAYER_COLORS } from '../shared/characters';
import {
  CHEST_Y, EYE_HEIGHT, INTERMISSION_TICKS, MAX_HP, MAX_NAME_LEN, MAX_PLAYERS, RESPAWN_TICKS, TICK_RATE,
  SNAPSHOT_EVERY, SPAWN_PROTECT_TICKS, SWITCH_TICKS, THROW_COOLDOWN_TICKS, TICK_DT, Key,
} from '../shared/constants';
import { Doors } from '../shared/doors';
import { SOLIDS, SPAWNS, PICKUP_SPOTS } from '../shared/map';
import { DOORS, type DoorDef } from '../shared/map/doors';
import { DEFAULT_RULES, type MatchRules } from '../shared/modes';
import { lookDir, newPlayerState, stepMovement, type Aabb, type InputCmd, type PlayerState } from '../shared/physics';
import type {
  GameEvent, InputMsg, MeState, PlayerInfo, S2C, SnapGrenade, SnapPlayer,
} from '../shared/protocol';
import {
  FRAG_MIN_MUL, GRENADES, LOOT_FRACTION, LOOT_LIFETIME_TICKS, LOOT_RADIUS, MAX_LOOT, MAX_RANGE, PICKUP_DEFS, SELF_DAMAGE_MUL, START_RESERVE_FRACTION, WEAPONS,
  type PickupKind, type WeaponDef,
} from '../shared/weapons';
import { castRay, explosionSeesPlayer, stepProjectile, type Projectile, type Target } from './combat';

/** Where a room sends its messages; the network layer or a test supplies it. */
export interface Conn {
  /** Delivers one message to the player. */
  send(msg: S2C): void;
}

/** Longest input backlog kept per player; older inputs are dropped when exceeded. */
const MAX_QUEUE = 12;
/** Most spare steps a player can bank by starving, to catch up after jitter without speed-hacking. */
const MAX_CATCHUP_CREDIT = 3;

/** Full server-side player record. */
interface Player {
  id: number;
  name: string;
  model: number;
  color: number;
  conn: Conn;
  state: PlayerState;
  hp: number;
  alive: boolean;
  /** False until the player enters the map; lobby players are not spawned, drawn, hit or able to pick things up. */
  playing: boolean;
  kills: number;
  deaths: number;
  weapon: number;
  mag: number[];
  reserve: number[];
  gren: number[];
  /** Tick the current reload completes, 0 when not reloading. */
  reloadEnd: number;
  nextFire: number;
  nextThrow: number;
  /** Semi-auto trigger pull waiting for the weapon to be ready. */
  fireLatch: boolean;
  protectUntil: number;
  respawnAt: number;
  blindEnd: number;
  blindMax: number;
  queue: InputMsg[];
  lastCmd: InputMsg | null;
  prevKeys: number;
  ack: number;
  credit: number;
}

/** A dead player's ammo lying on the floor, waiting to be looted. */
interface Loot {
  id: number;
  from: number;
  x: number; y: number; z: number;
  /** Rounds left per weapon (magazine plus reserve when dropped). */
  ammo: number[];
  /** Grenades left per slot. */
  gren: number[];
  expiresAt: number;
}

/** A grenade in flight. */
interface Grenade extends Projectile {
  id: number;
  slot: number;
  owner: number;
  explodeAt: number;
}

/** Construction options; tests use them for determinism and custom maps. */
export interface RoomOptions {
  /** The host's match rules; defaults to Deathmatch to 50 with no time limit. */
  rules?: MatchRules;
  /** Seed for the room's random numbers (spread, spawn colours). */
  seed?: number;
  /** Collision geometry; defaults to the office. */
  solids?: readonly Aabb[];
  /** Spawn points as `[x, z]`; defaults to the office spawns. */
  spawns?: readonly (readonly [number, number])[];
  /** Sliding doors; defaults to the office doors, or none when custom `solids` are given. */
  doors?: readonly DoorDef[];
  /** Pickup spots; defaults to the office pickups. */
  pickups?: readonly { kind: PickupKind; x: number; z: number }[];
}

/** Small fast seeded PRNG (mulberry32). */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The authoritative game simulation for one room. */
export class Room {
  /** Four-character join code. */
  readonly code: string;
  /** Mode, kill limit and time limit for every match in this room. */
  readonly rules: MatchRules;
  /** Current tick; all timers are integer ticks. */
  tick = 0;
  /** `play` during a round, `over` during the intermission. */
  phase: 'play' | 'over' = 'play';
  /** Id of the last round's winner, or -1. */
  winner = -1;

  private readonly players = new Map<number, Player>();
  private readonly solids: readonly Aabb[];
  /** Sliding doors; their collision boxes are part of `solids` and move in place. */
  private readonly doors: Doors;
  /** A door moved since the last snapshot, so the next one carries door states. */
  private doorsDirty = false;
  /** Tick at which the match clock runs out, or 0 while it is not running (no limit, or waiting for a second player). */
  private endsAt = 0;
  private readonly spawns: readonly (readonly [number, number])[];
  private readonly spots: readonly { kind: PickupKind; x: number; z: number }[];
  /** Tick each pickup becomes active again (0 = active now). */
  private readonly pickupReady: number[];
  private grenades: Grenade[] = [];
  private loot: Loot[] = [];
  private nextLootId = 1;
  private events: GameEvent[] = [];
  private nextPlayerId = 1;
  private nextGrenadeId = 1;
  private restartAt = 0;
  private rosterDirty = false;
  private readonly rng: () => number;

  /**
   * @param code - The room's join code.
   * @param opts - Optional seed and map overrides (for tests).
   */
  constructor(code: string, opts: RoomOptions = {}) {
    this.code = code;
    this.rng = makeRng(opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.rules = opts.rules ?? DEFAULT_RULES;
    this.doors = new Doors(opts.doors ?? (opts.solids ? [] : DOORS));
    this.solids = [...(opts.solids ?? SOLIDS), ...this.doors.boxes];
    this.spawns = opts.spawns ?? SPAWNS;
    this.spots = opts.pickups ?? PICKUP_SPOTS;
    this.pickupReady = this.spots.map(() => 0);
  }

  /** Number of players currently in the room. */
  get size(): number {
    return this.players.size;
  }

  /** True when nobody is in the room (it should be deleted). */
  get isEmpty(): boolean {
    return this.players.size === 0;
  }

  /** True when no more players fit. */
  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  /**
   * Adds a player, spawns them and tells everyone.
   * @param conn - Where to send this player's messages.
   * @param name - Already-sanitised callsign.
   * @param look - Chosen character style and colour index (-1 or omitted = random colour).
   * @returns The new player's id, or null if the room is full.
   */
  join(conn: Conn, name: string, look: { model?: number; color?: number } = {}): number | null {
    if (this.isFull) return null;
    const id = this.nextPlayerId++;
    const p: Player = {
      id, name: this.uniqueName(name), conn, model: look.model ?? 0,
      color: PLAYER_COLORS[look.color ?? -1] ?? PLAYER_COLORS[Math.floor(this.rng() * PLAYER_COLORS.length)]!,
      state: newPlayerState(0, 0, 0), hp: MAX_HP, alive: false, playing: false, kills: 0, deaths: 0, weapon: 1,
      mag: [], reserve: [], gren: [], reloadEnd: 0, nextFire: 0, nextThrow: 0, fireLatch: false,
      protectUntil: 0, respawnAt: 0, blindEnd: 0, blindMax: 0, queue: [], lastCmd: null, prevKeys: 0,
      ack: 0, credit: 0,
    };
    this.players.set(id, p);
    conn.send({
      t: 'joined', id, code: this.code, players: this.roster(), tick: this.tick,
      pickups: this.pickupReady.map((r) => (r <= this.tick ? '1' : '0')).join(''),
      loot: this.loot.map((l) => ({ id: l.id, from: l.from, x: l.x, y: l.y, z: l.z })),
      doors: this.doors.wire(),
      rules: this.rules,
    });
    this.rosterDirty = true;
    return id;
  }

  /**
   * Moves a player from the room lobby into the match (they clicked "Enter the office").
   * @param id - Player id from `join`.
   * @remarks During the intermission they wait and are spawned by the restart with everyone else.
   */
  enter(id: number): void {
    const p = this.players.get(id);
    if (!p || p.playing) return;
    p.playing = true;
    if (this.phase === 'play') this.spawn(p);
    this.startClockIfReady();
  }

  /** Appends a number if another player already uses the name, so the scoreboard stays unambiguous. */
  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
      const suffix = ` ${n}`;
      candidate = name.slice(0, MAX_NAME_LEN - suffix.length) + suffix;
    }
    return candidate;
  }

  /**
   * Removes a player; their grenades stay live.
   * @param id - Player id from `join`.
   */
  leave(id: number): void {
    if (this.players.delete(id)) this.rosterDirty = true;
  }

  /**
   * Queues one validated input command for the next ticks.
   * @param id - Sender's player id.
   * @param msg - Validated input message.
   */
  input(id: number, msg: InputMsg): void {
    const p = this.players.get(id);
    if (!p) return;
    p.queue.push(msg);
    if (p.queue.length > MAX_QUEUE) p.queue.splice(0, p.queue.length - MAX_QUEUE);
  }

  /** Read-only view of a player's state, for tests and diagnostics. */
  inspect(id: number): Readonly<Player> | undefined {
    return this.players.get(id);
  }

  /** Advances the simulation by one tick and sends snapshots when due. */
  step(): void {
    this.tick++;
    if (this.phase === 'over' && this.tick >= this.restartAt) this.restartMatch();

    this.stepDoors();
    if (this.phase === 'play' && this.endsAt > 0 && this.tick >= this.endsAt) this.endByTime();
    for (const p of this.players.values()) {
      this.applyInputs(p);
      if (p.playing && !p.alive && this.phase === 'play' && this.tick >= p.respawnAt) this.spawn(p);
      if (p.alive) this.tickWeapons(p);
    }
    this.tickPickups();
    this.tickLoot();
    this.tickGrenades();

    if (this.rosterDirty) {
      this.rosterDirty = false;
      const roster = this.roster();
      for (const p of this.players.values()) p.conn.send({ t: 'roster', players: roster });
    }
    if (this.tick % SNAPSHOT_EVERY === 0) this.sendSnapshots();
  }

  // ---- input and movement ----

  /**
   * Consumes this tick's input(s). One per tick, plus one banked catch-up step if the player
   * starved earlier, so long-run speed can never exceed the tick rate.
   */
  private applyInputs(p: Player): void {
    if (p.queue.length === 0) {
      p.credit = Math.min(p.credit + 1, MAX_CATCHUP_CREDIT);
      return;
    }
    let steps = 1;
    if (p.queue.length > 1 && p.credit > 0) {
      steps = 2;
      p.credit--;
    }
    for (let i = 0; i < steps; i++) {
      const msg = p.queue.shift();
      if (!msg) break;
      p.lastCmd = msg;
      p.ack = msg.seq;
      if (p.alive) stepMovement(p.state, msg as InputCmd, TICK_DT, this.solids);
    }
  }

  // ---- weapons ----

  /** Reload completion, trigger handling and grenade throws for one living player. */
  private tickWeapons(p: Player): void {
    const cmd = p.lastCmd;
    if (!cmd) return;
    const keys = cmd.keys;

    if (p.reloadEnd && this.tick >= p.reloadEnd) {
      const w = WEAPONS[p.weapon]!;
      const take = Math.min(w.magSize - p.mag[p.weapon]!, p.reserve[p.weapon]!);
      p.mag[p.weapon]! += take;
      p.reserve[p.weapon]! -= take;
      p.reloadEnd = 0;
    }

    // Using a door works any time you are alive, even between matches.
    if ((keys & Key.Interact) !== 0 && (p.prevKeys & Key.Interact) === 0) this.useDoor(p);

    if (this.phase !== 'play') {
      p.prevKeys = keys;
      return;
    }

    if (cmd.weapon !== p.weapon) {
      p.weapon = cmd.weapon;
      p.reloadEnd = 0;
      p.fireLatch = false;
      p.nextFire = Math.max(p.nextFire, this.tick + SWITCH_TICKS);
    }
    const w = WEAPONS[p.weapon]!;

    const pressed = (bit: number) => (keys & bit) !== 0 && (p.prevKeys & bit) === 0;
    if (pressed(Key.Reload)) this.startReload(p);
    if (pressed(Key.Fire)) p.fireLatch = true;
    if (!(keys & Key.Fire)) p.fireLatch = false;
    const wantsFire = w.auto ? (keys & Key.Fire) !== 0 : p.fireLatch;
    if (wantsFire && this.tick >= p.nextFire && !p.reloadEnd) {
      if (p.mag[p.weapon]! <= 0) this.startReload(p);
      else this.fire(p, w, (keys & Key.Aim) !== 0);
    }

    if (pressed(Key.Grenade1)) this.throwGrenade(p, 0);
    if (pressed(Key.Grenade2)) this.throwGrenade(p, 1);
    p.prevKeys = keys;
  }

  // ---- doors ----

  /** Moves the doors one tick, pushing players out of their way, and flags a snapshot to carry the new state. */
  private stepDoors(): void {
    const bodies = [...this.players.values()].filter((p) => p.alive).map((p) => p.state);
    if (this.doors.step(TICK_DT, bodies, this.solids) || this.doors.moving) this.doorsDirty = true;
  }

  /** Opens or closes the door the player is facing, if any, and tells everyone. */
  private useDoor(p: Player): void {
    const i = this.doors.pick(p.state.x, p.state.z, p.state.yaw);
    if (i < 0 || !this.doors.toggle(i)) return;
    const s = this.doors.states[i]!;
    this.events.push({ k: 'door', i, o: Math.round(s.open * 100), t: Math.round(s.target * 100) });
    this.doorsDirty = true;
  }

  /** Begins a reload if there is room in the magazine and spare ammo. */
  private startReload(p: Player): void {
    const w = WEAPONS[p.weapon]!;
    if (p.reloadEnd || p.mag[p.weapon]! >= w.magSize || p.reserve[p.weapon]! <= 0) return;
    p.reloadEnd = this.tick + w.reloadTicks;
    this.events.push({ k: 'reload', id: p.id });
  }

  /** Fires one shot: spends a round and resolves every pellet against world and players. */
  private fire(p: Player, w: WeaponDef, aiming: boolean): void {
    p.mag[p.weapon]!--;
    p.nextFire = this.tick + w.interval;
    p.fireLatch = false;

    const ox = p.state.x, oy = p.state.y + EYE_HEIGHT, oz = p.state.z;
    const base = lookDir(p.state.yaw, p.state.pitch);
    const spread = aiming ? w.aimSpread : w.spread;
    const targets: Target[] = [];
    for (const o of this.players.values()) if (o !== p && o.alive) targets.push({ id: o.id, ...o.state });

    const dealt = new Map<number, { dmg: number; head: boolean }>();
    let endX = 0, endY = 0, endZ = 0;
    let firstKind: 'none' | 'world' | 'player' = 'none';
    for (let i = 0; i < w.pellets; i++) {
      const [dx, dy, dz] = this.perturb(base, spread);
      const hit = castRay(this.solids, targets, ox, oy, oz, dx, dy, dz, MAX_RANGE);
      if (i === 0) {
        endX = ox + dx * hit.t; endY = oy + dy * hit.t; endZ = oz + dz * hit.t;
        firstKind = hit.player >= 0 ? 'player' : hit.t < MAX_RANGE ? 'world' : 'none';
      }
      if (hit.player < 0) {
        // A bullet that struck a surface leaves a hole there; the event goes to everyone in the room.
        if (hit.axis >= 0 && hit.t < MAX_RANGE) {
          this.events.push({ k: 'hole', x: round2(ox + dx * hit.t), y: round2(oy + dy * hit.t), z: round2(oz + dz * hit.t), a: hit.axis, s: hit.sign });
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
    this.events.push({ k: 'shot', id: p.id, w: p.weapon, ex: round2(endX), ey: round2(endY), ez: round2(endZ), hit: firstKind });
    for (const [id, d] of dealt) {
      const victim = this.players.get(id);
      if (victim) this.damage(victim, d.dmg, p, p.weapon, d.head);
    }
  }

  /** Random direction inside a cone of half-angle `spread` around `dir`. */
  private perturb(dir: readonly [number, number, number], spread: number): [number, number, number] {
    if (spread <= 0) return [dir[0], dir[1], dir[2]];
    // Orthonormal basis (r, u) perpendicular to dir; fall back to X when looking straight up/down.
    let rx = dir[2], ry = 0, rz = -dir[0];
    const rl = Math.hypot(rx, rz);
    if (rl < 1e-6) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
    const ux = dir[1] * rz - dir[2] * ry;
    const uy = dir[2] * rx - dir[0] * rz;
    const uz = dir[0] * ry - dir[1] * rx;
    const ang = this.rng() * Math.PI * 2;
    const rad = Math.tan(spread) * Math.sqrt(this.rng());
    const a = Math.cos(ang) * rad, b = Math.sin(ang) * rad;
    const x = dir[0] + rx * a + ux * b;
    const y = dir[1] + ry * a + uy * b;
    const z = dir[2] + rz * a + uz * b;
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  }

  /**
   * Applies damage, handling spawn protection, kills and the win check.
   * @param attacker - Who dealt it (a victim hitting themselves counts as a suicide).
   * @param weapon - Weapon index, or `'frag'` for explosions.
   */
  private damage(victim: Player, amount: number, attacker: Player, weapon: number | 'frag', head: boolean): void {
    if (this.phase !== 'play' || !victim.alive || this.tick < victim.protectUntil) return;
    const dmg = Math.max(1, Math.round(amount));
    victim.hp = Math.max(0, victim.hp - dmg);
    this.events.push({ k: 'hit', by: attacker.id, to: victim.id, dmg, head });
    if (victim.hp > 0) return;

    victim.alive = false;
    victim.deaths++;
    victim.respawnAt = this.tick + RESPAWN_TICKS;
    this.dropLoot(victim);
    victim.reloadEnd = 0;
    if (attacker !== victim) attacker.kills++;
    this.rosterDirty = true;
    this.events.push({ k: 'kill', by: attacker.id, to: victim.id, w: weapon });
    if (attacker !== victim && attacker.kills >= this.rules.killLimit) this.endMatch(attacker.id, 'kills');
  }

  /** Ends the match and starts the intermission. @param winner - Winning player's id, or -1 for a draw. */
  private endMatch(winner: number, reason: 'kills' | 'time'): void {
    this.phase = 'over';
    this.winner = winner;
    this.endsAt = 0;
    this.restartAt = this.tick + INTERMISSION_TICKS;
    this.events.push({ k: 'matchEnd', winner, restartIn: INTERMISSION_TICKS, reason });
  }

  /** The time limit ran out: the player with the most kills wins; a tie for first is a draw. */
  private endByTime(): void {
    let best = -1;
    let winner = -1;
    for (const p of this.players.values()) {
      if (!p.playing) continue;
      if (p.kills > best) {
        best = p.kills;
        winner = p.id;
      } else if (p.kills === best) {
        winner = -1;
      }
    }
    this.endMatch(winner, 'time');
  }

  /** Starts the match clock once there is a game on: a time limit is set and two players are in the match. */
  private startClockIfReady(): void {
    if (this.rules.timeLimitMin <= 0 || this.endsAt > 0 || this.phase !== 'play') return;
    let playing = 0;
    for (const p of this.players.values()) if (p.playing) playing++;
    if (playing >= 2) this.endsAt = this.tick + this.rules.timeLimitMin * 60 * TICK_RATE;
  }

  /** Seconds left for the HUD: -1 without a time limit, the full limit while the clock waits, 0 after the match ends. */
  private timeLeft(): number {
    if (this.rules.timeLimitMin <= 0) return -1;
    if (this.phase === 'over') return 0;
    if (this.endsAt === 0) return this.rules.timeLimitMin * 60;
    return Math.max(0, Math.ceil((this.endsAt - this.tick) / TICK_RATE));
  }

  // ---- grenades ----

  /** Throws a grenade from the given slot if the player has one and is off cooldown. */
  private throwGrenade(p: Player, slot: number): void {
    if (p.gren[slot]! <= 0 || this.tick < p.nextThrow) return;
    const def = GRENADES[slot]!;
    p.gren[slot]!--;
    p.nextThrow = this.tick + THROW_COOLDOWN_TICKS;
    // Aim a little above the crosshair, like a lobbed throw.
    const [dx, dy, dz] = lookDir(p.state.yaw, p.state.pitch);
    const ay = dy + 0.2;
    const l = Math.hypot(dx, ay, dz);
    this.grenades.push({
      id: this.nextGrenadeId++, slot, owner: p.id,
      x: p.state.x, y: p.state.y + EYE_HEIGHT, z: p.state.z,
      vx: (dx / l) * def.speed + p.state.vx * def.inheritVel,
      vy: (ay / l) * def.speed + p.state.vy * def.inheritVel,
      vz: (dz / l) * def.speed + p.state.vz * def.inheritVel,
      explodeAt: this.tick + def.fuseTicks,
    });
    this.events.push({ k: 'throw', id: p.id, s: slot });
  }

  /** Moves live grenades and detonates the ones whose fuse ran out. */
  private tickGrenades(): void {
    if (this.grenades.length === 0) return;
    const alive: Grenade[] = [];
    for (const g of this.grenades) {
      stepProjectile(g, GRENADES[g.slot]!, TICK_DT, this.solids);
      if (this.tick >= g.explodeAt) this.explode(g);
      else alive.push(g);
    }
    this.grenades = alive;
  }

  /** Resolves a detonation: frag damage or flash blindness for everyone in range with line of sight. */
  private explode(g: Grenade): void {
    const def = GRENADES[g.slot]!;
    this.events.push({ k: 'boom', s: g.slot, x: round2(g.x), y: round2(g.y), z: round2(g.z) });
    const owner = this.players.get(g.owner);
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const cx = p.state.x, cy = p.state.y + CHEST_Y, cz = p.state.z;
      const dist = Math.hypot(cx - g.x, cy - g.y, cz - g.z);
      if (dist >= def.radius || !explosionSeesPlayer(this.solids, g.x, g.y, g.z, { id: p.id, ...p.state })) continue;
      const falloff = 1 - dist / def.radius;
      if (def.kind === 'frag') {
        const mul = Math.max(FRAG_MIN_MUL, falloff) * (p.id === g.owner ? SELF_DAMAGE_MUL : 1);
        this.damage(p, def.damage * mul, owner ?? p, 'frag', false);
      } else {
        // Looking at the blast hurts most; a flash behind you still dazzles a bit.
        const [lx, ly, lz] = lookDir(p.state.yaw, p.state.pitch);
        const facing = dist > 1e-6 ? (lx * (g.x - cx) + ly * (g.y - cy) + lz * (g.z - cz)) / dist : 1;
        const ticks = Math.round(def.blindTicks * falloff * (0.3 + 0.7 * Math.max(0, facing)));
        if (ticks > 0 && this.tick + ticks > p.blindEnd) {
          p.blindEnd = this.tick + ticks;
          p.blindMax = ticks;
        }
      }
    }
  }

  // ---- pickups ----

  /** Re-enables pickups whose timer ran out and lets living players collect nearby ones. */
  private tickPickups(): void {
    this.spots.forEach((s, i) => {
      const ready = this.pickupReady[i]!;
      if (ready === this.tick) this.events.push({ k: 'pk', i, on: true });
      if (ready > this.tick) return;
      const def = PICKUP_DEFS[s.kind];
      for (const p of this.players.values()) {
        if (!p.alive || Math.abs(p.state.y) > 1.6) continue;
        if (Math.hypot(p.state.x - s.x, p.state.z - s.z) > def.radius) continue;
        if (!this.applyPickup(p, s.kind)) continue;
        this.pickupReady[i] = this.tick + def.respawnTicks;
        this.events.push({ k: 'pickup', id: p.id, i, kind: s.kind }, { k: 'pk', i, on: false });
        break;
      }
    });
  }

  /** Gives a pickup's contents to a player. @returns False if they could not use it (so it stays). */
  private applyPickup(p: Player, kind: PickupKind): boolean {
    const def = PICKUP_DEFS[kind];
    if (kind === 'hp') {
      if (p.hp >= MAX_HP) return false;
      p.hp = Math.min(MAX_HP, p.hp + def.amount);
      return true;
    }
    if (kind === 'ammo') {
      if (WEAPONS.every((w, i) => p.reserve[i]! >= w.maxReserve)) return false;
      WEAPONS.forEach((w, i) => {
        p.reserve[i] = Math.min(w.maxReserve, p.reserve[i]! + Math.ceil(w.maxReserve * def.amount));
      });
      return true;
    }
    if (GRENADES.every((g, i) => p.gren[i]! >= g.maxCarry)) return false;
    GRENADES.forEach((g, i) => {
      p.gren[i] = Math.min(g.maxCarry, p.gren[i]! + def.amount);
    });
    return true;
  }

  // ---- loot ----

  /** Leaves a bag with a share (`LOOT_FRACTION`) of what the victim was carrying, where they died. */
  private dropLoot(victim: Player): void {
    const ammo = WEAPONS.map((_, i) => Math.floor(((victim.mag[i] ?? 0) + (victim.reserve[i] ?? 0)) * LOOT_FRACTION));
    const gren = GRENADES.map((_, i) => Math.ceil((victim.gren[i] ?? 0) * LOOT_FRACTION));
    if (ammo.every((n) => n === 0) && gren.every((n) => n === 0)) return;
    const s = victim.state;
    const bag: Loot = { id: this.nextLootId++, from: victim.id, x: s.x, y: s.y, z: s.z, ammo, gren, expiresAt: this.tick + LOOT_LIFETIME_TICKS };
    this.loot.push(bag);
    this.events.push({ k: 'lootDrop', id: bag.id, from: bag.from, x: round2(bag.x), y: round2(bag.y), z: round2(bag.z) });
    // Too many bags on the floor: the oldest goes first.
    while (this.loot.length > MAX_LOOT) this.events.push({ k: 'lootGone', id: this.loot.shift()!.id });
  }

  /** Expires old bags and lets living players loot ones they stand next to. */
  private tickLoot(): void {
    if (this.loot.length === 0) return;
    const keep: Loot[] = [];
    for (const bag of this.loot) {
      if (this.tick >= bag.expiresAt) {
        this.events.push({ k: 'lootGone', id: bag.id });
        continue;
      }
      let takenBy = -1;
      for (const p of this.players.values()) {
        if (!p.alive || Math.abs(p.state.y - bag.y) > 1.6) continue;
        if (Math.hypot(p.state.x - bag.x, p.state.z - bag.z) > LOOT_RADIUS) continue;
        if (this.takeLoot(p, bag)) {
          takenBy = p.id;
          break;
        }
      }
      if (takenBy >= 0) this.events.push({ k: 'lootTake', id: bag.id, by: takenBy, from: bag.from });
      // A bag that was emptied disappears; one that only partly fit stays for the next player.
      if (takenBy >= 0 && bag.ammo.every((n) => n === 0) && bag.gren.every((n) => n === 0)) {
        this.events.push({ k: 'lootGone', id: bag.id });
        continue;
      }
      keep.push(bag);
    }
    this.loot = keep;
  }

  /**
   * Moves as much of a bag as fits into a player's reserves (never above the usual maximums).
   * @returns True if the player got anything.
   */
  private takeLoot(p: Player, bag: Loot): boolean {
    let took = false;
    WEAPONS.forEach((w, i) => {
      const n = Math.min(w.maxReserve - p.reserve[i]!, bag.ammo[i]!);
      if (n > 0) {
        p.reserve[i]! += n;
        bag.ammo[i]! -= n;
        took = true;
      }
    });
    GRENADES.forEach((g, i) => {
      const n = Math.min(g.maxCarry - p.gren[i]!, bag.gren[i]!);
      if (n > 0) {
        p.gren[i]! += n;
        bag.gren[i]! -= n;
        took = true;
      }
    });
    return took;
  }

  // ---- spawning and match flow ----

  /** Puts a player at the spawn point farthest from everyone else, with a full loadout. */
  private spawn(p: Player): void {
    let best = this.spawns[0]!;
    let bestScore = -1;
    for (const s of this.spawns) {
      let nearest = Infinity;
      for (const o of this.players.values()) {
        if (o === p || !o.alive) continue;
        nearest = Math.min(nearest, Math.hypot(o.state.x - s[0], o.state.z - s[1]));
      }
      // Tiny random term breaks ties (e.g. an empty map) without ever overriding a real distance gap.
      const score = Math.min(nearest, 1e6) + this.rng() * 0.01;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    p.state = newPlayerState(best[0], 0, best[1]);
    // Face the middle of the map so players do not spawn staring at a wall.
    p.state.yaw = Math.atan2(best[0], best[1]);
    p.hp = MAX_HP;
    p.alive = true;
    p.weapon = 1;
    p.mag = WEAPONS.map((w) => w.magSize);
    p.reserve = WEAPONS.map((w) => Math.floor(w.maxReserve * START_RESERVE_FRACTION));
    p.gren = GRENADES.map((g) => g.startCarry);
    p.reloadEnd = 0;
    p.nextFire = this.tick + SWITCH_TICKS;
    p.fireLatch = false;
    p.protectUntil = this.tick + SPAWN_PROTECT_TICKS;
    p.blindEnd = 0;
    // Stale inputs were made for the old position; clients drop their pending list on the 'spawn' event.
    p.queue.length = 0;
    this.events.push({ k: 'spawn', id: p.id, yaw: Math.round(p.state.yaw * 1000) / 1000 });
  }

  /** Ends the intermission: resets scores, pickups and grenades, and respawns everyone. */
  private restartMatch(): void {
    this.doors.reset();
    this.doorsDirty = true;
    this.phase = 'play';
    this.winner = -1;
    this.grenades = [];
    for (const l of this.loot) this.events.push({ k: 'lootGone', id: l.id });
    this.loot = [];
    this.spots.forEach((_, i) => {
      if (this.pickupReady[i]! > this.tick) this.events.push({ k: 'pk', i, on: true });
      this.pickupReady[i] = 0;
    });
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      if (p.playing) this.spawn(p);
    }
    this.events.push({ k: 'matchStart' });
    this.rosterDirty = true;
    this.startClockIfReady();
  }

  // ---- snapshots ----

  /** Public identity and scores of everyone in the room. */
  private roster(): PlayerInfo[] {
    return [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, model: p.model, color: p.color, kills: p.kills, deaths: p.deaths,
    }));
  }

  /** Sends each player the shared world state plus their private `me` block, then clears the event list. */
  private sendSnapshots(): void {
    // Lobby players are not in the world yet, so nobody else sees them.
    const snapPlayers: SnapPlayer[] = [...this.players.values()].filter((p) => p.playing).map((p) => ({
      id: p.id, x: round2(p.state.x), y: round2(p.state.y), z: round2(p.state.z),
      yaw: Math.round(p.state.yaw * 1000) / 1000, pitch: Math.round(p.state.pitch * 1000) / 1000,
      hp: p.hp, w: p.weapon, alive: p.alive, prot: this.tick < p.protectUntil,
    }));
    const snapGrenades: SnapGrenade[] = this.grenades.map((g) => ({
      id: g.id, s: g.slot, x: round2(g.x), y: round2(g.y), z: round2(g.z),
    }));
    const ev = this.events;
    this.events = [];
    const doors = this.doorsDirty ? this.doors.wire() : undefined;
    this.doorsDirty = false;
    for (const p of this.players.values()) {
      p.conn.send({ t: 'snap', tick: this.tick, players: snapPlayers, grenades: snapGrenades, me: this.meState(p), ev, doors });
    }
  }

  /** The private block for one player. */
  private meState(p: Player): MeState {
    const s = p.state;
    return {
      ack: p.ack, x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, onGround: s.onGround,
      hp: p.hp, alive: p.alive, playing: p.playing, respawnIn: p.alive || !p.playing ? 0 : Math.max(0, p.respawnAt - this.tick),
      prot: Math.max(0, p.protectUntil - this.tick), w: p.weapon,
      mag: p.mag, reserve: p.reserve, gren: p.gren,
      reload: p.reloadEnd ? Math.max(0, p.reloadEnd - this.tick) : 0,
      blind: Math.max(0, p.blindEnd - this.tick), blindMax: p.blindMax, timeLeft: this.timeLeft(),
    };
  }
}
