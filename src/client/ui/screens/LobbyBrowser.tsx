/**
 * The lobby browser: a live table of the open rooms on this server (host, code, players, mode, settings, status)
 * with a Join button per row. It polls `/api/rooms` every 2 s while open and only reads; joining goes through the
 * menu's own join handler, so the callsign, look and error handling are the same as joining by code.
 */
import { useCallback, useEffect, useState } from 'react';
import type { RoomPhase, RoomSummary } from '@shared/net/info';
import { MODES } from '@shared/rules/modes';
import { fetchRooms } from '@client/platform/lobby';
import { Footer } from '../components/Footer';
import { RulesSummary } from '../components/RulesSummary';

/** How often the list refreshes while the screen is open. */
const POLL_MS = 2000;

/** Player-facing name and colour of each room phase. */
const PHASE: Record<RoomPhase, { text: string; tone: string }> = {
  lobby: { text: 'Waiting', tone: 'text-accent' },
  play: { text: 'In match', tone: 'text-ok' },
  over: { text: 'Intermission', tone: 'text-warn' },
};

/** Props for {@link LobbyBrowser}. */
interface LobbyBrowserProps {
  /** True while a join request is in flight. */
  busy: boolean;
  /** Join error from the menu ("" for none). */
  error: string;
  /** Joins the room with this code. */
  onJoin(code: string): void;
  /** Called on Back or Esc. */
  onClose(): void;
}

/** One table row. */
function RoomRow({ room, busy, onJoin }: { room: RoomSummary; busy: boolean; onJoin(code: string): void }) {
  const phase = PHASE[room.phase];
  const mode = MODES.find((m) => m.id === room.rules.mode)?.name ?? 'Deathmatch';
  return (
    <tr className="border-t border-raised align-middle">
      <td className="px-3 py-3 text-lg font-black">{room.host}</td>
      <td className="px-3 py-3 font-mono text-lg font-black tracking-[0.25em] text-accent">{room.code}</td>
      <td className="whitespace-nowrap px-3 py-3 font-bold tabular-nums">
        {room.humans + room.bots} / {room.capacity}
        <span className="block text-xs font-normal text-dim">
          {room.humans} {room.humans === 1 ? 'player' : 'players'}, {room.bots} {room.bots === 1 ? 'bot' : 'bots'}
        </span>
      </td>
      <td className="px-3 py-3 font-bold">{mode}</td>
      <td className="px-3 py-3"><RulesSummary rules={room.rules} /></td>
      <td className={`whitespace-nowrap px-3 py-3 font-bold ${phase.tone}`}>{phase.text}</td>
      <td className="px-3 py-3 text-right">
        <button
          type="button" className="btn !px-5 !py-2 !text-base" disabled={busy || !room.joinable}
          title={room.joinable ? `Join ${room.host}` : 'This room is full'}
          onClick={() => onJoin(room.code)}
        >
          {room.joinable ? 'Join' : 'Full'}
        </button>
      </td>
    </tr>
  );
}

/** The whole lobby browser screen. */
export function LobbyBrowser({ busy, error, onJoin, onClose }: LobbyBrowserProps) {
  // null = not loaded yet, 'down' = server unreachable.
  const [rooms, setRooms] = useState<RoomSummary[] | null | 'down'>(null);

  const refresh = useCallback(() => {
    void fetchRooms().then((list) => setRooms(list ?? 'down'));
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [refresh, onClose]);

  return (
    <div className="voxel-bg fixed inset-0 z-20 flex flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl shrink-0 flex-1 flex-col gap-4 px-8 py-10">
        <div className="flex items-center justify-between">
          <h2 className="text-4xl font-black uppercase tracking-wider">Browse games</h2>
          <button type="button" className="btn-quiet" onClick={onClose}>Back</button>
        </div>
        <p className="min-h-5 text-sm font-bold text-danger" role="alert">{error}</p>

        {rooms === 'down' && (
          <div className="slab flex items-center justify-between gap-4 bg-panel p-5">
            <span className="font-bold text-danger">Cannot reach the game server.</span>
            <button type="button" className="btn-quiet" onClick={refresh}>Retry</button>
          </div>
        )}
        {rooms === null && <div className="slab bg-panel p-5 text-dim">Looking for games...</div>}
        {Array.isArray(rooms) && rooms.length === 0 && (
          <div className="slab bg-panel p-5 text-dim">No open games right now. Host one and friends will see it here.</div>
        )}
        {Array.isArray(rooms) && rooms.length > 0 && (
          <div className="slab overflow-x-auto bg-panel">
            <table className="w-full min-w-[56rem] text-left">
              <thead>
                <tr className="label">
                  <th className="px-3 py-2 font-normal">Host</th>
                  <th className="px-3 py-2 font-normal">Code</th>
                  <th className="px-3 py-2 font-normal">Players</th>
                  <th className="px-3 py-2 font-normal">Mode</th>
                  <th className="px-3 py-2 font-normal">Settings</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2"><span className="sr-only">Join</span></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => <RoomRow key={r.code} room={r} busy={busy} onJoin={onJoin} />)}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-faint">Rooms the host set to Hidden are not listed; join those with their room code.</p>
      </div>
      <Footer />
    </div>
  );
}
