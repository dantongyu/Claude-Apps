# How to Play Dropzone

A first-person looter-shooter that runs in your browser. Take a loadout into a
mission, fight your way through, grab what you can — and get the job done, because
**if you go down, everything you found stays behind.**

No install, no account. If you can open a web page, you can play.

---

## 1. Starting the game

You need a local web server — browsers block the game's files if you open
`index.html` directly from your hard drive.

**macOS / Linux** (Python is already installed):

```bash
cd Claude-Apps
python3 -m http.server 8123
```

**Windows:**

```bash
cd Claude-Apps
py -m http.server 8123
```

Then open **http://127.0.0.1:8123/** in Chrome, Firefox, Edge, or Safari.

Leave the terminal window open while you play — closing it stops the server.

### Getting into a match

1. Click **DEPLOY** on the lobby screen
2. Choose a mission — start with **Cold Open**
3. Click **DROP IN** to begin

That last click matters: browsers only hand over your mouse when you click, so
the game waits for it. Press `Esc` any time to release the mouse and pause.

---

## 2. Controls

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

## 3. Reading your screen

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

## 4. The core loop

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

## 5. Weapons and rarity

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

## 6. Staying alive

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

## 7. Who you're fighting

| Enemy | Health | Behaviour |
|---|---|---|
| **Scav** | 70 | Standard trooper. Comes straight at you |
| **Runner** | 55 | Fast and aggressive, closes to point-blank. Weak — hit it first |
| **Brute** | 190 + 50 shield | Slow tank that hits hard. Bring a rifle or use cover |
| **Marksman** | 80 + 25 shield | Shoots from 70 metres. Break line of sight, then flank |

Enemies need to *see* you to shoot. Buildings and crates block their line of sight
completely — use them.

---

## 8. The missions

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

## 9. Between missions

**LOADOUT** — Your stash holds up to 40 items. Equip 5 to take in. Every weapon
shows its full stats, so you can compare before you commit. Selling returns 40% of
an item's value — a good way to clear out common junk.

**SHOP** — Stock rotates once a day and is the same for everyone that day. You can
buy each slot once. You can also buy ammo packs and colour skins here.

Ammo is worth checking on before every run — running dry mid-mission is the most
common way to lose one.

---

## 10. Tips for your first few runs

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

## 11. Troubleshooting

**Nothing loads / the page is blank**
You're probably opening the file directly. It must be served — see step 1.

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

## A note on saving

The game saves automatically after every mission and every purchase. Close the tab
whenever you like; your level, credits, and stash will be there when you come back.

Good hunting.
