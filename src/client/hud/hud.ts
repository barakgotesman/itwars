/**
 * In-game HUD: health, ammo with magazine pips and reload progress, gun and grenade slots, the match race
 * strip, death screen, flashbang whiteout, hit markers, damage direction arrows, scoreboard, match banner
 * and sniper scope.
 * Pure DOM updates driven by the private `me` block of each snapshot and by game events.
 */
import { MAX_HP, TICK_RATE } from '@shared/core/constants';
import type { MatchRules } from '@shared/rules/modes';
import type { MeState, PlayerInfo } from '@shared/net/protocol';
import { rankPlayers } from '@shared/rules/standings';
import { GRENADES, WEAPONS } from '@shared/rules/weapons';
import { iconElement, type IconKind } from './gun-icons';
import { bindingLabel, onSettingsChange, settings, type Action } from '@client/platform/settings';

const $ = <T extends HTMLElement | SVGElement>(id: string) => document.getElementById(id) as unknown as T;

/** Handle for pushing state into the HUD. */
export interface Hud {
  /** Shows or hides the whole HUD. */
  show(visible: boolean): void;
  /** Refreshes every element from the latest private state. */
  update(me: MeState): void;
  /** Flashes the red damage vignette. */
  hurt(): void;
  /** Flashes the hit marker; red and bigger for headshots and kills. */
  hitMarker(kind: 'hit' | 'head' | 'kill'): void;
  /** Shows a fading arrow pointing at where damage came from. @param angle - Radians clockwise from straight ahead. */
  damageFrom(angle: number): void;
  /** Shows or hides the scoreboard; rows are sorted by kills. */
  scoreboard(visible: boolean, players: readonly PlayerInfo[], myId: number): void;
  /** Updates the "you vs the leader" strip at the top of the screen. */
  standings(players: readonly PlayerInfo[], myId: number): void;
  /** Names who killed you on the death screen, or clears it with null. */
  killedBy(name: string | null, icon?: IconKind): void;
  /** Shows a big message (match winner) or hides it with null. */
  banner(title: string | null, sub?: string): void;
  /** Shows or hides the sniper scope overlay. */
  scope(visible: boolean): void;
  /** Shows an FPS readout, or hides it with null. */
  fps(text: string | null): void;
}

/**
 * Binds to the HUD markup in `index.html`.
 * @param code - Room code to display in the corner.
 * @param rules - The room's rules, for the goal and the match clock.
 */
export function createHud(code: string, rules: MatchRules): Hud {
  const root = $<HTMLElement>('hud');
  const hpBar = $<HTMLElement>('hp-bar');
  const hpText = $<HTMLElement>('hp-text');
  const mag = $<HTMLElement>('ammo-mag');
  const reserve = $<HTMLElement>('ammo-reserve');
  const weapon = $<HTMLElement>('weapon-name');
  const reload = $<HTMLElement>('reload-note');
  const dead = $<HTMLElement>('dead');
  const deadCount = $<HTMLElement>('dead-count');
  const deadBy = $<HTMLElement>('dead-by');
  const flash = $<HTMLElement>('flash');
  const vignette = $<HTMLElement>('hit-vignette');
  const lowHp = $<HTMLElement>('low-hp');
  const crosshair = $<HTMLElement>('crosshair');
  const pips = $<HTMLElement>('ammo-pips');
  const reloadTrack = $<HTMLElement>('reload-track');
  const reloadBar = $<HTMLElement>('reload-bar');
  const marker = $<SVGElement>('hitmarker');
  const dirs = $<HTMLElement>('dmg-dirs');
  const banner = $<HTMLElement>('banner');
  const board = $<HTMLElement>('scoreboard');
  const scopeEl = $<HTMLElement>('scope');
  const fpsEl = $<HTMLElement>('fps');
  const youEl = $<HTMLElement>('match-you');
  const leadName = $<HTMLElement>('match-lead');
  const leadKills = $<HTMLElement>('match-lead-kills');
  $<HTMLElement>('hud-code').textContent = code;
  const goal = `First to ${rules.killLimit}`;
  $<HTMLElement>('score-goal').textContent = rules.timeLimitMin > 0 ? `${goal} kills · ${rules.timeLimitMin} min` : `${goal} kills`;
  $<HTMLElement>('match-goal').textContent = goal;
  const timerEl = $<HTMLElement>('match-timer');
  let markerTimer = 0;
  /** Magazine size the pips were last built for, so they are rebuilt only when the gun changes. */
  let pipCount = -1;

  // Gun slots (bottom right) and grenade slots (bottom left): one flat block each, key shown as a keycap.
  const bar = $<HTMLElement>('weapon-bar');
  const grenadeBar = $<HTMLElement>('grenade-bar');
  const keyTag = () => {
    const el = document.createElement('kbd');
    el.className = 'keycap absolute left-0 top-0 !min-w-5 !px-1 !py-0 !text-[10px]';
    return el;
  };
  const weaponKeys: Action[] = ['weapon1', 'weapon2', 'weapon3', 'weapon4'];
  const grenadeKeys: Action[] = ['grenade1', 'grenade2'];
  const weaponSlots = WEAPONS.map((w, i) => {
    const box = document.createElement('div');
    const key = keyTag();
    box.title = w.name;
    box.append(key, iconElement(i, 'h-7 w-14'));
    bar.append(box);
    return { box, key };
  });
  const grenadeSlots = GRENADES.map((g, i) => {
    const box = document.createElement('div');
    const key = keyTag();
    const count = document.createElement('span');
    count.className = 'text-xs font-extrabold tabular-nums';
    box.title = g.name;
    box.append(key, iconElement(i === 0 ? 'frag' : 'flash', 'h-6 w-11'), count);
    grenadeBar.append(box);
    return { box, key, count };
  });
  /** Shows the player's current bindings on the slots, so rebinding is reflected immediately. */
  const refreshKeys = () => {
    weaponSlots.forEach((s, i) => { s.key.textContent = bindingLabel(settings.bindings[weaponKeys[i]!]); });
    grenadeSlots.forEach((s, i) => { s.key.textContent = bindingLabel(settings.bindings[grenadeKeys[i]!]); });
  };
  refreshKeys();
  onSettingsChange(refreshKeys);
  /** Slot styling: the selected gun is a solid accent block, an empty one is dim. */
  const slotClass = (size: string, selected: boolean, empty: boolean) =>
    `relative flex ${size} items-center justify-center gap-1 pt-3 ${selected ? 'bg-accent text-ground' : 'bg-ground/75 text-ink'} ${empty ? 'opacity-35' : ''}`;
  /** Draws one pip per round of the magazine. */
  const buildPips = (n: number) => {
    pips.replaceChildren(...Array.from({ length: n }, () => document.createElement('span')));
    pipCount = n;
  };

  return {
    show: (visible) => {
      root.classList.toggle('hidden', !visible);
    },
    update: (me) => {
      const frac = Math.max(0, me.hp) / MAX_HP;
      hpBar.style.width = `${frac * 100}%`;
      // Ink while healthy, orange when hurt, red when one more burst could kill: colour is the warning.
      hpBar.className = `h-full ${frac > 0.5 ? 'bg-ink' : frac > 0.25 ? 'bg-warn' : 'bg-danger'}`;
      hpText.className = `text-6xl font-black leading-none tabular-nums ${frac > 0.5 ? '' : frac > 0.25 ? 'text-warn' : 'text-danger'}`;
      hpText.textContent = String(Math.max(0, me.hp));
      lowHp.classList.toggle('hidden', !(frac <= 0.25 && me.alive));

      const def = WEAPONS[me.w];
      const rounds = me.mag[me.w] ?? 0;
      const spare = me.reserve[me.w] ?? 0;
      const size = def?.magSize ?? 1;
      // Low magazine turns the number orange and empty turns it red, so you know before the click.
      const low = rounds <= Math.ceil(size / 4);
      weapon.textContent = def?.name ?? '';
      mag.textContent = String(rounds);
      reserve.textContent = String(spare);
      mag.className = `text-6xl font-black tabular-nums ${rounds === 0 ? 'text-danger' : low ? 'text-warn' : ''}`;
      if (pipCount !== size) buildPips(size);
      Array.from(pips.children).forEach((p, i) => {
        p.className = `h-full flex-1 ${i < rounds ? (low ? 'bg-warn' : 'bg-ink') : 'bg-raised'}`;
      });
      const reloading = me.reload > 0 && def !== undefined;
      reloadTrack.classList.toggle('hidden', !reloading);
      if (reloading) reloadBar.style.width = `${(1 - me.reload / def.reloadTicks) * 100}%`;
      reload.textContent = reloading ? 'Reloading' : rounds === 0 ? (spare === 0 ? 'No ammo' : 'Press R') : '';

      weaponSlots.forEach((s, i) => {
        s.box.className = slotClass('h-12 w-[4.5rem]', i === me.w, (me.mag[i] ?? 0) + (me.reserve[i] ?? 0) === 0);
      });
      grenadeSlots.forEach((s, i) => {
        const n = me.gren[i] ?? 0;
        s.box.className = slotClass('h-12 w-[5.5rem]', false, n === 0);
        s.count.textContent = `x${n}`;
      });
      // Lobby players are not dead, just not in the match yet.
      const showDead = !me.alive && me.playing;
      dead.classList.toggle('hidden', !showDead);
      dead.classList.toggle('flex', showDead);
      deadCount.textContent = String(Math.ceil(me.respawnIn / TICK_RATE));
      // Match clock: hidden without a time limit; turns red for the last 30 seconds.
      timerEl.classList.toggle('hidden', me.timeLeft < 0);
      if (me.timeLeft >= 0) {
        timerEl.textContent = `${Math.floor(me.timeLeft / 60)}:${String(me.timeLeft % 60).padStart(2, '0')}`;
        timerEl.classList.toggle('text-danger', me.timeLeft <= 30);
      }
      // Hold full white for the first second, then fade out.
      flash.style.opacity = String(me.blind > 0 ? Math.min(1, me.blind / TICK_RATE) : 0);
    },
    hurt: () => {
      vignette.style.opacity = '1';
      setTimeout(() => {
        vignette.style.opacity = '0';
      }, 260);
    },
    hitMarker: (kind) => {
      marker.style.color = kind === 'hit' ? '#ffffff' : '#ff4a4a';
      marker.style.transform = `translate(-50%, -50%) scale(${kind === 'kill' ? 1.5 : kind === 'head' ? 1.25 : 1})`;
      marker.style.opacity = '1';
      clearTimeout(markerTimer);
      markerTimer = window.setTimeout(() => {
        marker.style.opacity = '0';
      }, kind === 'kill' ? 350 : 160);
    },
    damageFrom: (angle) => {
      const wrap = document.createElement('div');
      wrap.className = 'absolute left-0 top-0 transition-opacity duration-1000';
      wrap.style.transform = `rotate(${angle}rad)`;
      const arrow = document.createElement('div');
      arrow.className = 'absolute h-10 w-16 -translate-x-1/2 bg-danger';
      arrow.style.top = '-150px';
      arrow.style.clipPath = 'polygon(50% 0, 100% 100%, 0 100%)';
      wrap.append(arrow);
      dirs.append(wrap);
      requestAnimationFrame(() => {
        wrap.style.opacity = '0';
      });
      setTimeout(() => wrap.remove(), 1100);
    },
    scoreboard: (visible, players, myId) => {
      board.classList.toggle('hidden', !visible);
      board.classList.toggle('flex', visible);
      if (!visible) return;
      const rows = rankPlayers(players);
      $<HTMLElement>('score-rows').replaceChildren(...rows.map((p, i) => {
        const tr = document.createElement('tr');
        // Your own row is a solid accent block so you find yourself at a glance.
        tr.className = p.id === myId ? 'bg-accent font-black text-ground' : i === 0 ? 'bg-raised font-bold' : 'font-bold';
        const kd = p.deaths === 0 ? p.kills.toFixed(1) : (p.kills / p.deaths).toFixed(1);
        const cells: [string, string][] = [
          [String(i + 1), 'py-2 pl-2'], [p.name, 'truncate'], [String(p.kills), 'text-right tabular-nums'],
          [String(p.deaths), 'text-right tabular-nums'], [kd, 'pr-2 text-right tabular-nums'],
        ];
        for (const [text, cls] of cells) {
          const td = document.createElement('td');
          td.className = cls;
          td.textContent = text;
          tr.append(td);
        }
        return tr;
      }));
    },
    standings: (players, myId) => {
      const mine = players.find((p) => p.id === myId);
      const top = rankPlayers(players.filter((p) => p.id !== myId))[0];
      youEl.textContent = String(mine?.kills ?? 0);
      leadName.textContent = top?.name ?? '';
      leadKills.textContent = top ? String(top.kills) : '';
    },
    killedBy: (name, icon) => {
      deadBy.replaceChildren();
      if (name === null) return;
      const who = document.createElement('span');
      who.className = 'text-accent';
      who.textContent = name;
      deadBy.append(document.createTextNode('Closed by '), who);
      if (icon !== undefined) deadBy.append(iconElement(icon, 'inline-block h-6 w-12'));
    },
    banner: (title, sub = '') => {
      banner.classList.toggle('hidden', title === null);
      banner.classList.toggle('flex', title !== null);
      $<HTMLElement>('banner-title').textContent = title ?? '';
      $<HTMLElement>('banner-sub').textContent = sub;
    },
    scope: (visible) => {
      scopeEl.classList.toggle('hidden', !visible);
      // The scope has its own reticle, so the plain crosshair steps aside.
      crosshair.style.visibility = visible ? 'hidden' : '';
    },
    fps: (text) => {
      fpsEl.classList.toggle('hidden', text === null);
      if (text !== null) fpsEl.textContent = text;
    },
  };
}
