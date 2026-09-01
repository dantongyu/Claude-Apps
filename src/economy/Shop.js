import { Random, hashString } from '../core/Random.js';
import { SHOP_POOL, AMMO_PACKS, SKINS, SHOP_SLOTS } from '../data/shop.js';
import { weaponStats, CONSUMABLES } from '../data/weapons.js';
import { makeWeapon, makeConsumable } from '../inventory/Item.js';
import { addToStash, stashFull } from '../inventory/Stash.js';
import { spend } from './Wallet.js';

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Stock is derived from the date, so it is stable all day and rotates overnight.
export function generateStock(dayKey) {
  const rng = new Random(hashString(`shop:${dayKey}`));
  const pool = rng.shuffle(SHOP_POOL).slice(0, SHOP_SLOTS);
  return pool.map((entry, i) => {
    const rarity = rng.pick(entry.rarities);
    const price = entry.kind === 'weapon'
      ? weaponStats(entry.itemId, rarity).price
      : CONSUMABLES[entry.itemId].price * 3;
    const count = entry.kind === 'weapon' ? 1 : 3;
    return {
      slot: i,
      kind: entry.kind,
      itemId: entry.itemId,
      rarity,
      count,
      price: Math.round(price * rng.range(0.9, 1.1)),
    };
  });
}

// Refreshes the profile's cached stock when the day rolls over.
export function ensureStock(profile, date = new Date()) {
  const day = todayKey(date);
  if (profile.shop.day !== day) {
    profile.shop.day = day;
    profile.shop.stock = generateStock(day);
    profile.shop.bought = [];
  }
  return profile.shop.stock;
}

export function isBought(profile, slot) {
  return profile.shop.bought.includes(slot);
}

// Returns { ok, reason }. Validates funds, stash space and one-per-day limits.
export function buyStockItem(profile, slot) {
  const entry = profile.shop.stock.find((s) => s.slot === slot);
  if (!entry) return { ok: false, reason: 'gone' };
  if (isBought(profile, slot)) return { ok: false, reason: 'sold out' };
  if (stashFull(profile)) return { ok: false, reason: 'stash full' };
  if (!spend(profile, entry.price)) return { ok: false, reason: 'not enough credits' };

  const item = entry.kind === 'weapon'
    ? makeWeapon(entry.itemId, entry.rarity)
    : makeConsumable(entry.itemId, entry.count);
  addToStash(profile, item);
  profile.shop.bought.push(slot);
  return { ok: true, item };
}

export function buyAmmo(profile, ammoType) {
  const pack = AMMO_PACKS.find((p) => p.ammo === ammoType);
  if (!pack) return { ok: false, reason: 'gone' };
  if (!spend(profile, pack.price)) return { ok: false, reason: 'not enough credits' };
  profile.ammo[pack.ammo] = (profile.ammo[pack.ammo] ?? 0) + pack.amount;
  return { ok: true, amount: pack.amount };
}

export function buySkin(profile, skinId) {
  const skin = SKINS.find((s) => s.id === skinId);
  if (!skin) return { ok: false, reason: 'gone' };
  if (profile.skins.includes(skinId)) return { ok: false, reason: 'owned' };
  if (!spend(profile, skin.price)) return { ok: false, reason: 'not enough credits' };
  profile.skins.push(skinId);
  return { ok: true };
}

export function activeSkinColor(profile) {
  return SKINS.find((s) => s.id === profile.activeSkin)?.color ?? SKINS[0].color;
}
