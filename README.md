# Dropzone

A browser-based first-person looter-shooter: lobby → mission → firefight → loot →
extract → shop, with progress that persists across reloads.

No build step, no package manager, no engine install. It is plain ES modules with
three.js vendored into the repo, so it runs off any static server.

## Play

```bash
python3 -m http.server 8123
# then open http://127.0.0.1:8123/
```

Click **DEPLOY**, pick a mission, then **DROP IN** to capture the mouse.

### Controls

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

## Tests

```bash
python3 tests/run.py
```

35 tests over the pure-logic layer (damage maths, rarity roll distributions,
inventory and stash rules, the XP curve, shop determinism, save migration,
objective gating) and the collision solver (landing, wall blocking, sliding,
step-up, ceilings, fast-fall tunnelling, line of sight).

There is no node on the development machine, so the runner concatenates the
relevant modules, stubs `localStorage` and the four three.js primitives
`Physics.js` touches, and evaluates the result with JavaScriptCore via
`osascript`. If you install node, the same test files port to Vitest with only
the runner replaced.

## Not implemented

Building, the shrinking storm, and multiplayer are deliberately out of scope.
Missions are single-player against AI bots.

Original work — not affiliated with, and using no assets from, any existing game.
All geometry is generated at runtime from primitives.
