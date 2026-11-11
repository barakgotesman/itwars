# IT WARS

Desktop-only, first-person office deathmatch shooter for the browser. Played over a LAN: one person hosts a room, others join with a room code. Theme: IT department vs. the rest of the office ("Have you tried turning them off?"). Portfolio project.

## Status

Playable. Milestones 1-5 are built and the game runs end to end on a LAN (host, join by code, play to 50 kills, restart). Remote repo: `github.com/barakgotesman/itwars` (`main`). See "Known gaps" at the bottom for what is unverified or missing.

## Requirements (from the owner)

- Name: **IT Wars**
- Stack: **TypeScript, Tailwind, three.js** (server: Node + `ws`). TypeScript only, no jQuery or UI framework.
- **Desktop only** (keyboard + mouse, pointer lock). Show a "desktop only" notice on touch devices.
- **LAN multiplayer**: a player hosts a room and gets a **room code**; others on the same network join with it.
- Mode: **Deathmatch (DM)**; the host picks the kill limit (10/20/30/40/50, default 50) and an optional time limit (off by default; 5/10/15/20/30 min, 10 when switched on). Max 8 players per room, match restarts 10 s after it ends. Modes are a registry (`shared/rules/modes.ts`) so future modes/mods plug in.
- **4 gun types**, **2 grenade slots**, **100 HP**.
- **Map**: a big office with rooms *and* open-plan space. **3D pickups**: ammo, HP, grenades.
- **Main menu** with a **settings screen**; **rebindable controls**.
- **60 FPS is a must.** Graphics are chosen once per computer (see "Graphics quality") and must never change while the player is playing.
- Everything is **blocky** (voxel look): models, particles, tracers, explosions, bullet holes.

## Commands

```
npm run dev            # game server (tsx watch, :3000) + Vite client (:5173, LAN-exposed, proxies /ws and /api)
npm run build          # typecheck (client + server configs) && vite build
npm start              # one Node process serves dist/ + WebSocket on :3000 and prints LAN URLs
npm run play           # build + start (use this to host for friends)
npm run typecheck      # tsc for the whole repo, then again with no DOM types for shared + server
npm test               # check:deps, verify:map, test:sim, test:smoke, test:settings, test:quality, test:zones, test:boards
npm run check:deps     # layering rule: shared is pure, server never imports client, client never imports server
npm run verify:map     # spawns and pickups are not inside solids and are reachable on foot
npm run test:sim       # headless server simulation tests (no browser)
npm run test:smoke     # real server + two WebSocket clients
npm run test:settings  # key rebinding rules and option defaults
npm run test:quality   # graphics calibration and hardware guess
npm run test:boards    # standings helpers, sign text templates, feed-line text, boards on free wall, one outward door sign per doorway
npm run test:zones     # lighting design: zones tile the map, sane values, lamp budget, no lamp buried in a solid
npm run make:icons     # regenerate public/ icons and the og-image from the pixel-art sprite (tools/make-icons.ts)
```

SEO and sharing: `index.html` carries the title, description, Open Graph/Twitter tags and JSON-LD; `public/` holds the manifest, `robots.txt` and icons. Build with `SITE_URL=https://domain npm run build` to add the canonical link and absolute `og:image` URLs (a small Vite plugin in `vite.config.ts`). Without it those tags are left out on purpose, because they need a real address.

Players open `http://<host-LAN-IP>:3000`. The server binds `0.0.0.0` and prints its LAN addresses (real adapters first, virtual WSL/Hyper-V ones last). Windows may show a firewall prompt on first run.

**Gotcha:** running bare `vite` gives "Cannot reach the game server": the page server proxies `/ws` to :3000, so the game server must be running (`npm run dev` starts both). Do not run `npm run dev`/`play` while another server holds :3000.

## Architecture

One package, three source folders, path aliases `@shared/*`, `@server/*`, `@client/*` (tsconfig `paths` + Vite `resolve.alias`; tsx reads the tsconfig). Use an alias for imports that cross a folder, a relative path for siblings.

**Layering rule (enforced by `npm run check:deps` and `tsconfig.server.json`, which has no DOM types):** `shared` imports nothing from `client`/`server`, no `three`, no Node. `server` never imports `client` or `three`. `client` never imports `server`. Anything both sides need goes in `shared`.

```
src/shared/   used by BOTH sides (no DOM, no Node APIs)
  core/       constants.ts (tick rate, player size, movement tuning, key bits, match rules), physics.ts (stepMovement, rayVsAabb, overlaps, lookDir), characters.ts
  net/        protocol.ts: typed C2S / S2C messages, GameEvent union, parseC2S validator, name/code sanitising
  rules/      weapons.ts (weapon / grenade / pickup / loot tables, all balance), modes.ts (mode registry, MatchRules, sanitizeRules, setup-screen options)
  world/      doors.ts (Doors simulation: used by server AND client), map/ (office generated from boxes: index, builder, furniture, shell, dressing, pickups, door-layout, zones (lighting design), accents (local lights), rooms/*)
src/server/   Node
  index.ts    bootstrap only: http server + gateway + loop
  loop.ts     fixed 60 Hz step of every room
  http/       api.ts (/api/info), static.ts (serves dist/), lan.ts (LAN addresses)
  net/        gateway.ts: WebSocket on /ws, rate limit, validation, routing to the player's room
  rooms/      room.ts (Room: state + join/enter/leave/input/step, calls the systems), manager.ts (codes, lookup, prune)
  sim/        one system per file, plain functions over the room state (state.ts `Sim`):
              movement, weapons, damage, grenades, pickups, loot, doors, spray, match (spawn, clock, end, restart), snapshot (roster, snapshots, `me`), combat (pure ray/LOS/projectile geometry), player, util
src/client/   Vite + three.js + Tailwind
  main.ts     entry: touch notice or wire menu + room panel + settings; config.ts (server URL, `VITE_SERVER_URL`)
  app/        menu.ts (callsign, character picker, host/join), room-panel.ts (room code, pause, Input, starts the game), setup-ui.ts, settings-ui.ts, preview.ts, appearance.ts, player-name.ts, dom.ts
  platform/   input.ts, settings.ts, quality.ts, audio.ts, net.ts (browser plumbing, no game rules)
  render/     three.js: world.ts, lighting.ts, renderer.ts (bloom, dust, composer), players.ts, viewmodel.ts, weapon-fx.ts, items.ts, door-visuals.ts, particles.ts, bullet-holes.ts
  hud/        hud.ts, feed.ts, gun-icons.ts, style.css (design tokens: one ground, one ink, one yellow accent; red only for danger; flat, square, no gradients except vignettes and the scope)
  game/       in-room game: index.ts (startGame wiring + message routing), scene.ts (renderer + all visuals), prediction.ts (LocalPlayer), roster.ts, events.ts (server events to effects/HUD), loop.ts (frame)
tests/        verify-map.ts sim-test.ts smoke-test.ts settings-test.ts quality-test.ts physics-check.ts
tools/        make-icons.ts, check-deps.ts
public/       copied to the site root: favicon (svg/ico), app icons, og-image.png, manifest.webmanifest, robots.txt
```

To host the client apart from the server (later, for an online game), build with `VITE_SERVER_URL=https://server` (see `.env.example`); by default the client uses its own origin.

### Networking model: authoritative server

- The server owns all game state: positions, HP, ammo, grenades, pickups, loot, scores. Clients never decide hits.
- Fixed **60 Hz** tick. Client sends one input per tick: `{seq, keys, yaw, pitch, weapon}`. The server consumes one queued input per tick, plus one banked catch-up step if the player starved earlier, so input flooding gives no speed advantage.
- **30 Hz snapshots**: shared `players`/`grenades`, a private `me` block (acked `seq`, exact position/velocity, hp, `playing`, ammo, grenades, reload, blind) and a list of one-off **events** since the last snapshot. Events are the way to tell everyone about something (shots, hits, kills, holes, loot, pickups, explosions).
- **Client-side prediction** with the shared `stepMovement`; on every snapshot reset to server state and replay unacked inputs. On the player's own `spawn` event the pending input list is cleared (the server drops its queue at spawn).
- **Remote players** are interpolated ~100 ms behind using client receive time.
- Hitscan and grenades are resolved on the server. No lag compensation.
- Transport: JSON over WebSocket. `parseC2S` validates every message (types, finite numbers, key mask, pitch clamp, sanitised names, model/colour indices). Per-connection rate limit; max payload 2 KB.

### Messages

C2S: `host {name, model, color, spray, rules}`, `join {code, name, model, color, spray}`, `enter`, `input {...}` (key bits include `Interact` and `Spray`).
S2C: `joined {id, code, players, rules, pickups, loot, doors, tick}`, `error`, `roster`, `snap` (carries `doors` only while a door is moving or has just stopped).
Events (`GameEvent`): `shot`, `hit`, `kill`, `spawn {yaw}`, `pickup`, `pk`, `throw`, `boom`, `reload`, `hole {x,y,z,a,s}`, `spray {id,x,y,z,a,s,r}`, `door {i,o,t}`, `lootDrop`, `lootTake`, `lootGone`, `matchEnd`, `matchStart`.

### Rooms, codes and the lobby

- `host` creates a room and returns a 4-character code (A-Z and 2-9, no 0/O/1/I); `join` takes it. Errors: unknown code, room full. Room is deleted when the last player leaves. Duplicate callsigns get a number suffix; a blank name becomes `GuestNNNN`.
- **Lobby:** a player who has joined but not clicked "Enter the office" is *not in the match*: not spawned, not in snapshots, cannot be hit, cannot pick anything up. `enter` spawns them (deferred to the restart during an intermission).

## Game design

### Match and rules
- DM, free-for-all; scoreboard on `Tab`. The host chooses the **rules** on the Game setup screen ("Host game"); they are sent in the `host` message, validated by `sanitizeRules` (bad values fall back to defaults), fixed for the room's lifetime, and echoed to everyone in `joined.rules`. The setup screen is generated from `MODES` (`OptionDef`: `choice` and `optional-choice`), so a new mode or option needs a registry entry, not new screen code. The last choice is remembered in `localStorage`.
- **Kill limit:** first to `rules.killLimit` ends the match (`matchEnd` reason `kills`).
- **Time limit** (`timeLimitMin`, 0 = off): the match clock starts once **two players are in the match** (so waiting for friends costs nothing), counts down on the server (`me.timeLeft` seconds, -1 without a limit, the full limit while waiting, 0 in the intermission) and ends the match at zero: most kills wins, a tie for first is a **draw** (`winner -1`, reason `time`). The clock restarts with each match.
- Intermission 10 s, then scores, pickups, loot, doors, bullet holes reset and everyone respawns.
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

Damage, falloff, reload, recoil and zoom are data in `shared/rules/weapons.ts`; muzzle flash, tracer and impact style per gun are data in `client/render/weapon-fx.ts`. Tune there, not in logic. Keep anything tall off the centre line of a gun's ADS pose so it never hides the crosshair.

### Grenades (2 slots, default G / H)
- **Coffee Bomb** (frag, radius damage with falloff, needs line of sight) and **Fire Alarm** (flashbang). Each slot holds up to 2, start with 1.

### Pickups and loot
- HP box (+35), ammo box (half of each weapon's max reserve), grenade crate (+1 per slot). Each has a light beam. A box is **left alone** unless it would help (full HP / ammo / grenades means it stays).
- **Loot bags:** a dead player (or a self-kill) drops a bag at their body with `LOOT_FRACTION` (half, rounded down; grenades rounded up) of their ammo. Walking over it loots automatically what fits under the usual maximums; the rest stays. Bags expire after 30 s, max 24 per room, cleared on a new match.

### Spray paint
- `T` (rebindable, `spray`) tags the wall you face, like CS:GO. The server (`server/sim/spray.ts`) casts a ray of `SPRAY_RANGE` (3 m) and emits a `spray` event (point, face axis/sign, `r` quarter turns so floor/ceiling tags face the sprayer) only for a static surface: never a door panel, open air, the intermission or a lobby player. Cooldown `SPRAY_COOLDOWN_TICKS` (10 s), reset on a new match.
- The design is a 16x16 pixel-art entry in `SPRAYS` (`shared/rules/sprays.ts`), chosen in the main menu next to the colour, saved in `itwars.look`, sent in `host`/`join` and echoed in the roster (`PlayerInfo.spray`). Never sent per press, so a client cannot choose arbitrary art. Add a design by adding an entry (palette keys in `SPRAY_PALETTE`).
- Client: `render/sprays.ts` draws flat nearest-filtered decals; each player keeps at most 3 (the oldest is replaced); cleared on `matchStart`. Players who join mid-match do not see earlier tags (same as bullet holes).

### Doors
- 10 sliding doors (north-row room doors plus Break room, Storage, Conference), defined in `shared/world/map/door-layout.ts`. A panel hangs just in front of the wall on the open-plan side and slides along it, so collision stays a simple box. Four start half-closed (0.5), the rest open. `E` (rebindable, `interact`) toggles the door you face: fully open closes it, otherwise it opens. 2 s travel, 0.3 s cooldown.
- **Shared simulation:** `shared/world/doors.ts` runs identically on the server (authoritative, `server/sim/doors.ts`) and on every client (prediction). The doors' collision boxes are appended to the solids list and mutated in place, so movement, bullets, grenades and line of sight all respect them (a closed door blocks bullets).
- **Pushing:** a moving door nudges players out along the wall's normal; if a player cannot be moved (wall behind them) the door **stops** instead of crushing them.
- Wire: `joined.doors` and `snap.doors` are `[open, target, ...]` in whole percent; `door` events announce a toggle. Doors reset on a new match.
- Adding a door: add an entry to `DOORS`, run `npm run verify:map` (it checks the panel never cuts into furniture or covers a spawn/pickup at any point of its travel).

### Bullet holes
- The server emits a `hole` event for **every** pellet that hits a surface (position + face normal), so all players see the same holes. Client draws black blocky decals that last ~15 s and shrink away in steps. No holes on players or open air.

### Map: "The Office" (about 100 x 70 m, ceiling 4.2 m)
- Open-plan centre with 12 cubicle pods and a lounge; north row of rooms (Executive, meeting rooms, Server room, Print room, IT Helpdesk); south row (Break room, Storage, Lobby, Conference, phone booths). 3.2 m doors.
- Generated from boxes; the client merges them per material. Keep decorative-only boxes `solid: false`. Every spawn and pickup must pass `npm run verify:map`.

### Signs and live scoreboards
- **Door signs** (`LABELS`, drawn by `client/render/signs.ts` into one atlas mesh): one plate above each doorway, on the **outside only** (the room's `side` decides). Hanging banners stay double-sided. Text may use `{KILLS}` / `{MINUTES}`, filled from the room's rules by `fillRuleTokens` (`shared/rules/standings.ts`), so the "Q4 TARGET" banner always shows the real kill limit.
- **Wall scoreboards**: `scoreboard(...)` in `shared/world/map/builder.ts` registers a screen (`BOARDS`): open-plan north wall (x -34), open-plan south wall (x -12), lobby east wall. `client/render/score-wall.ts` draws one shared canvas: "FIRST TO N KILLS", the match clock, the leader's progress bar, up to 8 ranked rows (your row highlighted), the winner during the intermission, and a "LATEST" strip of the same lines the kill feed shows (`feedLineText`). It redraws only when the data changes. Fed from `game/loop.ts` (2 Hz roster and clock), `game/events.ts` (winner), and a wrapper around the feed in `game/index.ts`.
- Ranking (`rankPlayers`) is shared by the HUD scoreboard and the boards. Keep boards clear of door gaps and posters; `npm run test:boards` checks it.

### Lighting design (every room has its own light)
- Everything is **baked** into vertex colours at load (unlit materials, zero per-frame cost). Never add real-time shadow lights: 60 FPS on weak PCs is a requirement.
- `shared/world/map/zones.ts` is the single source of truth, one entry per room: ambient colour and level, ceiling-panel behaviour (colour, strength, which panels are on or flicker), fog colour and density, and a brightness `floor` for players. `zoneAt(x, z)` looks a point up. Rooms: lit warm and low (executive, conference, lounge), cold and nearly dark (server room, helpdesk), olive and sparse (storage), bright white (break room, print), warm plus daylight (lobby), purple (phone lounge).
- `shared/world/map/accents.ts` places the small local lights (rack LEDs, monitor glow, desk lamps, vending, neon, bare bulbs, sunlit window patches) by room. A lamp must sit in free air: one inside furniture lights nothing, and `npm run test:zones` fails on it.
- `client/render/lighting.ts` bakes ambient from the zone (blended softly across doorways, wall faces use the air in front of them) plus lamps and contact shadows, using a grid index so baking stays fast. `light-field.ts` samples the baked light so `PlayerModel.setTint` / `ViewModel.setTint` tint characters and weapons to their room (never below the zone floor); `atmosphere.ts` eases fog and sky toward the camera's room each frame.
- **Add or retune a room's light:** edit its zone in `zones.ts` and its accents in `accents.ts`, then look at it in a rendered scene (Vite dev page importing `buildWorld`) and run `npm run test:zones`. Keep total lamps under the budget in the test.

### Controls and settings
- All actions are rebindable in Settings > Controls (`client/platform/settings.ts` `ACTIONS`): movement, jump, sprint, shoot, aim, reload, both grenades, use/open doors (`E`), weapons 1-4, next/previous weapon (mouse wheel by default), scoreboard. Click an action, press a key, mouse button or wheel; Esc cancels (Esc is reserved); a conflict **swaps** the two bindings; the wheel only works for weapon actions.
- **Menu sounds** (`platform/ui-sound.ts`, started in `main.ts`): a blip on hovering a control, a click on pressing one (a deeper thump on `.btn`), and a slider tick that rises with the value, all synthesised and delegated from the document so new buttons get them for free. Level = master volume x the `uiVolume` setting (Settings > Audio > Menu sounds, 0 = off). The first hover in a fresh tab is silent because browsers only start audio after a click.
- Other settings: mouse sensitivity, invert Y, FOV, master volume, menu sounds volume, FPS counter, graphics (below). Saved in `localStorage` (always try/catch).
- Keyboard and mouse input only act **while the pointer is locked** (so menus and pause never move the player). Pointer lock needs a click: after joining, the room panel shows "Enter the office"; Esc pauses and shows Enter/Resume, **Settings**, Leave room.

### Graphics quality (decided once)
- `quality.ts`: six presets (High ... Minimum). When a room is joined with no saved result, a **one-time calibration** runs behind a black cover while the player is on the room screen (Enter button says "Optimizing graphics..."), starting from a hardware guess (CPU cores, GPU name) and stepping down until 60 FPS holds, then **saves the tier** and stops forever. Later sessions use the saved tier. There is no live adjustment during play. Settings > Graphics: Auto (recommended) with **Re-detect** (re-measures next join), or Manual (render scale, anti-aliasing, bloom, dust, particles).

### Look and sound
- Flat-shaded blocky office (baked vertex lighting), no external assets. Players are boxy workers with procedural animation and name tags. First-person guns are drawn in a second render pass (depth cleared) so they never clip into walls; glass lenses use translucent panes with a drifting reflection.
- Audio is synthesised with Web Audio (shots per gun with a big echoing sniper shot, reload, hits, pickups, explosions, footsteps), panned and attenuated by distance. Volume is a setting.

## Conventions

- Strict TypeScript. No `any` unless commented. Small modules with one job. TypeScript only, plain DOM + Tailwind.
- Tailwind utility classes for DOM UI. Write full class names (no string-built fragments) so Tailwind can see them.
- Game balance and tuning live in `shared/rules/*.ts` and `client/render/weapon-fx.ts` data, never as magic numbers in logic.
- Coordinate system: x east, z south, y up. `yaw 0` faces -Z, positive yaw turns left; `pitch > 0` looks up. In the gun/viewmodel, -Z is forward.
- Server timers use integer ticks, not wall-clock time. Tell other players about things with **events**, keep snapshots small.
- Comments explain why, not what. **All code is documented with JSDoc**: every exported function, class, method, interface, type and non-trivial constant gets a `/** ... */` summary (plus `@param`/`@returns` where useful); each module has a file-header comment describing its single job.
- **Blocky look:** effects are cubes, not round sprites. Decals and layered model parts must stand at least ~1 cm proud of the surface below (or use polygon offset) so faces never share a plane (z-fighting shows as flickering clothes/guns).
- **Frame time:** never let `dt` go negative. The first `requestAnimationFrame` timestamp can predate the loop's start (the map build blocks), which once corrupted all animation timers.
- Graphics must not be changed during play (see above).

## How to...

- **Add a weapon**: entry in `WEAPONS` (`shared/rules/weapons.ts`) and `WEAPON_FX` (`render/weapon-fx.ts`); a model in `buildGun` (`render/viewmodel.ts`, with moving `parts`, `port`, `casing`); icon in `hud/gun-icons.ts`; held-gun look in `render/players.ts` (`GUN_LOOK`, `addGunDetails`); sound in `platform/audio.ts`; an `Action` if you go past 4 slots. Server logic is data-driven.
- **Add a character**: entry in `CHARACTERS` and a `buildX` method plus a `case` in `PlayerModel` (`render/players.ts`); the picker, protocol and preview pick it up.
- **Add a keybind action**: `Action` type, `ACTIONS`, `DEFAULT_BINDINGS` in `platform/settings.ts`; handle it in `platform/input.ts` (`HOLD_BITS`/`press`); if it is sent to the server also add a `Key` bit in `shared/core/constants.ts` and handle it in the matching `server/sim/*` system (e.g. `weapons.ts`). The settings UI picks it up automatically.
- **Add a message or event**: extend `C2S` / `S2C` / `GameEvent` in `shared/net/protocol.ts` first so both sides get compile errors until handled; add a case in `parseC2S` for client messages; handle server events in `client/game/events.ts`.
- **Change the map**: edit `shared/world/map/*`, run `npm run verify:map`, then play it.

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
- Spray paint: the server rules are tested headlessly (range, cooldown, doors, lobby, validation) and the decals were checked in a small rendered scene, but spraying in a live match, the hiss and the paint puff were not tried. No tags for late joiners.
- Doors: the logic is covered headlessly (blocking, pushing, wedged players, bullets, reset) and the models were checked in a rendered scene, but pressing `E` in a live match, the feel of being pushed, and the door sound were not tried.
- Lighting: the room mood was checked in a rendered contact sheet of every room (with characters standing in them) and by headless tests, but not by walking the live game; the dark rooms' readability against a real opponent has not been playtested.
- Graphics calibration has only been exercised on simulated machines and a 1 FPS automation tab, not on the owner's slow computer.
- Public demo deploy not done. No bots, no lag compensation.

## Out of scope for v1

Bots, teams or other modes, accounts and persistence, voice chat, mobile or gamepad, lag compensation, anti-cheat.
