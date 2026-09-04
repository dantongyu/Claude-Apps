# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Dropzone: a browser-based first-person looter-shooter. Plain ES modules, no npm, no
build step, no lint config. three.js (and PeerJS) are committed under `vendor/`.
`README.md` is the developer doc; `HOW_TO_PLAY.md` is the player guide;
`MULTIPLAYER_PLAN.md` is the co-op handoff doc (read it before touching `src/net/`).

## Commands

```bash
python3 -m http.server 8123      # serve, then open http://127.0.0.1:8123/
python3 tests/run.py             # run all three test suites (logic, net, physics)
```

The game must be *served*; opening `index.html` from disk gives a blank page (ES
modules + importmap). Deployed from `main` via GitHub Pages (`.nojekyll` is there so
`vendor/` is published).

### Test runner caveats

- `tests/run.py` needs **macOS `osascript`** (JavaScriptCore). There is no node,
  osascript, deno or bun on this Linux dev box, so tests cannot be run here; say so
  rather than claiming green.
- Each suite is built by concatenating the modules listed in `SUITES` in
  `tests/run.py` (in dependency order, `import`/`export` stripped) plus the test
  file, then evaluating it. **A module under test must not touch three.js or the
  DOM**, except `Physics.js`, whose four three.js primitives are stubbed. If you add
  a module to a suite, append it to that suite's `modules` list after its
  dependencies.
- There is no per-test filter. Tests are `test('name', () => {...})` with `eq`,
  `ok`, `close` helpers defined at the top of each `tests/*.test.js`; add new tests
  to the matching suite file.

## Architecture

**Entry:** `index.html` → importmap (`three` → `vendor/three/three.module.js`) →
`src/main.js`. `main.js` defines `App`, the top-level controller that owns the
WebGL renderer, the loaded profile, the `GameState` machine, the fixed-step `Loop`,
and the current `Match` (or null). `App` is exposed as `window.__dropzone`.

**Two layers, one state machine** (`src/core/GameState.js`, `State` enum):

- *Meta layer* (LOBBY, MISSIONS, INVENTORY, SHOP, RESULTS): plain DOM screens in
  `src/ui/screens/`, each exported as `render<Name>(root, app)`. Screens mutate
  `app.profile`, then call `app.save()`, `app.go(State.X)`, `app.flash(text)`.
  `App.rerender()` in `main.js` is the switch that maps states to screens; entering
  any non-MATCH state destroys the running match. Adding a screen = new `State`
  entry + a case in `rerender()`.
- *Match layer* (MATCH): `src/game/Match.js` builds the whole scene in its
  constructor from `{ renderer, mission, profile, loadout, hudRoot, input,
  onFinish }` and tears it all down in `dispose()`. The MATCH state shows the
  pause menu whenever pointer lock is lost. On finish, `Match` hands a result to
  `App._finishMatch`, which computes credits/XP, merges extracted loot into the
  stash (only on success), saves, and goes to RESULTS.

**Loop:** `core/Loop.js` simulates at a fixed 60 Hz with an accumulator (max 8
steps/frame) and renders once per animation frame. Never make gameplay depend on
frame dt.

**Invariants the code keeps (do not break):**

1. All tuning numbers live in `src/data/` (weapons, rarities, enemies, missions,
   shop). No gameplay constants elsewhere.
2. All randomness goes through `core/Random.js` (seeded). Arenas, loot and shop
   stock are reproducible from a seed; `Arena.buildArena(config, seed)` is
   deterministic, and missions carry a fixed seed.
3. `Match.dispose()` disposes everything `Match` created (geometry, materials,
   HUD, listeners).
4. Collision is an explicit AABB list from `Arena.js` solved in `Physics.js`; no
   physics library.

**Persistence:** `src/save/SaveGame.js` stores one versioned profile in
localStorage (`dropzone.save.v1`). New profile fields go in `defaultProfile()`;
`withDefaults()` backfills them into old saves, and `migrate()` is the seam for a
`VERSION` bump. Ammo is pooled by type in `profile.ammo` and shared across weapons.

**Multiplayer (in progress):** only the transport layer exists, `src/net/Protocol.js`
(message types, room codes, quantised pack/unpack) and `src/net/Interpolator.js`.
Nothing is wired into the game, `vendor/peerjs/peerjs.min.js` is deliberately not
loaded by `index.html`, and single-player behaviour must stay unchanged when a
`net` option is eventually added to `Match`. The authority split and build order
are in `MULTIPLAYER_PLAN.md`.

## Docs to keep in sync

The controls table is duplicated in `README.md` and `HOW_TO_PLAY.md`; the
weapon, rarity, enemy and mission tables (numbers copied from `src/data/`) live in
`HOW_TO_PLAY.md` only. The lobby links to both files. When changing bindings in
`core/Input.js`, update both docs; when changing tuning in `src/data/`, update
the player guide.
