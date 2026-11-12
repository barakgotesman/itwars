/**
 * Bot data: the Unix-style callsigns, the counts and skill levels the host can pick on the setup screen, and the
 * tuning table that makes an Easy bot slow and sloppy and a Hard bot quick and accurate. All bot balance lives
 * here, never as magic numbers in the brain (`server/sim/bots/*`).
 */
import { MAX_NAME_LEN, MAX_PLAYERS } from '@shared/core/constants';

/** Callsigns for bots: Unix users and tools. Letters, digits and `_.-` only, so they pass the name rules. */
export const BOT_NAMES: readonly string[] = [
  'root', 'daemon', 'sudo', 'cron', 'grep', 'awk', 'sed', 'bash', 'kernel', 'nginx', 'systemd', 'sshd',
  'vim', 'nano', 'curl', 'wget', 'chmod', 'chown', 'ping', 'tar', 'cat', 'kill', 'nobody', 'apache',
  'mysql', 'redis', 'docker', 'zsh', 'git', 'make', 'gcc', 'tmux', 'htop', 'passwd', 'init', 'fsck', 'dmesg',
];

/** Bot counts offered on the setup screen; the host plus 7 bots fills the room. */
export const BOT_COUNTS: readonly number[] = Array.from({ length: MAX_PLAYERS }, (_, i) => i);

/** Skill levels offered: the wire value is 1 (Easy), 2 (Normal) or 3 (Hard). */
export const BOT_SKILLS: readonly number[] = [1, 2, 3];
/** Display names for `BOT_SKILLS`, in the same order. */
export const BOT_SKILL_NAMES: readonly string[] = ['Easy', 'Normal', 'Hard'];
/** Skill used when none is chosen. */
export const DEFAULT_BOT_SKILL = 2;

/** Everything that differs between skill levels. Times are server ticks, angles radians, ranges metres. */
export interface BotTuning {
  /** Half the horizontal field of view; enemies outside it are not seen. */
  fovHalf: number;
  /** Furthest distance at which a bot notices an enemy. */
  sightRange: number;
  /** Radius within which it hears shots, grenades and doors. */
  hearRange: number;
  /** Fastest the aim may turn, in rad/s, so a flick takes human time. */
  turnRate: number;
  /** Ticks between first seeing an enemy and the first shot. */
  reactionTicks: number;
  /** Aim wander at 10 m, in radians. */
  aimError: number;
  /** Extra error per m/s of target speed, as a fraction of `aimError`. */
  errorPerSpeed: number;
  /** Ticks of steady sight over which the aim error halves. */
  errorSettleTicks: number;
  /** Chance an engagement aims for the head. */
  headshotBias: number;
  /** Automatic weapons: ticks held, then ticks released. */
  burstOn: number;
  burstOff: number;
  /** How long a last-seen position is remembered. */
  memoryTicks: number;
  /** Below this HP a bot in a fight falls back to find health. */
  retreatHp: number;
  /** Ticks between changing strafe direction in a fight. */
  strafeSwitchTicks: number;
  /** Chance per decision to lob a grenade at a hidden enemy. */
  grenadeChance: number;
  /** Whether it sprints while travelling. */
  sprintWhenRoaming: boolean;
  /** Whether it hops while fighting. */
  jumpsInFights: boolean;
}

/** Tuning per skill, index 0 = Easy, 1 = Normal, 2 = Hard. */
export const BOT_TUNING: readonly BotTuning[] = [
  {
    fovHalf: 0.87, sightRange: 40, hearRange: 18, turnRate: 2.2, reactionTicks: 60, aimError: 0.16, errorPerSpeed: 0.5,
    errorSettleTicks: 90, headshotBias: 0.05, burstOn: 12, burstOff: 10, memoryTicks: 120, retreatHp: 50,
    strafeSwitchTicks: 50, grenadeChance: 0.1, sprintWhenRoaming: false, jumpsInFights: false,
  },
  {
    fovHalf: 0.96, sightRange: 55, hearRange: 28, turnRate: 4.2, reactionTicks: 32, aimError: 0.07, errorPerSpeed: 0.3,
    errorSettleTicks: 55, headshotBias: 0.2, burstOn: 20, burstOff: 6, memoryTicks: 240, retreatHp: 35,
    strafeSwitchTicks: 35, grenadeChance: 0.25, sprintWhenRoaming: true, jumpsInFights: false,
  },
  {
    fovHalf: 1.05, sightRange: 80, hearRange: 40, turnRate: 8.4, reactionTicks: 12, aimError: 0.022, errorPerSpeed: 0.12,
    errorSettleTicks: 25, headshotBias: 0.45, burstOn: 40, burstOff: 3, memoryTicks: 420, retreatHp: 25,
    strafeSwitchTicks: 22, grenadeChance: 0.4, sprintWhenRoaming: true, jumpsInFights: true,
  },
];

/**
 * Tuning for a wire skill value.
 * @param skill - 1 (Easy), 2 (Normal) or 3 (Hard); anything else gets Normal.
 */
export function botTuning(skill: number): BotTuning {
  return BOT_TUNING[skill - 1] ?? BOT_TUNING[DEFAULT_BOT_SKILL - 1]!;
}

/** Display name of a wire skill value. */
export function botSkillName(skill: number): string {
  return BOT_SKILL_NAMES[skill - 1] ?? BOT_SKILL_NAMES[DEFAULT_BOT_SKILL - 1]!;
}

/**
 * Picks a callsign nobody in the room is using, falling back to a numbered name when the list runs out.
 * @param taken - Lower-cased names already in the room.
 * @param rng - The room's random numbers.
 */
export function pickBotName(taken: ReadonlySet<string>, rng: () => number): string {
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  if (free.length > 0) return free[Math.floor(rng() * free.length)]!;
  for (let n = 2; ; n++) {
    const name = `${BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)]!}${n}`.slice(0, MAX_NAME_LEN);
    if (!taken.has(name)) return name;
  }
}
