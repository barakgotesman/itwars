/**
 * Small inline SVG icons for the menu screens (copy, check, settings, exit, arrows), drawn on a 16 px grid with
 * square ends to match the blocky look. They use `currentColor`, so they follow the text colour of their button.
 */

/** Names of the available icons. */
export type IconName = 'copy' | 'check' | 'settings' | 'exit' | 'prev' | 'next';

/** The shapes of each icon, stroked at 2 px on a 16 x 16 grid. */
const SHAPES: Record<IconName, string[]> = {
  // Two overlapping sheets.
  copy: ['M5 5V1.5h9.5V11H11', 'M1.5 5h9.5v9.5H1.5z'],
  check: ['M2 8.5l4 4 8-9'],
  // A gear built from a square ring with four teeth.
  settings: ['M5 5h6v6H5z', 'M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13'],
  exit: ['M6 2H2v12h4', 'M6 8h8M10.5 4.5L14 8l-3.5 3.5'],
  prev: ['M10.5 2.5L5 8l5.5 5.5'],
  next: ['M5.5 2.5L11 8l-5.5 5.5'],
};

/** Renders an icon at `size` CSS pixels. */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      {SHAPES[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
