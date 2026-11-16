/**
 * "How it plays": three numbered blocks that take a visitor from hosting a room to the podium.
 */
import { STEPS } from './copy';
import { Section } from './Section';

/** The how-it-plays section. */
export function HowItPlays() {
  return (
    <Section id="how" kicker="01 / How it plays" title="Three steps to a deathmatch">
      <ol className="grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="slab flex flex-col gap-3 bg-panel p-6">
            <span className="text-5xl font-black text-accent">{i + 1}</span>
            <h3 className="text-2xl font-black uppercase tracking-wide">{s.title}</h3>
            <p className="text-base text-dim">{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
