import { h, button, panel } from '../dom.js';
import { formatCredits } from '../../economy/Wallet.js';
import { ensureStock, isBought, buyStockItem, buyAmmo, buySkin } from '../../economy/Shop.js';
import { AMMO_PACKS, SKINS } from '../../data/shop.js';
import { WEAPONS, CONSUMABLES, AMMO_TYPES, weaponStats } from '../../data/weapons.js';
import { rarityOf } from '../../data/rarities.js';
import { State } from '../../core/GameState.js';

export function renderShop(root, app) {
  const p = app.profile;
  const stock = ensureStock(p);

  const grid = h('div', { class: 'item-grid' });
  for (const entry of stock) {
    const sold = isBought(p, entry.slot);
    const isWeapon = entry.kind === 'weapon';
    const def = isWeapon ? WEAPONS[entry.itemId] : CONSUMABLES[entry.itemId];
    const color = rarityOf(entry.rarity).color;
    const affordable = p.credits >= entry.price;

    const details = isWeapon
      ? (() => {
          const s = weaponStats(entry.itemId, entry.rarity);
          return h('div', { class: 'item-stats' },
            line('DMG', s.damage.toFixed(1)),
            line('RPS', s.fireRate.toFixed(1)),
            line('MAG', String(s.magazine)),
            line('AMMO', AMMO_TYPES[s.ammo].name.replace(' Ammo', '')),
          );
        })()
      : h('div', { class: 'item-stats' },
          def.heal ? line('HEAL', `+${def.heal}`) : null,
          def.shield ? line('SHIELD', `+${def.shield}`) : null,
          line('QTY', `x${entry.count}`),
        );

    grid.append(h('div', { class: `item-card${sold ? ' sold' : ''}`, style: { borderColor: color } },
      h('div', { class: 'item-top' },
        h('span', { class: 'item-name', text: isWeapon ? `${rarityOf(entry.rarity).name} ${def.name}` : def.name, style: { color } }),
        isWeapon ? h('span', { class: 'item-class', text: def.class }) : null,
      ),
      details,
      h('div', { class: 'item-actions' },
        sold
          ? h('span', { class: 'sold-tag', text: 'PURCHASED' })
          : button(`BUY ${formatCredits(entry.price)}`, () => {
              const res = buyStockItem(p, entry.slot);
              app.flash(res.ok ? 'Added to stash' : `Cannot buy: ${res.reason}`);
              app.save();
              app.rerender();
            }, `btn small${affordable ? ' primary' : ' disabled'}`),
      ),
    ));
  }

  const ammoGrid = h('div', { class: 'chip-grid' },
    ...AMMO_PACKS.map((pack) => h('button', {
      class: `chip${p.credits >= pack.price ? '' : ' disabled'}`,
      on: { click: () => {
        const res = buyAmmo(p, pack.ammo);
        app.flash(res.ok ? `+${res.amount} ${AMMO_TYPES[pack.ammo].name}` : `Cannot buy: ${res.reason}`);
        app.save();
        app.rerender();
      } },
    },
      h('i', { style: { background: AMMO_TYPES[pack.ammo].color } }),
      h('span', { text: `${pack.amount} ${AMMO_TYPES[pack.ammo].name}` }),
      h('b', { text: formatCredits(pack.price) }),
    )),
  );

  const skinGrid = h('div', { class: 'chip-grid' },
    ...SKINS.map((s) => {
      const owned = p.skins.includes(s.id);
      return h('button', {
        class: `chip${owned ? ' owned' : ''}${!owned && p.credits < s.price ? ' disabled' : ''}`,
        on: { click: () => {
          if (owned) { p.activeSkin = s.id; app.save(); app.rerender(); return; }
          const res = buySkin(p, s.id);
          app.flash(res.ok ? `${s.name} unlocked` : `Cannot buy: ${res.reason}`);
          app.save();
          app.rerender();
        } },
      },
        h('i', { style: { background: s.color } }),
        h('span', { text: s.name }),
        h('b', { text: owned ? (p.activeSkin === s.id ? 'ACTIVE' : 'EQUIP') : formatCredits(s.price) }),
      );
    }),
  );

  root.append(h('div', { class: 'screen wide' },
    h('div', { class: 'topbar' },
      button('← BACK', () => app.go(State.LOBBY), 'btn ghost'),
      h('h1', { class: 'logo small', text: 'SHOP' }),
      h('div', { class: 'wallet' }, h('span', { class: 'coin' }), h('span', { text: formatCredits(p.credits) })),
    ),
    panel('Daily rotation', `Stock rotates every day. Today: ${p.shop.day}. One purchase per slot.`),
    grid,
    h('div', { class: 'skins-label', text: 'Ammo' }),
    ammoGrid,
    h('div', { class: 'skins-label', text: 'Colours' }),
    skinGrid,
  ));
}

function line(label, value) {
  return h('div', { class: 'stat-line' },
    h('span', { class: 'sl-label', text: label }),
    h('span', { class: 'sl-value', text: value }),
  );
}
