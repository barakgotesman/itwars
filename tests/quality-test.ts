/**
 * Headless tests for automatic graphics quality: the one-time calibration is driven by simulated machines
 * of different speeds, and the hardware guess is checked against fake GPUs. Run with `npm run test:quality`.
 */
import { Calibration, TIERS, currentTier, effectiveGraphics, guessTier, initQuality, setTier } from '@client/platform/quality';
import { settings } from '@client/platform/settings';

let failed = 0;

/** Records a named check. */
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

const LAST = TIERS.length - 1;

/** Result of a simulated calibration run. */
interface Run {
  cal: Calibration;
  /** Tiers visited, in order, starting with the first one. */
  visited: number[];
  /** Final tier reported by the calibration, or -1 if it never finished. */
  result: number;
  /** Seconds of game time until it finished. */
  seconds: number;
}

/**
 * Runs a calibration on a pretend machine.
 * @param fpsAt - Frame rate the machine manages at a given tier (capped at 60 like a 60 Hz screen).
 * @param startTier - Where calibration starts (the hardware guess).
 * @param opts - `visible` frames-visible predicate by time; `hitchEvery` inserts a long frame every n frames.
 */
function calibrate(fpsAt: (tier: number) => number, startTier = 0, opts: { hitchEvery?: number; hiddenUntil?: number } = {}): Run {
  setTier(startTier, false);
  const out: Run = { cal: null as unknown as Calibration, visited: [startTier], result: -1, seconds: 0 };
  out.cal = new Calibration((tier) => {
    out.result = tier;
  });
  let t = 0;
  let n = 0;
  while (t < 120 && !out.cal.done) {
    n++;
    const dt = opts.hitchEvery && n % opts.hitchEvery === 0 ? 0.8 : 1 / Math.min(60, fpsAt(currentTier()));
    out.cal.frame(dt, t >= (opts.hiddenUntil ?? 0));
    if (out.visited[out.visited.length - 1] !== currentTier()) out.visited.push(currentTier());
    t += dt;
  }
  out.seconds = t;
  return out;
}

settings.autoQuality = true;

// A capable machine is measured once, quickly, and left on High.
{
  const r = calibrate(() => 144);
  check('fast machine keeps High', r.result === 0 && r.visited.length === 1);
  check('and calibration is quick (under 4 s)', r.seconds < 4, `${r.seconds.toFixed(1)}s`);
}

// A machine that holds 60 only on a lighter preset ends exactly there, stepping down one rung at a time.
{
  const r = calibrate((t) => (t >= 3 ? 60 : 35));
  check('lands on the first preset that holds 60', r.result === 3, `result=${r.result}`);
  check('steps down in order', r.visited.join(',') === '0,1,2,3', r.visited.join(','));
}

// Hopelessly slow: skips rungs, then stops at the lightest preset.
{
  const r = calibrate(() => 12);
  check('a very slow machine ends on the lightest preset', r.result === LAST, `result=${r.result}`);
  check('it skips rungs when far off target', r.visited.length < TIERS.length, r.visited.join(','));
}

// A machine at about 1 FPS is slow, not "hitching": it must be detected quickly instead of being ignored.
{
  const r = calibrate(() => 1);
  check('a 1 FPS machine ends on the lightest preset', r.result === LAST, `result=${r.result}`);
  check('and that is decided in well under the time limit', r.seconds < 16, `${r.seconds.toFixed(1)}s`);
}

// Never goes up: a machine that is fine at every preset is not "upgraded" past where it started.
{
  const r = calibrate(() => 60, 2);
  check('calibration never raises the preset', r.result === 2 && r.visited.join(',') === '2');
}

// The result is final: later frames, however slow, change nothing.
{
  const r = calibrate(() => 60, 1);
  const before = currentTier();
  for (let i = 0; i < 600; i++) r.cal.frame(1 / 10, true);
  check('nothing changes after calibration is done', currentTier() === before && r.cal.done);
}

// Hitches and hidden tabs are not measurements.
{
  const r = calibrate(() => 60, 0, { hitchEvery: 150 });
  check('occasional hitches do not lower the preset', r.result === 0, `result=${r.result}`);
  const storm = calibrate(() => 60, 0, { hitchEvery: 20 });
  check('even constant hitching cannot hold up entering the game', storm.result >= 0 && storm.seconds <= 21, `result=${storm.result} seconds=${storm.seconds.toFixed(1)}`);
  const h = calibrate(() => 15, 0, { hiddenUntil: 6 });
  check('frames while the tab is hidden are ignored', h.seconds > 6 && h.visited[0] === 0);
}

// Gives up after 20 seconds even if it cannot decide.
{
  const r = calibrate((t) => (t >= LAST ? 60 : 50), 0);
  check('always finishes', r.result >= 0 && r.seconds <= 21, `seconds=${r.seconds.toFixed(1)} result=${r.result}`);
}

// Effective graphics: the calibrated preset in auto mode, the player's own options in manual.
{
  setTier(2, false);
  check('auto mode uses the calibrated preset', effectiveGraphics() === TIERS[2]);
  settings.autoQuality = false;
  settings.renderScale = 0.5;
  settings.bloom = false;
  const g = effectiveGraphics();
  check('manual mode uses the player options', g.renderScale === 0.5 && !g.bloom);
  settings.autoQuality = true;
  settings.renderScale = 1;
  settings.bloom = true;
}

// With nothing saved, a calibration is needed.
check('first run asks for calibration', initQuality(null) === true);

// Hardware guess.
{
  const gpu = (name: string) => ({
    getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
    getParameter: () => name,
  }) as unknown as WebGLRenderingContext;
  check('8 cores + no GPU info starts on High', guessTier(null, 8) === 0);
  check('4 cores starts lower', guessTier(null, 4) === 2);
  check('2 cores starts lower still', guessTier(null, 2) === 3);
  check('software rendering starts on the lightest preset', guessTier(gpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))'), 16) === LAST);
  check('old Intel graphics start on Low', guessTier(gpu('ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11)'), 16) >= 2);
  check('Intel Arc / Iris Xe are not penalised', guessTier(gpu('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)'), 16) === 0);
  check('a gaming GPU starts on High', guessTier(gpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)'), 16) === 0);
}

// The ladder only ever gets lighter.
{
  let ok = true;
  for (let i = 1; i < TIERS.length; i++) {
    const a = TIERS[i - 1]!;
    const b = TIERS[i]!;
    if (b.renderScale > a.renderScale || (b.bloom && !a.bloom) || (b.dust && !a.dust) || (b.particles && !a.particles) || (b.antialias && !a.antialias)) ok = false;
  }
  check('each preset is no heavier than the one before', ok);
}

if (failed) process.exit(1);
console.log('test:quality OK');
