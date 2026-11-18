/**
 * The "Game setup" screen the host sees before creating a room. It is built from the mode registry in
 * `shared/rules/modes.ts`, so a new mode or option shows up here without new screen code. Every option is one slim
 * row under a group heading (Match / Players / Weapons), its long explanation lives in an info bubble, and the room
 * summary and Create button are pinned at the bottom, so the whole screen fits without scrolling. The last choice is
 * remembered in `localStorage` via `platform/rules-storage.ts`. The menu owns whether it is open and passes
 * capacity, busy and error state in.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_TIME_LIMIT_MIN, MODES, groupOptions, type MatchRules, type OptionDef } from '@shared/rules/modes';
import type { ServerStatus } from '@shared/net/info';
import { loadRules, saveRules } from '@client/platform/rules-storage';
import { capacityNote } from '../components/CapacityPanel';
import { Footer } from '../components/Footer';
import { Chips } from '../components/Chips';
import { MapPicker } from '../components/MapPicker';
import { Toggle } from '../components/controls';
import { RulesSummary } from '../components/RulesSummary';
import { SetupRow } from '../components/SetupRow';
import { Stepper } from '../components/Stepper';

/** Longer lists than this become a < > carousel instead of a row of chips. */
const MAX_CHIPS = 3;

/** Props for {@link OptionRow}. */
interface OptionRowProps {
  opt: OptionDef;
  rules: MatchRules;
  capacity: ServerStatus | null;
  /** The time limit to come back to when the switch is turned off and on again. */
  lastTime: number;
  onChange(patch: Partial<MatchRules>): void;
  onRememberTime(minutes: number): void;
}

/** One option as a slim row: name, info bubble and its controls. */
function OptionRow({ opt, rules, capacity, lastTime, onChange, onRememberTime }: OptionRowProps) {
  const value = rules[opt.key];
  // The server measures itself at startup; say what that means for the bot count.
  const botCapacity = opt.key === 'bots' ? capacity : null;
  // A switched-off option has nothing to choose: show just the switch.
  const off = opt.kind === 'optional-choice' && value === 0;
  const pick = (v: number) => {
    if (opt.kind === 'optional-choice') onRememberTime(v);
    onChange({ [opt.key]: v });
  };
  return (
    <SetupRow
      label={opt.label}
      hint={opt.hint}
      note={botCapacity ? capacityNote(botCapacity) : undefined}
      nested={opt.kind === 'choice' && opt.dependsOn !== undefined}
    >
      <div className="flex items-center gap-2">
        {opt.kind === 'optional-choice' && (
          <Toggle value={!off} onChange={(on) => onChange({ [opt.key]: on ? lastTime : 0 })} />
        )}
        {!off && (opt.choices.length > MAX_CHIPS
          ? (
            <Stepper
              choices={opt.choices}
              value={value}
              unit={opt.unit}
              labels={opt.kind === 'choice' ? opt.labels : undefined}
              maxChoice={botCapacity ? botCapacity.botsAvailable : Infinity}
              onPick={pick}
            />
          )
          : (
            <Chips
              compact
              choices={opt.choices}
              value={value}
              unit={opt.unit}
              labels={opt.kind === 'choice' ? opt.labels : undefined}
              onPick={pick}
            />
          ))}
      </div>
    </SetupRow>
  );
}

/** Props for {@link Setup}. */
interface SetupProps {
  /** What the server can still take (null = unknown, no limit). */
  capacity: ServerStatus | null;
  /** Disables Create room while a request is in flight. */
  busy: boolean;
  /** Error shown above the Create button (for example "Cannot reach the game server"). */
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

  // The shooting range is solo practice, reached from its own menu button, never a hosted room other
  // players could join by code -- it never appears as a choice here, and a stale saved choice of it
  // (from before this rule existed) falls back to Deathmatch rather than silently being sent anyway.
  const hostableModes = MODES.filter((m) => m.id !== 'range');
  const base = hostableModes.some((m) => m.id === rules.mode) ? rules : { ...rules, mode: hostableModes[0]!.id };
  // Never offer (or send) more bots than the server can run.
  const current = capacity && base.bots > capacity.botsAvailable ? { ...base, bots: capacity.botsAvailable } : base;
  const mode = hostableModes.find((m) => m.id === current.mode) ?? hostableModes[0]!;
  // Options that depend on another (bot skill needs bots) appear only while that one is on.
  // The map is shown as cards (`MapPicker`) rather than a row, so it is left out of the generated panels.
  const options = mode.options.filter((o) => o.key !== 'map' && (o.kind !== 'choice' || !o.dependsOn || current[o.dependsOn] > 0));
  const groups = groupOptions(options);

  return (
    <div className="voxel-bg fixed inset-0 z-20 flex flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-2 px-6 pb-6">
        {/* The header stays in view and carries the summary of every setting, so the choices are visible at a glance. */}
        <header className="sticky top-0 z-10 -mx-6 flex flex-col gap-2 bg-ground px-6 pb-2 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black uppercase tracking-wider">Game setup</h2>
            <button type="button" className="btn-quiet" onClick={onClose}>Back</button>
          </div>
          <div className="slab flex items-center gap-3 bg-panel px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <RulesSummary rules={current} />
            </div>
            <button
              type="button"
              className="btn shrink-0 !px-6 !py-2.5"
              disabled={busy}
              onClick={() => {
                saveRules(current);
                onCreate(current);
              }}
            >
              Create room
            </button>
          </div>
          {error && <p className="text-sm font-bold text-danger" role="alert">{error}</p>}
        </header>
        {/* Always shown, so a new mode in the registry appears here with no screen change. Many modes wrap onto more rows. */}
        <section className="flex flex-col gap-1.5">
          <h3 className="label">Mode</h3>
          <div className="flex flex-wrap gap-2">
            {hostableModes.map((m) => {
              const active = m.id === current.mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  title={m.blurb}
                  className={active ? 'slab min-w-36 cursor-pointer bg-accent px-4 py-2 text-left text-sm font-black text-ground' : 'slab min-w-36 cursor-pointer bg-panel px-4 py-2 text-left text-sm font-black hover:bg-raised'}
                  onClick={() => setRules({ ...current, mode: m.id })}
                >
                  {m.name}
                </button>
              );
            })}
            {hostableModes.length === 1 && (
              <div className="min-w-36 border-2 border-dashed border-faint/50 px-4 py-2 text-sm font-bold text-faint">More modes soon</div>
            )}
          </div>
          <p className="text-xs text-dim">{mode.blurb}</p>
        </section>
        {mode.options.some((o) => o.key === 'map') && (
          <section className="flex flex-col gap-1.5">
            <h3 className="label">Map</h3>
            <MapPicker value={current.map} onPick={(map) => setRules({ ...current, map })} />
          </section>
        )}
        {groups.map((g) => (
          <section key={g.group} className="flex flex-col gap-1.5">
            <h3 className="label">{g.group}</h3>
            {/* One panel per topic: its rows share a background and are split by thin lines. */}
            <div className="slab flex flex-col divide-y divide-raised bg-panel">
            {g.options.map((opt) => (
              <OptionRow
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
        ))}
      </div>
      <Footer />
    </div>
  );
}
