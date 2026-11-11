/**
 * The room screen shown after joining (and again as the pause menu): room code, rules, player list, "Enter the
 * office" / Resume, Settings and Leave. Owns the pointer-locked `Input`, the HUD and the running game.
 */
import { MAX_PLAYERS } from '@shared/core/constants';
import { describeRules } from '@shared/rules/modes';
import type { JoinedMsg, PlayerInfo } from '@shared/net/protocol';
import { startGame, type GameHandle } from '@client/game';
import { createHud, type Hud } from '@client/hud/hud';
import { Input } from '@client/platform/input';
import type { Net } from '@client/platform/net';
import { $, setShown } from './dom';
import { setIconLabel, type IconName } from './icons';

/**
 * Redraws the player list in the room panel.
 * @param players - Everyone in the room.
 * @param myId - Your player id, so your own row is marked "(you)".
 */
function renderPlayers(players: readonly PlayerInfo[], myId: number): void {
  // Scores only mean something once somebody has scored; a fresh room shows names alone.
  const started = players.some((p) => p.kills > 0 || p.deaths > 0);
  $('room-count').textContent = `${players.length} / ${MAX_PLAYERS}`;
  const empty = Array.from({ length: Math.max(0, MAX_PLAYERS - players.length) }, () => {
    const li = document.createElement('li');
    li.className = 'px-3 py-2 text-xs font-bold text-faint';
    li.textContent = 'Waiting for a player...';
    return li;
  });
  $('room-players').replaceChildren(...players.map((p) => {
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between gap-6 bg-raised px-3 py-2 font-bold';
    const name = document.createElement('span');
    name.textContent = p.id === myId ? `${p.name} (you)` : p.name;
    if (p.id === myId) name.className = 'text-accent';
    const score = document.createElement('span');
    score.className = 'text-xs text-dim';
    score.textContent = started ? `${p.kills} ${p.kills === 1 ? 'kill' : 'kills'}` : '';
    li.append(name, score);
    return li;
  }), ...empty);
}

/**
 * Copies text to the clipboard. The async clipboard API only exists on secure pages, and a LAN address such as
 * http://192.168.x.x is not one, so this falls back to a hidden textarea and `execCommand`.
 * @returns Whether the text was copied.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea method.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/** Handle used by the menu to open the room screen. */
export interface RoomPanel {
  /**
   * Shows the room screen for a joined room and starts the game behind it.
   * @param net - The open connection.
   * @param joined - The server's welcome message.
   * @param lanUrl - Address friends can open to join.
   */
  open(net: Net, joined: JoinedMsg, lanUrl: string): void;
}

/**
 * Wires the room screen, pause menu and pointer-lock handling.
 * @param canvas - The game canvas (pointer lock target).
 * @param openSettings - Opens the settings screen (from the pause menu).
 */
export function createRoomPanel(canvas: HTMLCanvasElement, openSettings: () => void): RoomPanel {
  let net: Net | null = null;
  let hud: Hud | null = null;
  let game: GameHandle | null = null;
  let inRoom = false;
  let entered = false;

  const input = new Input(canvas, (locked) => {
    $('crosshair').classList.toggle('hidden', !locked);
    if (!inRoom) return;
    setShown('room', !locked);
    // The HUD belongs to actual play: hidden in the room screen and while paused.
    hud?.show(locked);
    // The map stays hidden until the first entry, so the room screen shows nothing of the game.
    if (locked) $('cover').classList.add('hidden');
  });

  $('enter').addEventListener('click', () => {
    if (!entered) {
      entered = true;
      // Tell the server to spawn us; until now we only sat in the room lobby.
      net?.send({ t: 'enter' });
      $('enter').textContent = 'Resume';
      $('room-title').textContent = 'Paused';
    }
    game?.unlockAudio();
    input.lock();
  });
  $('leave').addEventListener('click', () => {
    net?.close();
    location.reload();
  });
  $('reload').addEventListener('click', () => location.reload());
  $('room-settings').addEventListener('click', openSettings);
  // Copy buttons: the address alone (icon beside it) or the whole invite (address and code).
  const wireCopy = (id: string, icon: IconName, label: string, text: () => string) => {
    const button = $(id);
    setIconLabel(button, icon, label);
    button.addEventListener('click', () => {
      void copyText(text()).then((ok) => {
        setIconLabel(button, ok ? 'check' : icon, ok ? (label && 'Copied') : (label && 'Select it to copy'));
        button.title = ok ? 'Copied' : 'Could not copy; select the text instead';
        setTimeout(() => { setIconLabel(button, icon, label); button.title = id === 'copy-url' ? 'Copy address' : ''; }, 1500);
      });
    });
  };
  wireCopy('copy-url', 'copy', '', () => $('room-url').textContent ?? '');
  wireCopy('copy-code', 'copy', 'Copy invite', () => `Join IT Wars: open ${$('room-url').textContent ?? ''} and enter the code ${$('room-code').textContent ?? ''}`);
  setIconLabel($('room-settings'), 'settings', 'Settings');
  setIconLabel($('leave'), 'exit', 'Leave room');

  return {
    open(conn, joined, lanUrl) {
      net = conn;
      inRoom = true;
      hud = createHud(joined.code, joined.rules);
      $('room-code').textContent = joined.code;
      $('room-rules').textContent = describeRules(joined.rules);
      $('room-url').textContent = lanUrl;
      renderPlayers(joined.players, joined.id);
      conn.on((m) => {
        if (m.t === 'roster') renderPlayers(m.players, joined.id);
      });
      conn.onClose(() => setShown('disconnected', true));
      setShown('room', true);
      hud.show(false);
      $('cover').classList.remove('hidden');
      game = startGame({ canvas, input, net: conn, joined, hud });
      // Graphics are measured once, right now, behind the room screen; entering waits until that is done.
      const enterButton = $<HTMLButtonElement>('enter');
      enterButton.disabled = true;
      enterButton.textContent = 'Optimizing graphics...';
      game.whenReady(() => {
        enterButton.disabled = false;
        enterButton.textContent = entered ? 'Resume' : 'Enter the office';
      });
    },
  };
}
