/**
 * Generates the site icons and social preview image from one pixel-art sprite, with no image tools:
 * favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png and og-image.png (1200x630).
 * Run with `npm run make:icons`; the results live in `public/` and are committed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/', import.meta.url);
mkdirSync(OUT, { recursive: true });

/** Palette for the sprite: a sysadmin with glasses and a red tie. */
const PALETTE: Record<string, string> = {
  '.': '#10151f', H: '#2b1d12', S: '#f1c9a5', G: '#222228', B: '#2980b9', W: '#f4f4f1', T: '#c0392b',
};

/** 16 x 16 sprite; each character is one block. */
const SPRITE = [
  '................',
  '................',
  '....HHHHHHHH....',
  '....HHHHHHHH....',
  '....SSSSSSSS....',
  '....GGGGGGGG....',
  '....SGSSSSGS....',
  '....SSSSSSSS....',
  '....SSSSSSSS....',
  '......SSSS......',
  '..BBBBWTTWBBBB..',
  '..BBBBBTTBBBBB..',
  '..BBBBBTTBBBBB..',
  '..BBBBBTTBBBBB..',
  '..BBBBBBBBBBBB..',
  '................',
];

/** 5 x 7 block font for the preview image text. */
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
};

/** An RGBA pixel buffer with a rectangle fill, enough to draw blocky art. */
class Canvas {
  readonly data: Uint8Array;

  constructor(readonly w: number, readonly h: number, bg: string) {
    this.data = new Uint8Array(w * h * 4);
    this.rect(0, 0, w, h, bg);
  }

  /** Fills a rectangle (clipped to the canvas) with a `#rrggbb` colour. */
  rect(x: number, y: number, w: number, h: number, color: string): void {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const o = (j * this.w + i) * 4;
        this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = 255;
      }
    }
  }

  /** Draws the sprite with each block `cell` pixels wide. */
  sprite(x: number, y: number, cell: number): void {
    SPRITE.forEach((row, j) => [...row].forEach((c, i) => this.rect(x + i * cell, y + j * cell, cell, cell, PALETTE[c]!)));
  }

  /** Draws text in the block font; `px` is the size of one block. Unknown characters are blank. */
  text(s: string, x: number, y: number, px: number, color: string): void {
    let cx = x;
    for (const ch of s) {
      const glyph = FONT[ch];
      if (glyph) glyph.forEach((row, j) => [...row].forEach((c, i) => c === '#' && this.rect(cx + i * px, y + j * px, px, px, color)));
      cx += 6 * px;
    }
  }
}

/** CRC-32 table for PNG chunks. */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Builds one PNG chunk. */
function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  let c = 0xffffffff;
  for (const b of Buffer.concat([head.subarray(4), body])) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([head, body, tail]);
}

/** Encodes an RGBA canvas as a PNG file. */
function png(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((cv.w * 4 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (cv.w * 4 + 1)] = 0; // filter: none
    Buffer.from(cv.data.buffer, y * cv.w * 4, cv.w * 4).copy(raw, y * (cv.w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A square icon: the sprite scaled up by `scale`. */
function icon(size: number): Canvas {
  const cv = new Canvas(size, size, PALETTE['.']!);
  cv.sprite(0, 0, size / 16);
  return cv;
}

/** Writes a file into `public/`. */
const save = (name: string, data: Buffer | string) => writeFileSync(new URL(name, OUT), data);

// ---- favicon.svg: the same sprite as crisp blocks ----
const rects = SPRITE.flatMap((row, y) => [...row].map((c, x) => (c === '.' ? '' : `<rect x="${x}" y="${y}" width="1" height="1" fill="${PALETTE[c]}"/>`))).join('');
save('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" rx="2" fill="${PALETTE['.']}"/>${rects}</svg>\n`);

// ---- PNG icons ----
save('apple-touch-icon.png', png(icon(180)));
save('icon-192.png', png(icon(192)));
save('icon-512.png', png(icon(512)));

// ---- favicon.ico: a 32 x 32 PNG inside an ICO container (works in every browser) ----
const ico32 = png(icon(32));
const dir = Buffer.alloc(22);
dir.writeUInt16LE(1, 2); // type: icon
dir.writeUInt16LE(1, 4); // one image
dir[6] = 32; dir[7] = 32; // width, height
dir.writeUInt16LE(1, 10); // planes
dir.writeUInt16LE(32, 12); // bits per pixel
dir.writeUInt32LE(ico32.length, 14);
dir.writeUInt32LE(22, 18);
save('favicon.ico', Buffer.concat([dir, ico32]));

// ---- og-image.png: 1200 x 630 social preview ----
const og = new Canvas(1200, 630, '#0b0d12');
for (let i = 0; i < 6; i++) og.rect(60 + i * 200, 24, 120, 14, '#2a3140'); // ceiling lights
og.rect(0, 540, 1200, 14, '#2f80ed'); // office stripe
og.rect(0, 554, 1200, 76, '#3b4658'); // carpet
og.sprite(90, 130, 24);
og.text('IT WARS', 506 + 6, 176 + 6, 14, '#2f80ed');
og.text('IT WARS', 506, 176, 14, '#f4f4f1');
og.text('HAVE YOU TRIED TURNING THEM OFF?', 506, 316, 3, '#9fb0c8');
og.text('FREE MULTIPLAYER OFFICE SHOOTER', 506, 366, 3, '#ffd34a');
save('og-image.png', png(og));

console.log('icons written to public/');
