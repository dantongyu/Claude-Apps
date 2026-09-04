# How to Play Dropzone

A first-person looter-shooter that runs in your browser. Take a loadout into a
mission, fight your way through, grab what you can — and get the job done, because
**if you go down, everything you found stays behind.**

No install, no account. If you can open a web page, you can play — alone, or with
up to three friends in the same mission (section 11).

---

## 1. Getting the game

There are three ways in. **Pick the first one that applies to you.**

### Option A — Play online (easiest, nothing to install)

If the repo owner has turned on GitHub Pages, the game is already live:

**https://dantongyu.github.io/Claude-Apps/**

Click it and play. No download, no terminal, nothing to set up. Works on any
modern browser — Chrome, Firefox, Edge, or Safari.

*(Owner: see "Publishing the game" at the bottom of this file to switch this on.
It takes about a minute and is free for public repos.)*

### Option B — Download and run it yourself (no Git needed)

1. Go to **https://github.com/dantongyu/Claude-Apps**
2. Click the green **Code** button → **Download ZIP**
3. Unzip it — you'll get a folder called `Claude-Apps-main`
4. Open a terminal in that folder and start a small web server:

   **macOS / Linux** (Python is already installed):
   ```bash
   cd path/to/Claude-Apps-main
   python3 -m http.server 8123
   ```

   **Windows** (Python from [python.org](https://www.python.org/downloads/)):
   ```bash
   cd path\to\Claude-Apps-main
   py -m http.server 8123
   ```

5. Open **http://127.0.0.1:8123/** in your browser

Leave the terminal window open while you play — closing it stops the server.

> **Why can't I just double-click `index.html`?**
> Browsers block pages opened straight from your hard drive from loading their own
> code files, for security reasons. The page will come up blank. It has to be
> *served*, which is all the command above does. Nothing gets installed and nothing
> is sent anywhere — the server runs on your own machine and is only reachable
> from it.

**No terminal at all?** If you use VS Code, install the **Live Server** extension,
right-click `index.html`, and choose *Open with Live Server*. Same result.

### Option C — Clone it (for developers)

```bash
git clone https://github.com/dantongyu/Claude-Apps.git
cd Claude-Apps
python3 -m http.server 8123
```

Everything is committed, including three.js — there is no `npm install`, no build
step, and no dependencies to fetch.

---

## 2. Your first match

1. Click **DEPLOY** on the lobby screen
2. Choose a mission — start with **Cold Open**
3. Click **DROP IN** to begin

That last click matters: browsers only hand over your mouse when you click, so
the game waits for it. Press `Esc` any time to release the mouse and pause.

---

## 3. Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint |
| `Space` | Jump |
| `Ctrl` or `C` | Crouch |
| **Mouse** | Look around |
| **Left click** | Fire (hold for automatic weapons) |
| `R` | Reload |
| `E` | Open a chest you're standing next to |
| `F` | **Hold** to use a bandage or shield |
| `G` | Drop whatever you're holding |
| `1` – `5` | Select a backpack slot |
| **Scroll wheel** | Cycle through your items |
| `Esc` | Pause, settings, or abandon the mission |

Mouse sensitivity, field of view, and inverted look are all in the pause menu
(`Esc`). Your settings save automatically.

---

## 4. Reading your screen

| Where | What it tells you |
|---|---|
| **Bottom left** | Your health (green) and shield (blue) |
| **Bottom right** | Rounds in your magazine / rounds in reserve |
| **Bottom centre** | Your 5 backpack slots — the highlighted one is in your hands |
| **Top right** | Mission objectives and your progress |
| **Centre** | Crosshair. It flashes an X when you hit someone — **red for a headshot** |
| **Screen edge** | A red arc points toward whoever just shot you |

Loot on the ground shows as a **coloured beam of light**. The colour tells you how
good it is before you walk over.

---

## 5. The core loop

### You carry 5 items in

Pick them in **LOADOUT** from the lobby. Weapons, bandages, shields — five slots
total, your choice. You start with a Sidearm, a Ripper SMG, and 3 bandages.

### You find more inside

**Chests** are the gold boxes — walk up and press `E`. They hold the best loot in
the game and always drop a healthy pile of ammo. Enemies drop ammo when they die,
and sometimes something better.

Loot is picked up automatically when you walk over it, as long as you have a free
slot. If your backpack is full, drop something with `G` first.

### Only winners keep it

**Complete every objective and your entire backpack comes home to your stash.**

**Go down and you lose everything you found** — you keep only what you carried in.

That's the whole game in one sentence. A legendary sniper is worth nothing if you
die holding it.

### Then you get paid

You earn credits and XP either way — the full reward for a completed mission, and
about a quarter of it if you're taken out. Kills and chests pay a bonus on top
(12 credits per kill, 15 per chest), so a failed run is never a total loss.

Spend credits in the **SHOP**, level up to unlock harder missions.

---

## 6. Weapons and rarity

Every weapon comes in five rarities. **The same gun gets dramatically better as the
rarity goes up:**

| Rarity | Colour | Damage | Magazine | How often it drops |
|---|---|---|---|---|
| Common | Grey | — | — | Very often |
| Uncommon | Green | +15% | +10% | Often |
| Rare | Blue | +32% | +20% | Sometimes |
| Epic | Purple | +52% | +35% | Rarely |
| Legendary | Gold | **+75%** | **+50%** | Very rarely |

A legendary Vector AR hits for 45.5 per shot where the common version does 26. Always
pick up the better colour.

### The seven weapons

Numbers shown are for **Common** rarity — they scale up with the table above.

| Weapon | Type | Damage | Rate | Mag | Best range | Ammo |
|---|---|---|---|---|---|---|
| **Sidearm** | Pistol | 22 | 5.5/s | 12 | Close | Light |
| **Ripper SMG** | SMG | 15 | 11/s | 26 | Close | Light |
| **Breacher** | Shotgun | 11 ×9 pellets | 1.1/s | 5 | Point blank | Shells |
| **Vector AR** | Assault Rifle | 26 | 7/s | 30 | Medium | Medium |
| **Tri-Burst** | Assault Rifle | 30 | 3-round burst | 24 | Medium | Medium |
| **Sustainer LMG** | LMG | 24 | 9/s | 60 | Medium | Heavy |
| **Longshot** | Sniper | 96 | 0.7/s | 5 | Very long | Heavy |

**Ammo is shared by type.** Two light-ammo weapons draw from the same pool, so
carrying a Sidearm *and* a Ripper SMG means they compete for the same bullets.
Mixing ammo types is usually smarter.

### Two rules that decide most fights

**1. Standing still is far more accurate.** Your bullets spread when you move, and
spread worst of all mid-air. Stop moving for the shot — especially with a sniper,
which is nearly useless while running.

**2. Aim for the head.** Headshots multiply your damage: 1.5× for the SMG and
shotgun, 1.9× for the Vector AR, and **2.5× for the Longshot** — enough to drop most
enemies in a single round.

Damage also drops off beyond a weapon's effective range. A shotgun past 9 metres
barely scratches; a sniper stays lethal to 140.

---

## 7. Staying alive

You have **100 health**. Shield stacks on top of it up to another 100, and always
takes damage first — think of it as a second health bar you have to buy.

| Item | Restores | Time | Notes |
|---|---|---|---|
| **Bandage** | +18 health | 1.4s | Only heals you to 75 — can't finish the job |
| **Medkit** | Full health | 3.2s | Slow. Find cover first |
| **Small Shield** | +25 shield | 1.6s | Only up to 50 shield |
| **Shield Potion** | +50 shield | 3.0s | Takes you to the full 100 |

Hold `F` to use one — it doesn't happen instantly, and you're helpless while it
runs. Break line of sight before you start.

---

## 8. Who you're fighting

| Enemy | Health | Behaviour |
|---|---|---|
| **Scav** | 70 | Standard trooper. Comes straight at you |
| **Runner** | 55 | Fast and aggressive, closes to point-blank. Weak — hit it first |
| **Brute** | 190 + 50 shield | Slow tank that hits hard. Bring a rifle or use cover |
| **Marksman** | 80 + 25 shield | Shoots from 70 metres. Break line of sight, then flank |

Enemies need to *see* you to shoot. Buildings and crates block their line of sight
completely — use them.

---

## 9. The missions

| Mission | Unlocks at | Objective | Reward |
|---|---|---|---|
| **Cold Open** | Level 1 | Eliminate 8 | 220 cr · 120 XP |
| **Supply Sweep** | Level 1 | Open 6 chests, eliminate 6 | 340 cr · 180 XP |
| **Hold the Yard** | Level 3 | Survive 150 seconds | 520 cr · 300 XP |
| **Long Sightlines** | Level 5 | Eliminate 16, open 4 chests | 700 cr · 420 XP |
| **Heavy Contact** | Level 8 | Eliminate 20 | 950 cr · 620 XP |
| **Last Transport** | Level 12 | Open 8 chests, eliminate 14, then extract | 1,400 cr · 900 XP |

**Last Transport** works differently: the green **extraction pad** stays hidden until
every other objective is finished. Once it appears, run to it to end the mission.

Each mission always generates the same map, so you can learn the layout.

---

## 10. Between missions

**LOADOUT** — Your stash holds up to 40 items. Equip 5 to take in. Every weapon
shows its full stats, so you can compare before you commit. Selling returns 40% of
an item's value — a good way to clear out common junk.

**SHOP** — Stock rotates once a day and is the same for everyone that day. You can
buy each slot once. You can also buy ammo packs and colour skins here.

Ammo is worth checking on before every run — running dry mid-mission is the most
common way to lose one.

---

## 11. Playing with friends (co-op)

Up to **4 players** drop into the same mission and fight the bots together.
Objectives and kills are shared; **loot is per player** — what you pick up is
yours, and the usual rule applies: go down and you lose it.

It is peer-to-peer. There is no server to run, no account, nothing to install
beyond what you already did to play solo. One player **hosts** and gets a
4-letter room code; everyone else **joins** with that code.

### Setting it up so friends can play

Every player just needs the game open in their own browser, on their own
computer. Three ways to get it in front of them — use the first that fits:

**1. Everyone opens the public link (easiest)**

Send your friends **https://dantongyu.github.io/Claude-Apps/**. That is it.
Any modern browser on any computer, anywhere in the world. (Repo owner: this
needs GitHub Pages switched on — see "Publishing the game" at the bottom.)

**2. Your own copy, on GitHub Pages**

If you have forked or changed the game, publish your fork the same way (Settings
→ Pages → `main` / root). Then send friends *your* Pages link. Everyone must be
on the **same build** — a host and a joiner running different versions are
refused with a "version mismatch" message.

**3. Same room or same Wi‑Fi, no internet hosting needed**

Run the local server from Option B in section 1 on one computer:

```bash
python3 -m http.server 8123
```

Find that computer's address on the network (macOS: System Settings → Wi‑Fi →
Details; Windows: `ipconfig`, look for IPv4; Linux: `hostname -I`) — say
`192.168.1.20`. Friends on the same Wi‑Fi open
**http://192.168.1.20:8123/** in their browser. You still need internet access
for the brief moment players connect (the room code is matched through a small
public directory service), but the game itself then runs directly between your
machines.

> Downloading the ZIP and double-clicking `index.html` does **not** work for
> co-op either — the page has to be served, exactly as in section 1.

### Hosting a room

1. In the lobby click **CO-OP**.
2. Set your **callsign** (the name your squad sees over your head).
3. Click **HOST A ROOM**. A 4-letter code appears, big — read it out or hit
   **COPY CODE** and paste it to your friends.
4. Watch the squad list fill up. When everyone is in, pick a mission and click
   **DEPLOY SQUAD**. Everyone deploys at once.

Stay on the co-op screen while friends join. If you go back to the lobby the
room closes and everyone in it is sent home.

### Joining a room

1. Make sure you have a **weapon equipped** in LOADOUT — you cannot deploy
   without one, and the host will not wait.
2. Lobby → **CO-OP** → type the code under **JOIN A ROOM** → **JOIN**.
3. Wait for the host to pick a mission. You are dropped in automatically.

### In the mission

- Teammates show as coloured figures with a name tag (their shop skin colour).
- Bots, chests and floor loot are run by the host. If two of you reach the same
  item, whoever the host hears from first gets it — the other sees it vanish.
- The kill feed names who eliminated what. Only your own kills and chests count
  toward your credits.
- **Going down** puts you in spectator mode where you fell: you can look around
  but not move. The mission continues for the others and ends when the
  objectives are done or nobody is left standing. Your own result is a wipe
  either way — mission loot lost, partial pay — exactly as in solo.
- After the results screen, **CONTINUE** returns the whole squad to the room so
  the host can go again.
- Nobody can join a mission already in progress; they wait in the room for the
  next one.

### Co-op troubleshooting

**"No room with that code"** — Check the code (there are no O/0, I/1 or S/5 in
codes). The host must still be on the co-op screen: leaving it closes the room.

**"Version mismatch"** — You are on different builds. Everyone should open the
same link, and reload if it was open in an old tab.

**It connects, then nothing happens / "The host left"** — Some office, school
and university networks block direct peer connections. Try a phone hotspot for
whichever player is on the strict network. Home Wi‑Fi almost always works.

**Teammates stutter or teleport** — Normal on a poor connection. Bots and
teammates are shown a fraction of a second in the past to smooth this over; if
someone's connection is very bad it will still show.

**The host's Esc menu doesn't pause the bots** — Intended. The host runs the
world for everyone, so it keeps going while a menu is open.

---

## 12. Tips for your first few runs

- **Run Cold Open twice** before anything else. The first run teaches the controls,
  the second builds your stash.
- **Open every chest you pass.** Chest loot rolls better than anything on the
  ground, and the ammo alone pays for the detour.
- **Don't hoard consumables.** A shield potion in your backpack when you die is a
  shield potion you gave away.
- **Use the rooftops.** Every building has stairs up one side. Height beats numbers.
- **Stop before you shoot.** The single biggest accuracy gain available to you.
- **Bring two ammo types.** Two light weapons will leave you dry halfway through.
- **A wipe isn't a disaster.** You still get paid, and you keep your loadout. Cash
  out and try again.

---

## 13. Troubleshooting

**Nothing loads / the page is blank**
You opened `index.html` directly instead of serving it. See Option B in section 1
— or just use the online link in Option A.

**The mouse won't lock**
Click the **DROP IN** button rather than the background. Some browsers block
pointer lock in private/incognito windows.

**It's running slowly**
Lower the field of view in the pause menu, and close other browser tabs. The game
needs WebGL, which is on by default in every modern browser.

**I lost all my progress**
Progress lives in your browser's local storage for this site. Clearing browsing
data, or switching browsers or devices, starts you fresh. It's per-browser, not
per-account.

**I want to start over**
Open your browser's developer console (`F12`) and run:
`localStorage.removeItem('dropzone.save.v1')` — then reload.

---

## Publishing the game (for the repo owner)

Your repo is public and the game is plain static files, so **GitHub Pages will host
it for free** — then sharing is just a link, and nobody needs Python or a terminal.

1. Go to your repo on GitHub → **Settings** → **Pages** (left sidebar)
2. Under **Source**, choose **Deploy from a branch**
3. Set the branch to **`main`** and the folder to **`/ (root)`**
4. Click **Save**

Wait about a minute, then your game is live at:

**https://dantongyu.github.io/Claude-Apps/**

Every push to `main` republishes it automatically.

The repo includes an empty **`.nojekyll`** file at the root. Do not delete it:
GitHub Pages runs Jekyll by default, and Jekyll silently excludes `vendor/` from
the published site — which is exactly where three.js lives. Without that file the
page loads but the game never starts. Once it's up, point people at
that link instead of the repo — Option A above becomes the only instruction most
of them need.

---

## A note on saving

The game saves automatically after every mission and every purchase. Close the tab
whenever you like; your level, credits, and stash will be there when you come back.

Good hunting.
