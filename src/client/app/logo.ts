/**
 * Draws the "IT WARS" logo from a 5x5 pixel font as inline SVG, so the title is as blocky as the game
 * and needs no image or font file. "IT" takes the accent colour, "WARS" the ink colour.
 */

/** 5x5 glyphs for the letters of the title; `#` is a filled block. */
const GLYPHS: Record<string, readonly string[]> = {
  I: ['#####', '..#..', '..#..', '..#..', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
};

/**
 * Renders the logo into an element.
 * @param el - Container; it is filled with one SVG that scales to its width.
 */
export function renderLogo(el: HTMLElement): void {
  const words = ['IT', 'WARS'];
  let x = 0;
  let rects = '';
  const parts: string[] = [];
  words.forEach((word, wi) => {
    rects = '';
    for (const ch of word) {
      GLYPHS[ch]!.forEach((line, y) => {
        [...line].forEach((cell, cx) => {
          if (cell === '#') rects += `<rect x="${x + cx}" y="${y}" width="1" height="1"/>`;
        });
      });
      x += 6;
    }
    parts.push(`<g fill="${wi === 0 ? 'currentColor' : '#f4f4f1'}">${rects}</g>`);
    x += 2;
  });
  // Static markup built from the constants above, never from user input.
  el.innerHTML = `<svg viewBox="0 0 ${x - 2} 5" shape-rendering="crispEdges" class="block w-full" aria-hidden="true">${parts.join('')}</svg>`;
}
