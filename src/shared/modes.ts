/**
 * Game modes and match rules. A room is created with one `MatchRules` value, chosen by the host on the setup
 * screen and checked by the server. The `MODES` registry describes each mode and the options it offers, and the
 * setup screen is built from it, so adding a mode (or a mod) means adding an entry here rather than a new screen.
 */
import { KILLS_TO_WIN } from './constants';

/** Identifier of a game mode. Add new modes here as they are built. */
export type ModeId = 'dm';

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
}

/** Rules used when the host does not choose any (and the fallback for anything invalid). */
export const DEFAULT_RULES: MatchRules = { mode: 'dm', killLimit: KILLS_TO_WIN, timeLimitMin: 0 };

/** Numeric rule fields a setup option can control. */
export type RuleKey = 'killLimit' | 'timeLimitMin';

/** One option a mode shows on the setup screen. */
export type OptionDef =
  | {
    /** Pick one of several values. */
    kind: 'choice';
    key: RuleKey;
    label: string;
    hint: string;
    choices: readonly number[];
    unit: string;
  }
  | {
    /** An on/off switch; when on, pick one of several values. Off stores 0. */
    kind: 'optional-choice';
    key: RuleKey;
    label: string;
    hint: string;
    choices: readonly number[];
    unit: string;
    /** Value selected when the switch is turned on. */
    defaultOn: number;
  };

/** A game mode and the options it offers. */
export interface ModeDef {
  id: ModeId;
  name: string;
  blurb: string;
  options: readonly OptionDef[];
}

/** Every available mode. The first entry is the default. */
export const MODES: readonly ModeDef[] = [
  {
    id: 'dm',
    name: 'Deathmatch',
    blurb: 'Free-for-all. Frag everyone in the office. First to the kill limit wins.',
    options: [
      { kind: 'choice', key: 'killLimit', label: 'Kill limit', hint: 'First player to reach this many kills wins.', choices: KILL_LIMITS, unit: 'kills' },
      {
        kind: 'optional-choice', key: 'timeLimitMin', label: 'Time limit', unit: 'min', choices: TIME_LIMITS_MIN, defaultOn: DEFAULT_TIME_LIMIT_MIN,
        hint: 'Ends the match when time runs out; the most kills wins. The clock starts once two players are in.',
      },
    ],
  },
];

/**
 * Turns anything a client sent into valid rules, falling back to the default for each field that is wrong.
 * @param raw - Untrusted value.
 */
export function sanitizeRules(raw: unknown): MatchRules {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const mode = MODES.find((m) => m.id === r.mode)?.id ?? DEFAULT_RULES.mode;
  const killLimit = KILL_LIMITS.includes(r.killLimit as number) ? (r.killLimit as number) : DEFAULT_RULES.killLimit;
  const timeLimitMin = r.timeLimitMin === 0 || TIME_LIMITS_MIN.includes(r.timeLimitMin as number) ? (r.timeLimitMin as number) : 0;
  return { mode, killLimit, timeLimitMin };
}

/**
 * One-line summary of the rules, e.g. "Deathmatch · first to 30 · 10 min".
 */
export function describeRules(rules: MatchRules): string {
  const mode = MODES.find((m) => m.id === rules.mode)?.name ?? 'Deathmatch';
  return `${mode} · first to ${rules.killLimit}${rules.timeLimitMin > 0 ? ` · ${rules.timeLimitMin} min` : ' · no time limit'}`;
}
