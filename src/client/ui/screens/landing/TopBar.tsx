/**
 * The slim bar above the hero: the small logo on the left, anchor links to the sections and the Settings
 * button on the right. It scrolls away with the page (it is not pinned).
 */
import { Logo } from '../../components/Logo';

/** Props for {@link TopBar}. */
interface TopBarProps {
  /** Opens the settings screen. */
  onOpenSettings(): void;
}

/** Section links shown in the bar. */
const LINKS: readonly (readonly [href: string, label: string])[] = [
  ['#how', 'How it plays'],
  ['#arsenal', 'Arsenal'],
  ['#staff', 'The staff'],
];

/** The top bar. */
export function TopBar({ onOpenSettings }: TopBarProps) {
  return (
    <header className="w-full shrink-0 bg-ground/85">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-8">
        <a href="#top" className="block w-28" aria-label="IT Wars, back to the top"><Logo /></a>
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
