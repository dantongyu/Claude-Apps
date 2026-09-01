import { SLOTS } from './Inventory.js';
import { itemValue, maxStack } from './Item.js';

export const STASH_CAP = 40;

// The lobby's persistent storage plus the loadout selection that feeds a match.
export function stashItems(profile) {
  return profile.stash;
}

export function findItem(profile, uid) {
  return profile.stash.find((i) => i.uid === uid) ?? null;
}

export function stashFull(profile) {
  return profile.stash.length >= STASH_CAP;
}

// Stacks consumables where possible; returns false only when genuinely full.
export function addToStash(profile, item) {
  if (item.kind === 'consumable') {
    const cap = maxStack(item) * 4; // stash stacks deeper than the backpack
    const existing = profile.stash.find(
      (i) => i.kind === 'consumable' && i.itemId === item.itemId && i.count < cap,
    );
    if (existing) {
      existing.count += item.count;
      return true;
    }
  }
  if (stashFull(profile)) return false;
  profile.stash.push(item);
  return true;
}

export function removeFromStash(profile, uid) {
  const idx = profile.stash.findIndex((i) => i.uid === uid);
  if (idx === -1) return null;
  const [item] = profile.stash.splice(idx, 1);
  profile.loadout = profile.loadout.filter((u) => u !== uid);
  return item;
}

// Selling recovers 40% of value — enough to clear common clutter, not a farm.
export function sellValue(item) {
  return Math.max(5, Math.round(itemValue(item) * 0.4));
}

export function loadoutItems(profile) {
  return profile.loadout.map((uid) => findItem(profile, uid)).filter(Boolean);
}

export function inLoadout(profile, uid) {
  return profile.loadout.includes(uid);
}

export function toggleLoadout(profile, uid) {
  if (inLoadout(profile, uid)) {
    profile.loadout = profile.loadout.filter((u) => u !== uid);
    return { equipped: false };
  }
  if (profile.loadout.length >= SLOTS) return { equipped: false, reason: 'full' };
  if (!findItem(profile, uid)) return { equipped: false, reason: 'missing' };
  profile.loadout.push(uid);
  return { equipped: true };
}

// Drop stale uids (items sold or spent) so the loadout never dangles.
export function pruneLoadout(profile) {
  profile.loadout = profile.loadout.filter((uid) => findItem(profile, uid)).slice(0, SLOTS);
}
