/**
 * The main menu: callsign, character picker with the 3D preview, host (via the Game setup screen) and join by
 * code. It talks to the server only to host or join; once a room is joined it hands over to the room session.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CHARACTERS, PLAYER_COLORS } from '@shared/core/characters';
import type { MatchRules } from '@shared/rules/modes';
import type { ServerStatus } from '@shared/net/info';
import { createBackdrop, type Backdrop } from '@client/render/menu-backdrop';
import { loadLook, saveLook, type Look } from '@client/platform/appearance';
import { fetchInfo, request } from '@client/platform/lobby';
import { commitName, initialName } from '@client/platform/player-name';
import { createPreview, type Preview } from '@client/render/menu-preview';
import { Logo } from '../components/Logo';
import { SprayPicker } from '../components/SprayPicker';
import { joinRoom } from '../session';
import { Setup } from './Setup';

/** Hex colour string for a shirt colour. */
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** The controls cheat sheet under the buttons (only on tall enough screens). */
function ControlsHint() {
  const rows: [string[], string][] = [
    [['W', 'A', 'S', 'D'], 'Move'],
    [['Shift', 'Space'], 'Sprint, jump'],
    [['LMB', 'RMB'], 'Shoot, aim'],
    [['1', '2', '3', '4'], 'Weapons'],
    [['G', 'H', 'E'], 'Grenades, doors'],
  ];
  return (
    <div className="hidden grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm text-dim [@media(min-height:720px)]:grid">
      {rows.map(([keys, label]) => (
        <div key={label} className="contents">
          <span className="flex gap-1">{keys.map((k) => <kbd key={k} className="keycap">{k}</kbd>)}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

/** Props for {@link Menu}. */
interface MenuProps {
  /** Opens the settings screen. */
  onOpenSettings(): void;
}

/** The main menu screen. */
export function Menu({ onOpenSettings }: MenuProps) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [look, setLook] = useState<Look>(loadLook);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [capacity, setCapacity] = useState<ServerStatus | null>(null);
  const [lanUrl, setLanUrl] = useState(location.origin);
  const [lanHint, setLanHint] = useState('');

  const previewCanvas = useRef<HTMLCanvasElement>(null);
  const backdropCanvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<Preview | null>(null);
  const backdrop = useRef<Backdrop | null>(null);
  // Captures the look the component mounted with; the mount effect below runs once, before any change to
  // `look` could happen, so this is read-only after the initial render (never reassigned).
  const lookRef = useRef(look);

  /** Stops the menu's WebGL views (safe to call twice). */
  const stopViews = useCallback(() => {
    preview.current?.dispose();
    backdrop.current?.dispose();
    preview.current = null;
    backdrop.current = null;
  }, []);

  // The two WebGL views live exactly as long as the menu; they are also stopped before a game starts.
  useEffect(() => {
    preview.current = createPreview(previewCanvas.current!, lookRef.current);
    backdrop.current = createBackdrop(backdropCanvas.current!);
    return () => stopViews();
  }, [stopViews]);

  useEffect(() => {
    preview.current?.setLook(look);
    saveLook(look);
  }, [look]);

  // The server knows this machine's LAN addresses; the page may have been opened as "localhost".
  useEffect(() => {
    void fetchInfo().then((info) => {
      if (!info) return;
      setCapacity(info.status ?? null);
      const ip = info.lan[0];
      if (!ip) return;
      const url = `http://${ip}:${location.port || info.port}`;
      setLanUrl(url);
      setLanHint(`Playing with friends on your network? They open ${url} and join with your room code.`);
    });
  }, []);

  /** Runs a host/join attempt; errors show under the buttons (on the setup screen for hosting). */
  const attempt = async (msg: { t: 'host'; rules: MatchRules } | { t: 'join'; code: string }) => {
    setError('');
    setSetupError('');
    const callsign = commitName(name);
    setName(callsign);
    setBusy(true);
    try {
      const { net, joined } = await request({ ...msg, name: callsign, model: look.model, color: look.color, spray: look.spray });
      stopViews();
      joinRoom(net, joined, lanUrl);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not connect.';
      if (msg.t === 'host') setSetupError(message);
      else setError(message);
      setBusy(false);
    }
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 4) {
      setError('Room codes are 4 characters.');
      return;
    }
    void attempt({ t: 'join', code: trimmed });
  };

  const openSetup = () => {
    // Capacity changes as rooms fill up, so ask again each time the host opens the screen.
    void fetchInfo().then((info) => info && setCapacity(info.status ?? null));
    setSetupError('');
    setSetupOpen(true);
  };
  const closeSetup = useCallback(() => setSetupOpen(false), []);

  const character = CHARACTERS[look.model]!;
  return (
    <>
      <canvas ref={backdropCanvas} className="pointer-events-none fixed inset-0 h-screen w-screen scale-105 opacity-0 blur-[3px] transition-opacity duration-1000" aria-hidden="true" />
      <div className="fixed inset-0 overflow-y-auto bg-ground/70">
        <div className="mx-auto grid min-h-full max-w-6xl items-center gap-x-10 gap-y-6 px-8 py-6 lg:grid-cols-[1fr_26rem] [@media(min-height:800px)]:py-10">
          {/* Stage: the game's name, and who you will be. */}
          <section className="flex flex-col gap-3 [@media(min-height:800px)]:gap-5">
            <header>
              <h1 className="w-64 max-w-full text-accent [@media(min-height:800px)]:w-80" aria-label="IT Wars"><Logo /></h1>
              <p className="mt-2 text-base font-bold text-dim [@media(min-height:800px)]:mt-3 [@media(min-height:800px)]:text-lg">Have you tried turning them off?</p>
            </header>
            <canvas ref={previewCanvas} className="h-[clamp(11rem,34vh,22rem)] w-full bg-panel" />
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-black">{character.name}</div>
                <div className="line-clamp-2 h-10 text-sm text-dim">{character.blurb}</div>
              </div>
              <div className="flex shrink-0 flex-nowrap gap-1.5">
                {PLAYER_COLORS.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    title={`Colour ${i + 1}`}
                    aria-pressed={i === look.color}
                    className={`h-7 w-7 cursor-pointer outline-offset-2 outline-ink ${i === look.color ? 'outline-3' : ''}`}
                    style={{ backgroundColor: hex(c) }}
                    onClick={() => setLook({ ...look, color: i })}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {CHARACTERS.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  title={c.name}
                  aria-pressed={i === look.model}
                  className="choice !px-1 !py-2 text-[11px] uppercase tracking-wide"
                  onClick={() => setLook({ ...look, model: i })}
                >
                  {c.name.split(' ')[0]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="label shrink-0">Spray <kbd className="keycap">T</kbd></span>
              <SprayPicker value={look.spray} onChange={(spray) => setLook({ ...look, spray })} />
            </div>
          </section>

          {/* Play: callsign, join a friend's room, or host one. */}
          <section className="slab flex flex-col gap-4 bg-panel p-5 [@media(min-height:800px)]:gap-6 [@media(min-height:800px)]:p-6">
            <label className="flex flex-col gap-1.5">
              <span className="label">Callsign</span>
              <input
                type="text" maxLength={16} autoComplete="off" spellCheck={false} placeholder="Leave blank for a guest name"
                className="field text-lg" value={name} onChange={(e) => setName(e.target.value)}
              />
            </label>

            <form className="flex flex-col gap-1.5" onSubmit={onJoin}>
              <label htmlFor="code" className="label">Join with a room code</label>
              <div className="flex gap-2">
                <input
                  id="code" type="text" maxLength={4} autoComplete="off" spellCheck={false} placeholder="ABCD"
                  className="field min-w-0 flex-1 text-center text-3xl font-black uppercase tracking-[0.35em] placeholder:tracking-[0.35em]"
                  value={code} onChange={(e) => setCode(e.target.value)}
                />
                <button type="submit" className="btn" disabled={busy}>Join</button>
              </div>
              <p className="min-h-5 text-sm font-bold text-danger" role="alert">{error}</p>
            </form>

            <div className="flex flex-col gap-1.5">
              <span className="label">Or start your own</span>
              <button type="button" className="btn-quiet !py-3 !text-base" disabled={busy} onClick={openSetup}>Host a game</button>
              <p className="text-xs text-faint">Pick the kill limit and time limit, then share the code.</p>
            </div>

            <div className="flex flex-col gap-2 pt-1 [@media(min-height:800px)]:mt-2">
              <ControlsHint />
              <button type="button" className="btn-quiet mt-2 self-start" onClick={onOpenSettings}>Settings and controls</button>
            </div>
            <p className="text-xs text-faint">{lanHint}</p>
          </section>
        </div>
      </div>
      {setupOpen && (
        <Setup
          capacity={capacity}
          busy={busy}
          error={setupError}
          onCreate={(rules) => void attempt({ t: 'host', rules })}
          onClose={closeSetup}
        />
      )}
    </>
  );
}
