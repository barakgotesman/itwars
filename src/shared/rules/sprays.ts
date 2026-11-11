/**
 * Spray-paint designs: small pixel-art tags players leave on walls. Pure data shared by the menu picker and
 * the renderer. Each design is up to 16 x 16 cells; `.` is transparent and every other character is a key into
 * `SPRAY_PALETTE`. Rows or columns left out count as transparent.
 */

/** Edge length of the design grid, in cells. */
export const SPRAY_GRID = 16;

/** Colours used by the designs, as CSS hex strings. */
export const SPRAY_PALETTE: Readonly<Record<string, string>> = {
  w: '#f4f4f1', k: '#15171a', r: '#e0503f', u: '#2f6fdd', g: '#5be37d',
  a: '#9aa3b2', b: '#7a4a28', y: '#ffd23f', s: '#c4cbd3', o: '#ff7a1a',
};

/** One tag design. */
export interface SprayDef {
  name: string;
  rows: readonly string[];
}

/** Every design, in the order the menu shows them; a design's index is what travels over the network. */
export const SPRAYS: readonly SprayDef[] = [
  { name: '404', rows: [
    '',
    '.rrrrrrrrrrrrrr.',
    '',
    '.r..r.rrrr.r..r.',
    '.r..r.r..r.r..r.',
    '.rrrr.r..r.rrrr.',
    '....r.r..r....r.',
    '....r.rrrr....r.',
    '',
    '.rrrrrrrrrrrrrr.',
  ] },
  { name: 'Skull', rows: [
    '',
    '....wwwwwwww....',
    '...wwwwwwwwww...',
    '..wwwwwwwwwwww..',
    '..wwwwwwwwwwww..',
    '..wwkkkwwkkkww..',
    '..wwkkkwwkkkww..',
    '..wwkkkwwkkkww..',
    '...wwwwkkwwww...',
    '....wwwkkwww....',
    '.....wwwwww.....',
    '.....wkwkwkw....',
    '.....wkwkwkw....',
    '......wwwww.....',
  ] },
  { name: 'Coffee', rows: [
    '',
    '.....a..a.......',
    '......a..a......',
    '.....a..a.......',
    '',
    '..wwwwwwwwww....',
    '..wbbbbbbbbw....',
    '..wbbbbbbbbwwww.',
    '..wbbbbbbbbw..w.',
    '..wbbbbbbbbw..w.',
    '..wbbbbbbbbwwww.',
    '...wbbbbbbw.....',
    '...wwwwwwww.....',
    '..wwwwwwwwww....',
  ] },
  { name: 'Reboot', rows: [
    '.......gg.......',
    '.......gg.......',
    '...gg..gg..gg...',
    '..ggg..gg..ggg..',
    '.ggg...gg...ggg.',
    '.gg....gg....gg.',
    '.gg..........gg.',
    '.gg..........gg.',
    '.gg..........gg.',
    '.ggg........ggg.',
    '..ggg......ggg..',
    '...ggg....ggg...',
    '....gggggggg....',
  ] },
  { name: 'Error', rows: [
    '',
    '.aaaaaaaaaaaaaa.',
    '.auuuuuuuuuuuua.',
    '.aaaaaaaaaaaaaa.',
    '.awwwwwwwwwwwwa.',
    '.awwrrwwwwrrwwa.',
    '.awwwrrwwrrwwwa.',
    '.awwwwrrrrwwwwa.',
    '.awwwwrrrrwwwwa.',
    '.awwwrrwwrrwwwa.',
    '.awwrrwwwwrrwwa.',
    '.awwwwwwwwwwwwa.',
    '.aaaaaaaaaaaaaa.',
  ] },
  { name: 'Floppy', rows: [
    '',
    '.uuuuuuuuuuuuu..',
    '.uussssssskkuu..',
    '.uussssssskkuu..',
    '.uussssssskkuu..',
    '.uuuuuuuuuuuuu..',
    '.uuwwwwwwwwwuu..',
    '.uuwwwwwwwwwuu..',
    '.uuwwwwwwwwwuu..',
    '.uuwwwwwwwwwuu..',
    '.uuwwwwwwwwwuu..',
    '.uuuuuuuuuuuuu..',
  ] },
  { name: 'Ticket', rows: [
    '',
    '',
    '.yyyyyyyyyyyyyy.',
    '.yykkkkkkkkkkyy.',
    '.yyyyyyyyyyyyyy.',
    '.yykkkkkkkkyyyy.',
    '.yyyyyyyyyyyyyy.',
    '.yykkkkkkkkkkyy.',
    '.yyyyyyyyyyyyyy.',
    '.yykkkkyyyrrryy.',
    '.yyyyyyyyyrrryy.',
    '.yyyyyyyyyyyyyy.',
  ] },
  { name: 'Blue screen', rows: [
    '',
    '.kkkkkkkkkkkkkk.',
    '.kuuuuuuuuuuuuk.',
    '.kuuuuuuuuuuuuk.',
    '.kuuwuuuuwuuuuk.',
    '.kuuwuuuuwuuuuk.',
    '.kuuuuuuuuuuuuk.',
    '.kuuuwwwwwuuuuk.',
    '.kuuwuuuuuwuuuk.',
    '.kuuuuuuuuuuuuk.',
    '.kkkkkkkkkkkkkk.',
    '.......kk.......',
    '....kkkkkkkk....',
  ] },
  { name: 'Rubber duck', rows: [
    '',
    '......yyyy......',
    '.....yyyyyy.....',
    '.....ykyyyy.....',
    '.....yyyyoooo...',
    '.....yyyyyy.....',
    '...yyyyyyyyy....',
    '..yyyyyyyyyyy...',
    '.yyyyyyyyyyyyy..',
    '.yyyyyyyyyyyyy..',
    '..yyyyyyyyyyy...',
    '...yyyyyyyyy....',
  ] },
];

/** Number of designs; used to validate a received design index. */
export const SPRAY_COUNT = SPRAYS.length;
