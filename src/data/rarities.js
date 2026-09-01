// Rarity tiers. `damage` and `mag` multiply a weapon's base stats; `weight` is
// the default drop chance before a loot table biases it.
export const RARITIES = {
  common:    { id: 'common',    name: 'Common',    color: '#b8bfc9', damage: 1.00, mag: 1.00, value: 1.0, weight: 44 },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  color: '#4fd66f', damage: 1.15, mag: 1.10, value: 1.6, weight: 28 },
  rare:      { id: 'rare',      name: 'Rare',      color: '#4aa9ff', damage: 1.32, mag: 1.20, value: 2.6, weight: 16 },
  epic:      { id: 'epic',      name: 'Epic',      color: '#b46cff', damage: 1.52, mag: 1.35, value: 4.2, weight: 9 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#ffb03a', damage: 1.75, mag: 1.50, value: 7.0, weight: 3 },
};

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export function rarityOf(id) {
  return RARITIES[id] ?? RARITIES.common;
}

export function rarityRank(id) {
  return RARITY_ORDER.indexOf(id);
}
