import { h, button, panel } from '../dom.js';
import { MISSIONS } from '../../data/missions.js';
import { formatCredits } from '../../economy/Wallet.js';
import { loadoutItems } from '../../inventory/Stash.js';
import { itemName, itemColor } from '../../inventory/Item.js';
import { State } from '../../core/GameState.js';

export function renderMissions(root, app) {
  const p = app.profile;
  const loadout = loadoutItems(p);
  const hasWeapon = loadout.some((i) => i.kind === 'weapon');

  const list = h('div', { class: 'mission-list' });
  for (const m of MISSIONS) {
    const locked = p.level < m.level;
    const card = h('div', { class: `mission${locked ? ' locked' : ''}` },
      h('div', { class: 'mission-head' },
        h('h3', { text: m.name }),
        h('span', { class: `diff diff-${m.difficulty.toLowerCase()}`, text: m.difficulty }),
      ),
      h('p', { class: 'mission-brief', text: m.brief }),
      h('ul', { class: 'mission-objs' },
        ...m.objectives.map((o) => h('li', { text: `${o.label} — ${o.type === 'survive' ? `${o.count}s` : o.count}` })),
      ),
      h('div', { class: 'mission-foot' },
        h('span', { class: 'reward', text: `${formatCredits(m.rewards.credits)} cr · ${m.rewards.xp} XP` }),
        locked
          ? h('span', { class: 'lock', text: `Requires level ${m.level}` })
          : button('DEPLOY', () => app.startMission(m), 'btn primary small'),
      ),
    );
    list.append(card);
  }

  const strip = h('div', { class: 'loadout-strip inline' },
    ...Array.from({ length: 5 }, (_, i) => {
      const item = loadout[i];
      return h('div', {
        class: `strip-slot${item ? ' filled' : ''}`,
        style: item ? { borderColor: itemColor(item) } : {},
      }, item ? itemName(item) : 'Empty');
    }),
  );

  root.append(h('div', { class: 'screen wide' },
    h('div', { class: 'topbar' },
      button('← BACK', () => app.go(State.LOBBY), 'btn ghost'),
      h('h1', { class: 'logo small', text: 'MISSIONS' }),
      h('div', { class: 'wallet' }, h('span', { class: 'coin' }), h('span', { text: formatCredits(p.credits) })),
    ),
    panel('Select a contract', 'You carry your loadout in. Everything you find only comes home if you finish the job.'),
    !hasWeapon && h('div', { class: 'warn', text: 'No weapon equipped — open LOADOUT before deploying.' }),
    strip,
    list,
  ));
}
