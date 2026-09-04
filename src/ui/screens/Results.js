import { h, button } from '../dom.js';
import { formatCredits } from '../../economy/Wallet.js';
import { itemName, itemColor } from '../../inventory/Item.js';
import { State } from '../../core/GameState.js';

export function renderResults(root, app) {
  const r = app.result;
  if (!r) { app.go(State.LOBBY); return; }

  const mins = Math.floor(r.time / 60);
  const secs = Math.floor(r.time % 60);

  const objectives = h('ul', { class: 'result-objs' },
    ...r.objectives.map((o) => h('li', { class: o.done ? 'done' : 'failed' },
      h('span', { text: o.label }), h('b', { text: o.done ? 'COMPLETE' : o.text }),
    )),
  );

  const lootList = r.extracted?.length
    ? h('div', { class: 'loot-list' },
        ...r.extracted.map((i) => h('span', {
          class: 'loot-chip', text: itemName(i), style: { borderColor: itemColor(i) },
        })),
      )
    : h('p', { class: 'empty', text: r.success ? 'Nothing new extracted.' : 'Mission loot was lost.' });

  root.append(h('div', { class: `screen results ${r.success ? 'win' : 'loss'}` },
    h('h1', { class: 'result-title', text: r.success ? 'MISSION COMPLETE' : 'MISSION FAILED' }),
    h('p', { class: 'result-sub', text: r.mission.name }),
    objectives,
    h('div', { class: 'result-stats' },
      stat('Eliminations', r.kills),
      stat('Headshots', r.headshots),
      stat('Chests', r.chests),
      stat('Damage', r.damage),
      stat('Time', `${mins}:${String(secs).padStart(2, '0')}`),
    ),
    h('div', { class: 'rewards' },
      h('div', { class: 'reward-line' }, h('span', { text: 'Credits' }), h('b', { text: `+${formatCredits(r.rewards.credits)}` })),
      h('div', { class: 'reward-line' }, h('span', { text: 'XP' }), h('b', { text: `+${r.rewards.xp}` })),
      r.rewards.levels > 0
        ? h('div', { class: 'reward-line level-up' }, h('span', { text: 'LEVEL UP' }), h('b', { text: `→ ${app.profile.level}` }))
        : null,
    ),
    h('div', { class: 'loot-label', text: 'Extracted' }),
    lootList,
    h('div', { class: 'menu' },
      // A co-op run returns to the room so the squad can go again.
      button('CONTINUE', () => app.go(app.net ? State.MULTIPLAYER : State.LOBBY), 'btn primary'),
      !app.net && button('REDEPLOY', () => app.startMission(r.mission)),
      app.net?.isHost && button('REDEPLOY SQUAD', () => app.deployCoop(r.mission)),
    ),
  ));
}

function stat(label, value) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat-value', text: String(value) }),
    h('div', { class: 'stat-label', text: label }),
  );
}
