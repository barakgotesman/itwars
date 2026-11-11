/**
 * The "Game setup" screen the host sees before creating a room. It is built from the mode registry in
 * `shared/modes.ts`, so a new mode or option shows up here without new screen code. The last choice is remembered.
 */
import {
  DEFAULT_RULES, DEFAULT_TIME_LIMIT_MIN, MODES, describeRules, sanitizeRules, type MatchRules, type OptionDef,
} from '@shared/rules/modes';

const STORAGE_KEY = 'itwars.rules';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** Handle for the setup screen. */
export interface SetupUi {
  /** Shows the screen. */
  open(): void;
  /** Hides the screen. */
  close(): void;
  /** Shows an error under the Create button (for example "Cannot reach the game server"). */
  showError(message: string): void;
  /** Disables the buttons while a request is in flight. */
  setBusy(busy: boolean): void;
}

/** Reads the host's last rules, or the defaults. */
function loadRules(): MatchRules {
  try {
    return sanitizeRules(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_RULES };
  }
}

/** Remembers the rules for next time. */
function saveRules(rules: MatchRules): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Not persisting is fine.
  }
}

/** A row of choice buttons, with the current value highlighted. */
function chips(choices: readonly number[], value: number, unit: string, disabled: boolean, onPick: (v: number) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `flex flex-wrap gap-2 ${disabled ? 'pointer-events-none opacity-35' : ''}`;
  for (const c of choices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = disabled;
    b.className = `min-w-16 cursor-pointer rounded border px-3 py-2 text-sm ${c === value ? 'border-white bg-white/25 font-bold' : 'border-white/20 bg-white/5 text-white/70 hover:bg-white/15'}`;
    b.textContent = `${c}`;
    b.title = `${c} ${unit}`;
    b.addEventListener('click', () => onPick(c));
    wrap.append(b);
  }
  return wrap;
}

/**
 * Wires the setup panel in `index.html`.
 * @param onCreate - Called with the chosen rules when the host clicks "Create room".
 */
export function createSetupUi(onCreate: (rules: MatchRules) => void): SetupUi {
  const root = $('setup');
  const modeList = $('mode-list');
  const ruleList = $('rule-list');
  const summary = $('setup-summary');
  const errorLine = $('setup-error');
  const createButton = $('setup-create') as HTMLButtonElement;
  let rules = loadRules();
  /** The time limit to come back to when the switch is turned off and on again. */
  let lastTime = rules.timeLimitMin || DEFAULT_TIME_LIMIT_MIN;

  /** Draws one option block (label, hint and controls). */
  const option = (opt: OptionDef): HTMLElement => {
    const block = document.createElement('div');
    block.className = 'flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-4';
    const head = document.createElement('div');
    head.className = 'flex items-center justify-between gap-4';
    const label = document.createElement('div');
    label.className = 'text-sm font-bold uppercase tracking-widest';
    label.textContent = opt.label;
    head.append(label);

    if (opt.kind === 'optional-choice') {
      const on = rules[opt.key] > 0;
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.textContent = on ? 'On' : 'Off';
      sw.className = `w-20 cursor-pointer rounded border px-3 py-1 text-sm ${on ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200' : 'border-white/20 bg-white/5 text-white/60'}`;
      sw.addEventListener('click', () => {
        rules = { ...rules, [opt.key]: on ? 0 : lastTime };
        render();
      });
      head.append(sw);
    }
    const hint = document.createElement('div');
    hint.className = 'text-xs text-white/50';
    hint.textContent = opt.hint;
    block.append(head, hint);

    const value = rules[opt.key];
    const disabled = opt.kind === 'optional-choice' && value === 0;
    block.append(chips(opt.choices, disabled ? (lastTime || opt.defaultOn) : value, opt.unit, disabled, (v) => {
      if (opt.kind === 'optional-choice') lastTime = v;
      rules = { ...rules, [opt.key]: v };
      render();
    }));
    return block;
  };

  /** Redraws the mode cards, the options for the chosen mode and the summary line. */
  const render = () => {
    modeList.replaceChildren(...MODES.map((m) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `cursor-pointer rounded-lg border p-4 text-left ${m.id === rules.mode ? 'border-white bg-white/15' : 'border-white/15 bg-white/5 hover:bg-white/10'}`;
      const name = document.createElement('div');
      name.className = 'text-lg font-bold';
      name.textContent = m.name;
      const blurb = document.createElement('div');
      blurb.className = 'mt-1 text-xs text-white/60';
      blurb.textContent = m.blurb;
      card.append(name, blurb);
      card.addEventListener('click', () => {
        rules = { ...rules, mode: m.id };
        render();
      });
      return card;
    }));
    const soon = document.createElement('div');
    soon.className = 'rounded-lg border border-dashed border-white/15 p-4 text-xs text-white/40';
    soon.textContent = 'More game modes and mods are coming.';
    modeList.append(soon);

    const mode = MODES.find((m) => m.id === rules.mode) ?? MODES[0]!;
    ruleList.replaceChildren(...mode.options.map(option));
    summary.textContent = describeRules(rules);
  };

  const close = () => {
    root.classList.replace('flex', 'hidden');
    root.classList.add('hidden');
  };
  $('setup-back').addEventListener('click', close);
  createButton.addEventListener('click', () => {
    errorLine.textContent = '';
    saveRules(rules);
    onCreate(rules);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !root.classList.contains('hidden')) close();
  });

  return {
    open: () => {
      errorLine.textContent = '';
      render();
      root.classList.remove('hidden');
    },
    close,
    showError: (message) => {
      errorLine.textContent = message;
    },
    setBusy: (busy) => {
      createButton.disabled = busy;
    },
  };
}
