/**
 * Client entry: shows the desktop-only notice on touch devices, otherwise wires the main menu, the room
 * screen and the settings screen together.
 */
import '@client/hud/style.css';
import { $, setShown } from '@client/app/dom';
import { createMenu } from '@client/app/menu';
import { createRoomPanel } from '@client/app/room-panel';
import { createSettingsUi } from '@client/app/settings-ui';
import { initUiSound } from '@client/platform/ui-sound';

if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
  setShown('touch-notice', true);
} else {
  initUiSound();
  const settings = createSettingsUi();
  const room = createRoomPanel($<HTMLCanvasElement>('game'), settings.open);
  createMenu({
    onJoined: (net, joined, lanUrl) => room.open(net, joined, lanUrl),
    openSettings: settings.open,
  });
}
