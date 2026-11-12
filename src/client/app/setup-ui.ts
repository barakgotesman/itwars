/**
 * The "Game setup" screen the host sees before creating a room. It is built from the mode registry in
 * `shared/modes.ts`, so a new mode or option shows up here without new screen code. The last choice is remembered.
 */
import {
  DEFAULT_RULES, DEFAULT_TIME_LIMIT_MIN, MODES, describeRules, sanitizeRules, type MatchRules, type OptionDef,
} from '@shared/rules/modes';

const STORAGE_KEY = 'itwars.rules';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

/** What the server can still take, as `/api/info` reports it (measured on the machine the server runs on). */
export interface ServerCapacity {
  /** Bots a room hosted right now could get. */
  botsAvailable: number;
  /** More players that fit before the server is full. */
  playersAvailable: number;
  /** Share (0-1) of the server's budget in use. */
  load: number;
}

/** Handle for the setup screen. */
export interface SetupUi {
  /** Tells the screen what the server can handle, so it can limit the bot choices (null = unknown, no limit). */
  setCapacity(capacity: ServerCapacity | null): void;
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
function chips(
  choices: readonly number[], value: number, unit: string, disabled: boolean, onPick: (v: number) => void,
  labels?: readonly string[], maxChoice = Infinity,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `flex flex-wrap gap-1.5 ${disabled ? 'pointer-events-none opacity-35' : ''}`;
  choices.forEach((c, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    const tooMany = c > maxChoice;
    b.disabled = disabled || tooMany;
    b.className = tooMany ? 'choice min-w-16 pointer-events-none opacity-35' : 'choice min-w-16';
    b.setAttribute('aria-pressed', String(c === value));
    b.textContent = labels?.[k] ?? `${c}`;
    b.title = tooMany ? 'This server cannot run that many bots right now' : (labels?.[k] ?? `${c} ${unit}`);
    b.addEventListener('click', () => onPick(c));
    wrap.append(b);
  });
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
  /** What the server can take right now, once known. */
  let capacity: ServerCapacity | null = null;
  /** The time limit to come back to when the switch is turned off and on again. */
  let lastTime = rules.timeLimitMin || DEFAULT_TIME_LIMIT_MIN;

  /** Draws one option block (label, hint and controls). */
  const option = (opt: OptionDef): HTMLElement => {
    const block = document.createElement('div');
    block.className = 'slab flex flex-col gap-2 bg-panel p-4';
    const head = document.createElement('div');
    head.className = 'flex items-center justify-between gap-4';
    const label = document.createElement('div');
    label.className = 'text-base font-black';
    label.textContent = opt.label;
    head.append(label);

    if (opt.kind === 'optional-choice') {
      const on = rules[opt.key] > 0;
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.textContent = on ? 'On' : 'Off';
      sw.className = 'choice w-20';
      sw.setAttribute('aria-pressed', String(on));
      sw.addEventListener('click', () => {
        rules = { ...rules, [opt.key]: on ? 0 : lastTime };
        render();
      });
      head.append(sw);
    }
    const hint = document.createElement('div');
    hint.className = 'text-xs text-dim';
    hint.textContent = opt.hint;
    block.append(head, hint);
    // The server measures itself at startup; say what that means for the bot count.
    const botLimit = opt.key === 'bots' && capacity ? capacity.botsAvailable : Infinity;
    if (opt.key === 'bots' && capacity) {
      const note = document.createElement('div');
      note.className = `text-xs ${capacity.botsAvailable < 7 ? 'text-accent' : 'text-faint'}`;
      note.textContent = capacity.botsAvailable >= 7
        ? 'This server can run a full room of bots.'
        : `This server can run up to ${capacity.botsAvailable} bots for you right now (${Math.round(capacity.load * 100)}% of its capacity is in use). ` +
          'Players who join take priority over bots.';
      block.append(note);
    }

    const value = rules[opt.key];
    const disabled = opt.kind === 'optional-choice' && value === 0;
    block.append(chips(opt.choices, disabled ? (lastTime || opt.defaultOn) : value, opt.unit, disabled, (v) => {
      if (opt.kind === 'optional-choice') lastTime = v;
      rules = { ...rules, [opt.key]: v };
      render();
    }, opt.kind === 'choice' ? opt.labels : undefined, botLimit));
    return block;
  };

  /** Redraws the mode cards, the options for the chosen mode and the summary line. */
  const render = () => {
    modeList.replaceChildren(...MODES.map((m) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `slab cursor-pointer p-4 text-left ${m.id === rules.mode ? 'bg-accent text-ground' : 'bg-panel hover:bg-raised'}`;
      const name = document.createElement('div');
      name.className = 'text-lg font-black';
      name.textContent = m.name;
      const blurb = document.createElement('div');
      blurb.className = `mt-1 text-xs ${m.id === rules.mode ? 'text-ground/80' : 'text-dim'}`;
      blurb.textContent = m.blurb;
      card.append(name, blurb);
      card.addEventListener('click', () => {
        rules = { ...rules, mode: m.id };
        render();
      });
      return card;
    }));
    const soon = document.createElement('div');
    soon.className = 'p-2 text-xs text-faint';
    soon.textContent = 'More game modes and mods are coming.';
    modeList.append(soon);

    // Never offer (or send) more bots than the server can run.
    if (capacity && rules.bots > capacity.botsAvailable) rules = { ...rules, bots: capacity.botsAvailable };
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
    setCapacity: (c) => {
      capacity = c;
      if (!root.classList.contains('hidden')) render();
    },
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
