/**
 * The 2D overlay for the post-match podium: a headline ribbon, a countdown bar to the automatic rematch,
 * and, for the host only, a button to close the room instead of waiting. The podium itself is 3D geometry
 * built straight into the real game scene at a fixed office location (`render/podium.ts`, driven from
 * `game/events.ts` via `scene.podium`), visible through the game canvas behind this overlay. Reads
 * `matchEnd` from the HUD store; `game/events.ts` sets it when a `matchEnd` event arrives and clears it on
 * `matchStart`.
 */
import { useEffect, useRef, useState } from 'react';
import { closeMatch } from '../session';
import { useHud } from './hud-store';

/** The post-match podium overlay; renders nothing while no match has just ended. */
export function PodiumView() {
  const matchEnd = useHud((s) => s.matchEnd);
  // A fresh key per match end restarts the countdown bar's CSS animation.
  const [seq, setSeq] = useState(0);
  const wasActive = useRef(false);
  useEffect(() => {
    if (matchEnd && !wasActive.current) setSeq((n) => n + 1);
    wasActive.current = matchEnd !== null;
  }, [matchEnd]);
  if (!matchEnd) return null;

  const headline = matchEnd.winner < 0 ? "It's a draw!" : `${matchEnd.top[0]?.name ?? 'Someone'} won!`;
  const sub = matchEnd.reason === 'time' ? 'Time ran out; most kills wins' : 'Kill limit reached';

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-between">
      {/* A slim ribbon pinned to the very top edge, clear of the podium and its name plates below. */}
      <div className="flex w-full items-baseline justify-center gap-3 bg-ground/85 px-4 py-2.5">
        <p className="text-xl font-black uppercase tracking-widest text-accent sm:text-2xl">{headline}</p>
        <p className="hidden text-xs font-bold text-ink sm:block">{sub}</p>
      </div>
      <div className="flex flex-col items-center gap-3 p-6">
        {matchEnd.isHost && (
          <button type="button" className="btn-quiet pointer-events-auto" onClick={closeMatch}>Close the room</button>
        )}
        <div className="h-2 w-72 overflow-hidden bg-raised">
          <div key={seq} className="shrink-bar h-full bg-accent" style={{ animationDuration: `${matchEnd.restartSeconds}s` }} />
        </div>
        <p className="text-xs font-bold text-dim">Next match starts automatically</p>
      </div>
    </div>
  );
}
