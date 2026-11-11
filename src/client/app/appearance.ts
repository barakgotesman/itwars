/**
 * The player's chosen character style and shirt colour, remembered between visits.
 */
import { CHARACTERS, PLAYER_COLORS } from '@shared/core/characters';
import { SPRAY_COUNT } from '@shared/rules/sprays';

const STORAGE_KEY = 'itwars.look';

/** A saved choice: indexes into `CHARACTERS`, `PLAYER_COLORS` and `SPRAYS`. */
export interface Look {
  model: number;
  color: number;
  spray: number;
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
    ) {
      // Older saves have no spray design; fall back to the first.
      const spray = Number.isInteger(raw.spray) && raw.spray! >= 0 && raw.spray! < SPRAY_COUNT ? raw.spray! : 0;
      return { model: raw.model!, color: raw.color!, spray };
    }
  } catch {
    // Blocked or corrupt storage: fall through to a random look.
  }
  return { model: Math.floor(Math.random() * CHARACTERS.length), color: Math.floor(Math.random() * PLAYER_COLORS.length), spray: Math.floor(Math.random() * SPRAY_COUNT) };
}

/** Remembers the look for next time. */
export function saveLook(look: Look): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(look));
  } catch {
    // Not persisting is fine.
  }
}
