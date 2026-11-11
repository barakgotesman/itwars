/**
 * Client entry: menu (callsign, host or join), room panel (code, players, pause), and hand-off to the game loop.
 */
import './style.css';
import { CHARACTERS, PLAYER_COLORS } from '../shared/characters';
import { describeRules, type MatchRules } from '../shared/modes';
import type { ErrorMsg, HostMsg, JoinedMsg, JoinMsg, PlayerInfo } from '../shared/protocol';
import { loadLook, saveLook } from './appearance';
import { startGame, type GameHandle } from './game';
import { createHud, type Hud } from './hud';
import { Input } from './input';
import { Net } from './net';
import { commitName, initialName } from './player-name';
import { createPreview } from './preview';
import { createSettingsUi } from './settings-ui';
import { createSetupUi, type SetupUi } from './setup-ui';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Player-facing text for each server error. */
const ERROR_TEXT: Record<ErrorMsg['reason'], string> = {
  'bad-code': 'No room with that code. Check it and try again.',
  'room-full': 'That room is full.',
  'bad-request': 'The server did not understand the request.',
  'rate-limit': 'Too many requests. Slow down.',
};

/** Shows a panel (flex) or hides it. */
function setShown(id: string, shown: boolean): void {
  const el = $(id);
  el.classList.toggle('hidden', !shown);
  el.classList.toggle('flex', shown);
}

if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
  setShown('touch-notice', true);
} else {
  boot();
}

/** Wires the whole menu flow. */
function boot(): void {
  const canvas = $<HTMLCanvasElement>('game');
  const nameField = $<HTMLInputElement>('name');
  const codeField = $<HTMLInputElement>('code');
  const errorLine = $('menu-error');
  nameField.value = initialName();

  // ---- character picker ----
  const look = loadLook();
  const preview = createPreview($<HTMLCanvasElement>('preview'), look);
  const charButtons: HTMLButtonElement[] = [];
  const swatches: HTMLButtonElement[] = [];
  /** Highlights the current choice, updates the labels and the 3D preview, and remembers it. */
  const applyLook = () => {
    charButtons.forEach((b, i) => b.classList.toggle('bg-white/25', i === look.model));
    swatches.forEach((b, i) => {
      b.classList.toggle('ring-2', i === look.color);
      b.classList.toggle('ring-white', i === look.color);
    });
    $('char-name').textContent = CHARACTERS[look.model]!.name;
    $('char-blurb').textContent = CHARACTERS[look.model]!.blurb;
    preview.setLook(look);
    saveLook(look);
  };
  CHARACTERS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = c.name;
    b.className = 'cursor-pointer rounded border border-white/20 bg-white/5 px-1 py-1.5 text-[10px] uppercase tracking-wider hover:bg-white/15';
    b.textContent = c.name.split(' ')[0]!;
    b.addEventListener('click', () => { look.model = i; applyLook(); });
    charButtons.push(b);
    $('char-list').append(b);
  });
  PLAYER_COLORS.forEach((hex, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = `Colour ${i + 1}`;
    b.className = 'h-6 w-6 cursor-pointer rounded-full ring-offset-2 ring-offset-black';
    b.style.backgroundColor = `#${hex.toString(16).padStart(6, '0')}`;
    b.addEventListener('click', () => { look.color = i; applyLook(); });
    swatches.push(b);
    $('color-list').append(b);
  });
  applyLook();

  let net: Net | null = null;
  let hud: Hud | null = null;
  let game: GameHandle | null = null;
  let inRoom = false;
  let entered = false;
  let lanUrl = location.origin;
  let setup: SetupUi;

  const input = new Input(canvas, (locked) => {
    $('crosshair').classList.toggle('hidden', !locked);
    if (!inRoom) return;
    setShown('room', !locked);
    // The HUD belongs to actual play: hidden in the room screen and while paused.
    hud?.show(locked);
    // The map stays hidden until the first entry, so the room screen shows nothing of the game.
    if (locked) $('cover').classList.add('hidden');
  });

  // The server knows this machine's LAN addresses; the page may have been opened as "localhost".
  void fetch('/api/info').then((r) => r.json()).then((info: { lan: string[]; port: number }) => {
    const ip = info.lan[0];
    if (!ip) return;
    lanUrl = `http://${ip}:${location.port || info.port}`;
    $('lan-hint').textContent = `Playing with friends on your network? They open ${lanUrl} and join with your room code.`;
  }).catch(() => {
    // Info is only a hint; the menu works without it.
  });

  /** Redraws the player list in the room panel. */
  const renderPlayers = (players: readonly PlayerInfo[]) => {
    const list = $('room-players');
    list.replaceChildren(...players.map((p) => {
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
  };

  /** Sends a host/join request on a fresh connection and waits for the reply. */
  const request = async (msg: HostMsg | JoinMsg): Promise<JoinedMsg> => {
    const n = await Net.connect();
    return new Promise((resolve, reject) => {
      const off = n.on((m) => {
        if (m.t === 'joined') {
          off();
          net = n;
          resolve(m);
        } else if (m.t === 'error') {
          off();
          n.close();
          reject(new Error(ERROR_TEXT[m.reason]));
        }
      });
      n.send(msg);
    });
  };

  /** Switches from the menu to the room panel and starts the game loop. */
  const onJoined = (joined: JoinedMsg) => {
    if (!net) return;
    inRoom = true;
    preview.dispose();
    hud = createHud(joined.code, joined.rules);
    $('room-code').textContent = joined.code;
    $('room-rules').textContent = describeRules(joined.rules);
    $('room-share').textContent = `Friends open ${lanUrl} and enter this code.`;
    renderPlayers(joined.players);
    net.on((m) => {
      if (m.t === 'roster') renderPlayers(m.players);
    });
    net.onClose(() => setShown('disconnected', true));
    setShown('menu', false);
    setup.close();
    setShown('room', true);
    hud.show(false);
    $('cover').classList.remove('hidden');
    game = startGame({ canvas, input, net, joined, hud });
    // Graphics are measured once, right now, behind the room screen; entering waits until that is done.
    const enterButton = $<HTMLButtonElement>('enter');
    enterButton.disabled = true;
    enterButton.textContent = 'Optimizing graphics...';
    game.whenReady(() => {
      enterButton.disabled = false;
      enterButton.textContent = entered ? 'Resume' : 'Enter the office';
    });
  };

  /** Runs a host/join attempt, showing errors under the buttons. */
  const attempt = async (msg: { t: 'host'; rules: MatchRules } | { t: 'join'; code: string }) => {
    errorLine.textContent = '';
    const name = commitName(nameField.value);
    nameField.value = name;
    setBusy(true);
    try {
      onJoined(await request({ ...msg, name, model: look.model, color: look.color }));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not connect.';
      // A failed host attempt is reported on the setup screen, where the host is looking.
      if (msg.t === 'host') setup.showError(message);
      else errorLine.textContent = message;
      setBusy(false);
    }
  };

  /** Disables the menu buttons while a request is in flight. */
  const setBusy = (busy: boolean) => {
    for (const id of ['host', 'join']) $<HTMLButtonElement>(id).disabled = busy;
    setup.setBusy(busy);
  };

  // Host game opens the setup screen; its Create button sends the chosen rules to the server.
  setup = createSetupUi((rules) => void attempt({ t: 'host', rules }));
  $('host').addEventListener('click', () => setup.open());
  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = codeField.value.trim();
    if (code.length !== 4) {
      errorLine.textContent = 'Room codes are 4 characters.';
      return;
    }
    void attempt({ t: 'join', code });
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

  // Settings: from the main menu, and from the pause screen that Esc brings up.
  const settingsUi = createSettingsUi();
  $('menu-settings').addEventListener('click', settingsUi.open);
  $('room-settings').addEventListener('click', settingsUi.open);
}
