// Pure-logic test suite. Runs without a browser or DOM: the runner concatenates
// the non-Three modules and evaluates this file against them.
//   npm-less usage:  python3 tests/run.py
const T = [];
function test(name, fn) { T.push([name, fn]); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ?? 'expected'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}
function ok(v, msg) { if (!v) throw new Error(msg ?? 'expected truthy'); }
function close(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg ?? 'expected'}: ${a} !~ ${b}`);
}

// ---------------------------------------------------------------- combat

test('rarity multiplies weapon damage', () => {
  const common = weaponStats('rifle', 'common');
  const legendary = weaponStats('rifle', 'legendary');
  ok(legendary.damage > common.damage, 'legendary should out-damage common');
  close(legendary.damage / common.damage, 1.75, 0.001, 'legendary multiplier');
  ok(legendary.magazine > common.magazine, 'legendary holds more rounds');
});

test('damage falls off past effective range', () => {
  const s = weaponStats('rifle', 'common');
  eq(rangeMultiplier(s, s.range), 1, 'full damage at range');
  eq(rangeMultiplier(s, s.range * 0.5), 1, 'full damage inside range');
  close(rangeMultiplier(s, s.range * 2), s.falloff, 1e-9, 'falloff at 2x range');
  close(rangeMultiplier(s, s.range * 4), s.falloff, 1e-9, 'falloff floors out');
});

test('headshots apply the weapon multiplier', () => {
  const s = weaponStats('sniper', 'common');
  const body = computeDamage(s, 10, false);
  const head = computeDamage(s, 10, true);
  close(head / body, s.headshot, 1e-9, 'headshot multiplier');
});

test('shield absorbs before health', () => {
  const target = { health: 100, shield: 30 };
  const r1 = applyDamage(target, 20);
  eq(r1.toShield, 20); eq(r1.toHealth, 0); eq(target.shield, 10);
  const r2 = applyDamage(target, 40);
  eq(r2.toShield, 10); eq(r2.toHealth, 30); eq(target.health, 70);
  eq(r2.killed, false);
  const r3 = applyDamage(target, 999);
  ok(r3.killed, 'lethal damage kills');
  eq(target.health, 0);
});

test('spread widens while moving and in the air', () => {
  const s = weaponStats('rifle', 'common');
  const still = currentSpread(s, 0, 7.8, false);
  const moving = currentSpread(s, 7.8, 7.8, false);
  const airborne = currentSpread(s, 7.8, 7.8, true);
  eq(still, s.spread, 'standing still is base spread');
  ok(moving > still, 'moving is less accurate');
  ok(airborne > moving, 'jumping is worst');
});

// ---------------------------------------------------------------- loot

test('rarity rolls follow the weight curve', () => {
  const rng = new Random(1234);
  const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < 10000; i++) counts[rollRarity(rng, 0)]++;
  ok(counts.common > counts.uncommon, 'common beats uncommon');
  ok(counts.uncommon > counts.rare, 'uncommon beats rare');
  ok(counts.rare > counts.epic, 'rare beats epic');
  ok(counts.epic > counts.legendary, 'epic beats legendary');
  close(counts.common / 10000, 0.44, 0.03, 'common share');
  close(counts.legendary / 10000, 0.03, 0.015, 'legendary share');
});

test('luck shifts rolls toward higher rarities', () => {
  const roll = (luck) => {
    const rng = new Random(99);
    let good = 0;
    for (let i = 0; i < 6000; i++) {
      const r = rollRarity(rng, luck);
      if (r === 'epic' || r === 'legendary') good++;
    }
    return good;
  };
  ok(roll(0.6) > roll(0), 'luck produces more high-tier loot');
});

test('seeded rolls are reproducible', () => {
  const a = new Random(4471);
  const b = new Random(4471);
  for (let i = 0; i < 50; i++) eq(rollRarity(a, 0.2), rollRarity(b, 0.2), `roll ${i}`);
});

// ---------------------------------------------------------------- inventory

test('backpack holds five items and then refuses', () => {
  const inv = new Inventory();
  for (let i = 0; i < 5; i++) ok(inv.add(makeWeapon('pistol', 'common')).ok, `item ${i}`);
  ok(inv.isFull(), 'full after five');
  eq(inv.add(makeWeapon('rifle', 'common')).ok, false, 'sixth is refused');
});

test('consumables stack up to their cap', () => {
  const inv = new Inventory();
  inv.add(makeConsumable('bandage', 3));
  inv.add(makeConsumable('bandage', 2));
  eq(inv.items().length, 1, 'stacked into one slot');
  eq(inv.slots[0].count, 5, 'counts merged');
  inv.add(makeConsumable('bandage', 2)); // cap is 5, overflow needs a new slot
  eq(inv.items().length, 2, 'overflow takes a second slot');
  eq(inv.slots[1].count, 2);
});

test('ammo pools add and draw down', () => {
  const inv = new Inventory([], { medium: 30 });
  eq(inv.takeAmmo('medium', 50), 30, 'cannot take more than reserve');
  eq(inv.ammo.medium, 0);
  inv.addAmmo('medium', 45);
  eq(inv.takeAmmo('medium', 20), 20);
  eq(inv.ammo.medium, 25);
});

test('slot cycling skips empty slots', () => {
  const inv = new Inventory();
  inv.slots[0] = makeWeapon('pistol', 'common');
  inv.slots[3] = makeWeapon('rifle', 'rare');
  inv.select(0);
  inv.cycle(1);
  eq(inv.active, 3, 'jumps to the next filled slot');
  inv.cycle(1);
  eq(inv.active, 0, 'wraps around');
});

test('consuming a stack clears the slot at zero', () => {
  const inv = new Inventory([makeConsumable('medkit', 2)]);
  inv.consumeAt(0);
  eq(inv.slots[0].count, 1);
  inv.consumeAt(0);
  eq(inv.slots[0], null, 'empty stack frees the slot');
});

// ---------------------------------------------------------------- stash

test('loadout caps at five and prunes sold items', () => {
  const p = defaultProfile();
  p.stash = [];
  p.loadout = [];
  const items = [];
  for (let i = 0; i < 6; i++) {
    const it = makeWeapon('smg', 'common');
    items.push(it);
    addToStash(p, it);
  }
  for (let i = 0; i < 5; i++) ok(toggleLoadout(p, items[i].uid).equipped, `equip ${i}`);
  eq(toggleLoadout(p, items[5].uid).reason, 'full', 'sixth is refused');
  removeFromStash(p, items[0].uid);
  eq(p.loadout.length, 4, 'selling an item unequips it');
  pruneLoadout(p);
  eq(p.loadout.every((uid) => p.stash.some((i) => i.uid === uid)), true, 'no dangling uids');
});

test('unequipping frees a loadout slot', () => {
  const p = defaultProfile();
  const uid = p.stash[0].uid;
  ok(p.loadout.includes(uid));
  toggleLoadout(p, uid);
  ok(!p.loadout.includes(uid), 'toggled off');
  toggleLoadout(p, uid);
  ok(p.loadout.includes(uid), 'toggled back on');
});

// ---------------------------------------------------------------- economy

test('xp curve levels up and carries the remainder', () => {
  const p = defaultProfile();
  eq(p.level, 1);
  const need = xpForLevel(1);
  const levels = grantXp(p, need + 10);
  eq(levels, 1, 'one level gained');
  eq(p.level, 2);
  eq(p.xp, 10, 'remainder carries over');
  ok(xpForLevel(5) > xpForLevel(1), 'later levels cost more');
});

test('shop stock is stable per day and rotates across days', () => {
  const a = generateStock('2026-9-1');
  const b = generateStock('2026-9-1');
  const c = generateStock('2026-9-2');
  eq(JSON.stringify(a.map((x) => [x.itemId, x.rarity, x.price])),
     JSON.stringify(b.map((x) => [x.itemId, x.rarity, x.price])), 'same day is identical');
  ok(JSON.stringify(a) !== JSON.stringify(c), 'next day differs');
  eq(a.length, SHOP_SLOTS);
});

test('buying validates funds and marks the slot sold', () => {
  const p = defaultProfile();
  ensureStock(p, new Date('2026-09-01T12:00:00'));
  const entry = p.shop.stock[0];

  p.credits = entry.price - 1;
  const poor = buyStockItem(p, entry.slot);
  eq(poor.ok, false); eq(poor.reason, 'not enough credits');

  p.credits = entry.price + 100;
  const before = p.stash.length;
  const good = buyStockItem(p, entry.slot);
  ok(good.ok, 'purchase succeeds');
  eq(p.credits, 100, 'credits deducted');
  ok(p.stash.length > before || p.stash.some((i) => i.itemId === entry.itemId), 'item reached the stash');
  eq(buyStockItem(p, entry.slot).reason, 'sold out', 'one purchase per slot');
});

test('ammo packs and skins deduct credits', () => {
  const p = defaultProfile();
  p.credits = 10000;
  const before = p.ammo.light;
  ok(buyAmmo(p, 'light').ok);
  ok(p.ammo.light > before, 'ammo added');
  ok(buySkin(p, 'ember').ok);
  ok(p.skins.includes('ember'));
  eq(buySkin(p, 'ember').reason, 'owned', 'cannot rebuy a skin');
});

// ---------------------------------------------------------------- save

test('profile round-trips through storage', () => {
  const p = defaultProfile();
  p.credits = 4242;
  p.level = 7;
  ok(saveProfile(p), 'saved');
  const loaded = loadProfile();
  eq(loaded.credits, 4242);
  eq(loaded.level, 7);
  eq(loaded.stash.length, p.stash.length);
});

test('an unknown save version is migrated, not discarded', () => {
  localStorage.setItem('dropzone.save.v1', JSON.stringify({
    version: 0, credits: 999, level: 4,
  }));
  const loaded = loadProfile();
  eq(loaded.version, 1, 'bumped to current version');
  eq(loaded.credits, 999, 'kept what still made sense');
  eq(loaded.level, 4);
  ok(loaded.ammo && typeof loaded.ammo.light === 'number', 'missing fields defaulted');
  ok(Array.isArray(loaded.stash), 'stash defaulted');
});

test('corrupt storage falls back to a fresh profile', () => {
  localStorage.setItem('dropzone.save.v1', '{not json');
  const loaded = loadProfile();
  eq(loaded.level, 1);
  eq(loaded.credits, 500);
});

// ---------------------------------------------------------------- objectives

test('eliminate and chest objectives complete a mission', () => {
  const obj = new Objectives({
    objectives: [
      { type: 'eliminate', count: 3, label: 'Kill' },
      { type: 'chests', count: 2, label: 'Loot' },
    ],
  });
  obj.onKill(); obj.onKill();
  eq(obj.complete, false, 'not done yet');
  obj.onKill();
  obj.onChestOpened();
  eq(obj.complete, false);
  obj.onChestOpened();
  eq(obj.complete, true, 'all objectives met');
});

test('survive objectives tick down with time', () => {
  const obj = new Objectives({ objectives: [{ type: 'survive', count: 5, label: 'Hold' }] });
  for (let i = 0; i < 4; i++) obj.tick(1, false);
  eq(obj.complete, false);
  obj.tick(1.5, false);
  eq(obj.complete, true);
});

test('extraction stays locked until everything else is done', () => {
  const obj = new Objectives({
    objectives: [
      { type: 'eliminate', count: 1, label: 'Kill' },
      { type: 'extract', count: 1, label: 'Extract' },
    ],
  });
  eq(obj.extractUnlocked, false, 'locked at the start');
  obj.tick(0.1, true); // standing on the pad early does nothing
  eq(obj.complete, false, 'cannot extract early');
  obj.onKill();
  eq(obj.extractUnlocked, true, 'unlocks once the rest is done');
  obj.tick(0.1, true);
  eq(obj.complete, true, 'extraction completes the mission');
});

test('objective view reports progress for the HUD', () => {
  const obj = new Objectives({ objectives: [{ type: 'eliminate', count: 4, label: 'Kill' }] });
  obj.onKill();
  const v = obj.view()[0];
  eq(v.text, '1/4');
  close(v.pct, 0.25, 1e-9);
  eq(v.done, false);
});

// ---------------------------------------------------------------- runner

// ---------------------------------------------------------------- emitter

test('emitter forwards extra arguments and unsubscribes', () => {
  const em = new Emitter();
  const seen = [];
  const off = em.on('x', (a, b) => seen.push([a, b]));
  em.emit('x', 1, 'peer-7');
  off();
  em.emit('x', 2, 'peer-8');
  eq(seen.length, 1, 'handler removed by the returned unsubscribe');
  eq(seen[0][1], 'peer-7', 'second argument reaches the handler');
});

let pass = 0;
const failures = [];
for (const [name, fn] of T) {
  try { fn(); pass++; RESULTS.push('ok   ' + name); }
  catch (e) { failures.push(name); RESULTS.push('FAIL ' + name + '\n       ' + e.message); }
}
RESULTS.push('');
RESULTS.push(pass + '/' + T.length + ' tests passed');
if (failures.length) RESULTS.push('failed: ' + failures.join(', '));
