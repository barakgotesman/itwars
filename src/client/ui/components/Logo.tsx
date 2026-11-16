/**
 * The "IT WARS" logo drawn from a 5x5 pixel font as inline SVG, so the title is as blocky as the game and needs
 * no image or font file. Each letter has a hard, offset shadow behind it, like an extruded voxel sign. "IT" takes
 * the accent colour, "WARS" the ink colour.
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

/** Accent yellow, and the darker tones of the shadows behind each word. */
const YELLOW = '#ffd23f';
const YELLOW_SHADOW = '#a47c0f';
const INK = '#f4f4f1';
const INK_SHADOW = '#5d6678';

/** One filled block of a word. */
interface Block {
  key: string;
  x: number;
  y: number;
}

/** One word as blocks starting at column `x0`; letters are 5 wide with 1 spacing. */
function wordBlocks(word: string, x0: number): Block[] {
  const out: Block[] = [];
  [...word].forEach((ch, li) => {
    GLYPHS[ch]!.forEach((line, y) => {
      [...line].forEach((cell, cx) => {
        if (cell === '#') out.push({ key: `${word}${li}-${y}-${cx}`, x: x0 + li * 6 + cx, y });
      });
    });
  });
  return out;
}

/** Width of "IT", the gap, then "WARS" (each letter is 5 wide plus 1 spacing). */
const WIDTH = 2 * 6 + 2 + 4 * 6 - 2;
/** How far the shadow sits down and right, in blocks. */
const SHADOW = 0.45;

/** One word in a colour with its shadow copy shifted down and right behind it. */
function Word({ word, x0, fill, shadow }: { word: string; x0: number; fill: string; shadow: string }) {
  const blocks = wordBlocks(word, x0);
  return (
    <>
      <g fill={shadow} transform={`translate(${SHADOW} ${SHADOW})`}>
        {blocks.map((b) => <rect key={`s${b.key}`} x={b.x} y={b.y} width={1} height={1} />)}
      </g>
      <g fill={fill}>{blocks.map((b) => <rect key={b.key} x={b.x} y={b.y} width={1} height={1} />)}</g>
    </>
  );
}

/** The logo; it scales to the width of its container. */
export function Logo() {
  return (
    <svg viewBox={`0 0 ${WIDTH + SHADOW} ${5 + SHADOW}`} shapeRendering="crispEdges" className="block w-full" role="img" aria-label="IT Wars">
      <Word word="IT" x0={0} fill={YELLOW} shadow={YELLOW_SHADOW} />
      <Word word="WARS" x0={14} fill={INK} shadow={INK_SHADOW} />
    </svg>
  );
}
