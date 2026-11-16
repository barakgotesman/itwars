/**
 * "The office is the arena": a short paragraph about the map and four fact chips whose numbers come from the
 * game's own data.
 */
import { ARENA_FACTS, ARENA_TEXT } from './copy';
import { Section } from './Section';

/** The arena section. */
export function Arena() {
  return (
    <Section id="arena" kicker="03 / The arena" title="The office is the arena" intro={ARENA_TEXT}>
      <ul className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {ARENA_FACTS.map((f) => (
          <li key={f.label} className="slab bg-panel p-5">
            <div className="text-5xl font-black text-accent">{f.value}</div>
            <div className="label mt-1">{f.label}</div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
