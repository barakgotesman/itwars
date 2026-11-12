/**
 * The "Game setup" screen the host sees before creating a room. It is built from the mode registry in
 * `shared/rules/modes.ts`, so a new mode or option shows up here without new screen code. The last choice is
 * remembered in `localStorage` via `platform/rules-storage.ts`. The menu owns whether it is open and passes
 * capacity, busy and error state in.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_TIME_LIMIT_MIN, MODES, describeRules, type MatchRules, type OptionDef } from '@shared/rules/modes';
import type { ServerStatus } from '@shared/net/info';
import { loadRules, saveRules } from '@client/platform/rules-storage';
import { CapacityPanel } from '../components/CapacityPanel';
import { Chips } from '../components/Chips';
import { Toggle } from '../components/controls';

/** Props for {@link OptionBlock}. */
interface OptionBlockProps {
  opt: OptionDef;
  rules: MatchRules;
  capacity: ServerStatus | null;
  /** The time limit to come back to when the switch is turned off and on again. */
  lastTime: number;
  onChange(patch: Partial<MatchRules>): void;
  onRememberTime(minutes: number): void;
}

/** One option block: label, hint and its controls. */
function OptionBlock({ opt, rules, capacity, lastTime, onChange, onRememberTime }: OptionBlockProps) {
  const value = rules[opt.key];
  // The server measures itself at startup; say what that means for the bot count.
  const botCapacity = opt.key === 'bots' ? capacity : null;
  // A switched-off option has nothing to choose: show just the switch.
  const off = opt.kind === 'optional-choice' && value === 0;
  return (
    <div className="slab flex flex-col gap-2 bg-panel p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-base font-black">{opt.label}</div>
        {opt.kind === 'optional-choice' && (
          <Toggle value={!off} onChange={(on) => onChange({ [opt.key]: on ? lastTime : 0 })} />
        )}
      </div>
      <div className="text-xs text-dim">{opt.hint}</div>
      {botCapacity && (
        <div className={botCapacity.botsAvailable < 7 ? 'text-xs text-accent' : 'text-xs text-faint'}>
          {botCapacity.botsAvailable >= 7
            ? 'This server can run a full room of bots.'
            : `This server can run up to ${botCapacity.botsAvailable} bots for you right now (${Math.round(botCapacity.load * 100)}% of its capacity is in use). Players who join take priority over bots.`}
        </div>
      )}
      {!off && (
        <Chips
          choices={opt.choices}
          value={value}
          unit={opt.unit}
          labels={opt.kind === 'choice' ? opt.labels : undefined}
          maxChoice={botCapacity ? botCapacity.botsAvailable : Infinity}
          onPick={(v) => {
            if (opt.kind === 'optional-choice') onRememberTime(v);
            onChange({ [opt.key]: v });
          }}
        />
      )}
    </div>
  );
}

/** Props for {@link Setup}. */
interface SetupProps {
  /** What the server can still take (null = unknown, no limit). */
  capacity: ServerStatus | null;
  /** Disables Create room while a request is in flight. */
  busy: boolean;
  /** Error shown under the Create button (for example "Cannot reach the game server"). */
  error: string;
  /** Called with the chosen rules when the host clicks "Create room". */
  onCreate(rules: MatchRules): void;
  /** Called on Back or Esc. */
  onClose(): void;
}

/** The whole setup screen. */
export function Setup({ capacity, busy, error, onCreate, onClose }: SetupProps) {
  const [rules, setRules] = useState(loadRules);
  const [lastTime, setLastTime] = useState(() => rules.timeLimitMin || DEFAULT_TIME_LIMIT_MIN);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Never offer (or send) more bots than the server can run.
  const current = capacity && rules.bots > capacity.botsAvailable ? { ...rules, bots: capacity.botsAvailable } : rules;
  const mode = MODES.find((m) => m.id === current.mode) ?? MODES[0]!;
  // Options that depend on another (bot skill needs bots) appear only while that one is on.
  const options = mode.options.filter((o) => o.kind !== 'choice' || !o.dependsOn || current[o.dependsOn] > 0);

  return (
    <div className="voxel-bg fixed inset-0 z-20 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-6 px-8 py-10">
        <div className="flex items-center justify-between">
          <h2 className="text-4xl font-black uppercase tracking-wider">Game setup</h2>
          <button type="button" className="btn-quiet" onClick={onClose}>Back</button>
        </div>
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          <section className="flex flex-col gap-2">
            <h3 className="label">Mode</h3>
            <div className="flex flex-col gap-2">
              {MODES.map((m) => {
                const active = m.id === current.mode;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={active ? 'slab cursor-pointer bg-accent p-4 text-left text-ground' : 'slab cursor-pointer bg-panel p-4 text-left hover:bg-raised'}
                    onClick={() => setRules({ ...current, mode: m.id })}
                  >
                    <div className="text-lg font-black">{m.name}</div>
                    <div className={active ? 'mt-1 text-xs text-ground/80' : 'mt-1 text-xs text-dim'}>{m.blurb}</div>
                  </button>
                );
              })}
              <div className="p-2 text-xs text-faint">More game modes and mods are coming.</div>
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="label">Rules</h3>
            <div className="flex flex-col gap-3">
              {capacity && <CapacityPanel capacity={capacity} />}
              {options.map((opt) => (
                <OptionBlock
                  key={opt.key}
                  opt={opt}
                  rules={current}
                  capacity={capacity}
                  lastTime={lastTime}
                  onChange={(patch) => setRules({ ...current, ...patch })}
                  onRememberTime={setLastTime}
                />
              ))}
            </div>
          </section>
        </div>
        <div className="slab bg-panel p-4">
          <div className="label">This room</div>
          <div className="mt-1 text-xl font-black">{describeRules(current)}</div>
        </div>
        <p className="min-h-5 text-center text-sm font-bold text-danger" role="alert">{error}</p>
        <button
          type="button"
          className="btn w-full max-w-sm self-center"
          disabled={busy}
          onClick={() => {
            saveRules(current);
            onCreate(current);
          }}
        >
          Create room
        </button>
      </div>
    </div>
  );
}
