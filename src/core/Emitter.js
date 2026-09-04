// Minimal event emitter shared by the state machine and gameplay systems.
export class Emitter {
  constructor() {
    this._handlers = new Map();
  }

  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }

  // Extra arguments are forwarded (NetSession passes the sender's peer id).
  emit(event, payload, ...rest) {
    const set = this._handlers.get(event);
    if (!set) return;
    for (const fn of [...set]) fn(payload, ...rest);
  }

  clear() {
    this._handlers.clear();
  }
}
