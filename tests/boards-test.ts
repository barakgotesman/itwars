/**
 * Checks the data behind the wall boards and signs: ranking and clock helpers, the kill-limit template on the
 * banner, the feed-line text shown in the boards' "latest" strip, and that every board sits on free wall.
 * Run with `npm run test:boards`.
 */
import { feedLineText } from '@client/hud/feed';
import { fillRuleTokens, formatClock, rankPlayers } from '@shared/rules/standings';
import { BOARDS, LABELS } from '@shared/world/map';
import { NORTH_DOORS, SOUTH_DOORS } from '@shared/world/map/shell';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) return;
  failed++;
  console.log(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
}

// ---- ranking and formatting
const p = (name: string, kills: number, deaths: number) => ({ name, kills, deaths });
const ranked = rankPlayers([p('b', 5, 2), p('a', 5, 2), p('c', 7, 9), p('d', 5, 1)]).map((x) => x.name);
check('ranking: most kills first, fewer deaths, then name', ranked.join('') === 'cdab', ranked.join(''));
const input = [p('x', 1, 0), p('y', 2, 0)];
rankPlayers(input);
check('ranking does not reorder its input', input[0]!.name === 'x');
check('clock formats m:ss', formatClock(437) === '7:17' && formatClock(60) === '1:00' && formatClock(-4) === '0:00' && formatClock(9) === '0:09');

// ---- the banner shows the room's real kill limit
const rules = { killLimit: 30, timeLimitMin: 10 };
check('kill limit fills into the banner text', fillRuleTokens('Q4 TARGET: {KILLS} KILLS', rules) === 'Q4 TARGET: 30 KILLS');
check('minutes fill in, "no" without a limit', fillRuleTokens('{MINUTES} min', rules) === '10 min' && fillRuleTokens('{MINUTES} min', { killLimit: 50, timeLimitMin: 0 }) === 'no min');
check('the map banner uses the template, not a fixed number', LABELS.some((l) => l.text.includes('{KILLS}')) && !LABELS.some((l) => /\b50 KILLS/.test(l.text)));

// ---- feed lines become text for the board strip
const name = (text: string, tone: 'name' | 'me' = 'name') => ({ text, tone });
check('kill line reads "A killed B"', feedLineText([name('Dan'), { icon: 1 }, name('Barak')], 'Me') === 'Dan killed Barak');
check('your own name replaces "You"', feedLineText([name('You', 'me'), { icon: 1 }, name('Dan')], 'Barak') === 'Barak killed Dan');
check('a self-kill reads "A got killed"', feedLineText([name('Dan'), { icon: 3 }, name('Dan')], 'Me') === 'Dan got killed');
check('a join line reads naturally', feedLineText([name('Dan'), { text: ' joined the session' }], 'Me') === 'Dan joined the session');

// ---- boards sit on free wall
const span = (b: (typeof BOARDS)[number]): [number, number] => (b.axis === 'x' ? [b.x - b.w / 2, b.x + b.w / 2] : [b.z - b.w / 2, b.z + b.w / 2]);
check('there are three boards', BOARDS.length === 3, `${BOARDS.length}`);
for (const b of BOARDS) {
  const [a, c] = span(b);
  const gaps = b.axis === 'x' ? (b.z < 0 ? NORTH_DOORS : SOUTH_DOORS) : [];
  for (const [centre, width] of gaps) {
    check(`board at ${b.x},${b.z} clears the door at ${centre}`, c < centre - width / 2 - 0.3 || a > centre + width / 2 + 0.3);
  }
  check(`board at ${b.x},${b.z} fits between floor and ceiling`, b.y - b.h / 2 > 0.6 && b.y + b.h / 2 < 4.0);
  check(`board at ${b.x},${b.z} stays inside the map`, a > -49 && c < 49 && Math.abs(b.z) < 35);
}
for (let i = 0; i < BOARDS.length; i++) {
  for (let j = i + 1; j < BOARDS.length; j++) {
    const a = BOARDS[i]!, b = BOARDS[j]!;
    if (a.axis !== b.axis || Math.abs((a.axis === 'x' ? a.z : a.x) - (b.axis === 'x' ? b.z : b.x)) > 1) continue;
    const [a0, a1] = span(a), [b0, b1] = span(b);
    check('boards on one wall do not overlap', a1 < b0 || b1 < a0);
  }
}
// Door signs face outward only: one sign per doorway side, never two per door.
const doorSigns = LABELS.filter((l) => l.h < 0.7 && l.w >= 2.8 && Math.abs(l.y - 3.45) < 0.01);
const perDoor = new Map<string, number>();
for (const l of doorSigns) perDoor.set(`${l.text}|${l.axis === 'x' ? l.x : l.z}`, (perDoor.get(`${l.text}|${l.axis === 'x' ? l.x : l.z}`) ?? 0) + 1);
check('each doorway has a single outward-facing sign', [...perDoor.values()].every((n) => n === 1), JSON.stringify([...perDoor]));

if (failed > 0) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('test:boards OK');
