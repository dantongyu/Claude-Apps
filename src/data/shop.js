// What can appear in the daily rotation. Rarity is rolled per slot from the
// allowed band, so the same weapon costs more on a good day.
export const SHOP_POOL = [
  { itemId: 'pistol',   kind: 'weapon',     rarities: ['common', 'uncommon', 'rare'] },
  { itemId: 'smg',      kind: 'weapon',     rarities: ['common', 'uncommon', 'rare', 'epic'] },
  { itemId: 'rifle',    kind: 'weapon',     rarities: ['uncommon', 'rare', 'epic'] },
  { itemId: 'burst',    kind: 'weapon',     rarities: ['uncommon', 'rare', 'epic'] },
  { itemId: 'shotgun',  kind: 'weapon',     rarities: ['common', 'uncommon', 'rare', 'epic'] },
  { itemId: 'sniper',   kind: 'weapon',     rarities: ['rare', 'epic', 'legendary'] },
  { itemId: 'lmg',      kind: 'weapon',     rarities: ['rare', 'epic', 'legendary'] },
  { itemId: 'bandage',  kind: 'consumable', rarities: ['common'] },
  { itemId: 'medkit',   kind: 'consumable', rarities: ['common'] },
  { itemId: 'shieldsm', kind: 'consumable', rarities: ['common'] },
  { itemId: 'shieldlg', kind: 'consumable', rarities: ['common'] },
];

export const AMMO_PACKS = [
  { ammo: 'light',  amount: 120, price: 60 },
  { ammo: 'medium', amount: 120, price: 70 },
  { ammo: 'heavy',  amount: 60,  price: 90 },
  { ammo: 'shell',  amount: 32,  price: 80 },
];

// Cosmetics are pure vanity: they tint the player's viewmodel and lobby card.
export const SKINS = [
  { id: 'default', name: 'Standard Issue', color: '#5b8dd6', price: 0 },
  { id: 'ember',   name: 'Ember',          color: '#e4633c', price: 400 },
  { id: 'moss',    name: 'Moss',           color: '#4f9d5c', price: 400 },
  { id: 'violet',  name: 'Violet',         color: '#8f5bd6', price: 750 },
  { id: 'bone',    name: 'Bonewhite',      color: '#e2ded3', price: 750 },
  { id: 'gold',    name: 'Gilt',           color: '#d8b13a', price: 1800 },
];

export const SHOP_SLOTS = 6;
