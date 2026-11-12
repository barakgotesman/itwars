/**
 * The settings screen: Graphics, Audio and Controls tabs. Controls rebinding works by opening a full-screen
 * "press a key" overlay that takes the next key, mouse button or wheel turn.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { TIERS, currentTier, redetect } from '@client/platform/quality';
import {
  ACTIONS, RENDER_SCALES, WHEEL_ACTIONS, bindingLabel, resetBindings, resetOptions, setBinding, settings, updateSettings,
  type Action,
} from '@client/platform/settings';
import { useSettingsVersion } from '../hooks/useSettings';

type Tab = 'Graphics' | 'Audio' | 'Controls';
const TABS: readonly Tab[] = ['Graphics', 'Audio', 'Controls'];
const GROUPS = ['Movement', 'Combat', 'Weapons', 'Other'] as const;

/** One labelled row with a control on the right. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-3 py-2.5 hover:bg-panel">
      <div>
        <div className="text-sm font-bold">{label}</div>
        {hint && <div className="text-xs text-dim">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** Section heading inside a tab. */
function Heading({ children }: { children: ReactNode }) {
  return <div className="mt-6 px-3 text-lg font-black">{children}</div>;
}

/** Range slider with a live value label. */
function Slider({ min, max, step, value, format, onInput }: {
  min: number; max: number; step: number; value: number; format(v: number): string; onInput(v: number): void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range" min={min} max={max} step={step} value={value} className="w-52 cursor-pointer"
        onChange={(e) => onInput(Number(e.target.value))}
      />
      <span className="w-14 text-right text-sm font-bold tabular-nums">{format(value)}</span>
    </div>
  );
}

/** On/off switch. */
function Toggle({ value, onChange }: { value: boolean; onChange(v: boolean): void }) {
  return (
    <button type="button" className="choice w-20" aria-pressed={value} onClick={() => onChange(!value)}>
      {value ? 'On' : 'Off'}
    </button>
  );
}

/** Segmented choice buttons. */
function Choice<T extends string | number>({ options, value, onChange }: {
  options: readonly { label: string; value: T }[]; value: T; onChange(v: T): void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" className="choice" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Button that resets a group of options to their defaults. */
function ResetButton({ onClick, children }: { onClick(): void; children: ReactNode }) {
  return <button type="button" className="btn-quiet mt-6 self-start" onClick={onClick}>{children}</button>;
}

/** Graphics tab. */
function GraphicsTab() {
  const [redetecting, setRedetecting] = useState(false);
  const tier = currentTier();
  return (
    <>
      <Row label="Graphics quality" hint="Auto matches the game to your computer and keeps it near 60 FPS.">
        <Choice
          options={[{ label: 'Auto (recommended)', value: 'auto' }, { label: 'Manual', value: 'manual' }]}
          value={settings.autoQuality ? 'auto' : 'manual'}
          onChange={(v) => updateSettings({ autoQuality: v === 'auto' })}
        />
      </Row>
      {settings.autoQuality ? (
        <Row label="Current preset" hint="Measured once when you join a room, then saved. It never changes while you play.">
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap text-sm font-bold">{TIERS[tier]!.name} ({tier + 1} of {TIERS.length})</span>
            <button
              type="button" className="btn-quiet whitespace-nowrap !px-3 !py-1.5 !text-xs" disabled={redetecting}
              onClick={() => { redetect(); setRedetecting(true); }}
            >
              {redetecting ? 'Will re-measure next time you join' : 'Re-detect'}
            </button>
          </div>
        </Row>
      ) : (
        <>
          <Row label="Render scale" hint="Lower is faster, higher is sharper.">
            <Choice options={RENDER_SCALES.map((s) => ({ label: `${Math.round(s * 100)}%`, value: s }))} value={settings.renderScale} onChange={(v) => updateSettings({ renderScale: v })} />
          </Row>
          <Row label="Smooth edges (anti-aliasing)" hint="Turning this off helps a lot on weak graphics cards.">
            <Toggle value={settings.antialias} onChange={(v) => updateSettings({ antialias: v })} />
          </Row>
          <Row label="Glow (bloom)" hint="Light glow around lamps and screens.">
            <Toggle value={settings.bloom} onChange={(v) => updateSettings({ bloom: v })} />
          </Row>
          <Row label="Floating dust"><Toggle value={settings.dust} onChange={(v) => updateSettings({ dust: v })} /></Row>
          <Row label="Effects particles" hint="Sparks, smoke and explosion debris.">
            <Toggle value={settings.particles} onChange={(v) => updateSettings({ particles: v })} />
          </Row>
        </>
      )}
      <Row label="Field of view">
        <Slider min={60} max={110} step={1} value={settings.fov} format={(v) => `${v}°`} onInput={(v) => updateSettings({ fov: v })} />
      </Row>
      <Row label="Show FPS"><Toggle value={settings.showFps} onChange={(v) => updateSettings({ showFps: v })} /></Row>
    </>
  );
}

/** Audio tab. */
function AudioTab() {
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <>
      <Row label="Master volume">
        <Slider min={0} max={1} step={0.01} value={settings.volume} format={percent} onInput={(v) => updateSettings({ volume: v })} />
      </Row>
      <Row label="Menu sounds" hint="The blip when you hover a button and the click when you press one. Set to 0 to turn them off.">
        <Slider min={0} max={1} step={0.01} value={settings.uiVolume} format={percent} onInput={(v) => updateSettings({ uiVolume: v })} />
      </Row>
    </>
  );
}

/** Controls tab; clicking a binding calls `onListen`. */
function ControlsTab({ onListen }: { onListen(action: Action, label: string): void }) {
  return (
    <>
      <Heading>Mouse</Heading>
      <Row label="Sensitivity">
        <Slider min={0.2} max={3} step={0.05} value={settings.sensitivity} format={(v) => v.toFixed(2)} onInput={(v) => updateSettings({ sensitivity: v })} />
      </Row>
      <Row label="Invert Y axis"><Toggle value={settings.invertY} onChange={(v) => updateSettings({ invertY: v })} /></Row>
      {GROUPS.map((group) => (
        <div key={group} className="contents">
          <Heading>{group}</Heading>
          {ACTIONS.filter((a) => a.group === group).map((a) => (
            <Row key={a.id} label={a.label}>
              <button
                type="button"
                className="keycap !min-w-36 cursor-pointer !px-3 !py-1.5 !text-sm hover:!bg-accent hover:!text-ground"
                onClick={() => onListen(a.id, a.label)}
              >
                {bindingLabel(settings.bindings[a.id])}
              </button>
            </Row>
          ))}
        </div>
      ))}
      <ResetButton onClick={resetBindings}>Reset controls to defaults</ResetButton>
    </>
  );
}

/**
 * The full-screen "press a key" overlay. While mounted it takes the next key, mouse button or wheel turn
 * and binds it to the action; Esc cancels (Esc is reserved for pausing).
 */
function CaptureOverlay({ action, label, onDone }: { action: Action; label: string; onDone(): void }) {
  useEffect(() => {
    const bind = (code: string) => {
      if (setBinding(action, code)) onDone();
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') onDone();
      else bind(e.code);
    };
    const onMouse = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      bind(`Mouse${e.button}`);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (WHEEL_ACTIONS.has(action)) bind(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
    };
    const block = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('contextmenu', block, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('contextmenu', block, true);
    };
  }, [action, onDone]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-ground/95">
      <div className="text-3xl font-black">Press a key for &quot;{label}&quot;</div>
      <div className="text-sm font-bold text-dim">Press a key or mouse button. <kbd className="keycap">Esc</kbd> cancels.</div>
    </div>
  );
}

/** The settings screen. */
export function Settings({ onClose }: { onClose(): void }) {
  useSettingsVersion();
  const [tab, setTab] = useState<Tab>('Graphics');
  const [capturing, setCapturing] = useState<{ action: Action; label: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !capturing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capturing, onClose]);

  return (
    <div className="voxel-bg fixed inset-0 z-30 flex overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 px-8 py-10">
        <div className="flex items-center justify-between">
          <h2 className="text-4xl font-black uppercase tracking-wider">Settings</h2>
          <button type="button" className="btn-quiet" onClick={onClose}>Back</button>
        </div>
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button key={t} type="button" className="choice !px-5 !py-2 !text-base" aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {tab === 'Graphics' && <GraphicsTab />}
          {tab === 'Audio' && <AudioTab />}
          {tab === 'Controls' && <ControlsTab onListen={(action, label) => setCapturing({ action, label })} />}
          {tab !== 'Controls' && <ResetButton onClick={resetOptions}>Reset graphics, audio and mouse to defaults</ResetButton>}
        </div>
      </div>
      {capturing && <CaptureOverlay action={capturing.action} label={capturing.label} onDone={() => setCapturing(null)} />}
    </div>
  );
}
