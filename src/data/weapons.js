import { rarityOf } from './rarities.js';

export const AMMO_TYPES = {
  light:  { id: 'light',  name: 'Light Ammo',  color: '#e8d16a', maxStack: 999 },
  medium: { id: 'medium', name: 'Medium Ammo', color: '#7fd66a', maxStack: 999 },
  heavy:  { id: 'heavy',  name: 'Heavy Ammo',  color: '#e07a5f', maxStack: 999 },
  shell:  { id: 'shell',  name: 'Shells',      color: '#d96a9a', maxStack: 999 },
};

// Base stats are the COMMON-tier numbers. Rarity multiplies damage and magazine.
// damage      per bullet, at point blank
// fireRate    rounds per second
// spread      radians of cone at rest
// moveSpread  extra radians while moving at full speed
// range       metres before falloff starts
// falloff     damage multiplier at 2x range (linear between)
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Sidearm', class: 'Pistol', ammo: 'light',
    damage: 22, fireRate: 5.5, magazine: 12, reload: 1.3, spread: 0.008,
    moveSpread: 0.018, range: 28, falloff: 0.7, headshot: 1.8, auto: false,
    recoil: 0.011, pellets: 1, price: 120, weight: 1.1,
  },
  smg: {
    id: 'smg', name: 'Ripper SMG', class: 'SMG', ammo: 'light',
    damage: 15, fireRate: 11, magazine: 26, reload: 1.9, spread: 0.020,
    moveSpread: 0.022, range: 20, falloff: 0.55, headshot: 1.5, auto: true,
    recoil: 0.008, pellets: 1, price: 260, weight: 2.8,
  },
  rifle: {
    id: 'rifle', name: 'Vector AR', class: 'Assault Rifle', ammo: 'medium',
    damage: 26, fireRate: 7, magazine: 30, reload: 2.2, spread: 0.011,
    moveSpread: 0.030, range: 45, falloff: 0.75, headshot: 1.9, auto: true,
    recoil: 0.014, pellets: 1, price: 420, weight: 3.6,
  },
  burst: {
    id: 'burst', name: 'Tri-Burst', class: 'Assault Rifle', ammo: 'medium',
    damage: 30, fireRate: 8, magazine: 24, reload: 2.4, spread: 0.009,
    moveSpread: 0.026, range: 50, falloff: 0.8, headshot: 2.0, auto: true,
    recoil: 0.016, pellets: 1, burst: 3, price: 520, weight: 3.9,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher', class: 'Shotgun', ammo: 'shell',
    damage: 11, fireRate: 1.1, magazine: 5, reload: 2.9, spread: 0.075,
    moveSpread: 0.015, range: 9, falloff: 0.25, headshot: 1.5, auto: false,
    recoil: 0.045, pellets: 9, price: 480, weight: 3.4,
  },
  sniper: {
    id: 'sniper', name: 'Longshot', class: 'Sniper', ammo: 'heavy',
    damage: 96, fireRate: 0.7, magazine: 5, reload: 3.2, spread: 0.0012,
    moveSpread: 0.060, range: 140, falloff: 0.95, headshot: 2.5, auto: false,
    recoil: 0.055, pellets: 1, integralOptic: 'scope8', price: 900, weight: 6.2,
  },
  lmg: {
    id: 'lmg', name: 'Sustainer LMG', class: 'LMG', ammo: 'heavy',
    damage: 24, fireRate: 9, magazine: 60, reload: 4.2, spread: 0.024,
    moveSpread: 0.040, range: 40, falloff: 0.7, headshot: 1.5, auto: true,
    recoil: 0.013, pellets: 1, price: 780, weight: 8.4,
  },
};

// Optics are items you find, attach to a weapon, and look through. `zoom` is the
// FOV divisor while aiming; `spreadMul` scales the aimed spread cone; `scoped`
// means the sight picture is rendered through a second camera rather than being
// a plain FOV cut.
export const OPTICS = {
  reflex: {
    id: 'reflex', name: 'Reflex Sight', kind: 'optic',
    zoom: 1.25, adsTime: 0.18, spreadMul: 0.55, reticle: 'dot',
    weight: 0.3, price: 180,
  },
  holo: {
    id: 'holo', name: 'Holo Sight', kind: 'optic',
    zoom: 1.5, adsTime: 0.22, spreadMul: 0.50, reticle: 'circle',
    weight: 0.4, price: 260,
  },
  acog: {
    id: 'acog', name: '4x ACOG', kind: 'optic',
    zoom: 4, adsTime: 0.34, spreadMul: 0.35, reticle: 'chevron',
    weight: 0.6, price: 520,
  },
  scope8: {
    id: 'scope8', name: '8x Scope', kind: 'optic',
    zoom: 8, adsTime: 0.5, spreadMul: 0.22, reticle: 'mildot', scoped: true,
    weight: 0.9, price: 900,
  },
};

// Every gun can be aimed even with nothing on the rail. Pistols line up faster
// and magnify less than a long gun's notch-and-post.
const IRON = { id: 'iron', name: 'Iron Sights', kind: 'optic', zoom: 1.15, adsTime: 0.15, spreadMul: 0.60, reticle: 'iron', weight: 0 };
const IRON_PISTOL = { ...IRON, zoom: 1.1, adsTime: 0.12 };

export function ironSightsFor(stats) {
  return stats.class === 'Pistol' ? IRON_PISTOL : IRON;
}

// The sight actually in use: an attached optic, the gun's integral one, or irons.
export function opticFor(stats, attachedId) {
  const id = attachedId ?? stats.integralOptic ?? null;
  return (id && OPTICS[id]) || ironSightsFor(stats);
}

export function isOptic(id) { return !!OPTICS[id]; }

// Resolve a weapon id + rarity into the stats gameplay actually uses.
export function weaponStats(id, rarityId) {
  const base = WEAPONS[id];
  if (!base) throw new Error(`unknown weapon: ${id}`);
  const r = rarityOf(rarityId);
  return {
    ...base,
    rarity: r.id,
    damage: base.damage * r.damage,
    magazine: Math.round(base.magazine * r.mag),
    price: Math.round(base.price * r.value),
  };
}

export const CONSUMABLES = {
  bandage:  { id: 'bandage',  name: 'Bandage',      kind: 'consumable', heal: 18, cap: 75, useTime: 1.4, stack: 5, weight: 0.2, price: 40 },
  medkit:   { id: 'medkit',   name: 'Medkit',       kind: 'consumable', heal: 100, cap: 100, useTime: 3.2, stack: 2, weight: 0.8, price: 140 },
  shieldsm: { id: 'shieldsm', name: 'Small Shield', kind: 'consumable', shield: 25, shieldCap: 50, useTime: 1.6, stack: 4, weight: 0.4, price: 90 },
  shieldlg: { id: 'shieldlg', name: 'Shield Potion',kind: 'consumable', shield: 50, shieldCap: 100, useTime: 3.0, stack: 2, weight: 0.9, price: 200 },
};

export function isWeapon(id) { return !!WEAPONS[id]; }
export function isConsumable(id) { return !!CONSUMABLES[id]; }
