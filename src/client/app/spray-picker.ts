/**
 * The spray design picker: a small carousel with the chosen design shown large on a neutral grey stage (so yellow,
 * white and black designs all stay visible, which a highlighted button could not do), arrows to step through, the
 * design's name and a dot per design. Left and Right arrow keys step too while it has focus.
 */
import { SPRAYS, SPRAY_COUNT } from '@shared/rules/sprays';
import { drawSpray } from '@client/render/sprays';
import { iconSvg } from './icons';

/** Handle for the picker. */
export interface SprayPicker {
  /** Shows a design without calling `onChange`. */
  set(index: number): void;
}

/**
 * Builds the carousel into a container.
 * @param host - Element that receives the carousel.
 * @param initial - Design shown first.
 * @param onChange - Called with the new index when the player steps to another design.
 */
export function createSprayPicker(host: HTMLElement, initial: number, onChange: (index: number) => void): SprayPicker {
  let index = initial;
  host.className = 'flex flex-col gap-2';

  const row = document.createElement('div');
  row.className = 'flex items-center gap-2';
  const arrow = (dir: -1 | 1) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-quiet inline-flex !p-2.5';
    b.setAttribute('aria-label', dir < 0 ? 'Previous spray design' : 'Next spray design');
    // Static markup from the icon set, never from user input.
    b.innerHTML = iconSvg(dir < 0 ? 'prev' : 'next');
    b.addEventListener('click', () => step(dir));
    return b;
  };

  // A mid-grey stage: every design, light or dark, contrasts with it.
  const stage = document.createElement('div');
  stage.className = 'flex h-20 w-20 shrink-0 items-center justify-center bg-[#5a6275]';
  const art = document.createElement('canvas');
  art.width = 16;
  art.height = 16;
  art.className = 'h-16 w-16 [image-rendering:pixelated]';
  stage.append(art);

  const info = document.createElement('div');
  info.className = 'flex min-w-0 flex-1 flex-col gap-2';
  const name = document.createElement('div');
  name.className = 'truncate text-base font-extrabold';
  const dots = document.createElement('div');
  dots.className = 'flex flex-wrap gap-1';
  const dotEls = SPRAYS.map((s, i) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.title = s.name;
    d.setAttribute('aria-label', `Spray design: ${s.name}`);
    d.className = 'h-2.5 w-2.5 cursor-pointer';
    d.addEventListener('click', () => go(i));
    dots.append(d);
    return d;
  });
  info.append(name, dots);
  row.append(arrow(-1), stage, arrow(1), info);
  host.append(row);

  const g = art.getContext('2d')!;
  /** Repaints the stage, the name and the dots for the current index. */
  const show = () => {
    g.clearRect(0, 0, 16, 16);
    g.drawImage(drawSpray(index), 0, 0);
    name.textContent = SPRAYS[index]!.name;
    dotEls.forEach((d, i) => { d.className = `h-2.5 w-2.5 cursor-pointer ${i === index ? 'bg-accent' : 'bg-[#3a4766] hover:bg-faint'}`; });
  };
  const go = (i: number) => {
    index = (i + SPRAY_COUNT) % SPRAY_COUNT;
    show();
    onChange(index);
  };
  const step = (dir: -1 | 1) => go(index + dir);

  host.tabIndex = 0;
  host.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });
  show();
  return { set(i) { index = i; show(); } };
}
