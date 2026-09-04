// The only file that touches PeerJS. Everything else talks to a NetSession, so
// swapping the transport (TURN relay, a hosted WebSocket server) is a one-file
// change. PeerJS is loaded as a classic script by index.html and exposes
// `window.Peer`; it is not imported here so the game still boots without it.
import { Emitter } from '../core/Emitter.js';
import {
  MSG, EVT, PROTOCOL_VERSION, makeRoomCode, normaliseRoomCode, isValidRoomCode,
  peerIdForRoom, cleanName,
} from './Protocol.js';
import { Roster } from './Roster.js';

const HEARTBEAT = 2;        // seconds between pings
const TIMEOUT = 8;          // seconds of silence before a peer is dropped
const JOIN_TIMEOUT = 12000; // ms to wait for the host's WELCOME
const HOST_ATTEMPTS = 5;    // room codes to try before giving up

const now = () => performance.now() / 1000;

function peerLib() {
  const P = globalThis.Peer;
  if (!P) throw new Error('Multiplayer is unavailable: PeerJS did not load');
  return P;
}

// Resolves with an open Peer, or rejects with the PeerJS error (which carries
// `.type`, e.g. 'unavailable-id' when someone already holds that room).
function openPeer(id) {
  return new Promise((resolve, reject) => {
    const Peer = peerLib();
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    let settled = false;
    peer.once('open', () => { settled = true; resolve(peer); });
    peer.once('error', (err) => {
      if (settled) return;
      settled = true;
      try { peer.destroy(); } catch { /* already gone */ }
      reject(err);
    });
  });
}

function friendlyError(err) {
  const type = err?.type ?? '';
  if (type === 'peer-unavailable') return new Error('No room with that code. Check it with the host.');
  if (type === 'network' || type === 'server-error') return new Error('Could not reach the signalling server. Check your connection.');
  if (type === 'browser-incompatible') return new Error('This browser does not support WebRTC.');
  return err instanceof Error ? err : new Error(String(err?.message ?? err));
}

function safeSend(conn, msg) {
  if (!conn || !conn.open) return;
  try { conn.send(msg); } catch { /* the close handler will clean up */ }
}

export class NetSession extends Emitter {
  constructor(peer, { isHost, roomCode }) {
    super();
    this.peer = peer;
    this.isHost = isHost;
    this.roomCode = roomCode;
    this.localId = peer.id;
    this.hostId = isHost ? peer.id : peerIdForRoom(roomCode);
    this.conns = new Map(); // peer id -> DataConnection
    this.roster = isHost ? new Roster({ timeout: TIMEOUT }) : null;
    this._players = [];     // client-side copy of the host's list
    this._hostSeen = now();
    this.closed = false;
    this._hb = setInterval(() => this._heartbeat(), HEARTBEAT * 1000);
  }

  // --- lifecycle -------------------------------------------------------------

  static async host(name, color) {
    let lastErr = null;
    for (let i = 0; i < HOST_ATTEMPTS; i++) {
      const code = makeRoomCode();
      let peer;
      try {
        peer = await openPeer(peerIdForRoom(code));
      } catch (err) {
        lastErr = err;
        // Someone else holds this code on the shared broker: roll another.
        if (err?.type === 'unavailable-id') continue;
        throw friendlyError(err);
      }
      const session = new NetSession(peer, { isHost: true, roomCode: code });
      session.roster.add(peer.id, { name, color, host: true, now: now() });
      session._listenHost();
      return session;
    }
    throw friendlyError(lastErr ?? new Error('Could not claim a room code. Try again.'));
  }

  static async join(code, name, color) {
    if (!isValidRoomCode(code)) throw new Error('Enter the 4-character room code.');
    const roomCode = normaliseRoomCode(code);
    const peer = await openPeer(null).catch((e) => { throw friendlyError(e); });
    const hostId = peerIdForRoom(roomCode);

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { peer.destroy(); } catch { /* ignore */ }
        reject(friendlyError(err));
      };
      const timer = setTimeout(() => fail(new Error('No answer from that room. Is the host still on the multiplayer screen?')), JOIN_TIMEOUT);

      peer.on('error', (err) => fail(err));
      const conn = peer.connect(hostId, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        conn.send({ m: MSG.HELLO, v: PROTOCOL_VERSION, n: cleanName(name), c: color });
      });
      conn.on('data', (d) => {
        if (settled || !d || d.m !== MSG.WELCOME) return;
        if (!d.ok) { fail(new Error(d.reason ?? 'The host refused the connection.')); return; }
        settled = true;
        clearTimeout(timer);
        const session = new NetSession(peer, { isHost: false, roomCode });
        session._attachClient(conn, d.p ?? []);
        resolve(session);
      });
      conn.on('close', () => fail(new Error('The host closed the connection.')));
      conn.on('error', (err) => fail(err));
    });
  }

  leave() {
    if (this.closed) return;
    this.send(MSG.BYE);
    this._teardown();
  }

  _teardown() {
    this.closed = true;
    clearInterval(this._hb);
    for (const c of this.conns.values()) {
      try { c.close(); } catch { /* ignore */ }
    }
    this.conns.clear();
    try { this.peer.destroy(); } catch { /* ignore */ }
  }

  // --- queries ---------------------------------------------------------------

  get isClient() { return !this.isHost; }

  get players() {
    return this.isHost ? this.roster.list() : this._players;
  }

  get localPlayer() {
    return this.players.find((p) => p.id === this.localId) ?? null;
  }

  playerName(id) {
    return this.players.find((p) => p.id === id)?.name ?? 'Operator';
  }

  // Host only: refuse late joins while a mission is running.
  setInMatch(inMatch) {
    if (!this.roster) return;
    if (inMatch) this.roster.lock(); else this.roster.unlock();
  }

  // --- sending ---------------------------------------------------------------

  // Client -> host, or host -> everyone.
  send(type, payload = {}) {
    const msg = { ...payload, m: type };
    for (const c of this.conns.values()) safeSend(c, msg);
  }

  sendTo(id, type, payload = {}) {
    safeSend(this.conns.get(id), { ...payload, m: type });
  }

  // --- host side -------------------------------------------------------------

  _listenHost() {
    this.peer.on('connection', (conn) => {
      conn.on('data', (d) => this._hostData(conn, d));
      conn.on('close', () => this._hostDrop(conn.peer));
      conn.on('error', () => this._hostDrop(conn.peer));
    });
    this.peer.on('error', (err) => this.emit('error', friendlyError(err)));
    this.peer.on('disconnected', () => {
      // Lost the broker, not the peers: data channels keep working, but a
      // reconnect lets new players still find the room.
      if (!this.closed) { try { this.peer.reconnect(); } catch { /* ignore */ } }
    });
  }

  _hostData(conn, d) {
    if (!d || typeof d !== 'object') return;
    const id = conn.peer;
    if (d.m === MSG.HELLO) {
      const refuse = (reason) => {
        safeSend(conn, { m: MSG.WELCOME, ok: false, reason });
        setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 250);
      };
      if (d.v !== PROTOCOL_VERSION) {
        refuse('Version mismatch: everyone needs the latest build of the game.');
        return;
      }
      const res = this.roster.add(id, { name: d.n, color: d.c, now: now() });
      if (!res.ok) { refuse(`Could not join: ${res.reason}.`); return; }
      this.conns.set(id, conn);
      safeSend(conn, { m: MSG.WELCOME, ok: true, id, code: this.roomCode, p: this.roster.list() });
      this._broadcastPlayers();
      return;
    }
    if (!this.roster.has(id)) return; // never admitted
    this.roster.touch(id, now());
    if (d.m === MSG.PING) return;
    if (d.m === MSG.BYE) { this._hostDrop(id); return; }
    this.emit(d.m, d, id);
  }

  _hostDrop(id) {
    const conn = this.conns.get(id);
    this.conns.delete(id);
    if (conn) { try { conn.close(); } catch { /* ignore */ } }
    const p = this.roster.remove(id);
    if (!p || this.closed) return;
    this.emit(EVT.LEFT, { id, name: p.name });
    this._broadcastPlayers();
  }

  _broadcastPlayers() {
    const list = this.roster.list();
    this.send(MSG.LOBBY, { p: list });
    this.emit(EVT.PLAYERS, list);
  }

  // --- client side -----------------------------------------------------------

  _attachClient(conn, players) {
    this.conns.set(this.hostId, conn);
    this._players = players;
    this._hostSeen = now();
    conn.on('data', (d) => this._clientData(d));
    conn.on('close', () => this._hostGone());
    conn.on('error', () => this._hostGone());
    this.peer.on('error', (err) => {
      // Once connected, broker errors are not fatal; a dead host is caught by
      // the heartbeat.
      if (!this.closed) this.emit('error', friendlyError(err));
    });
    this.peer.on('disconnected', () => {
      if (!this.closed) { try { this.peer.reconnect(); } catch { /* ignore */ } }
    });
  }

  _clientData(d) {
    if (!d || typeof d !== 'object') return;
    this._hostSeen = now();
    if (d.m === MSG.PING) return;
    if (d.m === MSG.LOBBY) {
      this._players = d.p ?? [];
      this.emit(EVT.PLAYERS, this._players);
      return;
    }
    if (d.m === MSG.BYE) { this._hostGone(); return; }
    this.emit(d.m, d, this.hostId);
  }

  _hostGone() {
    if (this.closed) return;
    this._teardown();
    this.emit(EVT.HOST_LEFT);
  }

  // --- heartbeat -------------------------------------------------------------

  _heartbeat() {
    if (this.closed) return;
    const t = now();
    this.send(MSG.PING);
    if (this.isHost) {
      for (const id of this.roster.stale(t)) this._hostDrop(id);
    } else if (t - this._hostSeen > TIMEOUT) {
      this._hostGone();
    }
  }
}
