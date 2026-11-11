/**
 * The room screen shown after joining (and again as the pause menu): room code, rules, player list, "Enter the
 * office" / Resume, Settings and Leave. Owns the pointer-locked `Input`, the HUD and the running game.
 */
import { describeRules } from '@shared/rules/modes';
import type { JoinedMsg, PlayerInfo } from '@shared/net/protocol';
import { startGame, type GameHandle } from '@client/game';
import { createHud, type Hud } from '@client/hud/hud';
import { Input } from '@client/platform/input';
import type { Net } from '@client/platform/net';
import { $, setShown } from './dom';

/** Redraws the player list in the room panel. */
function renderPlayers(players: readonly PlayerInfo[]): void {
  $('room-players').replaceChildren(...players.map((p) => {
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between gap-6 px-3 py-1.5';
    const name = document.createElement('span');
    name.textContent = p.name;
    const score = document.createElement('span');
    score.className = 'text-white/50';
    score.textContent = `${p.kills} kills`;
    li.append(name, score);
    return li;
  }));
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

  return {
    open(conn, joined, lanUrl) {
      net = conn;
      inRoom = true;
      hud = createHud(joined.code, joined.rules);
      $('room-code').textContent = joined.code;
      $('room-rules').textContent = describeRules(joined.rules);
      $('room-share').textContent = `Friends open ${lanUrl} and enter this code.`;
      renderPlayers(joined.players);
      conn.on((m) => {
        if (m.t === 'roster') renderPlayers(m.players);
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
