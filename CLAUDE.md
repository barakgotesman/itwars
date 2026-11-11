# IT WARS

Desktop-only, first-person office deathmatch shooter for the browser. Played over a LAN: one person hosts a room, others join with a room code. Theme: IT department vs. the rest of the office ("Have you tried turning them off?"). Portfolio project.

## Status

Playable. Milestones 1-5 are built and the game runs end to end on a LAN (host, join by code, play to 50 kills, restart). Remote repo: `github.com/barakgotesman/itwars` (`main`). See "Known gaps" at the bottom for what is unverified or missing.

## Requirements (from the owner)

- Name: **IT Wars**
- Stack: **TypeScript, Tailwind, three.js** (server: Node + `ws`). TypeScript only, no jQuery or UI framework.
- **Desktop only** (keyboard + mouse, pointer lock). Show a "desktop only" notice on touch devices.
- **LAN multiplayer**: a player hosts a room and gets a **room code**; others on the same network join with it.
- Mode: **Deathmatch (DM)**, first to **50 kills** wins. Max 8 players per room, match restarts 10 s after a win.
- **4 gun types**, **2 grenade slots**, **100 HP**.
- **Map**: a big office with rooms *and* open-plan space. **3D pickups**: ammo, HP, grenades.
- **Main menu** with a **settings screen**; **rebindable controls**.
- **60 FPS is a must.** Graphics are chosen once per computer (see "Graphics quality") and must never change while the player is playing.
- Everything is **blocky** (voxel look): models, particles, tracers, explosions, bullet holes.

## Commands

```
npm run dev            # game server (tsx watch, :3000) + Vite client (:5173, LAN-exposed, proxies /ws and /api)
npm run build          # tsc --noEmit && vite build
npm start              # one Node process serves dist/ + WebSocket on :3000 and prints LAN URLs
npm run play           # build + start (use this to host for friends)
npm run typecheck
npm run verify:map     # spawns and pickups are not inside solids and are reachable on foot
npm run test:sim       # headless server simulation tests (no browser)
npm run test:smoke     # real server + two WebSocket clients
npm run test:settings  # key rebinding rules and option defaults
npm run test:quality   # graphics calibration and hardware guess
npm run make:icons     # regenerate public/ icons and the og-image from the pixel-art sprite (scripts/make-icons.ts)
```

SEO and sharing: `index.html` carries the title, description, Open Graph/Twitter tags and JSON-LD; `public/` holds the manifest, `robots.txt` and icons. Build with `SITE_URL=https://domain npm run build` to add the canonical link and absolute `og:image` URLs (a small Vite plugin in `vite.config.ts`). Without it those tags are left out on purpose, because they need a real address.

Players open `http://<host-LAN-IP>:3000`. The server binds `0.0.0.0` and prints its LAN addresses (real adapters first, virtual WSL/Hyper-V ones last). Windows may show a firewall prompt on first run.

**Gotcha:** running bare `vite` gives "Cannot reach the game server": the page server proxies `/ws` to :3000, so the game server must be running (`npm run dev` starts both). Do not run `npm run dev`/`play` while another server holds :3000.

## Architecture

One repo, one `tsconfig`, three folders:

```
src/shared/   used by BOTH sides (no DOM, no Node APIs)
  constants.ts   tick rate, player size, movement tuning, input key bits, match rules
  weapons.ts     weapon / grenade / pickup / loot tuning tables (all balance lives here)
  physics.ts     stepMovement (fixed-step AABB), rayVsAabb, rayVsAabbFace (hit face normal), overlaps, lookDir
  doors.ts       Doors: door state, live collision boxes, pushing players, picking the door you face (used by server AND client)
  characters.ts  the 7 selectable character styles and the shirt colour palette
  protocol.ts    typed C2S / S2C messages, GameEvent union, parseC2S validator, name/code sanitising
  map/           office generated from boxes (index, builder, furniture, shell, dressing, pickups, doors (door layout), rooms/*)
src/server/   Node
  index.ts       http (static + /api/info) + ws on /ws, rate limiting, fixed 60 Hz loop
  room.ts        Room = the authoritative simulation (input, weapons, grenades, pickups, loot, match flow, snapshots)
  combat.ts      pure geometry: castRay (world + players), line of sight, grenade stepping
  rooms.ts lan.ts static.ts (static.ts serves dist/ with correct content types, including .webmanifest and .txt)
src/client/   Vite + three.js + Tailwind
  main.ts        menu flow: callsign, character picker, host/join, room panel, pause, settings buttons
  game.ts        in-room loop: prediction, reconciliation, event handling, effects, audio, HUD wiring
  net.ts input.ts settings.ts settings-ui.ts quality.ts appearance.ts player-name.ts preview.ts
  world.ts lighting.ts effects.ts (bloom, dust, composer)
  players.ts     remote player models (7 styles), procedural animation, snapshot interpolation
  viewmodel.ts   first-person guns with moving parts, glass, casings; weapon-fx.ts (flash/tracer per gun)
  items.ts       pickups, loot bags, grenades in flight; door-visuals.ts door models
  particles.ts   blocky cube debris + stepped cube blasts; bullet-holes.ts decals
  hud.ts feed.ts gun-icons.ts audio.ts style.css
scripts/      verify-map.ts sim-test.ts smoke-test.ts settings-test.ts quality-test.ts physics-check.ts make-icons.ts
public/       copied to the site root: favicon (svg/ico), app icons, og-image.png, manifest.webmanifest, robots.txt
```

### Networking model: authoritative server

- The server owns all game state: positions, HP, ammo, grenades, pickups, loot, scores. Clients never decide hits.
- Fixed **60 Hz** tick. Client sends one input per tick: `{seq, keys, yaw, pitch, weapon}`. The server consumes one queued input per tick, plus one banked catch-up step if the player starved earlier, so input flooding gives no speed advantage.
- **30 Hz snapshots**: shared `players`/`grenades`, a private `me` block (acked `seq`, exact position/velocity, hp, `playing`, ammo, grenades, reload, blind) and a list of one-off **events** since the last snapshot. Events are the way to tell everyone about something (shots, hits, kills, holes, loot, pickups, explosions).
- **Client-side prediction** with the shared `stepMovement`; on every snapshot reset to server state and replay unacked inputs. On the player's own `spawn` event the pending input list is cleared (the server drops its queue at spawn).
- **Remote players** are interpolated ~100 ms behind using client receive time.
- Hitscan and grenades are resolved on the server. No lag compensation.
- Transport: JSON over WebSocket. `parseC2S` validates every message (types, finite numbers, key mask, pitch clamp, sanitised names, model/colour indices). Per-connection rate limit; max payload 2 KB.

### Messages

C2S: `host {name, model, color}`, `join {code, name, model, color}`, `enter`, `input {...}` (key bits include `Interact`).
S2C: `joined {id, code, players, pickups, loot, doors, tick}`, `error`, `roster`, `snap` (carries `doors` only while a door is moving or has just stopped).
Events (`GameEvent`): `shot`, `hit`, `kill`, `spawn {yaw}`, `pickup`, `pk`, `throw`, `boom`, `reload`, `hole {x,y,z,a,s}`, `door {i,o,t}`, `lootDrop`, `lootTake`, `lootGone`, `matchEnd`, `matchStart`.

### Rooms, codes and the lobby

- `host` creates a room and returns a 4-character code (A-Z and 2-9, no 0/O/1/I); `join` takes it. Errors: unknown code, room full. Room is deleted when the last player leaves. Duplicate callsigns get a number suffix; a blank name becomes `GuestNNNN`.
- **Lobby:** a player who has joined but not clicked "Enter the office" is *not in the match*: not spawned, not in snapshots, cannot be hit, cannot pick anything up. `enter` spawns them (deferred to the restart during an intermission).

## Game design

### Match
- DM, free-for-all, first to **50**; scoreboard on `Tab`. Intermission 10 s, then scores, pickups, loot, bullet holes reset and everyone respawns.
- Respawn after 3 s at the spawn farthest from other players, 2 s spawn protection (own-model blink).
- Kill feed shows `X [gun icon] Y`; hit marker (red for headshot/kill), damage direction arrows, death screen.

### Player and characters
- 100 HP. Walk, sprint, jump (can stand on desks). No fall damage, no crouch.
- 7 blocky characters chosen on the welcome screen with a rotating 3D preview (drag to rotate, wheel to zoom) and 8 shirt colours: Sysadmin, Hoodie Dev, Manager, Intern, HR, CTO, CFO. Choice is saved in `localStorage` and shown to other players.

### Weapons (default keys 1-4)
| # | Name | Type | Notes |
|---|------|------|-------|
| 1 | Stapler .45 | pistol, semi-auto | slide slides back, barrel shows, locks open when empty |
| 2 | Label Gun SMG | automatic | bolt cycles, tape reel spins, open-frame red-dot sight |
| 3 | Paper Shredder | **shotgun** (8 pellets) | pump racks each shot, paper-confetti impacts |
| 4 | Laser Pointer | sniper, scope | glass scope overlay, red beam that fades, bolt is worked after each shot |

Damage, falloff, reload, recoil and zoom are data in `weapons.ts`; muzzle flash, tracer and impact style per gun are data in `weapon-fx.ts`. Tune there, not in logic. Keep anything tall off the centre line of a gun's ADS pose so it never hides the crosshair.

### Grenades (2 slots, default G / H)
- **Coffee Bomb** (frag, radius damage with falloff, needs line of sight) and **Fire Alarm** (flashbang). Each slot holds up to 2, start with 1.

### Pickups and loot
- HP box (+35), ammo box (half of each weapon's max reserve), grenade crate (+1 per slot). Each has a light beam. A box is **left alone** unless it would help (full HP / ammo / grenades means it stays).
- **Loot bags:** a dead player (or a self-kill) drops a bag at their body with `LOOT_FRACTION` (half, rounded down; grenades rounded up) of their ammo. Walking over it loots automatically what fits under the usual maximums; the rest stays. Bags expire after 30 s, max 24 per room, cleared on a new match.

### Doors
- 10 sliding doors (north-row room doors plus Break room, Storage, Conference), defined in `shared/map/doors.ts`. A panel hangs just in front of the wall on the open-plan side and slides along it, so collision stays a simple box. Four start half-closed (0.5), the rest open. `E` (rebindable, `interact`) toggles the door you face: fully open closes it, otherwise it opens. 2 s travel, 0.3 s cooldown.
- **Shared simulation:** `shared/doors.ts` runs identically on the server (authoritative, in `room.ts`) and on every client (prediction). The doors' collision boxes are appended to the solids list and mutated in place, so movement, bullets, grenades and line of sight all respect them (a closed door blocks bullets).
- **Pushing:** a moving door nudges players out along the wall's normal; if a player cannot be moved (wall behind them) the door **stops** instead of crushing them.
- Wire: `joined.doors` and `snap.doors` are `[open, target, ...]` in whole percent; `door` events announce a toggle. Doors reset on a new match.
- Adding a door: add an entry to `DOORS`, run `npm run verify:map` (it checks the panel never cuts into furniture or covers a spawn/pickup at any point of its travel).

### Bullet holes
- The server emits a `hole` event for **every** pellet that hits a surface (position + face normal), so all players see the same holes. Client draws black blocky decals that last ~15 s and shrink away in steps. No holes on players or open air.

### Map: "The Office" (about 100 x 70 m, ceiling 4.2 m)
- Open-plan centre with 12 cubicle pods and a lounge; north row of rooms (Executive, meeting rooms, Server room, Print room, IT Helpdesk); south row (Break room, Storage, Lobby, Conference, phone booths). 3.2 m doors.
- Generated from boxes; the client merges them per material. Keep decorative-only boxes `solid: false`. Every spawn and pickup must pass `npm run verify:map`.

### Controls and settings
- All actions are rebindable in Settings > Controls (`settings.ts` `ACTIONS`): movement, jump, sprint, shoot, aim, reload, both grenades, use/open doors (`E`), weapons 1-4, next/previous weapon (mouse wheel by default), scoreboard. Click an action, press a key, mouse button or wheel; Esc cancels (Esc is reserved); a conflict **swaps** the two bindings; the wheel only works for weapon actions.
- Other settings: mouse sensitivity, invert Y, FOV, master volume, FPS counter, graphics (below). Saved in `localStorage` (always try/catch).
- Keyboard and mouse input only act **while the pointer is locked** (so menus and pause never move the player). Pointer lock needs a click: after joining, the room panel shows "Enter the office"; Esc pauses and shows Enter/Resume, **Settings**, Leave room.

### Graphics quality (decided once)
- `quality.ts`: six presets (High ... Minimum). When a room is joined with no saved result, a **one-time calibration** runs behind a black cover while the player is on the room screen (Enter button says "Optimizing graphics..."), starting from a hardware guess (CPU cores, GPU name) and stepping down until 60 FPS holds, then **saves the tier** and stops forever. Later sessions use the saved tier. There is no live adjustment during play. Settings > Graphics: Auto (recommended) with **Re-detect** (re-measures next join), or Manual (render scale, anti-aliasing, bloom, dust, particles).

### Look and sound
- Flat-shaded blocky office (baked vertex lighting), no external assets. Players are boxy workers with procedural animation and name tags. First-person guns are drawn in a second render pass (depth cleared) so they never clip into walls; glass lenses use translucent panes with a drifting reflection.
- Audio is synthesised with Web Audio (shots per gun with a big echoing sniper shot, reload, hits, pickups, explosions, footsteps), panned and attenuated by distance. Volume is a setting.

## Conventions

- Strict TypeScript. No `any` unless commented. Small modules with one job. TypeScript only, plain DOM + Tailwind.
- Tailwind utility classes for DOM UI. Write full class names (no string-built fragments) so Tailwind can see them.
- Game balance and tuning live in `shared/*.ts` and `weapon-fx.ts` data, never as magic numbers in logic.
- Coordinate system: x east, z south, y up. `yaw 0` faces -Z, positive yaw turns left; `pitch > 0` looks up. In the gun/viewmodel, -Z is forward.
- Server timers use integer ticks, not wall-clock time. Tell other players about things with **events**, keep snapshots small.
- Comments explain why, not what. **All code is documented with JSDoc**: every exported function, class, method, interface, type and non-trivial constant gets a `/** ... */` summary (plus `@param`/`@returns` where useful); each module has a file-header comment describing its single job.
- **Blocky look:** effects are cubes, not round sprites. Decals and layered model parts must stand at least ~1 cm proud of the surface below (or use polygon offset) so faces never share a plane (z-fighting shows as flickering clothes/guns).
- **Frame time:** never let `dt` go negative. The first `requestAnimationFrame` timestamp can predate the loop's start (the map build blocks), which once corrupted all animation timers.
- Graphics must not be changed during play (see above).

## How to...

- **Add a weapon**: entry in `WEAPONS` (`weapons.ts`) and `WEAPON_FX` (`weapon-fx.ts`); a model in `buildGun` (`viewmodel.ts`, with moving `parts`, `port`, `casing`); icon in `gun-icons.ts`; held-gun look in `players.ts` (`GUN_LOOK`, `addGunDetails`); sound in `audio.ts`; an `Action` if you go past 4 slots. Server logic is data-driven.
- **Add a character**: entry in `CHARACTERS` and a `buildX` method plus a `case` in `PlayerModel` (`players.ts`); the picker, protocol and preview pick it up.
- **Add a keybind action**: `Action` type, `ACTIONS`, `DEFAULT_BINDINGS` in `settings.ts`; handle it in `input.ts` (`HOLD_BITS`/`press`); if it is sent to the server also add a `Key` bit in `constants.ts` and handle it in `room.ts`. The settings UI picks it up automatically.
- **Add a message or event**: extend `C2S` / `S2C` / `GameEvent` in `protocol.ts` first so both sides get compile errors until handled; add a case in `parseC2S` for client messages.
- **Change the map**: edit `shared/map/*`, run `npm run verify:map`, then play it.

## Testing

- `test:sim` drives the `Room` class directly with fake connections: movement and speed-hack limits, hits, headshots, falloff, kills, respawn, match end and restart, grenades and line of sight, pickups (including the "leave it if it would not help" rules), the lobby, loot bags, bullet-hole events, character/colour validation.
- `test:smoke` starts the real server and connects two WebSocket clients. `test:settings` and `test:quality` run headless (the quality test simulates fast, slow and hitching machines).
- Rendering and feel can only be checked in a real browser with two tabs. Say explicitly when something was not verified visually.
- **Browser automation caveats:** an automated tab cannot take pointer lock (mouse aiming/firing and key input do not work) and may render at ~1 FPS, which makes the graphics calibration save the lowest tier. Preview models and effects by importing modules into a Vite dev page (`http://localhost:5173`, `await import('/src/client/....ts')`). **Clear test leftovers from `localStorage`** (`itwars.tier`, `itwars.settings`) afterwards, because the automation shares the owner's real browser profile.
- Before committing: `npm run typecheck`, `npm run build`, and all test scripts.

## Milestones

1. Server + shared code, rooms, codes, headless tests: done.
2. Client: map, prediction, remote players, HUD, characters, host/join: done.
3. Combat: 4 weapons, hit feedback, kill feed, scoreboard, match end: done.
4. Grenades, pickups, loot, audio, effects: done.
5. Menus: main, pause, settings with key rebinding and graphics: done.
6. Polish and public demo deploy (Fly.io / Render): in progress / not started (deploy).

## Known gaps

- Pressing Esc only pauses the local screen: the player stays in the match and can be shot. A real "pause out of the match" would need a server message like `enter`.
- Not verified visually or by ear in a live two-player match (the automated browser cannot use the mouse): mouse firing and aim-down-sights feel, hit markers, audio, loot pickup, bullet-hole decals, and the gun part animations (slide, bolt, pump, casings), including the sniper bolt handle fix.
- Doors: the logic is covered headlessly (blocking, pushing, wedged players, bullets, reset) and the models were checked in a rendered scene, but pressing `E` in a live match, the feel of being pushed, and the door sound were not tried.
- Graphics calibration has only been exercised on simulated machines and a 1 FPS automation tab, not on the owner's slow computer.
- Public demo deploy not done. No bots, no lag compensation.

## Out of scope for v1

Bots, teams or other modes, accounts and persistence, voice chat, mobile or gamepad, lag compensation, anti-cheat.
