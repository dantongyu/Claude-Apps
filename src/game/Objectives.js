import { Emitter } from '../core/Emitter.js';

// Tracks a mission's objective list. `extract` only unlocks once everything
// else is done, which is what makes it read as the finale rather than a race.
export class Objectives extends Emitter {
  constructor(mission) {
    super();
    this.mission = mission;
    this.entries = mission.objectives.map((o) => ({
      ...o, current: 0, done: false,
    }));
    this.complete = false;
    this.elapsed = 0;
  }

  get extractEntry() {
    return this.entries.find((e) => e.type === 'extract') ?? null;
  }

  // Extraction is gated on every other objective being finished.
  get extractUnlocked() {
    const e = this.extractEntry;
    if (!e) return false;
    return this.entries.every((x) => x === e || x.done);
  }

  _bump(type, amount = 1) {
    for (const e of this.entries) {
      if (e.type !== type || e.done) continue;
      e.current = Math.min(e.count, e.current + amount);
      if (e.current >= e.count) {
        e.done = true;
        this.emit('objective', e);
      }
    }
    this._checkComplete();
  }

  onKill() { this._bump('eliminate'); }
  onChestOpened() { this._bump('chests'); }

  tick(dt, playerAtExtract) {
    this.elapsed += dt;
    for (const e of this.entries) {
      if (e.type === 'survive' && !e.done) {
        e.current = Math.min(e.count, e.current + dt);
        if (e.current >= e.count) {
          e.done = true;
          this.emit('objective', e);
        }
      }
    }
    if (playerAtExtract && this.extractUnlocked) this._bump('extract');
    this._checkComplete();
  }

  _checkComplete() {
    if (this.complete) return;
    if (this.entries.every((e) => e.done)) {
      this.complete = true;
      this.emit('complete');
    }
  }

  // Shape the HUD renders.
  view() {
    return this.entries.map((e) => ({
      label: e.label,
      done: e.done,
      locked: e.type === 'extract' && !this.extractUnlocked,
      text: e.type === 'survive'
        ? `${Math.max(0, Math.ceil(e.count - e.current))}s`
        : `${Math.floor(e.current)}/${e.count}`,
      pct: Math.min(1, e.current / e.count),
    }));
  }
}
