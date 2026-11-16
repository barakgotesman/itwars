/**
 * Game modes and match rules. A room is created with one `MatchRules` value, chosen by the host on the setup
 * screen and checked by the server. The `MODES` registry describes each mode and the options it offers, and the
 * setup screen is built from it, so adding a mode (or a mod) means adding an entry here rather than a new screen.
 */
import { KILLS_TO_WIN } from '@shared/core/constants';
import { LOADOUT_IDS, LOADOUT_NAMES } from '@shared/rules/loadout';
import { BOT_COUNTS, BOT_SKILLS, BOT_SKILL_NAMES, DEFAULT_BOT_SKILL, botSkillName } from '@shared/rules/bots';

/** Identifier of a game mode. Add new modes here as they are built. */
export type ModeId = 'dm' | 'range';

/** Kill limits offered for Deathmatch. */
export const KILL_LIMITS: readonly number[] = [10, 20, 30, 40, 50];
/** Time limits offered, in minutes. */
export const TIME_LIMITS_MIN: readonly number[] = [5, 10, 15, 20, 30];
/** Time limit chosen when the host switches the timer on. */
export const DEFAULT_TIME_LIMIT_MIN = 10;

/** The rules of one room's matches. */
export interface MatchRules {
  mode: ModeId;
  /** First player to this many kills wins. */
  killLimit: number;
  /** Match length in minutes; 0 means no time limit. */
  timeLimitMin: number;
  /** Server-controlled players added when the room opens (0-7). They count as players for the match clock. */
  bots: number;
  /** Bot skill: 1 Easy, 2 Normal, 3 Hard, the same for every bot in the room. */
  botSkill: number;
  /** Spawn kit, index into `LOADOUTS`: 0 pistol only (guns are map pickups), 1 full arsenal. */
  loadout: number;
  /** 1 shows the room in the lobby browser, 0 keeps it joinable by code only. */
  listed: number;
}

/** Rules used when the host does not choose any (and the fallback for anything invalid). */
export const DEFAULT_RULES: MatchRules = { mode: 'dm', killLimit: KILLS_TO_WIN, timeLimitMin: 0, bots: 0, botSkill: DEFAULT_BOT_SKILL, loadout: 0, listed: 1 };

/** Numeric rule fields a setup option can control. */
export type RuleKey = 'killLimit' | 'timeLimitMin' | 'bots' | 'botSkill' | 'loadout' | 'listed';

/** One option a mode shows on the setup screen. */
export type OptionDef =
  | {
    /** Pick one of several values. */
    kind: 'choice';
    key: RuleKey;
    label: string;
    hint: string;
    /** Section heading the option is listed under on the setup screen ("Match", "Players", "Weapons"). */
    group: string;
    choices: readonly number[];
    unit: string;
    /** Text for each choice, in the same order, when a number alone says little (e.g. skill names). */
    labels?: readonly string[];
    /** Only shown while this other rule is above 0 (e.g. bot skill matters only when there are bots). */
    dependsOn?: RuleKey;
  }
  | {
    /** An on/off switch; when on, pick one of several values. Off stores 0. */
    kind: 'optional-choice';
    key: RuleKey;
    label: string;
    hint: string;
    /** Section heading the option is listed under on the setup screen. */
    group: string;
    choices: readonly number[];
    unit: string;
    /** Value selected when the switch is turned on. */
    defaultOn: number;
  };

/** Options that share a heading on the setup screen, in the order the group first appears. */
export interface OptionGroup {
  group: string;
  options: readonly OptionDef[];
}

/**
 * Splits a mode's options into their headed groups, keeping the registry order of both groups and options.
 * @param options - A mode's options.
 */
export function groupOptions(options: readonly OptionDef[]): OptionGroup[] {
  const groups: { group: string; options: OptionDef[] }[] = [];
  for (const o of options) {
    const found = groups.find((g) => g.group === o.group);
    if (found) found.options.push(o);
    else groups.push({ group: o.group, options: [o] });
  }
  return groups;
}

/** A game mode and the options it offers. */
export interface ModeDef {
  id: ModeId;
  name: string;
  blurb: string;
  options: readonly OptionDef[];
}

/** Values of the `listed` rule, and their setup-screen names (index = value). */
export const LISTED_IDS: readonly number[] = [1, 0];
export const LISTED_NAMES: readonly string[] = ['Listed', 'Hidden'];

/** Every available mode. The first entry is the default. */
export const MODES: readonly ModeDef[] = [
  {
    id: 'dm',
    name: 'Deathmatch',
    blurb: 'Free-for-all. Frag everyone in the office. First to the kill limit wins.',
    options: [
      { kind: 'choice', key: 'killLimit', group: 'Match', label: 'Kill limit', hint: 'First player to reach this many kills wins.', choices: KILL_LIMITS, unit: 'kills' },
      {
        kind: 'optional-choice', key: 'timeLimitMin', group: 'Match', label: 'Time limit', unit: 'min', choices: TIME_LIMITS_MIN, defaultOn: DEFAULT_TIME_LIMIT_MIN,
        hint: 'Ends the match when time runs out; the most kills wins. The clock starts once two players are in.',
      },
      {
        kind: 'choice', key: 'loadout', group: 'Weapons', label: 'Loadout', choices: LOADOUT_IDS, labels: LOADOUT_NAMES, unit: '',
        hint: 'Pistol only: everyone spawns with the stapler and hunts the office for the other guns. Full arsenal: all four guns from the start.',
      },
      {
        kind: 'choice', key: 'bots', group: 'Players', label: 'Bots', choices: BOT_COUNTS, unit: 'bots',
        hint: 'Computer players that fill the room from the start. Friends who join take a bot\'s seat, so a room of bots always has space for people.',
      },
      {
        kind: 'choice', key: 'botSkill', group: 'Players', label: 'Bot skill', choices: BOT_SKILLS, labels: BOT_SKILL_NAMES, unit: '', dependsOn: 'bots',
        hint: 'Easy bots react slowly and miss; Hard bots aim fast, land headshots and use grenades.',
      },
      {
        kind: 'choice', key: 'listed', group: 'Visibility', label: 'Lobby list', choices: LISTED_IDS, labels: LISTED_NAMES, unit: '',
        hint: 'Listed: the room shows up in "Browse games" for everyone on the network. Hidden: only people with the room code can join.',
      },
    ],
  },
  {
    id: 'range',
    name: 'Shooting Range',
    blurb: 'Solo practice: unlimited ammo and grenades on a small target range. No setup needed.',
    options: [],
  },
];

/** Fixed rules for the menu's one-click "Shooting Range" button: solo, no bots, unlimited ammo (see `server/sim/weapons.ts`/`grenades.ts`). */
export const RANGE_RULES: MatchRules = { mode: 'range', killLimit: KILL_LIMITS[0]!, timeLimitMin: 0, bots: 0, botSkill: DEFAULT_BOT_SKILL, loadout: 0, listed: 0 };

/**
 * Turns anything a client sent into valid rules, falling back to the default for each field that is wrong.
 * @param raw - Untrusted value.
 */
export function sanitizeRules(raw: unknown): MatchRules {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const mode = MODES.find((m) => m.id === r.mode)?.id ?? DEFAULT_RULES.mode;
  const killLimit = KILL_LIMITS.includes(r.killLimit as number) ? (r.killLimit as number) : DEFAULT_RULES.killLimit;
  const timeLimitMin = r.timeLimitMin === 0 || TIME_LIMITS_MIN.includes(r.timeLimitMin as number) ? (r.timeLimitMin as number) : 0;
  const bots = BOT_COUNTS.includes(r.bots as number) ? (r.bots as number) : DEFAULT_RULES.bots;
  const botSkill = BOT_SKILLS.includes(r.botSkill as number) ? (r.botSkill as number) : DEFAULT_RULES.botSkill;
  const loadout = LOADOUT_IDS.includes(r.loadout as number) ? (r.loadout as number) : DEFAULT_RULES.loadout;
  const listed = r.listed === 0 || r.listed === 1 ? r.listed : DEFAULT_RULES.listed;
  return { mode, killLimit, timeLimitMin, bots, botSkill, loadout, listed };
}

/**
 * One-line summary of the rules, e.g. "Deathmatch · first to 30 · 10 min".
 */
export function describeRules(rules: MatchRules): string {
  const mode = MODES.find((m) => m.id === rules.mode)?.name ?? 'Deathmatch';
  const bots = rules.bots > 0 ? ` · ${rules.bots} ${rules.bots === 1 ? 'bot' : 'bots'} (${botSkillName(rules.botSkill).toLowerCase()})` : '';
  const kit = rules.loadout === 1 ? ' · full arsenal' : '';
  return `${mode} · first to ${rules.killLimit}${rules.timeLimitMin > 0 ? ` · ${rules.timeLimitMin} min` : ' · no time limit'}${kit}${bots}`;
}
