/**
 * The site footer: a strip at the end of each non-gameplay screen (it scrolls with the content, it is not pinned)
 * with the seven characters in a row, the tagline and a link to the source. The portraits are 2D renders of the
 * game's own models made by `tools/characters.html`, each in a different shirt colour holding a different gun.
 * Each figure is lifted by half its height (a negative margin, so the lift is part of the layout) so it stands out of the
 * strip, over the yellow top line, and on every page load is nudged a few pixels up or down and tilted a few degrees at
 * random so the lineup does not look stamped out. The strip is as tall as what is in it, so it always reaches the very
 * bottom of the page with nothing spilling out underneath.
 */
import { useState, type CSSProperties } from 'react';
import { CHARACTERS } from '@shared/core/characters';

/** Where the source lives. */
const REPO_URL = 'https://github.com/barakgotesman/itwars';

/** The footer strip. */
export function Footer() {
  /** Per-figure vertical nudge (px) and tilt (degrees), drawn once per mount. */
  const [looks] = useState(() => CHARACTERS.map(() => ({ nudge: Math.round(Math.random() * 16 - 8), tilt: Math.round(Math.random() * 20 - 10) })));
  return (
    // `--fig` is the figure height; the top margin leaves room for the half of each figure that rises above the strip.
    <footer className="relative mt-[calc(var(--fig)/2+1.5rem)] flex shrink-0 items-start justify-between gap-6 border-t-4 border-accent bg-panel px-6 pb-4 [--fig:84px] [@media(max-height:720px)]:[--fig:60px]">
      <p className="hidden shrink-0 self-center text-sm font-bold text-dim lg:block lg:w-64">
        <span className="text-accent">IT Wars</span>
        <br />
        Have you tried turning them off?
      </p>
      <ul className="mx-auto -mt-[calc(var(--fig)/2)] flex items-start gap-3 sm:gap-6">
        {CHARACTERS.map((c, i) => (
          <li
            key={c.slug}
            title={c.name}
            style={{ '--nudge': `${looks[i]!.nudge}px`, '--tilt': `${looks[i]!.tilt}deg` } as CSSProperties}
            className="translate-y-(--nudge) rotate-[var(--tilt)] transition-transform duration-100 hover:translate-y-[calc(var(--nudge)-4px)]"
          >
            <img
              src={`/characters/${c.slug}.png`}
              alt={c.name}
              width={75}
              height={84}
              loading="lazy"
              draggable={false}
              className="block h-(--fig) w-[calc(var(--fig)*0.893)] select-none"
            />
          </li>
        ))}
      </ul>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="hidden shrink-0 self-center text-right text-sm font-bold text-dim hover:text-ink lg:block lg:w-64"
      >
        Source on GitHub
      </a>
    </footer>
  );
}
