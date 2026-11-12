/**
 * The "IT WARS" logo drawn from a 5x5 pixel font as inline SVG, so the title is as blocky as the game and needs
 * no image or font file. "IT" takes the accent colour, "WARS" the ink colour.
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

/** One word as a group of blocks starting at column `x0`. */
function wordBlocks(word: string, x0: number): { key: string; x: number; y: number }[] {
  const out: { key: string; x: number; y: number }[] = [];
  [...word].forEach((ch, li) => {
    GLYPHS[ch]!.forEach((line, y) => {
      [...line].forEach((cell, cx) => {
        if (cell === '#') out.push({ key: `${li}-${y}-${cx}`, x: x0 + li * 6 + cx, y });
      });
    });
  });
  return out;
}

/** Width of "IT", the gap, then "WARS" (each letter is 5 wide plus 1 spacing). */
const WIDTH = 2 * 6 + 2 + 4 * 6 - 2;

/** The logo; it scales to the width of its container. */
export function Logo() {
  return (
    <svg viewBox={`0 0 ${WIDTH} 5`} shapeRendering="crispEdges" className="block w-full" aria-hidden="true">
      <g fill="currentColor">{wordBlocks('IT', 0).map((b) => <rect key={b.key} x={b.x} y={b.y} width={1} height={1} />)}</g>
      <g fill="#f4f4f1">{wordBlocks('WARS', 14).map((b) => <rect key={b.key} x={b.x} y={b.y} width={1} height={1} />)}</g>
    </svg>
  );
}
