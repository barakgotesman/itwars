/**
 * Small inline SVG icons for the menu screens (copy, check, settings, exit), drawn on a 16 px grid with square
 * ends to match the blocky look. They use `currentColor`, so they follow the text colour of the button they sit in.
 */

/** Names of the available icons. */
export type IconName = 'copy' | 'check' | 'settings' | 'exit';

/** SVG paths for each icon, stroked at 2 px on a 16 x 16 grid. */
const PATHS: Record<IconName, string> = {
  // Two overlapping sheets.
  copy: '<path d="M5 5V1.5h9.5V11H11"/><path d="M1.5 5h9.5v9.5H1.5z"/>',
  check: '<path d="M2 8.5l4 4 8-9"/>',
  // A gear built from a square ring with four teeth.
  settings: '<path d="M5 5h6v6H5z"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13"/>',
  exit: '<path d="M6 2H2v12h4"/><path d="M6 8h8M10.5 4.5L14 8l-3.5 3.5"/>',
};

/**
 * SVG markup for an icon.
 * @param name - Which icon.
 * @param size - Width and height in CSS pixels.
 */
export function iconSvg(name: IconName, size = 16): string {
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${PATHS[name]}</svg>`;
}

/**
 * Puts an icon and a text label into a button, replacing its content.
 * @param el - The button.
 * @param name - Which icon.
 * @param label - Text after the icon; omit for an icon-only button.
 */
export function setIconLabel(el: HTMLElement, name: IconName, label = ''): void {
  // Static markup built from the constants above; the label goes in as text, never as HTML.
  el.innerHTML = iconSvg(name);
  if (label) {
    const span = document.createElement('span');
    span.textContent = label;
    el.append(span);
  }
}
