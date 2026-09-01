import { WEAPONS, CONSUMABLES, weaponStats } from '../data/weapons.js';
import { rarityOf } from '../data/rarities.js';

let _uid = 1;
export function newUid() {
  return `i${Date.now().toString(36)}${(_uid++).toString(36)}`;
}

// An inventory item is always this shape:
//   { uid, kind: 'weapon'|'consumable', itemId, rarity, count, ammoInMag }
export function makeWeapon(itemId, rarity = 'common') {
  const stats = weaponStats(itemId, rarity);
  return {
    uid: newUid(), kind: 'weapon', itemId, rarity,
    count: 1, ammoInMag: stats.magazine,
  };
}

export function makeConsumable(itemId, count = 1) {
  return { uid: newUid(), kind: 'consumable', itemId, rarity: 'common', count };
}

export function itemDef(item) {
  return item.kind === 'weapon' ? WEAPONS[item.itemId] : CONSUMABLES[item.itemId];
}

export function itemName(item) {
  const def = itemDef(item);
  if (!def) return 'Unknown';
  if (item.kind !== 'weapon') return def.name;
  return `${rarityOf(item.rarity).name} ${def.name}`;
}

export function itemColor(item) {
  return rarityOf(item.rarity).color;
}

export function itemValue(item) {
  if (item.kind === 'weapon') return weaponStats(item.itemId, item.rarity).price;
  return (CONSUMABLES[item.itemId]?.price ?? 0) * item.count;
}

export function maxStack(item) {
  if (item.kind !== 'consumable') return 1;
  return CONSUMABLES[item.itemId]?.stack ?? 1;
}
