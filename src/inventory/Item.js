import { WEAPONS, CONSUMABLES, OPTICS, weaponStats, opticFor } from '../data/weapons.js';
import { rarityOf } from '../data/rarities.js';

let _uid = 1;
// Prefixed so two machines in a co-op raid can never mint the same uid. The
// default is a random local tag; the net layer replaces it with the peer id.
let _prefix = Math.random().toString(36).slice(2, 6);

export function setUidPrefix(prefix) {
  if (prefix) _prefix = String(prefix).replace(/[^a-z0-9]/gi, '').slice(0, 8) || _prefix;
}

export function newUid() {
  return `i${_prefix}${Date.now().toString(36)}${(_uid++).toString(36)}`;
}

// An inventory item is always this shape:
//   { uid, kind: 'weapon'|'consumable'|'optic', itemId, rarity, count, ammoInMag,
//     attachments }
export function makeWeapon(itemId, rarity = 'common') {
  const stats = weaponStats(itemId, rarity);
  return {
    uid: newUid(), kind: 'weapon', itemId, rarity,
    count: 1, ammoInMag: stats.magazine, attachments: {},
  };
}

export function makeConsumable(itemId, count = 1) {
  return { uid: newUid(), kind: 'consumable', itemId, rarity: 'common', count };
}

export function makeOptic(itemId, rarity = 'common') {
  return { uid: newUid(), kind: 'optic', itemId, rarity, count: 1 };
}

export function itemDef(item) {
  if (item.kind === 'weapon') return WEAPONS[item.itemId];
  if (item.kind === 'optic') return OPTICS[item.itemId];
  return CONSUMABLES[item.itemId];
}

export function itemName(item) {
  const def = itemDef(item);
  if (!def) return 'Unknown';
  if (item.kind === 'consumable') return def.name;
  return `${rarityOf(item.rarity).name} ${def.name}`;
}

export function itemColor(item) {
  return rarityOf(item.rarity).color;
}

export function itemValue(item) {
  if (item.kind === 'weapon') return weaponStats(item.itemId, item.rarity).price;
  if (item.kind === 'optic') {
    return Math.round((OPTICS[item.itemId]?.price ?? 0) * rarityOf(item.rarity).value);
  }
  return (CONSUMABLES[item.itemId]?.price ?? 0) * item.count;
}

export function maxStack(item) {
  if (item.kind !== 'consumable') return 1;
  return CONSUMABLES[item.itemId]?.stack ?? 1;
}

// Kilograms. Drives the backpack's carry limit, so a full stack of bandages
// costs real space and an LMG costs a lot of it.
export function itemWeight(item) {
  const def = itemDef(item);
  if (!def) return 0;
  const each = def.weight ?? 0.5;
  const attached = item.kind === 'weapon' && item.attachments?.optic
    ? (OPTICS[item.attachments.optic]?.weight ?? 0)
    : 0;
  return each * (item.count ?? 1) + attached;
}

// The sight a weapon item is currently looking through: its attachment, its
// integral scope, or plain irons.
export function itemOptic(item) {
  if (item?.kind !== 'weapon') return null;
  return opticFor(weaponStats(item.itemId, item.rarity), item.attachments?.optic ?? null);
}

// True when this optic can be bolted onto this weapon. Guns with an integral
// scope (the Longshot) have no free rail.
export function canAttach(weaponItem, opticItem) {
  if (weaponItem?.kind !== 'weapon' || opticItem?.kind !== 'optic') return false;
  return !WEAPONS[weaponItem.itemId]?.integralOptic;
}
