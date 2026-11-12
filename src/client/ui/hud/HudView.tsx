/**
 * The in-game HUD as React components: health, ammo with magazine pips and reload progress, gun and grenade slots,
 * the match race strip, death screen, flashbang whiteout, hit markers, damage direction arrows, scoreboard, match
 * banner and sniper scope. Every component reads only the fields it shows through `useHud`, so a snapshot that
 * changes the ammo does not re-render the health. Values are pushed by the game via `createHud` (hud-store.ts).
 */
import { MAX_HP, TICK_RATE } from '@shared/core/constants';
import { rankPlayers } from '@shared/rules/standings';
import { GRENADES, WEAPONS } from '@shared/rules/weapons';
import { bindingLabel, settings, type Action } from '@client/platform/settings';
import { GunIcon } from '../components/GunIcon';
import { useSettingsVersion } from '../hooks/useSettings';
import { FeedView } from './FeedView';
import { useHud } from './hud-store';

const WEAPON_KEYS: readonly Action[] = ['weapon1', 'weapon2', 'weapon3', 'weapon4'];
const GRENADE_KEYS: readonly Action[] = ['grenade1', 'grenade2'];

/** Colour class for a value that warns as it gets low: ink, then orange, then red. */
function levelClass(frac: number): { bar: string; text: string } {
  if (frac > 0.5) return { bar: 'bg-ink', text: '' };
  if (frac > 0.25) return { bar: 'bg-warn', text: 'text-warn' };
  return { bar: 'bg-danger', text: 'text-danger' };
}

/** The key label on a slot; follows rebinding. */
function SlotKey({ action }: { action: Action }) {
  useSettingsVersion();
  return <kbd className="keycap absolute left-0 top-0 !min-w-5 !px-1 !py-0 !text-[10px]">{bindingLabel(settings.bindings[action])}</kbd>;
}

/** Slot styling: the selected gun is a solid accent block, an empty one is dim. */
function slotClass(size: string, selected: boolean, empty: boolean): string {
  return `relative flex ${size} items-center justify-center gap-1 pt-3 ${selected ? 'bg-accent text-ground' : 'bg-ground/75 text-ink'} ${empty ? 'opacity-35' : ''}`;
}

/** Full-screen white that holds for a second and fades (flashbang). */
function Whiteout() {
  const blind = useHud((s) => s.me?.blind ?? 0);
  return <div className="absolute inset-0 bg-white" style={{ opacity: blind > 0 ? Math.min(1, blind / TICK_RATE) : 0 }} />;
}

/** Red vignette flashed when you are hit, and the pulsing edge at low health. */
function DamageOverlays() {
  const hurt = useHud((s) => s.hurt);
  const low = useHud((s) => s.me !== null && s.me.alive && Math.max(0, s.me.hp) / MAX_HP <= 0.25);
  return (
    <>
      <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(200,0,0,0.6)_100%)] transition-opacity duration-200 ${hurt ? 'opacity-100' : 'opacity-0'}`} />
      {low && <div className="low-hp absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(190,0,0,0.55)_100%)]" />}
    </>
  );
}

/** Top left: the room code and the optional FPS readout. */
function RoomTag() {
  const code = useHud((s) => s.code);
  const fps = useHud((s) => s.fps);
  return (
    <div className="absolute left-4 top-4 flex flex-col gap-1 text-xs font-bold text-white/70">
      <div>Room <span className="text-sm font-extrabold tracking-widest text-ink">{code}</span></div>
      {fps !== null && <div className="tabular-nums">{fps}</div>}
    </div>
  );
}

/** The sniper scope: dark rim, glass with a drifting reflection, bezel and reticle. */
function Scope() {
  const scoped = useHud((s) => s.scope);
  if (!scoped) return null;
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0,transparent_27vmin,#05070a_27.5vmin)]">
      {/* The lens: a faint blue tint that darkens toward the rim, with a reflection that drifts across it. */}
      <div className="absolute left-1/2 top-1/2 h-[55vmin] w-[55vmin] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-[radial-gradient(circle_at_center,rgba(150,210,255,0.05)_0,rgba(110,170,230,0.08)_55%,rgba(10,30,60,0.45)_100%)] shadow-[inset_0_0_5vmin_rgba(0,15,40,0.85)]">
        <div className="scope-glint absolute -inset-[10%] bg-[linear-gradient(118deg,transparent_34%,rgba(255,255,255,0.13)_43%,rgba(255,255,255,0.03)_50%,transparent_58%)]" />
        <div className="absolute left-[18%] top-[14%] h-[7%] w-[7%] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.55)_0,transparent_70%)]" />
      </div>
      {/* Colour fringing at the glass edge, then a brushed-metal bezel. */}
      <div className="absolute left-1/2 top-1/2 h-[55.4vmin] w-[55.4vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.35vmin] border-red-500/30" />
      <div className="absolute left-1/2 top-1/2 h-[54.4vmin] w-[54.4vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.35vmin] border-cyan-300/30" />
      <div className="absolute left-1/2 top-1/2 h-[58vmin] w-[58vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.4vmin] border-neutral-800 shadow-[inset_0_0_0_0.2vmin_rgba(255,255,255,0.18),0_0_2vmin_rgba(0,0,0,0.9)]" />
      {/* Reticle: fine crosshair lines with thicker outer posts, and a red centre dot. */}
      <div className="absolute left-1/2 top-1/2 h-px w-[54vmin] -translate-x-1/2 bg-black/75" />
      <div className="absolute left-1/2 top-1/2 h-[54vmin] w-px -translate-y-1/2 bg-black/75" />
      <div className="absolute left-[calc(50%-27vmin)] top-1/2 h-[0.5vmin] w-[10vmin] -translate-y-1/2 bg-black/85" />
      <div className="absolute left-[calc(50%+17vmin)] top-1/2 h-[0.5vmin] w-[10vmin] -translate-y-1/2 bg-black/85" />
      <div className="absolute left-1/2 top-[calc(50%-27vmin)] h-[10vmin] w-[0.5vmin] -translate-x-1/2 bg-black/85" />
      <div className="absolute left-1/2 top-[calc(50%+17vmin)] h-[10vmin] w-[0.5vmin] -translate-x-1/2 bg-black/85" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(255,40,40,0.9)]" />
    </div>
  );
}

/** The hit marker: four ticks that flash on a hit; red and bigger for headshots and kills. */
function HitMarker() {
  const marker = useHud((s) => s.marker);
  const scale = marker?.kind === 'kill' ? 1.5 : marker?.kind === 'head' ? 1.25 : 1;
  return (
    <svg
      viewBox="0 0 40 40"
      className="absolute left-1/2 top-1/2 h-12 w-12"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="square"
      style={{ color: marker && marker.kind !== 'hit' ? '#ff4a4a' : '#ffffff', opacity: marker ? 1 : 0, transform: `translate(-50%, -50%) scale(${scale})` }}
    >
      <path d="M6 6 L14 14 M34 6 L26 14 M6 34 L14 26 M34 34 L26 26" />
    </svg>
  );
}

/** Arrows around the screen centre pointing at where damage came from; they fade out on their own. */
function DamageArrows() {
  const arrows = useHud((s) => s.arrows);
  return (
    <div className="absolute left-1/2 top-1/2 h-0 w-0">
      {arrows.map((a) => (
        <div key={a.id} className="dmg-arrow absolute left-0 top-0" style={{ transform: `rotate(${a.angle}rad)` }}>
          <div className="absolute h-10 w-16 -translate-x-1/2 bg-danger" style={{ top: -150, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />
        </div>
      ))}
    </div>
  );
}

/** Top centre: you, the clock or goal, and whoever is chasing the lead. */
function MatchInfo() {
  const rules = useHud((s) => s.rules);
  const you = useHud((s) => s.youKills);
  const leadName = useHud((s) => s.leadName);
  const leadKills = useHud((s) => s.leadKills);
  const timeLeft = useHud((s) => s.me?.timeLeft ?? -1);
  return (
    <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-stretch bg-ground/75 text-ink">
      <div className="flex w-40 items-baseline justify-end gap-2 px-3 py-1.5">
        <span className="text-xs font-bold text-accent">YOU</span>
        <span className="text-2xl font-black tabular-nums">{you}</span>
      </div>
      <div className="flex min-w-24 flex-col items-center justify-center bg-raised px-3 py-1">
        {/* The match clock: hidden without a time limit; red for the last 30 seconds. */}
        {timeLeft >= 0 && (
          <span className={`text-lg font-black leading-none tabular-nums ${timeLeft <= 30 ? 'text-danger' : ''}`}>
            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
          </span>
        )}
        <span className="text-[11px] font-bold leading-tight text-dim">First to {rules?.killLimit ?? 0}</span>
      </div>
      <div className="flex w-40 items-baseline gap-2 px-3 py-1.5">
        <span className="max-w-24 truncate text-xs font-bold text-dim">{leadName}</span>
        <span className="text-2xl font-black tabular-nums">{leadKills ?? ''}</span>
      </div>
    </div>
  );
}

/** The big match-result message. */
function Banner() {
  const banner = useHud((s) => s.banner);
  if (!banner) return null;
  return (
    <div className="absolute left-0 right-0 top-28 flex flex-col items-center gap-1 text-center">
      <div className="bg-ground/80 px-6 py-2 text-5xl font-black uppercase tracking-widest text-accent">{banner.title}</div>
      <div className="bg-ground/80 px-4 py-1 text-sm font-bold text-ink">{banner.sub}</div>
    </div>
  );
}

/** Bottom left: the grenade slots, then health. */
function HealthPanel() {
  const hp = useHud((s) => Math.max(0, s.me?.hp ?? MAX_HP));
  const gren0 = useHud((s) => s.me?.gren[0] ?? 0);
  const gren1 = useHud((s) => s.me?.gren[1] ?? 0);
  const frac = hp / MAX_HP;
  const level = levelClass(frac);
  const counts = [gren0, gren1];
  return (
    <div className="absolute bottom-5 left-5 flex flex-col gap-2">
      <div className="flex gap-2">
        {GRENADES.map((g, i) => (
          <div key={g.name} title={g.name} className={slotClass('h-12 w-[5.5rem]', false, counts[i] === 0)}>
            <SlotKey action={GRENADE_KEYS[i]!} />
            <GunIcon kind={i === 0 ? 'frag' : 'flash'} className="h-6 w-11" />
            <span className="text-xs font-extrabold tabular-nums">x{counts[i]}</span>
          </div>
        ))}
      </div>
      <div className="plate w-72 bg-ground/75 p-3">
        <div className="flex items-end justify-between">
          <span className="text-xs font-bold text-dim">HEALTH</span>
          <span className={`text-6xl font-black leading-none tabular-nums ${level.text}`}>{hp}</span>
        </div>
        <div className="mt-2 h-2.5 w-full bg-raised">
          <div className={`h-full ${level.bar}`} style={{ width: `${frac * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Bottom right: ammo with pips and reload progress, then the gun slots. */
function AmmoPanel() {
  const w = useHud((s) => s.me?.w ?? 0);
  const rounds = useHud((s) => s.me?.mag[s.me.w] ?? 0);
  const spare = useHud((s) => s.me?.reserve[s.me.w] ?? 0);
  const reload = useHud((s) => s.me?.reload ?? 0);
  // One entry per gun: has it any ammo at all (an empty gun slot is dimmed).
  const stock = useHud((s) => WEAPONS.map((_, i) => (s.me?.mag[i] ?? 0) + (s.me?.reserve[i] ?? 0)).join(','));
  const def = WEAPONS[w];
  const size = def?.magSize ?? 1;
  // Low magazine turns the number orange and empty turns it red, so you know before the click.
  const low = rounds <= Math.ceil(size / 4);
  const reloading = reload > 0 && def !== undefined;
  const note = reloading ? 'Reloading' : rounds === 0 ? (spare === 0 ? 'No ammo' : 'Press R') : '';
  const stocks = stock.split(',');
  return (
    <div className="absolute bottom-5 right-5 flex flex-col items-end gap-2">
      <div className="plate w-72 bg-ground/75 p-3">
        <div className="flex items-end justify-between">
          <span className="text-xs font-bold text-dim">{def?.name ?? ''}</span>
          <div className="leading-none">
            <span className={`text-6xl font-black tabular-nums ${rounds === 0 ? 'text-danger' : low ? 'text-warn' : ''}`}>{rounds}</span>
            <span className="text-xl font-bold text-dim"> / <span className="tabular-nums">{spare}</span></span>
          </div>
        </div>
        <div className="mt-2 flex h-2.5 gap-[2px]">
          {Array.from({ length: size }, (_, i) => (
            <span key={i} className={`h-full flex-1 ${i < rounds ? (low ? 'bg-warn' : 'bg-ink') : 'bg-raised'}`} />
          ))}
        </div>
        <div className="mt-2 flex h-5 items-center gap-2">
          {reloading && (
            <div className="h-1.5 flex-1 bg-raised">
              <div className="h-full bg-accent" style={{ width: `${(1 - reload / def.reloadTicks) * 100}%` }} />
            </div>
          )}
          <div className="ml-auto text-xs font-extrabold uppercase text-accent">{note}</div>
        </div>
      </div>
      <div className="flex gap-1.5">
        {WEAPONS.map((wp, i) => (
          <div key={wp.name} title={wp.name} className={slotClass('h-12 w-[4.5rem]', i === w, stocks[i] === '0')}>
            <SlotKey action={WEAPON_KEYS[i]!} />
            <GunIcon kind={i} className="h-7 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The Tab scoreboard, sorted by kills. */
function Scoreboard() {
  const board = useHud((s) => s.board);
  const rules = useHud((s) => s.rules);
  if (!board) return null;
  const goal = `First to ${rules?.killLimit ?? 0}`;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
      <div className="slab w-[38rem] max-w-[92vw] bg-ground/95 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-2xl font-black uppercase tracking-wider">Scoreboard</span>
          <span className="text-sm font-bold text-accent">
            {rules && rules.timeLimitMin > 0 ? `${goal} kills · ${rules.timeLimitMin} min` : `${goal} kills`}
          </span>
        </div>
        <table className="w-full text-base">
          <thead className="text-left text-sm font-bold text-dim">
            <tr>
              <th className="w-10 py-1.5">#</th><th>Callsign</th>
              <th className="w-16 text-right">Kills</th><th className="w-16 text-right">Deaths</th><th className="w-16 text-right">K/D</th>
            </tr>
          </thead>
          <tbody>
            {rankPlayers(board.players).map((p, i) => {
              const kd = p.deaths === 0 ? p.kills.toFixed(1) : (p.kills / p.deaths).toFixed(1);
              // Your own row is a solid accent block so you find yourself at a glance.
              const row = p.id === board.myId ? 'bg-accent font-black text-ground' : i === 0 ? 'bg-raised font-bold' : 'font-bold';
              return (
                <tr key={p.id} className={row}>
                  <td className="py-2 pl-2">{i + 1}</td>
                  <td className="truncate">{p.name}{p.bot && <span className="ml-2 text-[10px] font-black opacity-60">BOT</span>}</td>
                  <td className="text-right tabular-nums">{p.kills}</td>
                  <td className="text-right tabular-nums">{p.deaths}</td>
                  <td className="pr-2 text-right tabular-nums">{kd}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The death screen. Lobby players are not dead, just not in the match yet. */
function DeathScreen() {
  const dead = useHud((s) => s.me !== null && !s.me.alive && s.me.playing);
  const count = useHud((s) => Math.ceil((s.me?.respawnIn ?? 0) / TICK_RATE));
  const by = useHud((s) => s.killedBy);
  if (!dead) return null;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45">
      <div className="text-6xl font-black uppercase tracking-wider text-danger">Ticket closed</div>
      <div className="flex h-8 items-center gap-2 text-lg font-bold">
        {by && (
          <>
            Closed by <span className="text-accent">{by.name}</span>
            {by.icon !== undefined && <GunIcon kind={by.icon} className="inline-block h-6 w-12" />}
          </>
        )}
      </div>
      <div className="text-sm font-bold text-dim">Respawning in <span className="text-xl font-black text-ink">{count}</span></div>
    </div>
  );
}

/** The whole in-game HUD; renders nothing while hidden (lobby, pause). */
export function HudView() {
  const visible = useHud((s) => s.visible);
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 select-none">
      <Whiteout />
      <DamageOverlays />
      <RoomTag />
      <Scope />
      <HitMarker />
      <DamageArrows />
      <MatchInfo />
      <Banner />
      <FeedView />
      <HealthPanel />
      <AmmoPanel />
      <Scoreboard />
      <DeathScreen />
    </div>
  );
}
