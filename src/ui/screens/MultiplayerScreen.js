import { h, button, panel } from '../dom.js';
import { MISSIONS } from '../../data/missions.js';
import { formatCredits } from '../../economy/Wallet.js';
import { loadoutItems } from '../../inventory/Stash.js';
import { cleanName, MAX_PLAYERS } from '../../net/Protocol.js';
import { State } from '../../core/GameState.js';

// The co-op room. Before a session exists it offers HOST / JOIN; once one does
// it shows the room code, who is in, and (for the host) the mission picker.
// Re-rendered by App whenever the player list changes.
export function renderMultiplayer(root, app) {
  const p = app.profile;
  const net = app.net;

  root.append(h('div', { class: 'screen coop' },
    h('div', { class: 'topbar' },
      button('← BACK', () => app.go(State.LOBBY), 'btn ghost'),
      h('h1', { class: 'logo small', text: 'CO-OP' }),
      h('div', { class: 'wallet' }, h('span', { class: 'coin' }), h('span', { text: formatCredits(p.credits) })),
    ),
    net ? roomView(app, net) : connectView(app),
  ));
}

function connectView(app) {
  const p = app.profile;
  const hasWeapon = loadoutItems(p).some((i) => i.kind === 'weapon');

  const nameInput = h('input', {
    class: 'text-input',
    attrs: { type: 'text', maxlength: '16', placeholder: 'Callsign', value: p.callsign ?? '' },
    on: { change: (e) => { p.callsign = cleanName(e.target.value); e.target.value = p.callsign; app.save(); } },
  });

  const codeInput = h('input', {
    class: 'text-input code',
    attrs: { type: 'text', maxlength: '4', placeholder: 'CODE', autocapitalize: 'characters', spellcheck: 'false' },
    on: {
      input: (e) => { e.target.value = e.target.value.toUpperCase(); },
      keydown: (e) => { if (e.key === 'Enter') app.joinSession(codeInput.value); },
    },
  });

  const busy = app.netBusy;
  return h('div', { class: 'coop-body' },
    panel('Squad up', `Up to ${MAX_PLAYERS} players drop into the same mission and fight the bots together. One of you hosts and reads out a 4-letter room code; the rest join with it. Peer-to-peer: nothing to install, nothing to sign up for.`),
    !hasWeapon && h('div', { class: 'warn', text: 'No weapon equipped — open LOADOUT before you deploy with a squad.' }),
    app.netError && h('div', { class: 'warn', text: app.netError }),
    h('label', { class: 'field' }, h('span', { text: 'Your callsign' }), nameInput),
    h('div', { class: 'coop-cards' },
      h('div', { class: 'coop-card' },
        h('h3', { text: 'Host a room' }),
        h('p', { text: 'You pick the mission and run the world. Share the code with friends.' }),
        button(busy ? 'CONNECTING…' : 'HOST A ROOM', () => app.hostSession(), `btn primary${busy ? ' disabled' : ''}`),
      ),
      h('div', { class: 'coop-card' },
        h('h3', { text: 'Join a room' }),
        h('p', { text: 'Type the code your host gave you.' }),
        h('div', { class: 'join-row' },
          codeInput,
          button(busy ? '…' : 'JOIN', () => app.joinSession(codeInput.value), `btn${busy ? ' disabled' : ''}`),
        ),
      ),
    ),
    h('p', { class: 'hint', text: 'Both players need to be on this multiplayer screen to connect. If a join fails on a strict office or campus network, try a phone hotspot.' }),
  );
}

function roomView(app, net) {
  const p = app.profile;
  const me = net.localId;
  const host = net.players.find((x) => x.host);

  const codeEl = h('div', { class: 'room-code', text: net.roomCode });
  const copyBtn = button('COPY CODE', async () => {
    try {
      await navigator.clipboard.writeText(net.roomCode);
      app.flash('Room code copied');
    } catch {
      app.flash('Select the code and copy it by hand');
    }
  }, 'btn small');

  const players = h('div', { class: 'player-list' },
    ...net.players.map((pl) => h('div', { class: `player-row${pl.id === me ? ' me' : ''}` },
      h('span', { class: 'swatch', style: { background: pl.color } }),
      h('span', { class: 'player-name', text: pl.name }),
      pl.host && h('span', { class: 'tag', text: 'HOST' }),
      pl.id === me && h('span', { class: 'tag you', text: 'YOU' }),
    )),
    ...Array.from({ length: Math.max(0, MAX_PLAYERS - net.players.length) }, () =>
      h('div', { class: 'player-row empty', text: 'Open slot' })),
  );

  const status = net.isHost
    ? h('p', { class: 'panel-sub', text: net.players.length > 1
        ? 'Pick a mission below. Everyone deploys the moment you do.'
        : 'Waiting for players. Send them the code above — they enter it under JOIN A ROOM.' })
    : h('p', { class: 'panel-sub', text: `Waiting for ${host?.name ?? 'the host'} to pick a mission…` });

  return h('div', { class: 'coop-body' },
    h('div', { class: 'room-head' },
      h('div', {},
        h('div', { class: 'loadout-label', text: 'Room code' }),
        codeEl,
      ),
      h('div', { class: 'room-actions' },
        copyBtn,
        button('LEAVE ROOM', () => { app.leaveNet(); app.rerender(); }, 'btn ghost small'),
      ),
    ),
    h('div', { class: 'loadout-label', text: `Squad · ${net.players.length}/${MAX_PLAYERS}` }),
    players,
    status,
    net.isHost && missionPicker(app, p),
  );
}

function missionPicker(app, p) {
  const list = h('div', { class: 'mission-list compact' });
  for (const m of MISSIONS) {
    const locked = p.level < m.level;
    list.append(h('div', { class: `mission${locked ? ' locked' : ''}` },
      h('div', { class: 'mission-head' },
        h('h3', { text: m.name }),
        h('span', { class: `diff diff-${m.difficulty.toLowerCase()}`, text: m.difficulty }),
      ),
      h('p', { class: 'mission-brief', text: m.brief }),
      h('div', { class: 'mission-foot' },
        h('span', { class: 'reward', text: `${formatCredits(m.rewards.credits)} cr · ${m.rewards.xp} XP` }),
        locked
          ? h('span', { class: 'lock', text: `Requires level ${m.level}` })
          : button('DEPLOY SQUAD', () => app.deployCoop(m), 'btn primary small'),
      ),
    ));
  }
  return h('div', {},
    h('div', { class: 'loadout-label', text: 'Mission' }),
    list,
  );
}
