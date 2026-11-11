/**
 * The main menu: callsign, character picker with the 3D preview, host (via the Game setup screen) and
 * join by code. Talks to the server only to host or join; once a room is joined it hands over to the room panel.
 */
import { CHARACTERS, PLAYER_COLORS } from '@shared/core/characters';
import type { MatchRules } from '@shared/rules/modes';
import type { ErrorMsg, HostMsg, JoinedMsg, JoinMsg } from '@shared/net/protocol';
import { SERVER_HTTP } from '@client/config';
import { Net } from '@client/platform/net';
import { loadLook, saveLook } from './appearance';
import { $, setShown } from './dom';
import { commitName, initialName } from './player-name';
import { createPreview } from './preview';
import { createSetupUi, type SetupUi } from './setup-ui';

/** Player-facing text for each server error. */
const ERROR_TEXT: Record<ErrorMsg['reason'], string> = {
  'bad-code': 'No room with that code. Check it and try again.',
  'room-full': 'That room is full.',
  'bad-request': 'The server did not understand the request.',
  'rate-limit': 'Too many requests. Slow down.',
};

/** What the menu reports back once the server accepted the player. */
export interface MenuHooks {
  /** A room was hosted or joined; `lanUrl` is the address friends can open. */
  onJoined(net: Net, joined: JoinedMsg, lanUrl: string): void;
  /** Opens the settings screen. */
  openSettings(): void;
}

/**
 * Wires the whole menu flow.
 * @param hooks - Called when a room is joined.
 */
export function createMenu(hooks: MenuHooks): void {
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

  let lanUrl = location.origin;
  let setup: SetupUi;

  // The server knows this machine's LAN addresses; the page may have been opened as "localhost".
  void fetch(`${SERVER_HTTP}/api/info`).then((r) => r.json()).then((info: { lan: string[]; port: number }) => {
    const ip = info.lan[0];
    if (!ip) return;
    lanUrl = `http://${ip}:${location.port || info.port}`;
    $('lan-hint').textContent = `Playing with friends on your network? They open ${lanUrl} and join with your room code.`;
  }).catch(() => {
    // Info is only a hint; the menu works without it.
  });

  /** Sends a host/join request on a fresh connection and waits for the reply. */
  const request = async (msg: HostMsg | JoinMsg): Promise<{ net: Net; joined: JoinedMsg }> => {
    const net = await Net.connect();
    return new Promise((resolve, reject) => {
      const off = net.on((m) => {
        if (m.t === 'joined') {
          off();
          resolve({ net, joined: m });
        } else if (m.t === 'error') {
          off();
          net.close();
          reject(new Error(ERROR_TEXT[m.reason]));
        }
      });
      net.send(msg);
    });
  };

  /** Disables the menu buttons while a request is in flight. */
  const setBusy = (busy: boolean) => {
    for (const id of ['host', 'join']) $<HTMLButtonElement>(id).disabled = busy;
    setup.setBusy(busy);
  };

  /** Runs a host/join attempt, showing errors under the buttons. */
  const attempt = async (msg: { t: 'host'; rules: MatchRules } | { t: 'join'; code: string }) => {
    errorLine.textContent = '';
    const name = commitName(nameField.value);
    nameField.value = name;
    setBusy(true);
    try {
      const { net, joined } = await request({ ...msg, name, model: look.model, color: look.color });
      preview.dispose();
      setShown('menu', false);
      setup.close();
      hooks.onJoined(net, joined, lanUrl);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not connect.';
      // A failed host attempt is reported on the setup screen, where the host is looking.
      if (msg.t === 'host') setup.showError(message);
      else errorLine.textContent = message;
      setBusy(false);
    }
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

  $('menu-settings').addEventListener('click', hooks.openSettings);
}
