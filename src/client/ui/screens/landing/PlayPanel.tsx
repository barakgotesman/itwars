/**
 * The hero's one big "Play" block: callsign, Host a game, join with a room code, and the Shooting Range. These are
 * the only things above the fold that ask for a click, so nothing else competes with them.
 */
import type { FormEvent } from 'react';
import { RANGE_NOTE } from './copy';

/** Props for {@link PlayPanel}. */
export interface PlayPanelProps {
  name: string;
  onName(name: string): void;
  code: string;
  onCode(code: string): void;
  /** Join error text ("" for none). */
  error: string;
  /** True while a host/join request is in flight. */
  busy: boolean;
  /** The server's LAN hint, shown under the buttons. */
  lanHint: string;
  onJoin(e: FormEvent): void;
  onHost(): void;
  /** Opens the lobby browser. */
  onBrowse(): void;
  onRange(): void;
}

/** The play block. */
export function PlayPanel({ name, onName, code, onCode, error, busy, lanHint, onJoin, onHost, onBrowse, onRange }: PlayPanelProps) {
  return (
    <div className="slab flex flex-col gap-4 bg-panel p-5">
      <label className="flex flex-col gap-1.5">
        <span className="label">Callsign</span>
        <input
          type="text" maxLength={16} autoComplete="off" spellCheck={false} placeholder="Leave blank for a guest name"
          className="field text-lg" value={name} onChange={(e) => onName(e.target.value)}
        />
      </label>

      <button type="button" className="btn !py-4 !text-2xl" disabled={busy} onClick={onHost}>Host a game</button>

      <form className="flex flex-col gap-1.5" onSubmit={onJoin}>
        <label htmlFor="code" className="label">Or join with a room code</label>
        <div className="flex gap-2">
          <input
            id="code" type="text" maxLength={4} autoComplete="off" spellCheck={false} placeholder="ABCD"
            className="field min-w-0 flex-1 text-center text-3xl font-black uppercase tracking-[0.35em] placeholder:tracking-[0.35em]"
            value={code} onChange={(e) => onCode(e.target.value)}
          />
          <button type="submit" className="btn-quiet !px-6 !text-base" disabled={busy}>Join</button>
        </div>
        <p className="min-h-5 text-sm font-bold text-danger" role="alert">{error}</p>
      </form>

      <button type="button" className="btn-quiet !py-3 !text-base" disabled={busy} onClick={onBrowse}>Browse games</button>

      <div className="flex flex-col gap-1.5">
        <button type="button" className="btn-quiet !py-3 !text-base" disabled={busy} onClick={onRange}>Shooting Range</button>
        <p className="text-xs text-faint">{RANGE_NOTE}</p>
      </div>
      {lanHint && <p className="text-xs text-faint">{lanHint}</p>}
    </div>
  );
}
