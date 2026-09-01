// Fixed-step simulation with an accumulator, rendered once per animation frame.
// Keeps aim, recoil and bot behaviour frame-rate independent.
const STEP = 1 / 60;
const MAX_FRAME = 0.25; // never simulate more than a quarter second at once

export class Loop {
  constructor() {
    this.update = null;
    this.render = null;
    this._raf = 0;
    this._last = 0;
    this._acc = 0;
    this.running = false;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now() / 1000;
    this._acc = 0;
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);

    const now = performance.now() / 1000;
    let frame = now - this._last;
    this._last = now;
    if (frame > MAX_FRAME) frame = MAX_FRAME;
    this._acc += frame;

    let steps = 0;
    while (this._acc >= STEP && steps < 8) {
      this.update?.(STEP);
      this._acc -= STEP;
      steps++;
    }
    // Bail out of a death spiral rather than falling further behind.
    if (steps === 8) this._acc = 0;

    this.render?.(frame, this._acc / STEP);
  }
}
