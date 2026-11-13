/**
 * The root component: picks which screen to show from `appStore` and draws the always-present overlays
 * (map cover, vignette, crosshair, HUD, disconnected notice). The game canvas itself is a plain element in
 * `index.html`; the session attaches to it.
 */
import { appStore, useApp } from './app-store';
import { HudView } from './hud/HudView';
import { useHud } from './hud/hud-store';
import { PodiumView } from './hud/PodiumView';
import { Menu } from './screens/Menu';
import { Room } from './screens/Room';
import { Settings } from './screens/Settings';

/** Four square ticks with a dark backing so it reads on white walls and dark carpet alike. */
function Crosshair() {
  const scoped = useHud((s) => s.scope);
  if (scoped) return null; // the scope has its own reticle
  const tick = 'absolute bg-white outline outline-1 outline-black/80';
  return (
    <div className="pointer-events-none fixed left-1/2 top-1/2 h-0 w-0" aria-hidden="true">
      <span className={`${tick} -left-px -top-[13px] h-[7px] w-0.5`} />
      <span className={`${tick} -left-px top-[6px] h-[7px] w-0.5`} />
      <span className={`${tick} -left-[13px] -top-px h-0.5 w-[7px]`} />
      <span className={`${tick} left-[6px] -top-px h-0.5 w-[7px]`} />
    </div>
  );
}

/** The whole UI layer. */
export function App() {
  const { room, locked, covered, settingsOpen, disconnected, closedByHost } = useApp();
  const podiumActive = useHud((s) => s.matchEnd !== null);
  const openSettings = () => appStore.set({ settingsOpen: true });
  return (
    <>
      {/* Hides the map until the first entry, but unlike display:none it lets the graphics calibration render for real. */}
      {room && covered && <div className="fixed inset-0 bg-black" />}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.45)_100%)]" />
      {room && locked && <Crosshair />}
      <HudView />
      {!room && <Menu onOpenSettings={openSettings} />}
      {room && !locked && !podiumActive && <Room onOpenSettings={openSettings} />}
      <PodiumView />
      {settingsOpen && <Settings onClose={() => appStore.set({ settingsOpen: false })} />}
      {disconnected && (
        <div className="voxel-bg fixed inset-0 z-40 flex flex-col items-center justify-center gap-4">
          <p className="text-3xl font-black text-danger">Disconnected from the server</p>
          <button type="button" className="btn" onClick={() => location.reload()}>Back to menu</button>
        </div>
      )}
      {closedByHost && (
        <div className="voxel-bg fixed inset-0 z-40 flex flex-col items-center justify-center gap-4">
          <p className="text-3xl font-black text-accent">The host ended the match</p>
          <button type="button" className="btn" onClick={() => location.reload()}>Back to menu</button>
        </div>
      )}
    </>
  );
}
