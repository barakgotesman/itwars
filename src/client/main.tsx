/**
 * Client entry: shows the desktop-only notice on touch devices, otherwise mounts the React UI and hands the game
 * canvas to the room session.
 */
import { createRoot } from 'react-dom/client';
import '@client/hud/style.css';
import { initUiSound } from '@client/platform/ui-sound';
import { App } from '@client/ui/App';
import { attachCanvas } from '@client/ui/session';

/** Notice shown instead of the game on touch devices. */
function TouchNotice() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ground p-8 text-center text-xl font-bold">
      IT Wars is desktop only. Open it on a computer with a keyboard and mouse.
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
  root.render(<TouchNotice />);
} else {
  initUiSound();
  attachCanvas(document.getElementById('game') as HTMLCanvasElement);
  root.render(<App />);
}
