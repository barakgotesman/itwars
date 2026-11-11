/**
 * Tiny DOM helpers for the menu screens, which are defined in `index.html`.
 */

/** Looks up an element by id (the page guarantees it exists). */
export const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** Shows a panel (flex) or hides it. */
export function setShown(id: string, shown: boolean): void {
  const el = $(id);
  el.classList.toggle('hidden', !shown);
  el.classList.toggle('flex', shown);
}
