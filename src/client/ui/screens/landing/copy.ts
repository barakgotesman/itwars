/**
 * All the words on the landing page, in one place so the voice stays consistent and a copy edit never touches
 * layout code. Numbers (players, kill limits, doors, weapon and grenade names) are read from the shared game
 * data, so the page cannot drift from the rules. Voice: dry, short sentences, no superlatives, no emoji.
 */
import { MAX_PLAYERS } from '@shared/core/constants';
import { KILL_LIMITS } from '@shared/rules/modes';
import { GRENADES, WEAPONS } from '@shared/rules/weapons';

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

/** The arena section's heading line. */
export const ARENA_TEXT = 'Two places to settle it. You pick the map when you host.';

/** What the arena section says about one map: a tagline and a caption for each picture (keyed by gallery slug). */
export interface MapStory {
  /** The map's one-line pitch, shown on its tab. */
  tagline: string;
  /** Caption under each picture: a short name and one dry line. */
  captions: Readonly<Record<string, { title: string; line: string }>>;
}

/** The arena copy per map, keyed by map id (`MAP_INFO`). Pictures are `public/maps/<id>-<slug>.jpg` (`tools/maps.html`). */
export const MAP_STORIES: Readonly<Record<string, MapStory>> = {
  office: {
    tagline: 'The whole floor. Rooms, open plan, sliding doors.',
    captions: {
      conference: { title: 'Conference room', line: 'A long table, a big screen and nothing to hide behind.' },
      'break-room': { title: 'Break room', line: 'Bright, loud, and the coffee machine is not cover.' },
      'open-plan': { title: 'Open plan', line: 'Cubicle pods and long sight lines. Keep moving.' },
      lounge: { title: 'The lounge', line: 'Orange sofas in the middle of everything. Bad idea.' },
    },
  },
  datacenter: {
    tagline: 'Small and tight. One cold hall of glowing racks.',
    captions: {
      bay: { title: 'The bay', line: 'The open middle. Everyone ends up here sooner or later.' },
      aisle: { title: 'Cold aisle', line: 'Fast fights between the rack rows.' },
      'control-room': { title: 'Control room', line: 'A glass door, a desk of screens and a shotgun.' },
      racks: { title: 'Rack row', line: 'Blue light on every cabinet. You can see them coming.' },
    },
  },
  rooftop: {
    tagline: 'Open air, city lights and an edge that does not forgive.',
    captions: {
      helipad: { title: 'The helipad', line: 'The middle of the roof. Wide open, and the edge is never far.' },
      edge: { title: 'The edge', line: 'No railing on this side. One bad jump and the round is over.' },
      'stair-hut': { title: 'Stair hut', line: 'A warm doorway and a shotgun, tucked in the north-east corner.' },
      skyline: { title: 'The skyline', line: 'Neighbouring towers, an aircraft light on the mast, and a long way down.' },
    },
  },
};

/** The staff section. */
export const STAFF_TEXT = 'Seven colleagues, eight shirt colours, one spray-paint tag. Use the arrows beside the character at the top to pick who you are.';

/** The closing call to action. */
export const FINAL_HEADLINE = 'Your turn.';

/** The line under the closing headline. */
export const FINAL_TEXT = 'Someone has to restart the server.';
