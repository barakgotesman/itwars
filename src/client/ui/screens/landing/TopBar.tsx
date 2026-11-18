/**
 * The slim bar pinned to the top: the small logo on the left and anchor links to the sections on the right. The logo only fades in once the hero's big logo has scrolled out of view, so the two
 * never show together. While the page scrolls the bar follows along: the link of the section you are in lights up
 * with a yellow underline, a thin yellow line under the bar fills with how far down the page you are, and the bar
 * gains an edge and a shadow once it leaves the top. The scroll position is read straight from the page's scroller
 * (throttled to one read per frame); only a change of section re-renders.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Logo } from '../../components/Logo';

/** Props for {@link TopBar}. */
interface TopBarProps {
  /** True once the hero's own logo is off screen. */
  showLogo: boolean;
  /** The element that scrolls the landing page. */
  scroller: RefObject<HTMLElement | null>;
}

/** Section links shown in the bar, in page order. */
const LINKS: readonly (readonly [href: string, label: string])[] = [
  ['#how', 'How it plays'],
  ['#arsenal', 'Arsenal'],
  ['#arena', 'Arena'],
  ['#staff', 'The staff'],
];

/** A section counts as the current one once its top is this far (px) above the middle-ish line of the window. */
const ACTIVE_LINE_PX = 160;
/** The bar gets its edge and shadow after the page has scrolled this far (px). */
const EDGE_AFTER_PX = 8;

/** The top bar. */
export function TopBar({ showLogo, scroller }: TopBarProps) {
  const [active, setActive] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const progress = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = root.scrollTop;
      const base = root.getBoundingClientRect().top;
      // The last section whose top has passed the line; none while the hero is still on screen.
      let current: string | null = null;
      for (const [href] of LINKS) {
        const el = document.getElementById(href.slice(1));
        if (el && el.getBoundingClientRect().top - base <= ACTIVE_LINE_PX) current = href;
      }
      setActive(current);
      setScrolled(top > EDGE_AFTER_PX);
      const max = Math.max(1, root.scrollHeight - root.clientHeight);
      if (progress.current) progress.current.style.transform = `scaleX(${Math.min(1, top / max)})`;
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scroller]);

  return (
    <header
      className={`sticky top-0 z-30 w-full shrink-0 backdrop-blur-sm transition-[background-color,box-shadow] duration-300 ${
        scrolled ? 'bg-ground/95 shadow-[0_6px_0_rgba(0,0,0,0.35)]' : 'bg-ground/90'
      }`}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-8">
        <a
          href="#top" aria-label="IT Wars, back to the top" aria-hidden={!showLogo} tabIndex={showLogo ? 0 : -1}
          className={`block w-28 transition-opacity duration-200 ${showLogo ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <Logo />
        </a>
        <nav className="flex items-center gap-6 text-sm font-bold uppercase tracking-wider text-dim">
          {LINKS.map(([href, label]) => {
            const on = href === active;
            return (
              <a
                key={href}
                href={href}
                aria-current={on ? 'true' : undefined}
                className={`relative hidden py-1 transition-colors duration-200 hover:text-ink md:block ${on ? 'text-ink' : ''}`}
              >
                {label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 -bottom-0.5 h-[3px] origin-left bg-accent transition-transform duration-300 ease-out motion-reduce:transition-none ${on ? 'scale-x-100' : 'scale-x-0'}`}
                />
              </a>
            );
          })}
        </nav>
      </div>
      {/* How far down the page you are. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/5" aria-hidden="true">
        <div ref={progress} className="h-full origin-left scale-x-0 bg-accent" />
      </div>
    </header>
  );
}
