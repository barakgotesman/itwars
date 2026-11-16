/**
 * Player character options: the four body styles and the shirt colour palette a player can pick in the menu.
 */

/** One selectable character style. */
export interface CharacterDef {
  name: string;
  /** File-name-safe id of the character's 2D portrait in `public/characters/` (see `tools/characters.html`). */
  slug: string;
  /** One-line flavour text shown in the picker. */
  blurb: string;
}

/** Selectable styles; the array index is the `model` number on the wire. */
export const CHARACTERS: readonly CharacterDef[] = [
  { name: 'Sysadmin', slug: 'sysadmin', blurb: 'Glasses, tie, and a grudge against printers.' },
  { name: 'Hoodie Dev', slug: 'hoodie-dev', blurb: 'Hood up, headphones on. Do not disturb.' },
  { name: 'Manager', slug: 'manager', blurb: 'Sharp suit. Wants a quick sync.' },
  { name: 'Intern', slug: 'intern', blurb: 'Cap, lanyard, backpack. Here for the free coffee.' },
  { name: 'HR', slug: 'hr', blurb: 'Blazer, brooch, and your exit interview is booked.' },
  { name: 'CTO', slug: 'cto', blurb: 'Vest, round glasses, beard. Has opinions about the stack.' },
  { name: 'CFO', slug: 'cfo', blurb: 'Navy three-piece. Every bullet is a line item.' },
];

/** Shirt / tie / hoodie colours a player can choose; the index is the `color` number on the wire. */
export const PLAYER_COLORS: readonly number[] = [
  0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085, 0xe84393, 0x7f8c8d,
];
