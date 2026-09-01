import { h, button, panel } from '../dom.js';
import { formatCredits } from '../../economy/Wallet.js';
import { itemName, itemColor, itemDef } from '../../inventory/Item.js';
import { weaponStats } from '../../data/weapons.js';
import { AMMO_TYPES } from '../../data/weapons.js';
import { inLoadout, toggleLoadout, removeFromStash, sellValue, STASH_CAP } from '../../inventory/Stash.js';
import { State } from '../../core/GameState.js';
import { SKINS } from '../../data/shop.js';

export function renderInventory(root, app) {
  const p = app.profile;

  const grid = h('div', { class: 'item-grid' });
  const sorted = [...p.stash].sort((a, b) => Number(inLoadout(p, b.uid)) - Number(inLoadout(p, a.uid)));

  for (const item of sorted) {
    const equipped = inLoadout(p, item.uid);
    const def = itemDef(item);
    const color = itemColor(item);

    const details = item.kind === 'weapon'
      ? (() => {
          const s = weaponStats(item.itemId, item.rarity);
          return h('div', { class: 'item-stats' },
            statLine('DMG', s.damage.toFixed(1)),
            statLine('RPS', s.fireRate.toFixed(1)),
            statLine('MAG', String(s.magazine)),
            statLine('RNG', `${s.range}m`),
            statLine('AMMO', AMMO_TYPES[s.ammo].name.replace(' Ammo', '')),
          );
        })()
      : h('div', { class: 'item-stats' },
          def.heal ? statLine('HEAL', `+${def.heal}`) : null,
          def.shield ? statLine('SHIELD', `+${def.shield}`) : null,
          statLine('USE', `${def.useTime}s`),
          statLine('QTY', `x${item.count}`),
        );

    grid.append(h('div', {
      class: `item-card${equipped ? ' equipped' : ''}`,
      style: { borderColor: color },
    },
      h('div', { class: 'item-top' },
        h('span', { class: 'item-name', text: itemName(item), style: { color } }),
        item.kind === 'weapon' ? h('span', { class: 'item-class', text: def.class }) : null,
      ),
      details,
      h('div', { class: 'item-actions' },
        button(equipped ? 'UNEQUIP' : 'EQUIP', () => {
          const res = toggleLoadout(p, item.uid);
          if (!res.equipped && res.reason === 'full') app.flash('Loadout is full (5 slots)');
          app.save();
          app.rerender();
        }, `btn small${equipped ? '' : ' primary'}`),
        button(`SELL ${sellValue(item)}`, () => {
          if (!confirm(`Sell ${itemName(item)} for ${sellValue(item)} credits?`)) return;
          const removed = removeFromStash(p, item.uid);
          if (removed) {
            p.credits += sellValue(removed);
            app.save();
            app.rerender();
          }
        }, 'btn small ghost'),
      ),
    ));
  }

  const ammo = h('div', { class: 'ammo-row' },
    ...Object.values(AMMO_TYPES).map((a) => h('div', { class: 'ammo-chip' },
      h('i', { style: { background: a.color } }),
      h('span', { text: `${a.name}: ${p.ammo[a.id] ?? 0}` }),
    )),
  );

  const skins = h('div', { class: 'skin-row' },
    ...SKINS.filter((s) => p.skins.includes(s.id)).map((s) => h('button', {
      class: `skin${p.activeSkin === s.id ? ' active' : ''}`,
      style: { background: s.color },
      attrs: { title: s.name },
      on: { click: () => { p.activeSkin = s.id; app.save(); app.rerender(); } },
    })),
  );

  root.append(h('div', { class: 'screen wide' },
    h('div', { class: 'topbar' },
      button('← BACK', () => app.go(State.LOBBY), 'btn ghost'),
      h('h1', { class: 'logo small', text: 'LOADOUT' }),
      h('div', { class: 'wallet' }, h('span', { class: 'coin' }), h('span', { text: formatCredits(p.credits) })),
    ),
    panel(
      `Stash (${p.stash.length}/${STASH_CAP})`,
      'Equip up to 5 items to carry into a mission. Higher rarity means more damage and a bigger magazine.',
    ),
    ammo,
    h('div', { class: 'skins-label', text: 'Colours' }),
    skins,
    p.stash.length === 0
      ? h('p', { class: 'empty', text: 'Your stash is empty. Visit the shop or run a mission.' })
      : grid,
  ));
}

function statLine(label, value) {
  return h('div', { class: 'stat-line' },
    h('span', { class: 'sl-label', text: label }),
    h('span', { class: 'sl-value', text: value }),
  );
}
