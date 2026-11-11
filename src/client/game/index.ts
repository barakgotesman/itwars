/**
 * The in-room game: wires the scene, the predicted local player, the roster, the event handler and the
 * render loop together, and routes server messages to them. Each piece lives in its own file here.
 */
import type { JoinedMsg } from '@shared/net/protocol';
import { createFeed } from '@client/hud/feed';
import type { Hud } from '@client/hud/hud';
import type { Input } from '@client/platform/input';
import type { Net } from '@client/platform/net';
import { Calibration } from '@client/platform/quality';
import { createEventHandler, type CameraFx } from './events';
import { startFrameLoop } from './loop';
import { LocalPlayer } from './prediction';
import { RosterTracker } from './roster';
import { createScene } from './scene';

/** Everything the loop needs from the rest of the client. */
export interface GameContext {
  canvas: HTMLCanvasElement;
  input: Input;
  net: Net;
  joined: JoinedMsg;
  hud: Hud;
}

/** Handle returned to the menu code. */
export interface GameHandle {
  /** Runs `fn` once graphics calibration has finished (immediately if there is none to do). */
  whenReady(fn: () => void): void;
  /** Call from a click so the browser allows sound. */
  unlockAudio(): void;
}

/**
 * Creates the renderer and starts the fixed-step simulation and render loop.
 * @param ctx - Canvas, input, network and HUD handles.
 */
export function startGame(ctx: GameContext): GameHandle {
  const { canvas, input, net, joined, hud } = ctx;
  const myId = joined.id;

  const scene = createScene(canvas, joined, hud);
  const feed = createFeed();
  const roster = new RosterTracker(joined.players, myId, feed);
  const local = new LocalPlayer(scene.solids);
  const camFx: CameraFx = { shake: 0, kick: 0 };
  const onEvent = createEventHandler({ myId, scene, local, input, hud, feed, roster, camFx });

  /**
   * One-time graphics calibration, run while the player is still on the room screen with the map hidden.
   * It picks the preset, saves it and is then finished for good: graphics never change during play.
   */
  const readyCallbacks: (() => void)[] = [];
  let calibration: Calibration | null = scene.needsCalibration
    ? new Calibration(() => {
      calibration = null;
      for (const fn of readyCallbacks.splice(0)) fn();
    })
    : null;

  net.on((msg) => {
    if (msg.t === 'roster') {
      scene.remotes.setRoster(msg.players);
      roster.update(msg.players);
    } else if (msg.t === 'snap') {
      if (msg.doors) scene.doors.applyWire(msg.doors, 0.08);
      msg.ev.forEach(onEvent);
      scene.remotes.onSnapshot(msg.players, performance.now());
      scene.grenadeVisuals.sync(msg.grenades);
      local.reconcile(msg);
      hud.update(msg.me);
    }
  });

  startFrameLoop({
    myId, scene, local, roster, camFx, input, net, hud,
    beforeFrame: (rawDt, visible) => calibration?.frame(rawDt, visible),
  });

  return {
    unlockAudio: () => scene.sfx.unlock(),
    whenReady: (fn) => {
      if (calibration) readyCallbacks.push(fn);
      else fn();
    },
  };
}
