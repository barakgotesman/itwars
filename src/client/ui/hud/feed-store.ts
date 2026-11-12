/**
 * Event feed state: the lines currently on screen. `createFeed` is what the game pushes kills and joins into;
 * `FeedView.tsx` draws the lines. Each line fades after a few seconds and is then removed.
 */
import { useSyncExternalStore } from 'react';
import type { Feed, FeedPart } from '@client/hud/feed';
import { createStore } from '../hooks/store';

const MAX_LINES = 7;
const LIFETIME_MS = 7000;
const FADE_MS = 800;

/** One line in the feed. */
export interface FeedLine {
  id: number;
  parts: readonly FeedPart[];
  /** True once it started fading out. */
  fading: boolean;
}

const feedStore = createStore<{ lines: readonly FeedLine[] }>({ lines: [] });

/** The lines to draw, oldest first. */
export function useFeedLines(): readonly FeedLine[] {
  return useSyncExternalStore(feedStore.subscribe, () => feedStore.get().lines);
}

let nextId = 0;

/** Creates the handle the game uses to add feed lines (there is one feed per page). */
export function createFeed(): Feed {
  feedStore.set({ lines: [] });
  return {
    push(parts) {
      const id = ++nextId;
      const lines = [...feedStore.get().lines, { id, parts, fading: false }].slice(-MAX_LINES);
      feedStore.set({ lines });
      setTimeout(() => {
        feedStore.set({ lines: feedStore.get().lines.map((l) => (l.id === id ? { ...l, fading: true } : l)) });
        setTimeout(() => feedStore.set({ lines: feedStore.get().lines.filter((l) => l.id !== id) }), FADE_MS);
      }, LIFETIME_MS);
    },
  };
}
