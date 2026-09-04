import * as THREE from 'three';
import { GameState, State } from './core/GameState.js';
import { Loop } from './core/Loop.js';
import { Input } from './core/Input.js';
import { loadProfile, saveProfile } from './save/SaveGame.js';
import { Match } from './game/Match.js';
import { grantCredits, grantXp } from './economy/Wallet.js';
import { loadoutItems, addToStash, pruneLoadout } from './inventory/Stash.js';
import { renderLobby } from './ui/screens/Lobby.js';
import { renderMissions } from './ui/screens/MissionBoard.js';
import { renderInventory } from './ui/screens/InventoryScreen.js';
import { renderShop } from './ui/screens/ShopScreen.js';
import { renderResults } from './ui/screens/Results.js';
import { renderPause } from './ui/screens/PauseMenu.js';
import { renderMultiplayer } from './ui/screens/MultiplayerScreen.js';
import { h } from './ui/dom.js';
import { NetSession } from './net/NetSession.js';
import { MSG, EVT } from './net/Protocol.js';
import { missionById } from './data/missions.js';
import { activeSkinColor } from './economy/Shop.js';
import { setUidPrefix } from './inventory/Item.js';

// Top-level controller: owns the renderer, the profile, the state machine and
// whichever match is currently running.
class App {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.uiRoot = document.getElementById('ui');
    this.hudRoot = document.getElementById('hud');

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.profile = loadProfile();
    pruneLoadout(this.profile);

    this.input = new Input(this.canvas);
    this.input.onLockChange = (locked) => this._onLockChange(locked);
    this.applySettings();

    this.state = new GameState();
    this.state.on('change', () => this.rerender());

    this.match = null;
    this.result = null;
    this.pauseFirst = false;

    // Co-op session, or null. Lives across matches; dropped on return to the lobby.
    this.net = null;
    this.netBusy = false;
    this.netError = null;
    this._netUnsubs = [];

    this.loop = new Loop();
    this.loop.update = (dt) => this.match?.update(dt);
    this.loop.render = () => this.match?.render();
    this.loop.start();

    window.addEventListener('resize', () => this._resize());
    this._resize();
    this.rerender();
  }

  // --- plumbing --------------------------------------------------------------

  applySettings() {
    this.input.sensitivity = 0.0022 * this.profile.settings.sensitivity;
    if (this.match) {
      this.match.camera.fov = this.profile.settings.fov;
      this.match.player.baseFov = this.profile.settings.fov;
      this.match.camera.updateProjectionMatrix();
    }
  }

  save() {
    saveProfile(this.profile);
  }

  go(state, payload) {
    this.state.go(state, payload);
  }

  flash(text) {
    const n = h('div', { class: 'flash', text });
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('out'), 1500);
    setTimeout(() => n.remove(), 2100);
  }

  _resize() {
    const w = window.innerWidth;
    const h2 = window.innerHeight;
    this.renderer.setSize(w, h2);
    this.match?.resize(w, h2);
  }

  _onLockChange(locked) {
    if (!this.state.is(State.MATCH)) return;
    if (locked) {
      this.pauseFirst = false;
      this.match?.setPaused(false);
      this.uiRoot.innerHTML = '';
    } else {
      this.match?.setPaused(true);
      this.rerender();
    }
  }

  // --- match lifecycle -------------------------------------------------------

  startMission(mission) {
    this._destroyMatch();
    const loadout = loadoutItems(this.profile);
    if (!loadout.some((i) => i.kind === 'weapon')) {
      this.flash('Equip a weapon in LOADOUT first');
      this.go(State.INVENTORY);
      return;
    }

    this.profile.stats.missions++;
    this.save();

    this.net?.setInMatch(true);
    this.match = new Match({
      renderer: this.renderer,
      mission,
      profile: this.profile,
      loadout,
      hudRoot: this.hudRoot,
      input: this.input,
      onFinish: (result) => this._finishMatch(result),
      net: this.net,
    });
    this.match.setPaused(true);
    this.pauseFirst = true;
    this.canvas.classList.add('active');
    this.go(State.MATCH, mission);
  }

  resumeMatch() {
    this.uiRoot.innerHTML = '';
    this.input.requestLock();
  }

  abandonMatch() {
    this.match?.finish(false);
  }

  // --- co-op session ---------------------------------------------------------

  async hostSession() {
    await this._connect(() => NetSession.host(this.profile.callsign, activeSkinColor(this.profile)));
  }

  async joinSession(code) {
    await this._connect(() => NetSession.join(code, this.profile.callsign, activeSkinColor(this.profile)));
  }

  async _connect(open) {
    if (this.net || this.netBusy) return;
    this.netBusy = true;
    this.netError = null;
    this.rerender();
    try {
      this._attachNet(await open());
    } catch (err) {
      this.netError = err?.message ?? String(err);
    } finally {
      this.netBusy = false;
      if (this.state.is(State.MULTIPLAYER)) this.rerender();
    }
  }

  _attachNet(session) {
    this.net = session;
    // Items minted on this machine can never collide with a teammate's.
    setUidPrefix(session.localId.replace(/[^a-z0-9]/gi, '').slice(-8));
    const rerender = () => { if (this.state.is(State.MULTIPLAYER)) this.rerender(); };
    this._netUnsubs = [
      session.on(EVT.PLAYERS, rerender),
      session.on(EVT.LEFT, ({ name }) => this.flash(`${name} left the room`)),
      session.on('error', (err) => this.flash(err.message)),
      session.on(EVT.HOST_LEFT, () => this._hostLeft()),
      session.on(MSG.START, (d) => {
        if (session.isHost || this.state.is(State.MATCH)) return;
        const mission = missionById(d.mission);
        if (mission) this.startMission(mission);
      }),
    ];
  }

  // Host only: tell the room, then deploy ourselves.
  deployCoop(mission) {
    if (!this.net?.isHost) return;
    this.net.send(MSG.START, { mission: mission.id });
    this.startMission(mission);
  }

  _hostLeft() {
    this.flash('The host left the session');
    this._detachNet();
    if (this.match) this.match.finish(false); // -> results, then the lobby
    else this.go(State.LOBBY);
  }

  leaveNet() {
    const s = this.net;
    this._detachNet();
    s?.leave();
  }

  _detachNet() {
    for (const u of this._netUnsubs) u();
    this._netUnsubs = [];
    this.net = null;
    this.netError = null;
  }

  _finishMatch(result) {
    const p = this.profile;
    const m = result.mission;

    // Partial credit on a wipe keeps a bad run from feeling wasted, without
    // making failure the efficient strategy.
    const scale = result.success ? 1 : 0.25;
    const credits = Math.round(m.rewards.credits * scale + result.kills * 12 + result.chests * 15);
    const xp = Math.round(m.rewards.xp * (result.success ? 1 : 0.35) + result.kills * 6);

    const carriedInUids = new Set(p.loadout);
    let extracted = [];

    if (result.success && result.carried) {
      // Everything in the backpack replaces what was carried in.
      p.stash = p.stash.filter((i) => !carriedInUids.has(i.uid));
      for (const item of result.carried) addToStash(p, item);
      extracted = result.carried.filter((i) => !carriedInUids.has(i.uid));
      p.loadout = [...carriedInUids].filter((uid) => p.stash.some((i) => i.uid === uid));
      p.stats.completed++;
    } else {
      p.stats.deaths++;
    }

    p.ammo = result.ammo;
    p.stats.kills += result.kills;
    p.stats.chests += result.chests;

    grantCredits(p, credits);
    const levels = grantXp(p, xp);
    pruneLoadout(p);
    this.save();

    this.result = { ...result, rewards: { credits, xp, levels }, extracted };
    this.input.releaseLock();
    this._destroyMatch();
    this.go(State.RESULTS);
  }

  _destroyMatch() {
    if (!this.match) return;
    this.match.dispose();
    this.match = null;
    this.canvas.classList.remove('active');
    this.renderer.clear();
  }

  // --- rendering -------------------------------------------------------------

  rerender() {
    const root = this.uiRoot;
    root.innerHTML = '';
    switch (this.state.current) {
      case State.LOBBY: this._leaveMatch(); this.leaveNet(); renderLobby(root, this); break;
      case State.MULTIPLAYER:
        this._leaveMatch();
        this.net?.setInMatch(false); // back in the room: late joiners welcome again
        renderMultiplayer(root, this);
        break;
      case State.MISSIONS: this._leaveMatch(); renderMissions(root, this); break;
      case State.INVENTORY: this._leaveMatch(); renderInventory(root, this); break;
      case State.SHOP: this._leaveMatch(); renderShop(root, this); break;
      case State.RESULTS: this._leaveMatch(); renderResults(root, this); break;
      case State.MATCH:
        if (!this.input.locked) renderPause(root, this);
        break;
      default: break;
    }
  }

  // Any non-match screen means the match is over and the canvas idles.
  _leaveMatch() {
    if (this.match) {
      this.input.releaseLock();
      this._destroyMatch();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__dropzone = new App();
});
