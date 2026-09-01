import { itemDef, maxStack } from './Item.js';

export const SLOTS = 5;

// The in-match backpack: 5 hotbar slots plus shared ammo reserves.
// Mirrors what the player carried in, and what they carry out.
export class Inventory {
  constructor(items = [], ammo = {}) {
    this.slots = new Array(SLOTS).fill(null);
    this.ammo = { light: 0, medium: 0, heavy: 0, shell: 0, ...ammo };
    this.active = 0;
    for (const it of items) this.add(it);
  }

  get activeItem() {
    return this.slots[this.active];
  }

  firstFree() {
    return this.slots.indexOf(null);
  }

  isFull() {
    return this.firstFree() === -1;
  }

  // Returns { ok, slot, merged } — merged means it stacked onto an existing item.
  add(item) {
    if (!item) return { ok: false };
    if (item.kind === 'consumable') {
      const cap = maxStack(item);
      for (let i = 0; i < SLOTS; i++) {
        const s = this.slots[i];
        if (s && s.kind === 'consumable' && s.itemId === item.itemId && s.count < cap) {
          const room = cap - s.count;
          const moved = Math.min(room, item.count);
          s.count += moved;
          item.count -= moved;
          if (item.count <= 0) return { ok: true, slot: i, merged: true };
        }
      }
    }
    const free = this.firstFree();
    if (free === -1) return { ok: false };
    this.slots[free] = item;
    return { ok: true, slot: free, merged: false };
  }

  addAmmo(type, amount) {
    if (!(type in this.ammo)) return 0;
    this.ammo[type] += amount;
    return amount;
  }

  takeAmmo(type, wanted) {
    const have = this.ammo[type] ?? 0;
    const taken = Math.min(have, wanted);
    this.ammo[type] = have - taken;
    return taken;
  }

  removeAt(slot) {
    const it = this.slots[slot];
    this.slots[slot] = null;
    return it;
  }

  // Spend one of a stacked consumable; clears the slot when it runs out.
  consumeAt(slot) {
    const it = this.slots[slot];
    if (!it || it.kind !== 'consumable') return null;
    it.count -= 1;
    if (it.count <= 0) this.slots[slot] = null;
    return it;
  }

  select(slot) {
    if (slot < 0 || slot >= SLOTS) return;
    this.active = slot;
  }

  // Cycle to the next non-empty slot in `dir` (+1/-1). Falls back to staying put.
  cycle(dir) {
    for (let step = 1; step <= SLOTS; step++) {
      const i = (this.active + dir * step + SLOTS * 4) % SLOTS;
      if (this.slots[i]) { this.active = i; return; }
    }
  }

  items() {
    return this.slots.filter(Boolean);
  }

  ammoTypeFor(item) {
    return item?.kind === 'weapon' ? itemDef(item)?.ammo : null;
  }
}
