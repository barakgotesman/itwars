/**
 * Remembers the host's last chosen match rules between visits, for the Game setup screen.
 */
import { DEFAULT_RULES, sanitizeRules, type MatchRules } from '@shared/rules/modes';

const STORAGE_KEY = 'itwars.rules';

/** Reads the host's last rules, or the defaults. */
export function loadRules(): MatchRules {
  try {
    return sanitizeRules(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_RULES };
  }
}

/** Remembers the rules for next time. */
export function saveRules(rules: MatchRules): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Not persisting is fine.
  }
}
