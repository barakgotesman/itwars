/**
 * Lets a component follow the live `settings` object. The object is mutated in place, so the hook returns a
 * version number that changes on every settings change; reading `settings` during render then stays current.
 */
import { useSyncExternalStore } from 'react';
import { onSettingsChange } from '@client/platform/settings';

let version = 0;
const subscribe = (listener: () => void): (() => void) =>
  onSettingsChange(() => {
    version++;
    listener();
  });

/** Re-renders the component whenever any setting or key binding changes. */
export function useSettingsVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
