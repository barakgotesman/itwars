/**
 * The slim bar pinned to the top: the small logo on the left, anchor links to the sections and the Settings
 * button on the right. The logo only fades in once the hero's big logo has scrolled out of view, so the two
 * never show together.
 */
import { Logo } from '../../components/Logo';

/** Props for {@link TopBar}. */
interface TopBarProps {
  /** Opens the settings screen. */
  onOpenSettings(): void;
  /** True once the hero's own logo is off screen. */
  showLogo: boolean;
}

/** Section links shown in the bar. */
const LINKS: readonly (readonly [href: string, label: string])[] = [
  ['#how', 'How it plays'],
  ['#arsenal', 'Arsenal'],
  ['#staff', 'The staff'],
];

/** The top bar. */
export function TopBar({ onOpenSettings, showLogo }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 w-full shrink-0 bg-ground/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-8">
        <a
          href="#top" aria-label="IT Wars, back to the top" aria-hidden={!showLogo} tabIndex={showLogo ? 0 : -1}
          className={`block w-28 transition-opacity duration-200 ${showLogo ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <Logo />
        </a>
        <nav className="flex items-center gap-6 text-sm font-bold uppercase tracking-wider text-dim">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className="hidden hover:text-ink md:block">{label}</a>
          ))}
          <button type="button" className="btn-quiet" onClick={onOpenSettings}>Settings</button>
        </nav>
      </div>
    </header>
  );
}
