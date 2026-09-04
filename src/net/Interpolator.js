// Snapshots arrive ~15 times a second but we render at 60+. Rather than snapping
// remote players and bots to the newest snapshot (which looks like a slideshow),
// we render them a fixed delay in the past and interpolate between the two
// snapshots that bracket that moment.
//
// The delay is the cost: remote players are shown ~120ms behind where they
// really are. That is the standard trade and is invisible in co-op.

export const INTERP_DELAY = 0.12;
const MAX_BUFFER = 24;

// Shortest-path angle lerp, so a bot turning past PI doesn't spin the long way.
export function lerpAngle(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Interpolator {
  constructor(delay = INTERP_DELAY) {
    this.delay = delay;
    this.buffer = []; // ascending by time
  }

  push(snapshot) {
    // Drop anything that arrives out of order; UDP-like ordering is not
    // guaranteed once a connection gets unhappy.
    const last = this.buffer[this.buffer.length - 1];
    if (last && snapshot.time <= last.time) return false;
    this.buffer.push(snapshot);
    while (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    return true;
  }

  get latest() {
    return this.buffer[this.buffer.length - 1] ?? null;
  }

  // The moment we should be rendering, given the newest snapshot we hold.
  renderTime() {
    const latest = this.latest;
    return latest ? latest.time - this.delay : 0;
  }

  // Returns { players, enemies, objectives } interpolated to renderTime(), or
  // null when nothing has arrived yet.
  sample() {
    if (this.buffer.length === 0) return null;
    if (this.buffer.length === 1) return this.buffer[0];

    const t = this.renderTime();
    let older = this.buffer[0];
    let newer = this.buffer[1];
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].time <= t && this.buffer[i + 1].time >= t) {
        older = this.buffer[i];
        newer = this.buffer[i + 1];
        break;
      }
    }

    const span = newer.time - older.time;
    const k = span > 0 ? Math.max(0, Math.min(1, (t - older.time) / span)) : 1;

    return {
      time: t,
      players: blendList(older.players, newer.players, k),
      enemies: blendList(older.enemies, newer.enemies, k),
      // Discrete state always comes from the newest snapshot — interpolating a
      // kill count would be nonsense.
      objectives: newer.objectives,
    };
  }

  clear() {
    this.buffer = [];
  }
}

function blendList(oldList, newList, k) {
  const byId = new Map(oldList.map((e) => [e.id, e]));
  return newList.map((n) => {
    const o = byId.get(n.id);
    if (!o) return n; // appeared this snapshot: no history to blend from
    return {
      ...n,
      pos: {
        x: lerp(o.pos.x, n.pos.x, k),
        y: lerp(o.pos.y, n.pos.y, k),
        z: lerp(o.pos.z, n.pos.z, k),
      },
      yaw: lerpAngle(o.yaw, n.yaw, k),
      pitch: n.pitch != null && o.pitch != null ? lerp(o.pitch, n.pitch, k) : n.pitch,
    };
  });
}
