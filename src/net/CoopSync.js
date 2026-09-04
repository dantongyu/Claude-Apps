import * as THREE from 'three';
import { MSG, EVT, packPlayer, unpackPlayer, packSnapshot, unpackSnapshot, packPos, unpackPos } from './Protocol.js';
import { Interpolator } from './Interpolator.js';
import { RemotePlayer } from '../game/RemotePlayer.js';
import { Enemy } from '../game/Enemy.js';
import { ENEMIES } from '../data/enemies.js';

const SEND_RATE = 1 / 15;   // snapshots and player states per second
const STALE_AFTER = 6;      // seconds without a state before a peer leaves the match

// Everything a Match needs to be played by several people at once. Built by
// Match when it is given a `net` session, disposed with it. The authority split
// (MULTIPLAYER_PLAN.md): you own your own body; the host owns bots, chests,
// pickups and objectives.
export class CoopSync {
  constructor(match, net) {
    this.match = match;
    this.net = net;
    this.isHost = net.isHost;
    this.isClient = !net.isHost;
    this.localId = net.localId;

    this.clock = 0;
    this.sendAcc = 0;
    // id -> { name, color, body, latest, posV, interp, lastSeen }
    this.remotes = new Map();
    this.snapshots = new Interpolator(); // client: the host's world
    this.objectives = null;              // client: newest objective view
    this.unsubs = [];

    this._wireLoot();
    this._listen();
  }

  // --- setup -----------------------------------------------------------------

  _wireLoot() {
    const loot = this.match.loot;
    const net = this.net;
    if (this.isHost) {
      loot.remote = {
        spawn: (id, payload, pos) => net.send(MSG.LOOT_SPAWN, { i: id, p: payload, x: packPos(pos) }),
        claimed: (id, toId) => net.send(MSG.LOOT_GONE, { i: id, to: toId }),
      };
    } else {
      loot.authority = false;
      loot.remote = {
        take: (id) => net.send(MSG.LOOT_TAKE, { i: id }),
        drop: (payload, pos) => net.send(MSG.LOOT_DROP, { p: payload, x: packPos(pos) }),
        openChest: (index) => net.send(MSG.CHEST_OPEN, { c: index }),
      };
    }
  }

  _listen() {
    const on = (type, fn) => this.unsubs.push(this.net.on(type, fn));
    const m = this.match;

    on(EVT.PLAYERS, () => this._syncRoster());
    on(EVT.LEFT, ({ id }) => this._removeRemote(id));

    if (this.isHost) {
      on(MSG.STATE, (d, from) => {
        const r = this._remote(from);
        if (!r) return;
        const state = unpackPlayer(d);
        r.latest = state;
        r.posV.set(state.pos.x, state.pos.y, state.pos.z);
        r.lastSeen = this.clock;
        r.interp.push({ time: d.t, players: [state], enemies: [], objectives: [] });
      });
      on(MSG.ENEMY_HIT, (d, from) => {
        const enemy = m.enemies.find((e) => e.id === d.e);
        // Validate: a bot another player already killed must not count twice.
        if (!enemy || !enemy.alive) return;
        const res = enemy.hurt(Number(d.d) || 0);
        if (res.killed) m._onEnemyKilled(enemy, from);
      });
      on(MSG.CHEST_OPEN, (d, from) => {
        const chest = m.loot.chests[d.c];
        if (chest) m.loot.openChest(chest, from);
      });
      on(MSG.LOOT_TAKE, (d, from) => m.loot.grantRemote(d.i, from));
      on(MSG.LOOT_DROP, (d) => {
        if (!d.p || !Array.isArray(d.x)) return;
        const pos = unpackPos(d.x);
        m.loot.dropAt(new THREE.Vector3(pos.x, pos.y, pos.z), d.p);
      });
      on(MSG.MATCH_LEAVE, (_d, from) => this._removeRemote(from));
    } else {
      on(MSG.SNAPSHOT, (d) => {
        const snap = unpackSnapshot(d);
        if (this.snapshots.push(snap)) this.objectives = snap.objectives;
      });
      on(MSG.LOOT_SPAWN, (d) => {
        if (!d.p || !Array.isArray(d.x)) return;
        const pos = unpackPos(d.x);
        m.loot.spawnRemote(d.i, d.p, new THREE.Vector3(pos.x, pos.y, pos.z));
      });
      on(MSG.LOOT_GONE, (d) => m.loot.resolveRemote(d.i, d.to === this.localId));
      on(MSG.CHEST_DONE, (d) => {
        const chest = m.loot.markChestOpened(d.c);
        if (chest) m._onChestOpenedRemote(d.by);
      });
      on(MSG.KILL, (d) => m._onKillAnnounced(d.by, d.n));
      on(MSG.PLAYER_HURT, (d) => {
        const from = Array.isArray(d.f) ? unpackPos(d.f) : null;
        m._onPlayerDamaged(Number(d.d) || 0, from ? new THREE.Vector3(from.x, from.y, from.z) : null);
      });
      on(MSG.MISSION_END, (d) => m.finish(!!d.ok && m.player.alive));
    }
  }

  // --- remotes ---------------------------------------------------------------

  _remote(id) {
    if (id === this.localId) return null;
    let r = this.remotes.get(id);
    if (r) return r;
    const info = this.net.players.find((p) => p.id === id);
    if (!info) return null; // not in the session
    r = {
      name: info.name, color: info.color, body: null, latest: null,
      posV: new THREE.Vector3(), interp: new Interpolator(), lastSeen: this.clock,
    };
    this.remotes.set(id, r);
    return r;
  }

  _body(r) {
    if (!r.body) r.body = new RemotePlayer(this.match.scene, { name: r.name, color: r.color });
    return r.body;
  }

  _removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.body?.dispose();
    this.remotes.delete(id);
  }

  _syncRoster() {
    const ids = new Set(this.net.players.map((p) => p.id));
    for (const id of [...this.remotes.keys()]) if (!ids.has(id)) this._removeRemote(id);
  }

  playerName(id) {
    return this.net.playerName(id);
  }

  // --- host queries ----------------------------------------------------------

  // Nearest living player to a point, as the bots see it. Falls back to the
  // local player (dead) so a bot always has something to idle toward.
  targetFor(pos) {
    const local = this.match.player;
    let best = { pos: local.pos, alive: local.alive, id: null };
    let bestD = local.alive ? local.pos.distanceTo(pos) : Infinity;
    for (const [id, r] of this.remotes) {
      if (!r.latest?.alive) continue;
      const d = r.posV.distanceTo(pos);
      if (d < bestD) { bestD = d; best = { pos: r.posV, alive: true, id }; }
    }
    return best;
  }

  anyPlayerAt(pos, radius) {
    for (const r of this.remotes.values()) {
      if (r.latest?.alive && r.posV.distanceTo(pos) < radius) return true;
    }
    return false;
  }

  anyAlive() {
    if (this.match.player.alive) return true;
    for (const r of this.remotes.values()) if (r.latest?.alive) return true;
    return false;
  }

  // Every player position, for keeping bot spawns out of everyone's face.
  playerPositions() {
    const out = [this.match.player.pos];
    for (const r of this.remotes.values()) if (r.latest) out.push(r.posV);
    return out;
  }

  // --- host announcements ----------------------------------------------------

  hurtRemote(id, amount, from) {
    this.net.sendTo(id, MSG.PLAYER_HURT, { d: Math.round(amount * 10) / 10, f: from ? packPos(from) : null });
  }

  announceKill(enemy, byId) {
    this.net.send(MSG.KILL, { e: enemy.id, by: byId ?? this.localId, n: enemy.def.name });
  }

  announceChest(index, byId) {
    this.net.send(MSG.CHEST_DONE, { c: index, by: byId ?? this.localId });
  }

  announceEnd(success) {
    this.net.send(MSG.MISSION_END, { ok: !!success });
  }

  // --- client actions --------------------------------------------------------

  // Weapon hook: report the hit, show feedback, let the host decide.
  clientHit(enemy, damage, isHead) {
    if (!enemy.alive) return { total: 0, killed: false };
    enemy.flash();
    this.net.send(MSG.ENEMY_HIT, { e: enemy.id, d: Math.round(damage * 10) / 10, h: isHead ? 1 : 0 });
    return { total: damage, killed: false };
  }

  // --- per-frame -------------------------------------------------------------

  _localState() {
    const m = this.match;
    const p = m.player;
    const w = m.weapon;
    return {
      id: this.localId,
      pos: p.pos, yaw: p.yaw, pitch: p.pitch,
      health: p.health, shield: p.shield, alive: p.alive,
      firing: !!(w && m.input.locked && m.input.mouseDown),
      weaponId: w?.item.itemId ?? null,
      rarity: w?.item.rarity ?? null,
    };
  }

  update(dt) {
    this.clock += dt;
    this.sendAcc += dt;
    if (this.isHost) this._hostTick(dt);
    else this._clientTick(dt);
  }

  _hostTick(dt) {
    for (const [id, r] of this.remotes) {
      if (this.clock - r.lastSeen > STALE_AFTER) { this._removeRemote(id); continue; }
      const s = r.interp.sample();
      if (s?.players[0]) this._body(r).apply(s.players[0], dt);
    }
    if (this.sendAcc < SEND_RATE) return;
    this.sendAcc = 0;

    const m = this.match;
    const players = [this._localState()];
    for (const r of this.remotes.values()) if (r.latest) players.push(r.latest);
    const enemies = m.enemies.map((e) => ({
      id: e.id, type: e.def.id, pos: e.pos, yaw: e.group.rotation.y,
      health: e.health, shield: e.shield, alive: e.alive,
    }));
    this.net.send(MSG.SNAPSHOT, packSnapshot({
      time: this.clock, players, enemies, objectives: m.objectives.view(),
    }));
  }

  _clientTick(dt) {
    const s = this.snapshots.sample();
    if (s) {
      this._syncPlayers(s.players, dt);
      this._syncEnemies(s.enemies, dt);
    }
    if (this.sendAcc < SEND_RATE) return;
    this.sendAcc = 0;
    this.net.send(MSG.STATE, { ...packPlayer(this._localState()), t: this.clock });
  }

  _syncPlayers(list, dt) {
    const seen = new Set();
    for (const s of list) {
      if (s.id === this.localId) continue;
      const r = this._remote(s.id);
      if (!r) continue;
      seen.add(s.id);
      r.latest = s;
      this._body(r).apply(s, dt);
    }
    for (const id of [...this.remotes.keys()]) if (!seen.has(id)) this._removeRemote(id);
  }

  _syncEnemies(list, dt) {
    const m = this.match;
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      let e = m.enemies.find((x) => x.id === s.id);
      if (!e) {
        if (!s.alive) continue; // died before we ever saw it
        const def = ENEMIES[s.type];
        if (!def) continue;
        e = new Enemy(def, new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z), m._enemyCtx());
        e.id = s.id;
        m.enemies.push(e); // in place: the weapon holds a reference to this array
      }
      e.applyRemote(s, dt);
    }
    for (let i = m.enemies.length - 1; i >= 0; i--) {
      if (seen.has(m.enemies[i].id)) continue;
      m.enemies[i].dispose();
      m.enemies.splice(i, 1);
    }
  }

  dispose() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.isClient && !this.net.closed) this.net.send(MSG.MATCH_LEAVE);
    for (const id of [...this.remotes.keys()]) this._removeRemote(id);
    this.match.loot.remote = null;
  }
}
