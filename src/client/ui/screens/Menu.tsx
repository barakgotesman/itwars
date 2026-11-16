/**
 * The main menu, built as a landing page: a hero with the play block and the 3D character over the live office,
 * then short sections about the game and the staff, then the footer. This component owns the state and the
 * host/join/range handlers and the two WebGL views (office backdrop, character preview); the markup lives in
 * `landing/`. It talks to the server only to host or join; once a room is joined it hands over to the room session.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { RANGE_RULES, type MatchRules } from '@shared/rules/modes';
import { CHARACTERS } from '@shared/core/characters';
import type { ServerStatus } from '@shared/net/info';
import { createBackdrop, type Backdrop } from '@client/render/menu-backdrop';
import { loadLook, saveLook, type Look } from '@client/platform/appearance';
import { fetchInfo, request } from '@client/platform/lobby';
import { commitName, initialName } from '@client/platform/player-name';
import { createPreview, type Preview } from '@client/render/menu-preview';
import { Footer } from '../components/Footer';
import { joinRoom } from '../session';
import { Arena } from './landing/Arena';
import { Arsenal } from './landing/Arsenal';
import { FinalCta } from './landing/FinalCta';
import { Hero } from './landing/Hero';
import { HowItPlays } from './landing/HowItPlays';
import { Staff } from './landing/Staff';
import { TopBar } from './landing/TopBar';
import { Setup } from './Setup';

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
  /** Direction of the last arrow press, read once by the effect that updates the preview. */
  const stepDirection = useRef<0 | 1 | -1>(0);

  /** Stops the menu's WebGL views (safe to call twice). */
  const stopViews = useCallback(() => {
    preview.current?.dispose();
    backdrop.current?.dispose();
    preview.current = null;
    backdrop.current = null;
  }, []);

  // The two WebGL views live exactly as long as the menu; they are also stopped before a game starts.
  useEffect(() => {
    preview.current = createPreview(previewCanvas.current!, lookRef.current, { transparent: true });
    backdrop.current = createBackdrop(backdropCanvas.current!);
    return () => stopViews();
  }, [stopViews]);

  useEffect(() => {
    // An arrow press spins the old character out and the new one in; any other change (colour) swaps at once.
    preview.current?.setLook(look, stepDirection.current || undefined);
    stepDirection.current = 0;
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
  /** Moves to the next or previous character (wrapping round) with the spin transition. */
  const stepCharacter = (direction: 1 | -1) => {
    stepDirection.current = direction;
    setLook({ ...look, model: (look.model + direction + CHARACTERS.length) % CHARACTERS.length });
  };
  const startRange = () => void attempt({ t: 'host', rules: RANGE_RULES });

  return (
    <>
      <canvas ref={backdropCanvas} className="pointer-events-none fixed inset-0 h-screen w-screen opacity-0 transition-opacity duration-1000" aria-hidden="true" />
      <div className="fixed inset-0 flex scroll-smooth flex-col overflow-y-auto">
        <TopBar onOpenSettings={onOpenSettings} />
        <Hero
          previewCanvas={previewCanvas}
          model={look.model}
          color={look.color}
          onColor={(color) => setLook({ ...look, color })}
          onStep={stepCharacter}
          spray={look.spray}
          onSpray={(spray) => setLook({ ...look, spray })}
          name={name}
          onName={setName}
          code={code}
          onCode={setCode}
          error={error}
          busy={busy}
          lanHint={lanHint}
          onJoin={onJoin}
          onHost={openSetup}
          onRange={startRange}
        />
        <div className="bg-ground/90">
          <HowItPlays />
          <Arsenal />
          <Arena />
          <Staff />
          <FinalCta busy={busy} onHost={openSetup} onRange={startRange} />
          <Footer />
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
