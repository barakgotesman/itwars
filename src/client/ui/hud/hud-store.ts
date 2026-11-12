/**
 * The HUD's state and the `Hud` interface the game loop talks to. The game (plain TypeScript) pushes values in;
 * the React components in `HudView.tsx` read single fields with `useHud`, so a change re-renders only the part of
 * the HUD that shows it. Nothing here runs per frame: `update` follows snapshots (30 Hz), standings and the FPS
 * readout 2 Hz, the scoreboard only when its content changes.
 */
import { useSyncExternalStore } from 'react';
import type { MatchRules } from '@shared/rules/modes';
import type { MeState, PlayerInfo } from '@shared/net/protocol';
import type { IconKind } from '@client/hud/gun-icons';
import { createStore, type Store } from '../hooks/store';

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

/** Which hit marker is showing right now. */
export interface MarkerState {
  kind: 'hit' | 'head' | 'kill';
  /** Increments per hit so a repeated hit restarts the flash. */
  n: number;
}

/** One damage-direction arrow on screen. */
export interface DamageArrow {
  id: number;
  angle: number;
}

/** Everything the HUD shows. */
export interface HudState {
  visible: boolean;
  code: string;
  rules: MatchRules | null;
  /** Latest private state; null before the first snapshot. */
  me: MeState | null;
  hurt: boolean;
  marker: MarkerState | null;
  arrows: readonly DamageArrow[];
  /** Scoreboard rows, or null while it is hidden. */
  board: { players: readonly PlayerInfo[]; myId: number } | null;
  youKills: number;
  leadName: string;
  leadKills: number | null;
  killedBy: { name: string; icon?: IconKind } | null;
  banner: { title: string; sub: string } | null;
  scope: boolean;
  fps: string | null;
}

/** The state of a HUD with nothing happening. */
const BLANK: HudState = {
  visible: false, code: '', rules: null, me: null, hurt: false, marker: null, arrows: [], board: null,
  youKills: 0, leadName: '', leadKills: null, killedBy: null, banner: null, scope: false, fps: null,
};

/** The single HUD store (there is one HUD per page). */
export const hudStore: Store<HudState> = createStore<HudState>(BLANK);

/** Reads one field of the HUD state; the component re-renders only when the selected value changes (compared by identity). */
export function useHud<T>(select: (s: HudState) => T): T {
  return useSyncExternalStore(hudStore.subscribe, () => select(hudStore.get()));
}

/** How long the hurt vignette stays, ms. */
const HURT_MS = 260;
/** How long a damage arrow lives, ms (its CSS fade takes 1 s). */
const ARROW_MS = 1100;

/** Cheap fingerprint of the scoreboard data, so an unchanged board does not re-render. */
function boardKey(players: readonly PlayerInfo[], myId: number): string {
  return `${myId}|${players.map((p) => `${p.id}:${p.name}:${p.kills}:${p.deaths}:${p.bot ? 1 : 0}`).join(',')}`;
}

/**
 * Resets the HUD for a new room and returns the handle the game loop uses.
 * @param code - Room code to display in the corner.
 * @param rules - The room's rules, for the goal and the match clock.
 */
export function createHud(code: string, rules: MatchRules): Hud {
  hudStore.set({ ...BLANK, code, rules });
  let markerTimer = 0;
  let hurtTimer = 0;
  let markerCount = 0;
  let arrowId = 0;
  let lastBoardKey = '';

  return {
    show: (visible) => hudStore.set({ visible }),
    update: (me) => hudStore.set({ me }),
    hurt: () => {
      hudStore.set({ hurt: true });
      clearTimeout(hurtTimer);
      hurtTimer = window.setTimeout(() => hudStore.set({ hurt: false }), HURT_MS);
    },
    hitMarker: (kind) => {
      hudStore.set({ marker: { kind, n: ++markerCount } });
      clearTimeout(markerTimer);
      markerTimer = window.setTimeout(() => hudStore.set({ marker: null }), kind === 'kill' ? 350 : 160);
    },
    damageFrom: (angle) => {
      const id = ++arrowId;
      hudStore.set({ arrows: [...hudStore.get().arrows, { id, angle }] });
      setTimeout(() => hudStore.set({ arrows: hudStore.get().arrows.filter((a) => a.id !== id) }), ARROW_MS);
    },
    scoreboard: (visible, players, myId) => {
      if (!visible) {
        lastBoardKey = '';
        hudStore.set({ board: null });
        return;
      }
      const key = boardKey(players, myId);
      if (key === lastBoardKey) return;
      lastBoardKey = key;
      hudStore.set({ board: { players: [...players], myId } });
    },
    standings: (players, myId) => {
      const mine = players.find((p) => p.id === myId);
      let top: PlayerInfo | undefined;
      for (const p of players) if (p.id !== myId && (!top || p.kills > top.kills)) top = p;
      hudStore.set({ youKills: mine?.kills ?? 0, leadName: top?.name ?? '', leadKills: top ? top.kills : null });
    },
    killedBy: (name, icon) => hudStore.set({ killedBy: name === null ? null : { name, icon } }),
    banner: (title, sub = '') => hudStore.set({ banner: title === null ? null : { title, sub } }),
    scope: (scope) => hudStore.set({ scope }),
    fps: (fps) => hudStore.set({ fps }),
  };
}
