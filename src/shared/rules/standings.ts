/**
 * Ranking and formatting rules for scoreboards, shared by the HUD scoreboard and the live boards on the office
 * walls, so every screen agrees on who is ahead.
 */

/** The fields a ranking needs. */
export interface Rankable {
  name: string;
  kills: number;
  deaths: number;
}

/**
 * Orders players for a scoreboard: most kills first, fewer deaths break a tie, then the name keeps the order stable.
 * @returns A new sorted array; the input is untouched.
 */
export function rankPlayers<T extends Rankable>(players: readonly T[]): T[] {
  return [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
}

/**
 * Formats seconds as `m:ss`.
 * @param seconds - Whole seconds, clamped at zero.
 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Fills the room's real numbers into a map text template, so signs show the rules of this room.
 * Supported tokens: `{KILLS}` (kill limit) and `{MINUTES}` (time limit, or "no" when there is none).
 */
export function fillRuleTokens(text: string, rules: { killLimit: number; timeLimitMin: number }): string {
  return text.replace('{KILLS}', String(rules.killLimit)).replace('{MINUTES}', rules.timeLimitMin > 0 ? String(rules.timeLimitMin) : 'no');
}
