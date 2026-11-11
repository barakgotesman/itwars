/**
 * The player's chosen character style and shirt colour, remembered between visits.
 */
import { CHARACTERS, PLAYER_COLORS } from '../shared/characters';

const STORAGE_KEY = 'itwars.look';

/** A saved choice: indexes into `CHARACTERS` and `PLAYER_COLORS`. */
export interface Look {
  model: number;
  color: number;
}

/**
 * Loads the saved look, or a random one on a first visit.
 * @returns A valid look.
 */
export function loadLook(): Look {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Look> | null;
    if (
      raw && Number.isInteger(raw.model) && Number.isInteger(raw.color) &&
      raw.model! >= 0 && raw.model! < CHARACTERS.length && raw.color! >= 0 && raw.color! < PLAYER_COLORS.length
    ) return { model: raw.model!, color: raw.color! };
  } catch {
    // Blocked or corrupt storage: fall through to a random look.
  }
  return { model: Math.floor(Math.random() * CHARACTERS.length), color: Math.floor(Math.random() * PLAYER_COLORS.length) };
}

/** Remembers the look for next time. */
export function saveLook(look: Look): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(look));
  } catch {
    // Not persisting is fine.
  }
}
