# IT Wars

> *"Have you tried turning them off?"*

A blocky, first-person **office deathmatch shooter** that runs in the browser. One person hosts a room, friends on the same network join with a 4-letter code, and the first to **50 kills** wins. The IT department against the rest of the office, armed with staplers, label guns, paper shredders and a laser pointer.

Built with **TypeScript**, **three.js** and **Tailwind**, with a small **Node + WebSocket** server. No game engine, no image or sound files: every model, texture and sound effect is generated in code, so it works fully offline on a LAN.

> Desktop only (keyboard and mouse). Touch devices get a "desktop only" notice.

## Play with a friend

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run play
```

The server prints the addresses it is listening on, for example:

```
  local:   http://localhost:3000
  network: http://192.168.1.20:3000
```

1. Open the **local** address, pick a character, a colour, a spray design and a callsign, and click **Host a game**. Choose the kill limit and an optional time limit, then **Create room**. You get a 4-letter room code.
2. Your friend opens the **network** address on the same Wi-Fi or LAN, types the code and clicks **Join**.
3. The lobby shows the room code, the address to share (click the copy icon beside it) and who has joined. Everyone clicks **Enter the office** to start playing. **Esc** pauses and opens Settings.

Windows may ask to let Node through the firewall the first time; allow it on private networks.

## Features

- **LAN multiplayer** with room codes, up to 8 players per room, an authoritative server and client-side prediction.
- **Deathmatch** with host-chosen rules: kill limit of 10, 20, 30, 40 or 50, and an optional time limit (5 to 30 minutes, 10 by default when switched on; the clock starts once two players are in, and the most kills wins). Automatic restart, scoreboard on `Tab`, kill feed (`X [gun icon] Y`).
- A **Game setup** screen when you host, built from a mode registry so future game modes and mods plug in.
- **4 guns**, each with its own moving parts, muzzle flash, tracer and sound: Stapler .45 (pistol), Label Gun SMG, Paper Shredder (shotgun) and Laser Pointer (sniper with a glass scope).
- **2 grenades**: Coffee Bomb (explosive) and Fire Alarm (flashbang).
- **Sliding doors** on the main rooms: some start half-closed, press `E` to open or close. Doors are solid (they block movement and bullets), and one that closes on you pushes you out of the way.
- **Pickups** across the map (HP, ammo, grenades) with light beams, and **loot bags** that dead players drop with half of their ammo.
- **Bullet holes** that every player sees, then fade away.
- **Spray paint**: press `T` near a wall to leave your pixel-art tag (9 designs, picked in the menu). 10 second cooldown, 3 tags per player, cleared when a new match starts.
- **7 selectable characters** (Sysadmin, Hoodie Dev, Manager, Intern, HR, CTO, CFO) with a rotating 3D preview and shirt colours.
- **Live scoreboards** on three office walls (callsigns, kills, deaths, clock, and the latest kills and joins), room name signs above every doorway, and a banner that shows the room's real kill limit.
- A **shooter-style interface**: flat, blocky and high-contrast, with big health and ammo numbers, magazine pips, a reload bar, a low-health warning, a race strip showing you against the leader, a right-side kill feed, and a main menu that floats over a slow flythrough of the real office map.
- A big **office map**: open-plan floor with cubicles, plus meeting rooms, a server room, a break room, storage and more.
- **Settings**: fully rebindable controls, field of view, master and menu-sound volume, FPS counter and graphics options.
- **Automatic graphics**: the game measures your computer once when you join a room, picks a preset that holds 60 FPS and remembers it. Nothing changes while you play.

## Controls

These are the defaults; everything can be rebound in **Settings → Controls**.

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Jump / Sprint | `Space` / `Shift` |
| Shoot / Aim | Left mouse / Right mouse |
| Reload | `R` |
| Weapons | `1`-`4` or mouse wheel |
| Coffee Bomb / Fire Alarm | `G` / `H` |
| Open / close a door | `E` (face the door) |
| Spray paint | `T` (face a wall) |
| Scoreboard | hold `Tab` |
| Pause and settings | `Esc` |

## Development

```bash
npm run dev            # game server (:3000) + Vite client (:5173) with live reload
npm run build          # type-check and build the client
npm run typecheck
```

`npm run dev` starts both servers. Running plain `vite` on its own shows "Cannot reach the game server", because the page server forwards the game connection to the server on port 3000.

### Publishing and SEO

The page ships with a descriptive title and meta description, Open Graph and Twitter share tags, structured data, a web manifest, `robots.txt` and generated pixel-art icons (`public/`). Once you have a public address, build with it so the canonical link and absolute share-image URLs are added:

```bash
SITE_URL=https://your-domain.example npm run build
```

`npm run make:icons` regenerates the favicon, app icons and the 1200x630 share image from a small pixel-art sprite (no image tools needed).

### Tests

```bash
npm test               # everything below, plus the layering check
npm run test:sim       # headless server simulation (movement, combat, grenades, pickups, loot, lobby...)
npm run test:smoke     # real server with two WebSocket clients
npm run test:settings  # key rebinding rules
npm run test:quality   # graphics calibration
npm run verify:map     # every spawn and pickup is reachable and not inside a wall
npm run check:deps     # shared/server/client import only what their layer allows
```

Visuals and game feel can only be judged in a real browser with two windows.

### Project layout

```
src/shared/   code used by both sides (no DOM, no Node): core (constants, physics), net (protocol), rules (weapons, modes), world (doors, the office map)
src/server/   Node server: http (static files, /api/info), net (WebSocket gateway), rooms (room + manager), sim (movement, weapons, grenades, pickups, loot, match, snapshots)
src/client/   browser game: app (menus), platform (input, settings, audio, quality, net), render (three.js world, players, guns, effects), hud, game (prediction, events, loop)
tests/        headless tests and the map check
tools/        icon generator and the layering check
```

The server owns all game state and runs at 60 Hz, sending snapshots at 30 Hz. Clients send inputs, predict their own movement with the same shared code, and interpolate other players. To host the page on a different address than the game server, build with `VITE_SERVER_URL` (see `.env.example`). More detail for contributors is in [`CLAUDE.md`](CLAUDE.md).

## Known limitations

- Pressing `Esc` pauses only your screen: you stay in the match and can still be shot.
- No bots, so you need at least two players.
- No lag compensation (designed for LAN).
- A public demo deployment is not set up yet.

## License

No license has been chosen yet; all rights reserved by the author until one is added.
