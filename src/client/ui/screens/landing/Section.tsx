/**
 * Shared frame for the landing page's content sections: an anchor id, a small yellow kicker, a big heading and a
 * one-line intro, centred in the page's column.
 */
import type { ReactNode } from 'react';

/** Props for {@link Section}. */
interface SectionProps {
  /** Anchor id the top bar links to. */
  id: string;
  /** Small label above the heading. */
  kicker: string;
  /** The section heading. */
  title: string;
  /** One line under the heading. */
  intro?: string;
  children: ReactNode;
}

/** One landing-page section. */
export function Section({ id, kicker, title, intro, children }: SectionProps) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-16 px-8 py-16">
      <p className="label !text-accent">{kicker}</p>
      <h2 className="mt-2 text-4xl font-black uppercase tracking-wide">{title}</h2>
      {intro && <p className="mt-3 max-w-2xl text-lg text-dim">{intro}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}
