// The host's view of who is in the room. Pure bookkeeping, no networking, so the
// join/refuse/timeout rules can be tested without a browser.
import { cleanName, MAX_PLAYERS } from './Protocol.js';

export class Roster {
  constructor({ maxPlayers = MAX_PLAYERS, timeout = 8 } = {}) {
    this.maxPlayers = maxPlayers;
    this.timeout = timeout;
    this.players = []; // [{ id, name, color, host, lastSeen }] in join order
    this.locked = false; // true once a mission has started: no late joins
  }

  get size() {
    return this.players.length;
  }

  get(id) {
    return this.players.find((p) => p.id === id) ?? null;
  }

  has(id) {
    return !!this.get(id);
  }

  // Returns { ok: true, player } or { ok: false, reason } with a reason the
  // joining player can be shown verbatim.
  add(id, { name, color, host = false, now = 0 } = {}) {
    if (this.has(id)) return { ok: false, reason: 'already in the room' };
    if (this.locked) return { ok: false, reason: 'mission already in progress' };
    if (this.size >= this.maxPlayers) return { ok: false, reason: 'room is full' };
    const player = {
      id, host,
      name: this._uniqueName(cleanName(name)),
      color: typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : '#5b8dd6',
      lastSeen: now,
    };
    this.players.push(player);
    return { ok: true, player };
  }

  remove(id) {
    const i = this.players.findIndex((p) => p.id === id);
    if (i === -1) return null;
    return this.players.splice(i, 1)[0];
  }

  touch(id, now) {
    const p = this.get(id);
    if (p) p.lastSeen = now;
  }

  // Non-host ids that have gone quiet for longer than the timeout.
  stale(now) {
    return this.players
      .filter((p) => !p.host && now - p.lastSeen > this.timeout)
      .map((p) => p.id);
  }

  lock() { this.locked = true; }
  unlock() { this.locked = false; }

  // What gets broadcast: no connection handles, no timestamps.
  list() {
    return this.players.map(({ id, name, color, host }) => ({ id, name, color, host }));
  }

  // Two "Operator"s become "Operator" and "Operator 2" so the HUD and kill feed
  // stay unambiguous.
  _uniqueName(base) {
    const taken = new Set(this.players.map((p) => p.name));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
