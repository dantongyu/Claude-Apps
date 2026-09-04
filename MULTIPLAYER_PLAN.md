# Co-op Multiplayer — Design and Handoff

**Status:** transport layer written and tested; nothing is wired into the game yet.
Single-player is untouched and still works exactly as before.

This document exists so whoever picks this up does not have to re-derive the
decisions. Read it before writing code.

---

## Decisions already made (and why)

**Mode: co-op, not PvP.** 2–4 players drop into the *same existing mission* and
fight the bots together. Objectives and kill counts are shared; loot is per-player.
This reuses every mission, enemy, chest and objective already built. PvP would need
respawns, scoring, round timers and balance built around players — a much larger
build with none of the existing content applying.

**Transport: peer-to-peer over WebRTC (PeerJS), not a dedicated server.**
The game is hosted on GitHub Pages, which serves static files only and *cannot* run
a server process. P2P keeps that hosting free and unchanged: one player hosts, the
others join with a 4-character room code. PeerJS's public broker handles signalling,
so there is nothing to deploy, keep alive, or pay for.

The trade: a small fraction of strict corporate/university networks block direct
peer connections, and the public broker is a third-party dependency. If that becomes
a real problem, the fix is a TURN relay or moving to a hosted WebSocket server —
`NetSession` (below) is the only file that should need to change.

---

## Authority model

Deliberately split, because full host authority would need client-side prediction
and rollback — a large amount of work whose payoff is anti-cheat, which does not
matter among friends.

| State | Owner | Why |
|---|---|---|
| Your own position, aim, health, shield | **you** | Zero input lag on the thing you feel most. No prediction needed. |
| Bots: spawning, AI, health, death | **host** | One brain, so everyone fights the same fight. |
| Chests: who opened what | **host** | Prevents two players both looting the same chest. |
| Ground loot: who claimed what | **host** | Same reason. |
| Objective progress, mission end | **host** | One source of truth for "are we done". |
| Your inventory and stash | **you, locally** | Never sent. Loot is per-player, so it needs no agreement. |

**Anti-cheat is explicitly a non-goal.** A modified client could give itself health.
This is a game you play with friends over a shared link.

### The map needs no syncing at all

`Arena.buildArena(config, seed)` is fully deterministic and every mission carries a
fixed `seed`. All peers build a byte-identical map, including chest positions, from
the mission id alone. **Do not send geometry.** The same is true of loot rolls —
`Random.js` is seeded — though loot *outcomes* are still sent, because each peer
consumes its RNG at different rates once play begins.

---

## What is already built

| File | What it does | Tested |
|---|---|---|
| `src/net/Protocol.js` | Message types, room codes, and pack/unpack for players, bots and snapshots. Positions quantised to 1cm and angles to ~0.06°, which roughly halves snapshot size. | 10 tests |
| `src/net/Interpolator.js` | Snapshot buffer. Renders remote entities 120ms in the past and blends between the two bracketing snapshots, so 15Hz updates look smooth at 60fps. Handles angle wrap and out-of-order arrivals. | 8 tests |
| `vendor/peerjs/peerjs.min.js` | PeerJS 1.5.4, committed like three.js so there is still no install step. Exposes `window.Peer`. | — |
| `tests/net.test.js` | The 18 tests above. Run with `python3 tests/run.py`. | — |

A full 4-player, 8-bot snapshot serialises to **under 1400 bytes**, so ~15Hz is
comfortable.

---

## What is left to build

Ordered so each step is verifiable before the next.

### 1. `src/net/NetSession.js` — the only file that touches PeerJS

Wrap it so the rest of the game never imports PeerJS directly; that is what keeps
the WebSocket escape hatch cheap.

```js
class NetSession {
  static async host(name)          // picks a free room code, returns a session
  static async join(code, name)    // connects to a host
  get isHost, get isClient, get players, get roomCode
  send(type, payload)              // client -> host, or host -> all
  sendTo(peerId, type, payload)    // host -> one client
  on(type, handler)                // returns an unsubscribe function
  leave()
}
```

Requirements:
- Host claims peer id `peerIdForRoom(code)`. **If the id is taken, generate a new
  code and retry** (up to ~5 times) — the broker is shared with every other PeerJS
  app on the internet, which is exactly why ids are namespaced.
- Heartbeat every ~2s; drop a peer after ~8s of silence and tell everyone.
- Handle `close` and `error` on every connection. A host disconnect must end the
  mission cleanly for clients, not freeze them. **Host migration is out of scope** —
  say "host left" and return everyone to their own lobby.
- Add `<script src="./vendor/peerjs/peerjs.min.js"></script>` to `index.html`
  *before* the module script. It is deliberately not there yet, so the 92KB is not
  loaded for players who never touch multiplayer.

### 2. `src/ui/screens/MultiplayerScreen.js` + a lobby entry point

HOST / JOIN buttons, the room code shown large and copyable, a player list, and a
DEPLOY button only the host can press. Add a `State.MULTIPLAYER` to
`core/GameState.js` and a button on the lobby next to DEPLOY.

### 3. `src/game/RemotePlayer.js`

The visual body of another player: reuse the box-figure approach from `Enemy.js`,
tinted with that player's skin colour, plus a floating name tag. Drive its position
and yaw purely from `Interpolator.sample()` — **never** run physics on it.

### 4. Wire into `Match.js`

`Match` takes an optional `net` (null = single-player, and that path must stay
byte-identical in behaviour). Branch on `net.isHost`:

- **Host:** runs `_spawnTick` and all `Enemy.update` as today, and broadcasts a
  snapshot at 15Hz.
- **Client:** does *not* spawn or tick bots. It creates/removes `Enemy` objects to
  match the snapshot and drives their transforms from the interpolator. It sends its
  own state at 15Hz.

Shooting stays client-side for responsiveness: you raycast against your local copy
of the bots, then send `ENEMY_HIT {enemyId, damage, isHead}`. The host applies the
damage and the resulting health arrives in the next snapshot. **The host must
validate** that the enemy exists and is alive, or two players killing the same bot
will double-count the objective.

### 5. Shared chests, loot and objectives

Chests and pickups become host-owned: clients *request* (`CHEST_OPEN`, `LOOT_TAKE`)
and act only on the host's confirmation (`CHEST_DONE`, `LOOT_GONE`). This is the
subtle part — pick up the optimism carefully, because showing loot the host then
denies you feels far worse than a 60ms delay.

Objective progress comes from the snapshot; clients should stop counting locally.

### 6. Results

Everyone gets the mission outcome from the host, but rewards and extracted loot stay
per-player and local — `_finishMatch` in `main.js` already does the right thing and
should need no changes.

---

## Testing this

The pure logic (`Protocol`, `Interpolator`, and any new pure helpers) is testable
headlessly — add to `tests/net.test.js` and keep `python3 tests/run.py` green.

**The netcode itself can only be tested live**, with two browser windows on the same
machine to start, and then two different machines on different networks — which is
the only way NAT traversal problems show up. Expect to spend real time here; this is
the part that cannot be desk-checked.

Watch for:
- Two players opening one chest simultaneously
- A client shooting a bot the host has already killed
- The host leaving mid-mission
- A player joining while a mission is already running (simplest correct answer:
  refuse, and make them wait in the lobby)
