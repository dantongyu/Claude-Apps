// Seeded PRNG (mulberry32). Every random draw in the game goes through here so
// arenas, loot and shop rotations are reproducible from a seed.
export class Random {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._s = this.seed;
  }

  next() {
    this._s = (this._s + 0x6d2b79f5) >>> 0;
    let t = this._s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // items: [{ weight, ...}] -> picks one proportional to weight
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.weight;
    let roll = this.next() * total;
    for (const it of items) {
      roll -= it.weight;
      if (roll <= 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

// Stable 32-bit hash of a string, for turning names/dates into seeds.
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
