/**
 * The settings screen: Graphics, Audio and Controls tabs, built with plain DOM. Controls rebinding works by
 * opening a full-screen "press a key" overlay that takes the next key, mouse button or wheel turn.
 */
import { TIERS, currentTier, redetect } from '@client/platform/quality';
import {
  ACTIONS, RENDER_SCALES, WHEEL_ACTIONS, bindingLabel, resetBindings, resetOptions, setBinding, settings, updateSettings,
  type Action,
} from '@client/platform/settings';

type Tab = 'Graphics' | 'Audio' | 'Controls';
const TABS: readonly Tab[] = ['Graphics', 'Audio', 'Controls'];

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** Handle for opening and closing the screen. */
export interface SettingsUi {
  open(): void;
  close(): void;
}

/** One labelled row with a control on the right. */
function row(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const r = document.createElement('div');
  r.className = 'flex items-center justify-between gap-6 px-3 py-2.5 hover:bg-panel';
  const left = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'text-sm font-bold';
  name.textContent = label;
  left.append(name);
  if (hint) {
    const h = document.createElement('div');
    h.className = 'text-xs text-dim';
    h.textContent = hint;
    left.append(h);
  }
  r.append(left, control);
  return r;
}

/** Section heading inside a tab. */
function heading(text: string): HTMLElement {
  const h = document.createElement('div');
  h.className = 'mt-6 px-3 text-lg font-black';
  h.textContent = text;
  return h;
}

/** Range slider with a live value label. */
function slider(min: number, max: number, step: number, value: number, format: (v: number) => string, onInput: (v: number) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center gap-3';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.className = 'w-52 cursor-pointer';
  const label = document.createElement('span');
  label.className = 'w-14 text-right text-sm font-bold tabular-nums';
  label.textContent = format(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    label.textContent = format(v);
    onInput(v);
  });
  wrap.append(input, label);
  return wrap;
}

/** On/off switch. */
function toggle(value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  const paint = (on: boolean) => {
    b.textContent = on ? 'On' : 'Off';
    b.className = 'choice w-20';
    b.setAttribute('aria-pressed', String(on));
  };
  let state = value;
  paint(state);
  b.addEventListener('click', () => {
    state = !state;
    paint(state);
    onChange(state);
  });
  return b;
}

/** Segmented choice buttons. */
function choice<T extends string | number>(options: readonly { label: string; value: T }[], value: T, onChange: (v: T) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex gap-1.5';
  const buttons = options.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = o.label;
    b.addEventListener('click', () => {
      onChange(o.value);
      paint(o.value);
    });
    wrap.append(b);
    return { b, value: o.value };
  });
  const paint = (current: T) => {
    for (const { b, value: v } of buttons) {
      b.className = 'choice';
      b.setAttribute('aria-pressed', String(v === current));
    }
  };
  paint(value);
  return wrap;
}

/**
 * Wires the settings panel in `index.html`.
 * @returns Handle to open and close it.
 */
export function createSettingsUi(): SettingsUi {
  const root = $('settings');
  const body = $('settings-body');
  const tabsEl = $('settings-tabs');
  const capture = $('capture');
  let tab: Tab = 'Graphics';
  let stopCapture: (() => void) | null = null;

  const graphics = () => {
    body.append(row(
      'Graphics quality',
      choice([{ label: 'Auto (recommended)', value: 'auto' }, { label: 'Manual', value: 'manual' }], settings.autoQuality ? 'auto' : 'manual', (v) => {
        updateSettings({ autoQuality: v === 'auto' });
        render();
      }),
      'Auto matches the game to your computer and keeps it near 60 FPS.',
    ));
    if (settings.autoQuality) {
      const current = document.createElement('div');
      current.className = 'flex items-center gap-3';
      const name = document.createElement('span');
      name.className = 'whitespace-nowrap text-sm font-bold';
      name.textContent = `${TIERS[currentTier()]!.name} (${currentTier() + 1} of ${TIERS.length})`;
      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn-quiet whitespace-nowrap !px-3 !py-1.5 !text-xs';
      again.textContent = 'Re-detect';
      again.addEventListener('click', () => {
        redetect();
        again.textContent = 'Will re-measure next time you join';
        again.disabled = true;
      });
      current.append(name, again);
      body.append(row('Current preset', current, 'Measured once when you join a room, then saved. It never changes while you play.'));
    } else {
      body.append(
        row('Render scale', choice(RENDER_SCALES.map((s) => ({ label: `${Math.round(s * 100)}%`, value: s })), settings.renderScale, (v) => updateSettings({ renderScale: v })), 'Lower is faster, higher is sharper.'),
        row('Smooth edges (anti-aliasing)', toggle(settings.antialias, (v) => updateSettings({ antialias: v })), 'Turning this off helps a lot on weak graphics cards.'),
        row('Glow (bloom)', toggle(settings.bloom, (v) => updateSettings({ bloom: v })), 'Light glow around lamps and screens.'),
        row('Floating dust', toggle(settings.dust, (v) => updateSettings({ dust: v }))),
        row('Effects particles', toggle(settings.particles, (v) => updateSettings({ particles: v })), 'Sparks, smoke and explosion debris.'),
      );
    }
    body.append(
      row('Field of view', slider(60, 110, 1, settings.fov, (v) => `${v}°`, (v) => updateSettings({ fov: v }))),
      row('Show FPS', toggle(settings.showFps, (v) => updateSettings({ showFps: v }))),
    );
  };

  const audio = () => {
    body.append(
      row('Master volume', slider(0, 1, 0.01, settings.volume, (v) => `${Math.round(v * 100)}%`, (v) => updateSettings({ volume: v }))),
    );
  };

  const controls = () => {
    body.append(
      heading('Mouse'),
      row('Sensitivity', slider(0.2, 3, 0.05, settings.sensitivity, (v) => v.toFixed(2), (v) => updateSettings({ sensitivity: v }))),
      row('Invert Y axis', toggle(settings.invertY, (v) => updateSettings({ invertY: v }))),
    );
    for (const group of ['Movement', 'Combat', 'Weapons', 'Other'] as const) {
      body.append(heading(group));
      for (const a of ACTIONS.filter((x) => x.group === group)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'keycap !min-w-36 cursor-pointer !px-3 !py-1.5 !text-sm hover:!bg-accent hover:!text-ground';
        b.textContent = bindingLabel(settings.bindings[a.id]);
        b.addEventListener('click', () => listen(a.id, a.label));
        body.append(row(a.label, b));
      }
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn-quiet mt-6 self-start';
    reset.textContent = 'Reset controls to defaults';
    reset.addEventListener('click', () => {
      resetBindings();
      render();
    });
    body.append(reset);
  };

  /** Redraws the tab strip and the current tab's rows. */
  const render = () => {
    tabsEl.replaceChildren(...TABS.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t;
      b.className = 'choice !px-5 !py-2 !text-base';
      b.setAttribute('aria-pressed', String(t === tab));
      b.addEventListener('click', () => {
        tab = t;
        render();
      });
      return b;
    }));
    body.replaceChildren();
    if (tab === 'Graphics') graphics();
    else if (tab === 'Audio') audio();
    else controls();
    if (tab !== 'Controls') {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'btn-quiet mt-6 self-start';
      reset.textContent = 'Reset graphics, audio and mouse to defaults';
      reset.addEventListener('click', () => {
        resetOptions();
        render();
      });
      body.append(reset);
    }
  };

  /** Opens the "press a key" overlay and binds the next key, mouse button or wheel turn to the action. */
  const listen = (action: Action, label: string) => {
    stopCapture?.();
    $('capture-title').textContent = `Press a key for "${label}"`;
    capture.classList.replace('hidden', 'flex');
    const done = () => {
      capture.classList.replace('flex', 'hidden');
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('contextmenu', block, true);
      stopCapture = null;
      render();
    };
    const bind = (code: string) => {
      if (setBinding(action, code)) done();
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Esc is reserved for pausing, so it cancels instead of binding.
      if (e.code === 'Escape') done();
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
    stopCapture = done;
  };

  const close = () => {
    stopCapture?.();
    root.classList.replace('flex', 'hidden');
    root.classList.add('hidden');
  };
  const open = () => {
    render();
    root.classList.remove('hidden');
  };

  $('settings-close').addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !root.classList.contains('hidden') && !stopCapture) close();
  });

  return { open, close };
}
