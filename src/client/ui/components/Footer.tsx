/**
 * The site footer: a strip at the end of each non-gameplay screen (it scrolls with the content, it is not pinned)
 * with the seven characters in a row, the tagline and a link to the source. The portraits are 2D renders of the
 * game's own models made by `tools/characters.html`, each in a different shirt colour holding a different gun.
 * Each figure is lifted by half its height so it stands out of the strip, over the yellow top line, and on every page
 * load is nudged a few pixels up or down and tilted a few degrees at random so the lineup does not look stamped out.
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
    // The top margin leaves room for the half of each figure that rises above the strip.
    <footer className="relative mt-12 flex h-16 shrink-0 items-start justify-between gap-6 border-t-4 border-accent bg-panel px-6 [@media(max-height:720px)]:mt-10 [@media(max-height:720px)]:h-12">
      <p className="hidden shrink-0 self-center text-sm font-bold text-dim lg:block lg:w-64">
        <span className="text-accent">IT Wars</span>
        <br />
        Have you tried turning them off?
      </p>
      <ul className="mx-auto flex items-start gap-3 sm:gap-6">
        {CHARACTERS.map((c, i) => (
          <li
            key={c.slug}
            title={c.name}
            style={{ '--nudge': `${looks[i]!.nudge}px`, '--tilt': `${looks[i]!.tilt}deg` } as CSSProperties}
            className="translate-y-[calc(-50%+var(--nudge))] rotate-[var(--tilt)] transition-transform duration-100 hover:translate-y-[calc(-50%+var(--nudge)-4px)]"
          >
            <img
              src={`/characters/${c.slug}.png`}
              alt={c.name}
              width={75}
              height={84}
              loading="lazy"
              draggable={false}
              className="block h-[84px] w-[75px] select-none [@media(max-height:720px)]:h-[60px] [@media(max-height:720px)]:w-[54px]"
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
