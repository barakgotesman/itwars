/**
 * "The staff": the seven characters as info cards with their portraits and one-liners. Picking a character is done
 * with the arrows on the hero, not here; a link takes the visitor back up to it.
 */
import { CHARACTERS } from '@shared/core/characters';
import { STAFF_TEXT } from './copy';
import { Section } from './Section';

/** The staff section. */
export function Staff() {
  return (
    <Section id="staff" kicker="04 / The staff" title="Meet the staff" intro={STAFF_TEXT}>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {CHARACTERS.map((c) => (
          <li key={c.slug} className="slab flex flex-col items-center gap-2 bg-panel p-3 text-center">
            <img src={`/characters/${c.slug}.png`} alt="" width={107} height={120} loading="lazy" draggable={false} className="block h-28 w-auto select-none" />
            <h3 className="text-base font-black uppercase tracking-wide">{c.name}</h3>
            <p className="text-xs text-dim">{c.blurb}</p>
          </li>
        ))}
      </ul>
      <a href="#top" className="btn-quiet mt-8 inline-block">Pick yours at the top</a>
    </Section>
  );
}
