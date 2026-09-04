# Dropzone

A browser-based first-person looter-shooter: drop into a mission, fight through AI
squads, loot chests — and get out, because **anything you find is lost if you go
down.** Lobby, loadout, missions, and a daily shop, with progress that persists
across reloads. Play solo, or host a room and drop in with up to three friends.

No install, no account, no build step. Plain ES modules with three.js vendored into
the repo, so it runs off any static web server.

## Install and play

**Three ways in — pick the first one that applies to you.**

### 1. Play online — nothing to install

**https://dantongyu.github.io/Claude-Apps/**

Click and play in any modern browser.

*(If that link 404s, GitHub Pages hasn't been switched on yet — see
[Publishing the game](HOW_TO_PLAY.md#publishing-the-game-for-the-repo-owner). It's
a one-minute, one-time setting and free for public repos.)*

### 2. Download and run it locally — no Git needed

1. Click the green **Code** button above → **Download ZIP**, then unzip it
2. Open a terminal in that folder and start a small local server:

   ```bash
   python3 -m http.server 8123     # Windows: py -m http.server 8123
   ```

3. Open **http://127.0.0.1:8123/**

> Double-clicking `index.html` will show a blank page — browsers block pages opened
> straight from disk from loading their own code files. The command above just
> serves the folder locally; nothing is installed and nothing leaves your machine.

No terminal? In VS Code, install the **Live Server** extension, right-click
`index.html`, and pick *Open with Live Server*.

### 3. Clone it — for developers

```bash
git clone https://github.com/dantongyu/Claude-Apps.git
cd Claude-Apps
python3 -m http.server 8123
```

There is no `npm install` and no build step. Everything, three.js included, is
committed.

### Then

Click **DEPLOY** → pick **Cold Open** → click **DROP IN** to capture your mouse.
`Esc` pauses and gives the mouse back.

> **📖 New players: read [HOW_TO_PLAY.md](HOW_TO_PLAY.md)** — the full guide, with
> controls, the rarity and weapon tables, enemy types, missions, and
> troubleshooting. The rest of this file is developer documentation.

## Controls

| | |
|---|---|
| `W A S D` | Move |
| `Shift` | Sprint |
| `Space` | Jump |
| `Ctrl` / `C` | Crouch |
| Mouse | Look / fire |
| `R` | Reload |
| `E` | Open chest |
| `F` | Use held consumable (hold) |
| `G` | Drop held item |
| `1`-`5` / wheel | Hotbar slots |
| `Esc` | Pause + settings |

## The loop

You carry up to **5 items** into a mission. Weapons roll one of five rarities
(common → legendary), which multiplies damage and magazine size. Chests and bots
drop loot; ammo is pooled by type and shared across every weapon that uses it.

**Finish the objectives and everything in your backpack extracts with you. Go down
and you keep only what you brought in.** That is the whole tension of a run.

Credits and XP pay out on both outcomes — full on success, a quarter on a wipe —
and feed the daily shop, whose stock is seeded from the date, so it is stable all
day and rotates overnight.

## Architecture

Two layers, one state machine (`src/core/GameState.js`):

- **Meta layer** — lobby, mission board, loadout, shop, results. Plain DOM in
  `src/ui/screens/`. No 3D cost when you are not playing.
- **Match layer** — `src/game/Match.js` owns a scene, builds it on deploy and
  disposes all of it on exit, so repeated runs do not leak GPU memory.

```
src/
  core/        state machine, fixed-step loop, input, seeded PRNG
  data/        ALL tuning: weapons, rarities, enemies, missions, shop
  game/        arena generation, physics, player, weapons, bots, loot, objectives
  inventory/   item model, 5-slot backpack, persistent stash + loadout
  economy/     credits, XP curve, daily shop rotation
  net/         co-op: wire format, interpolation, PeerJS session, host/client sync
  ui/          DOM screens + in-match HUD
  save/        versioned localStorage profile with a migration seam
```

Three rules the code sticks to:

1. **No gameplay numbers outside `src/data/`.** Balancing is a one-file edit.
2. **All randomness goes through `core/Random.js`.** Arenas, loot and shop stock
   are reproducible from a seed.
3. **`Match.dispose()` disposes everything it created.** Wired in from the start,
   not retrofitted.

Simulation runs at a fixed 60 Hz with an accumulator and renders once per frame,
so aim, recoil and bot behaviour do not change with your frame rate.

Collision is an explicit AABB list built alongside the arena geometry rather than
a physics library — the world is boxes and the actors are boxes, so a ~400 KB
dependency would buy nothing.

### Co-op

Co-op is peer-to-peer over WebRTC (PeerJS, vendored), so the game still runs off
any static host. One player hosts and owns the bots, chests, pickups and
objectives; every player owns their own body, health and inventory, so there is no
input lag on the thing you feel most. The map is never sent — arenas are seeded,
so every peer builds the same one. `src/net/NetSession.js` is the only file that
touches PeerJS; `src/net/CoopSync.js` is the host/client split, driven by `Match`
when it is given a session. Design, trade-offs and the testing checklist are in
[MULTIPLAYER_PLAN.md](MULTIPLAYER_PLAN.md).

## Tests

```bash
python3 tests/run.py
```

60 tests over the pure-logic layer (damage maths, rarity roll distributions,
inventory and stash rules, the XP curve, shop determinism, save migration,
objective gating), the co-op wire format, interpolation and room roster, and the
collision solver (landing, wall blocking, sliding, step-up, ceilings, fast-fall
tunnelling, line of sight).

There is no node on the development machines, so the runner concatenates the
relevant modules, stubs `localStorage` and the four three.js primitives
`Physics.js` touches, and evaluates the result with whichever engine is present:
JavaScriptCore via `osascript` on macOS, or SpiderMonkey via `gjs` on a Linux
desktop. If you install node, the same test files port to Vitest with only the
runner replaced.

The netcode itself cannot be desk-checked: open two browser windows on the same
machine first, then two machines on different networks (the only way NAT
problems show up). The checklist is at the end of `MULTIPLAYER_PLAN.md`.

## Not implemented

Building, the shrinking storm, PvP and host migration are deliberately out of
scope. Missions are co-op against AI bots; there is no anti-cheat, because this
is a game you play with friends over a shared link.

Original work — not affiliated with, and using no assets from, any existing game.
All geometry is generated at runtime from primitives.
