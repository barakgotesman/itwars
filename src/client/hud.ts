/**
 * In-game HUD: HP bar, ammo, grenades, reload note, death screen, flashbang whiteout, hit markers,
 * damage direction arrows, scoreboard, match banner and sniper scope.
 * Pure DOM updates driven by the private `me` block of each snapshot and by game events.
 */
import { MAX_HP, TICK_RATE } from '../shared/constants';
import type { MatchRules } from '../shared/modes';
import type { MeState, PlayerInfo } from '../shared/protocol';
import { GRENADES, WEAPONS } from '../shared/weapons';
import { iconElement } from './gun-icons';
import { bindingLabel, onSettingsChange, settings, type Action } from './settings';

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
  const flash = $<HTMLElement>('flash');
  const vignette = $<HTMLElement>('hit-vignette');
  const marker = $<SVGElement>('hitmarker');
  const dirs = $<HTMLElement>('dmg-dirs');
  const banner = $<HTMLElement>('banner');
  const board = $<HTMLElement>('scoreboard');
  const scopeEl = $<HTMLElement>('scope');
  const fpsEl = $<HTMLElement>('fps');
  $<HTMLElement>('hud-code').textContent = code;
  const goal = `First to ${rules.killLimit} kills`;
  $<HTMLElement>('score-goal').textContent = rules.timeLimitMin > 0 ? `${goal} · ${rules.timeLimitMin} min` : goal;
  $<HTMLElement>('match-goal').textContent = goal;
  const timerEl = $<HTMLElement>('match-timer');
  let markerTimer = 0;

  // Weapon bar: one small card per carried gun, then the two grenade slots.
  const bar = $<HTMLElement>('weapon-bar');
  const keyTag = () => {
    const el = document.createElement('span');
    el.className = 'absolute left-1 top-0.5 text-[10px] font-bold text-white/70';
    return el;
  };
  const weaponKeys: Action[] = ['weapon1', 'weapon2', 'weapon3', 'weapon4'];
  const grenadeKeys: Action[] = ['grenade1', 'grenade2'];
  const weaponSlots = WEAPONS.map((w, i) => {
    const box = document.createElement('div');
    const key = keyTag();
    box.title = w.name;
    box.append(key, iconElement(i, 'h-8 w-16'));
    bar.append(box);
    return { box, key };
  });
  const divider = document.createElement('span');
  divider.className = 'mx-1 h-10 w-px self-center bg-white/20';
  bar.append(divider);
  const grenadeSlots = GRENADES.map((g, i) => {
    const box = document.createElement('div');
    const key = keyTag();
    const count = document.createElement('span');
    count.className = 'text-[10px] tabular-nums text-white/80';
    box.title = g.name;
    box.append(key, iconElement(i === 0 ? 'frag' : 'flash', 'h-7 w-12'), count);
    bar.append(box);
    return { box, key, count };
  });
  /** Shows the player's current bindings on the cards, so rebinding is reflected immediately. */
  const refreshKeys = () => {
    weaponSlots.forEach((s, i) => { s.key.textContent = bindingLabel(settings.bindings[weaponKeys[i]!]); });
    grenadeSlots.forEach((s, i) => { s.key.textContent = bindingLabel(settings.bindings[grenadeKeys[i]!]); });
  };
  refreshKeys();
  onSettingsChange(refreshKeys);
  /** Card styling: selected is bright and raised, empty is dim. */
  const cardClass = (size: string, selected: boolean, empty: boolean) =>
    `relative flex ${size} flex-col items-center justify-center rounded border transition-transform ${
      selected ? 'z-10 -translate-y-1 scale-110 border-white bg-white/25' : 'border-white/25 bg-black/55'} ${empty ? 'opacity-40' : ''}`;

  return {
    show: (visible) => {
      root.classList.toggle('hidden', !visible);
    },
    update: (me) => {
      const frac = Math.max(0, me.hp) / MAX_HP;
      hpBar.style.width = `${frac * 100}%`;
      hpBar.className = `h-full ${frac > 0.5 ? 'bg-emerald-500' : frac > 0.25 ? 'bg-amber-400' : 'bg-red-500'}`;
      hpText.textContent = String(Math.max(0, me.hp));
      weapon.textContent = WEAPONS[me.w]?.name ?? '';
      mag.textContent = String(me.mag[me.w] ?? 0);
      reserve.textContent = String(me.reserve[me.w] ?? 0);
      reload.textContent = me.reload > 0 ? 'Reloading...' : (me.mag[me.w] ?? 0) === 0 ? 'Press R to reload' : '';
      weaponSlots.forEach((s, i) => {
        const mag = me.mag[i] ?? 0;
        const spare = me.reserve[i] ?? 0;
        // Ammo numbers live in the bottom-right corner only; a card just dims when its gun is completely out.
        s.box.className = cardClass('h-12 w-20', i === me.w, mag + spare === 0);
      });
      grenadeSlots.forEach((s, i) => {
        const n = me.gren[i] ?? 0;
        s.box.className = cardClass('h-12 w-20', false, n === 0);
        // Short name next to the count so the G / H cards explain themselves.
        s.count.textContent = `${i === 0 ? 'Bomb' : 'Alarm'} x${n}`;
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
        timerEl.classList.toggle('text-red-400', me.timeLeft <= 30);
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
      marker.style.color = kind === 'hit' ? '#ffffff' : '#ff3b3b';
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
      arrow.className = 'absolute h-10 w-16 -translate-x-1/2 bg-gradient-to-b from-red-500/90 to-transparent';
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
      const rows = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      $<HTMLElement>('score-rows').replaceChildren(...rows.map((p, i) => {
        const tr = document.createElement('tr');
        tr.className = p.id === myId ? 'bg-white/10 text-amber-300' : '';
        for (const [text, cls] of [[String(i + 1), 'py-1'], [p.name, ''], [String(p.kills), 'text-right'], [String(p.deaths), 'text-right']] as const) {
          const td = document.createElement('td');
          td.className = cls;
          td.textContent = text;
          tr.append(td);
        }
        return tr;
      }));
    },
    banner: (title, sub = '') => {
      banner.classList.toggle('hidden', title === null);
      banner.classList.toggle('flex', title !== null);
      $<HTMLElement>('banner-title').textContent = title ?? '';
      $<HTMLElement>('banner-sub').textContent = sub;
    },
    scope: (visible) => {
      scopeEl.classList.toggle('hidden', !visible);
    },
    fps: (text) => {
      fpsEl.classList.toggle('hidden', text === null);
      if (text !== null) fpsEl.textContent = text;
    },
  };
}
