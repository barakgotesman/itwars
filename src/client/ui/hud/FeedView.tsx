/**
 * Event feed in the top-right corner: joins, leaves and kills, newest at the bottom, fading out.
 * A kill reads "X [gun icon] Y".
 */
import type { Tone } from '@client/game/ports';
import { GunIcon } from '../components/GunIcon';
import { useFeedLines } from './feed-store';

const TONE: Record<Tone, string> = {
  name: 'text-ink',
  me: 'text-accent',
  dim: 'text-dim',
  kill: 'text-danger',
};

/** Draws the lines currently in the feed. */
export function FeedView() {
  const lines = useFeedLines();
  return (
    <div className="absolute right-4 top-4 flex w-96 flex-col items-end gap-1">
      {lines.map((line) => {
        // A line that involves you gets an accent edge so you spot your own kills and deaths.
        const mine = line.parts.some((p) => 'tone' in p && p.tone === 'me');
        return (
          <div
            key={line.id}
            className={`feed-in flex items-center gap-2 bg-ground/75 px-2.5 py-1 text-sm font-bold transition-opacity duration-700 ${mine ? 'border-r-4 border-accent' : ''} ${line.fading ? 'opacity-0' : ''}`}
          >
            {line.parts.map((p, i) => 'icon' in p
              ? <GunIcon key={i} kind={p.icon} className="inline-block h-5 w-10 shrink-0" />
              : <span key={i} className={TONE[p.tone ?? 'dim']}>{p.text}</span>)}
          </div>
        );
      })}
    </div>
  );
}
