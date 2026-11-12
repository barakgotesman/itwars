/**
 * The server's measured limits and how much of them is free, shown above the options on the setup screen.
 */
import type { ServerStatus } from '@shared/net/info';

/** Renders the capacity summary. */
export function CapacityPanel({ capacity }: { capacity: ServerStatus }) {
  const pct = Math.round(capacity.load * 100);
  return (
    <div className="slab flex flex-col gap-1 bg-panel p-4">
      <div className="text-base font-black">Server capacity</div>
      <div className="text-xs text-dim">
        Measured on this machine when the server started: it can run about {capacity.maxPlayers} players, or{' '}
        {capacity.maxBots} bots, or a mix. Players always get priority over bots.
      </div>
      <div className={pct >= 90 ? 'text-xs font-bold text-accent' : 'text-xs font-bold text-ink'}>
        Right now: {pct}% in use, room for {capacity.playersAvailable} more players and up to {capacity.botsAvailable} bots in your room.
      </div>
    </div>
  );
}
