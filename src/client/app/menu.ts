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
import { createBackdrop } from './backdrop';
import { renderLogo } from './logo';
import { $, setShown } from './dom';
import { commitName, initialName } from './player-name';
import { createPreview } from './preview';
import { createSprayPicker } from './spray-picker';
import { createSetupUi, type ServerCapacity, type SetupUi } from './setup-ui';

/** Player-facing text for each server error. */
const ERROR_TEXT: Record<ErrorMsg['reason'], string> = {
  'bad-code': 'No room with that code. Check it and try again.',
  'room-full': 'That room is full.',
  'server-full': 'This server is at its limit right now. Try again in a moment.',
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
  renderLogo($('logo'));

  // ---- character picker ----
  const look = loadLook();
  const backdrop = createBackdrop($<HTMLCanvasElement>('backdrop'));
  const preview = createPreview($<HTMLCanvasElement>('preview'), look);
  const charButtons: HTMLButtonElement[] = [];
  const swatches: HTMLButtonElement[] = [];
  /** Highlights the current choice, updates the labels and the 3D preview, and remembers it. */
  const applyLook = () => {
    charButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === look.model)));
    swatches.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(i === look.color));
      b.classList.toggle('outline-3', i === look.color);
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
    b.className = 'choice !px-1 !py-2 text-[11px] uppercase tracking-wide';
    b.textContent = c.name.split(' ')[0]!;
    b.addEventListener('click', () => { look.model = i; applyLook(); });
    charButtons.push(b);
    $('char-list').append(b);
  });
  PLAYER_COLORS.forEach((hex, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = `Colour ${i + 1}`;
    b.className = 'h-7 w-7 cursor-pointer outline-offset-2 outline-ink';
    b.style.backgroundColor = `#${hex.toString(16).padStart(6, '0')}`;
    b.addEventListener('click', () => { look.color = i; applyLook(); });
    swatches.push(b);
    $('color-list').append(b);
  });
  // The spray design is a carousel (a highlighted button would hide yellow designs on a yellow highlight).
  const sprayPicker = createSprayPicker($('spray-list'), look.spray, (i) => { look.spray = i; applyLook(); });
  applyLook();

  let lanUrl = location.origin;
  let setup: SetupUi;

  // The server knows this machine's LAN addresses; the page may have been opened as "localhost".
  /** Asks the server what it can still take and tells the setup screen. */
  const refreshCapacity = (): Promise<void> => fetch(`${SERVER_HTTP}/api/info`).then((r) => r.json()).then((info: { status?: ServerCapacity }) => {
    setup?.setCapacity(info.status ?? null);
  }).catch(() => {
    // Without it the setup screen just offers every choice and the server decides.
  });

  void fetch(`${SERVER_HTTP}/api/info`).then((r) => r.json()).then((info: { lan: string[]; port: number; status?: ServerCapacity }) => {
    setup?.setCapacity(info.status ?? null);
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
      const { net, joined } = await request({ ...msg, name, model: look.model, color: look.color, spray: look.spray });
      preview.dispose();
      backdrop.dispose();
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
  $('host').addEventListener('click', () => {
    // Capacity changes as rooms fill up, so ask again each time the host opens the screen.
    void refreshCapacity();
    setup.open();
  });
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
