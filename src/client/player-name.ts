/**
 * Callsign handling for the menu: remembers the last name, and invents a guest name when none is given.
 */
import { MAX_NAME_LEN } from '../shared/constants';
import { guestName, sanitizeName } from '../shared/protocol';

const STORAGE_KEY = 'itwars.name';

/**
 * Name to pre-fill in the menu: the saved one, or a fresh guest name.
 * @returns A non-empty callsign.
 */
export function initialName(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) return sanitizeName(saved);
  } catch {
    // Storage can be blocked (private mode); a guest name works fine.
  }
  return guestName();
}

/**
 * Turns the text field into the name to send, and remembers it for next time.
 * @param raw - Current field value; blank means "pick a guest name for me".
 * @returns The sanitised callsign.
 */
export function commitName(raw: string): string {
  const name = raw.trim() ? sanitizeName(raw) : guestName();
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Not persisting is fine.
  }
  return name.slice(0, MAX_NAME_LEN);
}
