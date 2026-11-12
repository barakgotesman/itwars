/**
 * A minimal external store for `useSyncExternalStore`. Plain TypeScript code (the menu, the game loop) can
 * write to it and React components re-render only when the value they read changes.
 */
import { useSyncExternalStore } from 'react';

/** A value that can be read, patched and subscribed to. */
export interface Store<T> {
  /** Current value. */
  get(): T;
  /** Merges `patch` over the value; subscribers run only if something actually changed. */
  set(patch: Partial<T>): void;
  /** Subscribes to changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/**
 * Creates a store holding an object.
 * @param initial - The starting value.
 */
export function createStore<T extends object>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(patch) {
      const changed = (Object.keys(patch) as (keyof T)[]).some((k) => patch[k] !== value[k]);
      if (!changed) return;
      value = { ...value, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** Reads a store inside a component and re-renders when it changes. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
