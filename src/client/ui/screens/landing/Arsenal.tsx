/**
 * "The arsenal": one card per gun (icon, name and type from the game's own data, a one-liner and where to find it)
 * and a smaller card for each of the two grenades.
 */
import { GunIcon } from '../../components/GunIcon';
import { ARSENAL_INTRO, GRENADE_BLURBS, GRENADE_NAMES, GUN_BLURBS, GUN_NAMES } from './copy';
import { Section } from './Section';

/** The grenade icon kinds, in the order of the grenade slots. */
const GRENADE_KINDS = ['frag', 'flash'] as const;

/** The arsenal section. */
export function Arsenal() {
  return (
    <Section id="arsenal" kicker="02 / The arsenal" title="Office supplies, repurposed" intro={ARSENAL_INTRO}>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {GUN_BLURBS.map((g, i) => (
          <li key={GUN_NAMES[i]} className="slab flex flex-col gap-3 bg-panel p-5">
            <GunIcon kind={i} className="block h-14 w-full" />
            <div>
              <h3 className="text-lg font-black uppercase tracking-wide">{GUN_NAMES[i]}</h3>
              <p className="label !text-accent">{g.kind}</p>
            </div>
            <p className="text-sm text-dim">{g.text}</p>
            <p className="mt-auto text-xs font-bold text-faint">Found: {g.where}</p>
          </li>
        ))}
      </ul>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2">
        {GRENADE_BLURBS.map((text, i) => (
          <li key={GRENADE_NAMES[i]} className="slab flex items-center gap-4 bg-panel p-4">
            <GunIcon kind={GRENADE_KINDS[i]!} className="block h-12 w-20 shrink-0" />
            <div>
              <h3 className="text-base font-black uppercase tracking-wide">{GRENADE_NAMES[i]}</h3>
              <p className="text-sm text-dim">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
