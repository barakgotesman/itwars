/**
 * All the words on the landing page, in one place so the voice stays consistent and a copy edit never touches
 * layout code. Numbers (players, kill limits, doors, weapon and grenade names) are read from the shared game
 * data, so the page cannot drift from the rules. Voice: dry, short sentences, no superlatives, no emoji.
 */
import { MAX_PLAYERS } from '@shared/core/constants';
import { KILL_LIMITS } from '@shared/rules/modes';
import { GRENADES, WEAPONS } from '@shared/rules/weapons';
import { DOORS } from '@shared/world/map/door-layout';
import { ZONES } from '@shared/world/map/zones';

/** The headline under the logo. */
export const HEADLINE = 'Have you tried turning them off?';

/** The sentence under the headline. */
export const SUBHEAD = `A blocky first-person office deathmatch for your browser. The IT department against everyone else, up to ${MAX_PLAYERS} players on your network. No install, no account.`;

/** Small print under the Shooting Range button. */
export const RANGE_NOTE = 'Warm up alone: unlimited ammo, every gun, no setup.';

/** A numbered step in "How it plays". */
export interface Step {
  title: string;
  text: string;
}

/** The three steps from hosting to the podium. */
export const STEPS: readonly Step[] = [
  { title: 'Host', text: 'Pick the kill limit, the time limit and how many bots. You get a four-letter room code.' },
  { title: 'Share', text: `Friends on the same network open your address and type the code. ${MAX_PLAYERS} desks per room.` },
  { title: 'Frag', text: `First to the kill limit (${KILL_LIMITS[0]} to ${KILL_LIMITS[KILL_LIMITS.length - 1]}) wins. The podium shows who ran the office, then a rematch starts on its own.` },
];

/** The short type tag under each weapon's name; keep the order of `WEAPONS`. */
export const GUN_KINDS: readonly string[] = ['Pistol', 'SMG', 'Shotgun', 'Sniper', 'Rocket launcher', 'Melee'];

/** The type tag under each grenade's name; keep the order of `GRENADES`. */
export const GRENADE_KINDS: readonly string[] = ['Frag', 'Flashbang'];

/** Weapon names, from the rules. */
export const GUN_NAMES: readonly string[] = WEAPONS.map((w) => w.name);

/** Grenade names, from the rules. */
export const GRENADE_NAMES: readonly string[] = GRENADES.map((g) => g.name);

/** Arsenal intro line. */
export const ARSENAL_INTRO = 'A stapler, a sheet of A4, and whatever you find on the way.';

/** The arena section. */
export const ARENA_TEXT = 'One floor of open-plan chaos: cubicle pods, a lobby, a break room and a server room you will want to visit. Sliding doors close on command. Every room has its own light.';

/** Fact chips in the arena section. */
export const ARENA_FACTS: readonly { value: string; label: string }[] = [
  { value: String(MAX_PLAYERS), label: 'players per room' },
  { value: String(DOORS.length), label: 'sliding doors' },
  { value: String(ZONES.length), label: 'lit zones' },
  { value: `${WEAPONS.length} + ${GRENADES.length}`, label: 'guns and grenades' },
];

/** The staff section. */
export const STAFF_TEXT = 'Seven colleagues, eight shirt colours, one spray-paint tag. Use the arrows beside the character at the top to pick who you are.';

/** The closing call to action. */
export const FINAL_HEADLINE = 'Your turn.';

/** The line under the closing headline. */
export const FINAL_TEXT = 'Someone has to restart the server.';
