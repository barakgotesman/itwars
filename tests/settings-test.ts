/**
 * Headless tests for the settings model: key rebinding rules, swapping on conflict, wheel limits and resets.
 * Run with `npm run test:settings`; exits non-zero on failure. (localStorage is absent in Node, which the module tolerates.)
 */
import {
  ACTIONS, DEFAULT_BINDINGS, bindingLabel, onSettingsChange, resetBindings, resetOptions, setBinding, settings, updateSettings,
} from '@client/platform/settings';

let failed = 0;

/** Records a named check. */
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

/** True if no two actions share a binding. */
const unique = () => new Set(Object.values(settings.bindings)).size === ACTIONS.length;

check('defaults are conflict-free', unique() && ACTIONS.every((a) => DEFAULT_BINDINGS[a.id] === settings.bindings[a.id]));

let notified = 0;
onSettingsChange(() => notified++);

// Rebinding to a free key.
check('rebind to a free key succeeds', setBinding('forward', 'ArrowUp') && settings.bindings.forward === 'ArrowUp');
check('listeners are notified', notified === 1);
check('no conflicts after a free rebind', unique());

// Conflict: the two actions swap.
setBinding('forward', 'KeyW');
setBinding('jump', 'KeyW');
check('conflict gives the key to the new action', settings.bindings.jump === 'KeyW');
check('conflict swaps the old key to the displaced action', settings.bindings.forward === 'Space');
check('no duplicates after a swap', unique());
resetBindings();

// Mouse buttons are normal bindings.
setBinding('reload', 'Mouse1');
check('mouse buttons can be bound', settings.bindings.reload === 'Mouse1');
setBinding('grenade1', 'Mouse0');
check('binding the shoot button to another action swaps shoot away', settings.bindings.fire === 'KeyG' && settings.bindings.grenade1 === 'Mouse0');
resetBindings();

// Wheel only works for weapon actions.
check('wheel is refused for a held action', !setBinding('fire', 'WheelUp') && settings.bindings.fire === 'Mouse0');
check('wheel is accepted for next weapon', setBinding('weapon1', 'WheelUp') && settings.bindings.weapon1 === 'WheelUp');
check('wheel swap hands the displaced action the old key', settings.bindings.prevWeapon === 'Digit1');
resetBindings();
// A held action must never be swapped onto the wheel.
setBinding('nextWeapon', 'KeyZ');
setBinding('fire', 'WheelDown');
check('held action never ends up on the wheel', !settings.bindings.fire.startsWith('Wheel'));
resetBindings();

check('reset restores every default', ACTIONS.every((a) => settings.bindings[a.id] === DEFAULT_BINDINGS[a.id]));

// Options.
updateSettings({ sensitivity: 2, invertY: true, volume: 0.2, bloom: false, renderScale: 0.5, uiVolume: 0.3 });
check('menu sound volume updates', settings.uiVolume === 0.3);
check('options update', settings.sensitivity === 2 && settings.invertY && settings.volume === 0.2 && !settings.bloom && settings.renderScale === 0.5);
resetOptions();
check('menu sounds default to 60% and reset', settings.uiVolume === 0.6);
check('options reset to defaults', settings.sensitivity === 1 && !settings.invertY && settings.volume === 0.5 && settings.bloom && settings.renderScale === 1 && settings.autoQuality && settings.antialias);

// Labels.
check('labels are readable', bindingLabel('KeyW') === 'W' && bindingLabel('Digit3') === '3' && bindingLabel('Mouse2') === 'Right Mouse'
  && bindingLabel('WheelDown') === 'Wheel Down' && bindingLabel('ShiftLeft') === 'Left Shift' && bindingLabel('F13') === 'F13');

if (failed) process.exit(1);
console.log('test:settings OK');
