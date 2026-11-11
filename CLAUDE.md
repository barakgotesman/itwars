# IT WARS

Desktop-only, first-person office deathmatch shooter for the browser. Played over a LAN: one person hosts a room, others join with a room code. Theme: IT department vs. the rest of the office ("Have you tried turning them off?"). Portfolio project.

## Status

Planning stage. A project scaffold and some shared modules were drafted before the scope was clarified; treat everything as replaceable and build from the spec below. Do not assume any file exists until you have looked.

## Requirements (from the owner)

- Name: **IT Wars**
- Stack: **TypeScript, Tailwind, three.js**
- **Desktop only** (keyboard + mouse, pointer lock). Show a "desktop only" notice on touch devices.
- **LAN multiplayer**: a player hosts a room and gets a **room code**; others on the same network join with it.
- Mode: **Deathmatch (DM)**, first to **50 kills** wins.
- **4 gun types.**
- **Map**: a big office with rooms *and* open-plan space.
- **3D pickups** placed in the map: ammo boxes and HP boxes (plus grenades).
- **HP bar**, 100 HP.
- **Grenades**: each player has **2 grenade slots**.
- **Main menu** with a **settings screen**.
- **Rebindable controls** (movement, throw grenade, and so on).
- Write this file first; do not start coding before the owner says so.

## Assumptions to confirm with the owner before building

1. "2 slots of grenades" = two slots, each with its own key: slot 1 Frag ("Coffee Bomb"), slot 2 Flashbang ("Fire Alarm"). Each slot holds up to 2; start with 1 each.
2. Players spawn with all 4 weapons. Spare ammo is limited; ammo boxes refill half of each weapon's max reserve.
3. Max 8 players per room. A match restarts automatically 10 s after someone reaches 50 kills.
4. Works over a LAN, but the same server can also be deployed publicly for a portfolio demo link.

## Commands (planned)

```
npm run dev       # server (tsx watch, :3000) + Vite client (:5173, exposed on LAN, proxies /ws and /api)
npm run build     # tsc --noEmit && vite build
npm start         # production: one Node process serves dist/ + WebSocket on :3000, prints LAN URLs
npm run play      # build + start
npm run typecheck
npm run verify:map  # map sanity: spawns/pickups not inside solids, all reachable
npm run test:sim    # headless server simulation tests (no browser)
```

Players open `http://<host-LAN-IP>:3000`. The server must bind `0.0.0.0` and print its LAN addresses on start. Windows will show a firewall prompt on first run.

## Architecture

One repo, one `tsconfig`, three folders:

```
src/shared/   code used by BOTH sides (no DOM, no Node APIs)
  constants.ts  tick rate, player size, movement tuning, input key bits
  weapons.ts    weapon/grenade/pickup data tables
  physics.ts    stepMovement (fixed-step AABB collision), ray vs AABB, lookDir
  map/          office generated from boxes, one file per room (index, builder, furniture, shell, dressing, rooms/*); exports MAP_BOXES, SOLIDS
  protocol.ts   typed C2S / S2C messages
src/server/   Node: http (static + /api/info) + ws; Room = the simulation
src/client/   Vite + three.js + Tailwind UI
  main.ts game.ts world.ts players.ts viewmodel.ts effects.ts audio.ts
  hud.ts menu.ts settings.ts input.ts net.ts style.css
scripts/      verify-map.ts, sim-test.ts, smoke-test.ts
```

### Networking model: authoritative server

- The server owns all game state: positions, HP, ammo, grenades, pickups, scores. Clients never decide hits.
- Fixed **60 Hz** simulation. The client sends one input command per tick: `{seq, keys bitmask, yaw, pitch}`. The server applies queued commands, then runs weapon logic once per tick from the latest input.
- Server broadcasts **30 Hz snapshots** plus a private `me` block (last acked `seq`, exact position/velocity, ammo, grenades).
- **Client-side prediction** for the local player: run the same `stepMovement` locally, then on each snapshot reset to the server state and replay unacked inputs.
- **Remote players** are interpolated about 100 ms behind, using client receive time (no clock sync needed).
- Hitscan weapons and grenades are resolved on the server. No lag compensation (LAN latency is a few ms). Revisit only if the game goes public.
- Shared `stepMovement` is the single source of truth. Never copy movement logic into the client or server separately.
- Transport: JSON over WebSocket (`ws`). Validate every incoming message (types, finite numbers, clamp pitch, mask keys, sanitize names, rate limit).

### Rooms and codes

- One server hosts many rooms. `host` creates a room and returns a 4-character code (A-Z and 2-9, no 0/O/1/I). `join` takes the code.
- Errors: unknown code, room full. The room is deleted when its last player leaves.
- The menu fetches `/api/info` to show the host's LAN URLs and the room code to share.

## Game design

### Match
- DM, free-for-all. First to **50 kills** wins; scoreboard on `Tab`. Intermission 10 s, then reset scores/pickups and respawn everyone.
- Respawn after 3 s at the spawn point farthest from other players, with 2 s spawn protection.
- Kill feed, hit marker (headshot variant), damage direction indicator, death screen ("Ticket closed by NAME").

### Player
- 100 HP, HP bar bottom-left. Walk, sprint, jump (can stand on desks). No fall damage. No crouch in v1.

### Weapons (key 1-4, all carried at spawn)
| # | Name | Type | Notes |
|---|------|------|-------|
| 1 | Stapler .45 | pistol, semi-auto | accurate, 24 dmg |
| 2 | Label Gun SMG | automatic | 11 dmg, high rate, spread |
| 3 | Paper Shredder | shotgun | 8 pellets, strong up close, falls off fast |
| 4 | Laser Pointer | sniper, zoom/scope | 80 dmg, headshot kills, slow |

Headshot multipliers, falloff, reload and recoil are data in `weapons.ts`. Tune there, not in logic.

### Grenades (2 slots)
- Slot 1 **Coffee Bomb**: explosive, radius damage with falloff, needs line of sight. Slot 2 **Fire Alarm**: flashbang, blinds and deafens based on distance and facing.
- Server-simulated projectile: gravity, bounces off geometry, fuse timer.

### Pickups (3D, rotating and bobbing, respawn on a timer)
- **HP box**: white box with red cross, +35 HP.
- **Ammo box**: olive box with yellow stripe, refills reserves.
- **Grenade crate**: dark pad with mug and alarm, +1 per slot.
- Each kind has a faint colored light beam so it is visible across the open floor. Server decides who picks up; clients just render active/inactive state from the snapshot.

### Map: "The Office" (about 100 x 70 m, ceiling 4.2 m)
- **Open plan centre**: 12 cubicle pods (partitions and desks), central lounge, low cover walls, plants, water coolers.
- **North row of rooms**: Executive office, 2 meeting rooms (connected), **Server room** (rack lanes, high-risk and high-reward), Print room, **IT Helpdesk** (home turf).
- **South row**: Break room, Storage (shelves and crates), open Lobby with reception desk, Conference room, phone booths.
- Doors are 3.2 m gaps with lintels. Players can hop onto desks and chairs.
- Map is generated from boxes in `shared/map.ts`; client merges them per material for few draw calls. Keep decorative-only boxes `solid: false`.
- Every spawn and pickup must pass `npm run verify:map` (not inside a solid, reachable on foot).

### Controls and settings
- Defaults: WASD move, Space jump, Shift sprint, LMB fire, RMB aim, R reload, 1-4 weapons, G / H grenade slot 1 / 2, Tab scoreboard, mouse wheel cycles weapons, Esc pauses.
- All actions are rebindable in Settings > Controls: click an action, press a key or mouse button, Esc cancels, a conflict swaps the two bindings, "Reset to defaults" button.
- Other settings: mouse sensitivity, FOV, master volume, invert Y, FPS counter. Persist in `localStorage` (wrap in try/catch).
- Main menu: callsign, **Host room**, **Join room** (code), **Settings**, LAN address hint. Pause menu: Resume, Settings, Leave room.
- Pointer lock needs a user click: after joining, show an "Enter the office" button instead of locking automatically.

### Look and sound
- Flat-shaded low-poly office: Lambert materials, hemisphere + directional light, emissive ceiling panels, canvas-generated carpet texture. No external assets, so it works offline on a LAN.
- Players are boxy office workers with team-free random shirt colors, a tie and a name tag.
- First-person weapon models are drawn in a second pass (clear depth) so they never clip into walls.
- Audio is synthesized with Web Audio (no files): shots, reload, pickups, hits, explosions, footsteps; panned and attenuated by distance.

## Conventions

- Strict TypeScript. No `any` unless commented. Prefer small modules with one job.
- Tailwind utility classes for all DOM UI (menu, HUD). Write full class names (no string-built fragments) so Tailwind can see them. Reusable bits go in `style.css` with `@apply`.
- Game balance and tuning live in `shared/*.ts` data, never as magic numbers in logic.
- Coordinate system: x east, z south, y up. `yaw 0` faces -Z, positive yaw turns left; `pitch > 0` looks up.
- Server timers use integer ticks, not wall-clock time.
- Don't send full state when a delta or event is enough; keep snapshots small.
- Comments explain why, not what.
- **All code is documented with JSDoc.** Every exported function, class, method, interface and type, and every non-trivial module-level constant, gets a `/** ... */` block with a one-line summary, plus `@param` and `@returns` where they add information (types come from TypeScript, so do not repeat them in braces). Add `@remarks` or inline `//` comments for the non-obvious why. Add a short `/** ... */` file-header comment to each module describing its single job.

## How to...

- **Add a weapon**: add an entry to `WEAPONS`, add a model in `viewmodel.ts`, add a sound in `audio.ts`, add a keybind action if you go beyond 4 slots. Server logic is data-driven.
- **Change the map**: edit `shared/map.ts` helpers, run `npm run verify:map`, then play it.
- **Add a keybind action**: add it to the `Action` type, `DEFAULT_BINDINGS`, and `ACTIONS` list in `settings.ts`; handle it in `game.ts`. The settings UI picks it up automatically.
- **Add a message**: extend `C2S` / `S2C` in `protocol.ts` first so both sides get compile errors until handled.

## Testing

- `test:sim` drives the `Room` class directly with fake connections: movement, hits, headshots, kills, respawn, grenade damage and LOS, pickups, 50-kill match end and restart.
- `test:smoke` starts the real server and connects two WebSocket clients: host, join by code, snapshots flow, bad code is rejected.
- Rendering and feel can only be checked in a real browser with two tabs. Say so explicitly when something was not verified visually.

## Milestones

1. Server + shared code: rooms, codes, movement, pickups, headless tests green.
2. Client: map rendering, local movement with prediction, remote players, HUD (HP bar, ammo).
3. Combat: 4 weapons, hit feedback, kill feed, scoreboard, 50-kill match end.
4. Grenades (2 slots), pickups visuals, audio.
5. Menus: main, pause, settings with key rebinding.
6. Polish: effects, map dressing, public demo deploy (Fly.io / Render).

## Out of scope for v1

Bots, teams or other modes, accounts and persistence, voice chat, mobile or gamepad, lag compensation, anti-cheat.
