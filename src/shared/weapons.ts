/**
 * Weapon, grenade and pickup data tables. All balance lives here; server logic is data-driven.
 */
import { TICK_RATE } from './constants';

/** Index into `WEAPONS` (key 1-4 maps to 0-3). */
export type WeaponId = 0 | 1 | 2 | 3;

/** Static description of one gun. Times are in server ticks, angles in radians. */
export interface WeaponDef {
  name: string;
  /** Holding fire keeps shooting; otherwise each trigger pull fires once. */
  auto: boolean;
  /** Damage per pellet at point-blank range, body shot. */
  damage: number;
  pellets: number;
  headMul: number;
  /** Ticks between shots. */
  interval: number;
  magSize: number;
  /** Maximum spare ammo outside the magazine. */
  maxReserve: number;
  reloadTicks: number;
  /** Cone half-angle when firing from the hip. */
  spread: number;
  /** Cone half-angle while aiming (RMB). */
  aimSpread: number;
  /** Distance where damage starts to fall off. */
  falloffStart: number;
  /** Distance where damage reaches `minMul` of base. */
  falloffEnd: number;
  minMul: number;
  /** Client only: camera kick per shot (pitch). */
  recoil: number;
  /** Client only: FOV divisor while aiming. */
  zoom: number;
}

/** The four guns, in key order. */
export const WEAPONS: readonly WeaponDef[] = [
  {
    name: 'Stapler .45', auto: false, damage: 24, pellets: 1, headMul: 2, interval: 10,
    magSize: 12, maxReserve: 60, reloadTicks: 85, spread: 0.012, aimSpread: 0.003,
    falloffStart: 25, falloffEnd: 70, minMul: 0.6, recoil: 0.018, zoom: 1.25,
  },
  {
    name: 'Label Gun SMG', auto: true, damage: 11, pellets: 1, headMul: 1.8, interval: 4,
    magSize: 30, maxReserve: 150, reloadTicks: 110, spread: 0.03, aimSpread: 0.016,
    falloffStart: 15, falloffEnd: 45, minMul: 0.5, recoil: 0.01, zoom: 1.3,
  },
  {
    name: 'Paper Shredder', auto: false, damage: 12, pellets: 8, headMul: 1.5, interval: 48,
    magSize: 6, maxReserve: 30, reloadTicks: 150, spread: 0.07, aimSpread: 0.05,
    falloffStart: 5, falloffEnd: 22, minMul: 0.1, recoil: 0.07, zoom: 1.15,
  },
  {
    name: 'Laser Pointer', auto: false, damage: 80, pellets: 1, headMul: 2, interval: 75,
    magSize: 5, maxReserve: 20, reloadTicks: 140, spread: 0.06, aimSpread: 0,
    falloffStart: 200, falloffEnd: 201, minMul: 1, recoil: 0.04, zoom: 4,
  },
];

/** Longest hitscan distance; the map is ~100 m across. */
export const MAX_RANGE = 200;

/** Index into `GRENADES`; also the keybind slot (G = 0, H = 1). */
export type GrenadeSlot = 0 | 1;

/** Static description of one grenade type. */
export interface GrenadeDef {
  name: string;
  kind: 'frag' | 'flash';
  /** Most one slot can hold. */
  maxCarry: number;
  startCarry: number;
  fuseTicks: number;
  /** Blast radius in metres. */
  radius: number;
  /** Frag: damage at the centre. */
  damage: number;
  /** Flash: full-effect blind duration in ticks. */
  blindTicks: number;
  /** Throw speed in m/s. */
  speed: number;
  /** Fraction of the thrower's velocity added to the throw. */
  inheritVel: number;
  /** Fraction of speed kept on the bounced axis. */
  bounce: number;
  /** Fraction of horizontal speed kept when hitting the floor. */
  floorFriction: number;
}

/** Slot 1 Coffee Bomb (frag), slot 2 Fire Alarm (flashbang). */
export const GRENADES: readonly GrenadeDef[] = [
  {
    name: 'Coffee Bomb', kind: 'frag', maxCarry: 2, startCarry: 1, fuseTicks: 2.5 * TICK_RATE,
    radius: 7, damage: 110, blindTicks: 0, speed: 16, inheritVel: 0.5, bounce: 0.45, floorFriction: 0.7,
  },
  {
    name: 'Fire Alarm', kind: 'flash', maxCarry: 2, startCarry: 1, fuseTicks: 1.5 * TICK_RATE,
    radius: 20, damage: 0, blindTicks: 5 * TICK_RATE, speed: 16, inheritVel: 0.5, bounce: 0.45, floorFriction: 0.7,
  },
];
/** Gravity for thrown grenades (m/s^2). */
export const GRENADE_GRAVITY = 20;
/** Collision radius of a grenade. */
export const GRENADE_RADIUS = 0.12;
/** The thrower takes this fraction of a frag's damage. */
export const SELF_DAMAGE_MUL = 0.5;
/** Frag damage never drops below this fraction of `damage` inside the radius. */
export const FRAG_MIN_MUL = 0.1;

/** What a pickup box gives. */
export type PickupKind = 'hp' | 'ammo' | 'grenade';

/** Static description of one pickup kind. */
export interface PickupDef {
  /** Ticks until the box comes back after being taken. */
  respawnTicks: number;
  /** Horizontal pickup radius. */
  radius: number;
  /** HP restored (hp) or fraction of max reserve refilled (ammo). */
  amount: number;
}

/**
 * Share of a victim's ammo that ends up in their loot bag. Below 1 so a kill is a top-up, not a full restock.
 * Rounds are rounded down; grenades are rounded up, so a lone grenade still drops.
 */
export const LOOT_FRACTION = 0.5;
/** How long a dead player's loot bag stays on the floor. */
export const LOOT_LIFETIME_TICKS = 30 * TICK_RATE;
/** Horizontal distance at which a bag can be looted. */
export const LOOT_RADIUS = 1.2;
/** Most bags kept per room; the oldest is removed first. */
export const MAX_LOOT = 24;

/** Tuning for the three pickup kinds. */
export const PICKUP_DEFS: Record<PickupKind, PickupDef> = {
  hp: { respawnTicks: 20 * TICK_RATE, radius: 1.1, amount: 35 },
  ammo: { respawnTicks: 20 * TICK_RATE, radius: 1.1, amount: 0.5 },
  grenade: { respawnTicks: 30 * TICK_RATE, radius: 1.1, amount: 1 },
};

/** Fraction of each weapon's `maxReserve` a player spawns with. */
export const START_RESERVE_FRACTION = 0.5;
