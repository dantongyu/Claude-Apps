import { h, button } from '../dom.js';
import { levelProgress, formatCredits } from '../../economy/Wallet.js';
import { loadoutItems } from '../../inventory/Stash.js';
import { itemName, itemColor } from '../../inventory/Item.js';
import { activeSkinColor } from '../../economy/Shop.js';
import { State } from '../../core/GameState.js';

const REPO_URL = 'https://github.com/dantongyu/Claude-Apps';
const GUIDE_URL = 'https://github.com/dantongyu/Claude-Apps/blob/main/HOW_TO_PLAY.md';

// Opens in a new tab so a player mid-session never loses their place.
function externalLink(label, href) {
  return h('a', {
    class: 'btn ghost small link',
    text: label,
    attrs: { href, target: '_blank', rel: 'noopener noreferrer' },
  });
}

export function renderLobby(root, app) {
  const p = app.profile;
  const prog = levelProgress(p);
  const loadout = loadoutItems(p);

  const card = h('div', { class: 'lobby-card' },
    h('div', { class: 'avatar', style: { background: activeSkinColor(p) } }),
    h('div', { class: 'who' },
      h('div', { class: 'level', text: `Level ${p.level}` }),
      h('div', { class: 'xp-track' }, h('i', { style: { width: `${prog.pct * 100}%` } })),
      h('div', { class: 'xp-text', text: `${prog.xp} / ${prog.need} XP` }),
    ),
  );

  const wallet = h('div', { class: 'wallet' },
    h('span', { class: 'coin' }), h('span', { text: formatCredits(p.credits) }),
  );

  const loadoutRow = h('div', { class: 'loadout-strip' },
    ...Array.from({ length: 5 }, (_, i) => {
      const item = loadout[i];
      return h('div', {
        class: `strip-slot${item ? ' filled' : ''}`,
        style: item ? { borderColor: itemColor(item) } : {},
      }, item ? itemName(item) : 'Empty');
    }),
  );

  const stats = h('div', { class: 'lobby-stats' },
    stat('Missions', p.stats.completed),
    stat('Eliminations', p.stats.kills),
    stat('Chests', p.stats.chests),
    stat('Wipes', p.stats.deaths),
  );

  root.append(h('div', { class: 'screen lobby' },
    h('div', { class: 'topbar' }, h('h1', { class: 'logo', text: 'DROPZONE' }), wallet),
    card,
    h('div', { class: 'loadout-label', text: 'Current loadout' }),
    loadoutRow,
    h('div', { class: 'menu' },
      button('DEPLOY', () => app.go(State.MISSIONS), 'btn primary'),
      button('LOADOUT', () => app.go(State.INVENTORY)),
      button('SHOP', () => app.go(State.SHOP)),
    ),
    stats,
    h('p', { class: 'hint', text: 'WASD move · Shift sprint · Space jump · Mouse aim & fire · R reload · E interact · F use · G drop · 1-5 slots · Esc pause' }),
    h('div', { class: 'links' },
      externalLink('◆ SOURCE CODE', REPO_URL),
      externalLink('📖 HOW TO PLAY', GUIDE_URL),
      h('span', { class: 'links-note', text: 'Open source — clone it and keep building.' }),
    ),
  ));
}

function stat(label, value) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat-value', text: String(value) }),
    h('div', { class: 'stat-label', text: label }),
  );
}
