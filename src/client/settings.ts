/**
 * Player settings: graphics, audio, mouse and rebindable controls. Saved in localStorage and applied live
 * through change listeners, so the menu, the pause screen and the game all see the same values.
 */

/** Everything a player can do that has a key binding. */
export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint'
  | 'fire' | 'aim' | 'reload' | 'grenade1' | 'grenade2'
  | 'weapon1' | 'weapon2' | 'weapon3' | 'weapon4' | 'nextWeapon' | 'prevWeapon'
  | 'scoreboard';

/** One row in the controls list. */
export interface ActionInfo {
  id: Action;
  label: string;
  group: 'Movement' | 'Combat' | 'Weapons' | 'Other';
}

/** Every rebindable action in display order. Add a new action here, in `DEFAULT_BINDINGS` and in `input.ts`. */
export const ACTIONS: readonly ActionInfo[] = [
  { id: 'forward', label: 'Move forward', group: 'Movement' },
  { id: 'back', label: 'Move back', group: 'Movement' },
  { id: 'left', label: 'Move left', group: 'Movement' },
  { id: 'right', label: 'Move right', group: 'Movement' },
  { id: 'jump', label: 'Jump', group: 'Movement' },
  { id: 'sprint', label: 'Sprint', group: 'Movement' },
  { id: 'fire', label: 'Shoot', group: 'Combat' },
  { id: 'aim', label: 'Aim down sights', group: 'Combat' },
  { id: 'reload', label: 'Reload', group: 'Combat' },
  { id: 'grenade1', label: 'Throw Coffee Bomb', group: 'Combat' },
  { id: 'grenade2', label: 'Throw Fire Alarm', group: 'Combat' },
  { id: 'weapon1', label: 'Stapler .45', group: 'Weapons' },
  { id: 'weapon2', label: 'Label Gun SMG', group: 'Weapons' },
  { id: 'weapon3', label: 'Paper Shredder', group: 'Weapons' },
  { id: 'weapon4', label: 'Laser Pointer', group: 'Weapons' },
  { id: 'nextWeapon', label: 'Next weapon', group: 'Weapons' },
  { id: 'prevWeapon', label: 'Previous weapon', group: 'Weapons' },
  { id: 'scoreboard', label: 'Scoreboard (hold)', group: 'Other' },
];

/**
 * Factory bindings. Values are `KeyboardEvent.code` names, `Mouse0`-`Mouse4` for buttons,
 * or `WheelUp` / `WheelDown` (weapon actions only).
 */
export const DEFAULT_BINDINGS: Readonly<Record<Action, string>> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft',
  fire: 'Mouse0', aim: 'Mouse2', reload: 'KeyR', grenade1: 'KeyG', grenade2: 'KeyH',
  weapon1: 'Digit1', weapon2: 'Digit2', weapon3: 'Digit3', weapon4: 'Digit4',
  nextWeapon: 'WheelDown', prevWeapon: 'WheelUp', scoreboard: 'Tab',
};

/** Actions that may be bound to the mouse wheel (it has no "held" state). */
export const WHEEL_ACTIONS: ReadonlySet<Action> = new Set<Action>(['weapon1', 'weapon2', 'weapon3', 'weapon4', 'nextWeapon', 'prevWeapon']);

/** Render-scale choices shown in the graphics tab. */
export const RENDER_SCALES: readonly number[] = [0.5, 0.75, 1, 1.5];

/** All saved settings. */
export interface Settings {
  bindings: Record<Action, string>;
  /** Mouse sensitivity multiplier (1 = default). */
  sensitivity: number;
  invertY: boolean;
  /** Horizontal-ish field of view in degrees. */
  fov: number;
  /** Master volume 0..1. */
  volume: number;
  /** Pick graphics automatically to hold 60 FPS (see `quality.ts`); the four options below then apply only in manual mode. */
  autoQuality: boolean;
  /** Resolution multiplier on top of the device pixel ratio. */
  renderScale: number;
  /** Smooth edges (4x MSAA); expensive on weak GPUs. */
  antialias: boolean;
  bloom: boolean;
  /** Floating dust motes. */
  dust: boolean;
  /** Sparks, smoke and explosion particles. */
  particles: boolean;
  showFps: boolean;
}

/** Defaults for everything except bindings. */
const DEFAULTS: Omit<Settings, 'bindings'> = {
  sensitivity: 1, invertY: false, fov: 80, volume: 0.5, autoQuality: true, renderScale: 1, antialias: true, bloom: true, dust: true, particles: true, showFps: false,
};

const STORAGE_KEY = 'itwars.settings';

/** The live settings object. Mutate through `updateSettings` / `setBinding` so listeners fire and it is saved. */
export const settings: Settings = { bindings: { ...DEFAULT_BINDINGS }, ...DEFAULTS };

const listeners = new Set<() => void>();

/** Clamps a number into a range, falling back when it is not a finite number. */
function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** Reads saved settings, ignoring anything malformed. Called once on startup. */
function load(): void {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Settings> | null;
    if (!raw || typeof raw !== 'object') return;
    settings.sensitivity = num(raw.sensitivity, 0.2, 3, DEFAULTS.sensitivity);
    settings.invertY = raw.invertY === true;
    settings.fov = num(raw.fov, 60, 110, DEFAULTS.fov);
    settings.volume = num(raw.volume, 0, 1, DEFAULTS.volume);
    settings.renderScale = RENDER_SCALES.includes(raw.renderScale as number) ? (raw.renderScale as number) : DEFAULTS.renderScale;
    settings.autoQuality = raw.autoQuality !== false;
    settings.antialias = raw.antialias !== false;
    settings.bloom = raw.bloom !== false;
    settings.dust = raw.dust !== false;
    settings.particles = raw.particles !== false;
    settings.showFps = raw.showFps === true;
    if (raw.bindings && typeof raw.bindings === 'object') {
      for (const a of ACTIONS) {
        const v = (raw.bindings as Record<string, unknown>)[a.id];
        if (typeof v === 'string' && v) settings.bindings[a.id] = v;
      }
      // A hand-edited or corrupt save could bind two actions to one key; fall back to defaults then.
      if (new Set(Object.values(settings.bindings)).size !== ACTIONS.length) settings.bindings = { ...DEFAULT_BINDINGS };
    }
  } catch {
    // Blocked or corrupt storage: keep the defaults.
  }
}
load();

/** Saves to localStorage and tells every listener. */
function commit(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not persisting is fine.
  }
  notifyChange();
}

/** Tells every listener without saving (used when the automatic quality level changes). */
export function notifyChange(): void {
  for (const fn of listeners) fn();
}

/**
 * Subscribes to any settings change.
 * @returns A function that unsubscribes.
 */
export function onSettingsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Changes non-binding settings, then saves and notifies. */
export function updateSettings(patch: Partial<Omit<Settings, 'bindings'>>): void {
  Object.assign(settings, patch);
  commit();
}

/**
 * Rebinds an action. If another action already uses that key, the two swap so nothing is left unbound.
 * @returns False if the binding is not allowed (wheel on a held action).
 */
export function setBinding(action: Action, code: string): boolean {
  if (code.startsWith('Wheel') && !WHEEL_ACTIONS.has(action)) return false;
  const old = settings.bindings[action];
  for (const a of ACTIONS) {
    if (a.id !== action && settings.bindings[a.id] === code) {
      // The wheel cannot take a held action, so the displaced action keeps its old key instead.
      if (!(old.startsWith('Wheel') && !WHEEL_ACTIONS.has(a.id))) settings.bindings[a.id] = old;
    }
  }
  settings.bindings[action] = code;
  commit();
  return true;
}

/** Restores the factory key bindings. */
export function resetBindings(): void {
  settings.bindings = { ...DEFAULT_BINDINGS };
  commit();
}

/** Restores every graphics, audio and mouse option (not the bindings). */
export function resetOptions(): void {
  Object.assign(settings, DEFAULTS);
  commit();
}

/**
 * Human-readable name for a binding.
 * @example bindingLabel('KeyW') // "W"
 */
export function bindingLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const names: Record<string, string> = {
    Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt', AltRight: 'Right Alt', Tab: 'Tab', CapsLock: 'Caps Lock', Enter: 'Enter', Backspace: 'Backspace',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Mouse0: 'Left Mouse', Mouse1: 'Middle Mouse', Mouse2: 'Right Mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
    WheelUp: 'Wheel Up', WheelDown: 'Wheel Down', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  };
  return names[code] ?? code;
}
