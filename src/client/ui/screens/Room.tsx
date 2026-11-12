/**
 * The room screen shown after joining (and again as the pause menu): room code, rules, player list, "Enter the
 * office" / Resume, Settings and Leave. It only draws and forwards clicks; the pointer lock, the HUD and the
 * running game are owned by `ui/session.ts`.
 */
import { useEffect, useRef, useState } from 'react';
import { MAX_PLAYERS } from '@shared/core/constants';
import { describeRules } from '@shared/rules/modes';
import { copyText } from '@client/platform/clipboard';
import { Icon, type IconName } from '../components/Icon';
import { useApp } from '../app-store';
import { enterOffice, leaveRoom } from '../session';

/** Props for {@link CopyButton}. */
interface CopyButtonProps {
  icon: IconName;
  /** Text next to the icon; omit for an icon-only button. */
  label?: string;
  /** Tooltip while idle. */
  title?: string;
  /** What gets copied. */
  text: string;
  className: string;
}

/** A button that copies text and shows "Copied" for a moment. */
function CopyButton({ icon, label = '', title = '', text, className }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'ok' | 'failed'>('idle');
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onClick = () => {
    void copyText(text).then((ok) => {
      setState(ok ? 'ok' : 'failed');
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('idle'), 1500);
    });
  };
  const shown = state === 'ok' ? 'Copied' : 'Select it to copy';
  return (
    <button
      type="button"
      className={className}
      title={state === 'ok' ? 'Copied' : state === 'failed' ? 'Could not copy; select the text instead' : title}
      aria-label={title || label}
      onClick={onClick}
    >
      <Icon name={state === 'ok' ? 'check' : icon} />
      {label && <span>{state === 'idle' ? label : shown}</span>}
    </button>
  );
}

/** The room screen; shown whenever you are in a room but not playing. */
export function Room({ onOpenSettings }: { onOpenSettings(): void }) {
  const { room, ready, entered } = useApp();
  if (!room) return null;
  const { joined, lanUrl, players } = room;
  const isRange = joined.rules.mode === 'range';
  // Scores only mean something once somebody has scored; a fresh room shows names alone.
  const started = players.some((p) => p.kills > 0 || p.deaths > 0);
  const invite = `Join IT Wars: open ${lanUrl} and enter the code ${joined.code}`;

  const actions = (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn w-full" disabled={!ready} onClick={enterOffice}>
        {!ready ? 'Optimizing graphics...' : entered ? 'Resume' : isRange ? 'Enter the range' : 'Enter the office'}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-quiet inline-flex items-center justify-center gap-2" onClick={onOpenSettings}>
          <Icon name="settings" /><span>Settings</span>
        </button>
        <button type="button" className="btn-quiet inline-flex items-center justify-center gap-2 hover:!bg-danger hover:!text-ground" onClick={leaveRoom}>
          <Icon name="exit" /><span>Leave room</span>
        </button>
      </div>
    </div>
  );

  if (isRange) {
    return (
      <div className="fixed inset-0 flex overflow-y-auto bg-ground/90 px-6 py-6">
        <div className="m-auto flex w-full max-w-md flex-col gap-6 text-center">
          <div>
            <p className="label">{entered ? 'Paused' : 'Shooting Range'}</p>
            <p className="mt-2 text-base font-extrabold">Unlimited ammo and grenades. Every gun, no setup.</p>
          </div>
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex overflow-y-auto bg-ground/90 px-6 py-6">
      {/* Two columns on wide screens so the lobby fits a laptop's height; one column when narrow. */}
      <div className="m-auto grid w-full max-w-4xl items-center gap-8 md:grid-cols-2 md:gap-12">
        <section className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
          <p className="label">{entered ? 'Paused' : 'Lobby'}</p>
          <div className="select-all text-7xl font-black tracking-[0.2em] text-accent lg:text-8xl">{joined.code}</div>
          <p className="mt-1 text-sm text-dim">Friends open this address and enter the code:</p>
          <div className="flex items-center gap-2">
            <code className="select-all text-lg font-extrabold text-ink">{lanUrl}</code>
            <CopyButton icon="copy" title="Copy address" text={lanUrl} className="btn-quiet inline-flex !p-2" />
          </div>
          <p className="mt-2 text-base font-extrabold">{describeRules(joined.rules)}</p>
          <CopyButton icon="copy" label="Copy invite" text={invite} className="btn-quiet mt-2 inline-flex items-center gap-2" />
        </section>
        <section className="flex flex-col gap-4">
          <div className="slab bg-panel p-3">
            <div className="mb-2 flex justify-between text-xs font-bold text-dim">
              <span>Players</span><span>{players.length} / {MAX_PLAYERS}</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {players.map((p) => (
                <li key={p.id} className="plate flex items-center justify-between gap-6 bg-raised px-3 py-2 font-bold">
                  <span className={p.id === joined.id ? 'text-accent' : ''}>{p.id === joined.id ? `${p.name} (you)` : p.name}</span>
                  <span className="text-xs text-dim">{started ? `${p.kills} ${p.kills === 1 ? 'kill' : 'kills'}` : ''}</span>
                </li>
              ))}
              {Array.from({ length: Math.max(0, MAX_PLAYERS - players.length) }, (_, i) => (
                <li key={`empty-${i}`} className="px-3 py-2 text-xs font-bold text-faint">Waiting for a player...</li>
              ))}
            </ul>
          </div>
          {actions}
        </section>
      </div>
    </div>
  );
}
