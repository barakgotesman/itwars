/**
 * Keyboard and mouse input: pointer lock, view angles, and the per-tick command. Every key, mouse button
 * and wheel direction goes through the rebindable bindings in `settings.ts`.
 */
import { Key, KEY_MASK } from '@shared/core/constants';
import { ACTIONS, onSettingsChange, settings, type Action } from './settings';

/** Actions that are held down and sent to the server as bits in the key mask. */
const HOLD_BITS: Partial<Record<Action, number>> = {
  forward: Key.Forward, back: Key.Back, left: Key.Left, right: Key.Right, jump: Key.Jump, sprint: Key.Sprint,
  fire: Key.Fire, aim: Key.Aim, reload: Key.Reload, grenade1: Key.Grenade1, grenade2: Key.Grenade2, interact: Key.Interact,
};

/** Weapon-select actions and the weapon index they choose. */
const WEAPON_SLOT: Partial<Record<Action, number>> = { weapon1: 0, weapon2: 1, weapon3: 2, weapon4: 3 };

/** Radians of turn per mouse count at sensitivity 1. */
const BASE_SENSITIVITY = 0.0022;

/** True when the key event targets a text field, so typing a name never moves the player. */
function isTyping(e: KeyboardEvent): boolean {
  return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
}

/** Keyboard and mouse state; owns pointer lock and accumulates view angles. */
export class Input {
  keys = 0;
  yaw = 0;
  pitch = 0;
  locked = false;
  /** True while the scoreboard key is held. */
  scoreboard = false;
  /** Multiplier on mouse sensitivity; below 1 while zoomed in. */
  sensScale = 1;
  /** Selected weapon index 0-3 (starts on the SMG, the server's spawn weapon). */
  weapon = 1;
  /** Binding code (`KeyW`, `Mouse0`, `WheelUp`...) to the actions it triggers. */
  private lookup = new Map<string, Action[]>();

  constructor(private canvas: HTMLElement, onLockChange: (locked: boolean) => void) {
    this.rebuildLookup();
    onSettingsChange(() => {
      this.rebuildLookup();
      // A rebind while a key is held would leave that action stuck on.
      this.keys = 0;
      this.scoreboard = false;
    });

    window.addEventListener('keydown', (e) => {
      if (isTyping(e) || !this.locked) return;
      const actions = this.lookup.get(e.code);
      if (!actions) return;
      e.preventDefault();
      if (!e.repeat) for (const a of actions) this.press(a);
    });
    window.addEventListener('keyup', (e) => {
      for (const a of this.lookup.get(e.code) ?? []) this.release(a);
    });
    window.addEventListener('blur', () => {
      this.keys = 0;
      this.scoreboard = false;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      for (const a of this.lookup.get(`Mouse${e.button}`) ?? []) this.press(a);
    });
    document.addEventListener('mouseup', (e) => {
      for (const a of this.lookup.get(`Mouse${e.button}`) ?? []) this.release(a);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      for (const a of this.lookup.get(e.deltaY > 0 ? 'WheelDown' : 'WheelUp') ?? []) this.press(a);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const k = BASE_SENSITIVITY * settings.sensitivity * this.sensScale;
      this.yaw -= e.movementX * k;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - e.movementY * k * (settings.invertY ? -1 : 1)));
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys = 0;
        this.scoreboard = false;
      }
      onLockChange(this.locked);
    });
  }

  /** Rebuilds the code-to-actions table from the current bindings. */
  private rebuildLookup(): void {
    this.lookup = new Map();
    for (const { id } of ACTIONS) {
      const code = settings.bindings[id];
      this.lookup.set(code, [...(this.lookup.get(code) ?? []), id]);
    }
  }

  /** Starts an action: sets a held bit, selects a weapon, cycles weapons or shows the scoreboard. */
  private press(a: Action): void {
    const bit = HOLD_BITS[a];
    if (bit) this.keys |= bit;
    else if (a === 'scoreboard') this.scoreboard = true;
    else if (a === 'nextWeapon') this.weapon = (this.weapon + 1) % 4;
    else if (a === 'prevWeapon') this.weapon = (this.weapon + 3) % 4;
    else if (WEAPON_SLOT[a] !== undefined) this.weapon = WEAPON_SLOT[a]!;
  }

  /** Ends a held action. */
  private release(a: Action): void {
    const bit = HOLD_BITS[a];
    if (bit) this.keys &= ~bit;
    else if (a === 'scoreboard') this.scoreboard = false;
  }

  /** Requests pointer lock; browsers only allow this from a user click. */
  lock(): void {
    void this.canvas.requestPointerLock();
  }

  /** @returns The current input as one tick command (`keys` masked to known bits). */
  sample() {
    return { keys: this.keys & KEY_MASK, yaw: this.yaw, pitch: this.pitch, weapon: this.weapon };
  }
}
