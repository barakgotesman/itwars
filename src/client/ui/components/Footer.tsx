/**
 * The site footer: a strip along the bottom edge with the seven characters standing in a row (2D portraits
 * rendered from the game's own models by `tools/characters.html`, each in a different shirt colour), the
 * tagline and a link to the source. It is mounted once in `App.tsx`; every screen stops above it
 * (`--footer-h` in `styles.css`), so it never covers a control.
 */
import { CHARACTERS } from '@shared/core/characters';

/** Where the source lives. */
const REPO_URL = 'https://github.com/barakgotesman/itwars';

/** The footer strip. */
export function Footer() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 flex h-(--footer-h) items-end justify-between gap-6 border-t-4 border-accent bg-panel px-6">
      <p className="hidden shrink-0 self-center text-sm font-bold text-dim lg:block lg:w-64">
        <span className="text-accent">IT Wars</span>
        <br />
        Have you tried turning them off?
      </p>
      {/* The floor line: the figures stand on it, so the strip reads as a lineup rather than a row of icons. */}
      <ul className="mx-auto flex items-end gap-3 sm:gap-6">
        {CHARACTERS.map((c) => (
          <li key={c.slug} title={c.name} className="transition-transform duration-100 hover:-translate-y-1">
            <img
              src={`/characters/${c.slug}.png`}
              alt={c.name}
              width={75}
              height={84}
              loading="lazy"
              draggable={false}
              className="block h-[84px] w-[75px] select-none [@media(max-height:720px)]:h-[58px] [@media(max-height:720px)]:w-[52px]"
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
