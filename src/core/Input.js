// Keyboard/mouse state plus pointer-lock mouselook deltas.
// Consumers read `input.down(action)` rather than raw key codes so bindings stay
// in one table.
const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'KeyC'],
  reload: ['KeyR'],
  interact: ['KeyE'],
  drop: ['KeyG'],
  use: ['KeyF'],
};

const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.sensitivity = 0.0022;
    this._pressed = new Set(); // edge-triggered, cleared each frame
    this._slotRequest = -1;
    this._listeners = [];
    this.onLockChange = null;
    this._bind();
  }

  _add(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

  _bind() {
    this._add(window, 'keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      const slot = SLOT_KEYS.indexOf(e.code);
      if (slot >= 0) this._slotRequest = slot;
      // Space scrolls the page otherwise.
      if (e.code === 'Space' && this.locked) e.preventDefault();
    });
    this._add(window, 'keyup', (e) => this.keys.delete(e.code));
    this._add(window, 'blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    this._add(this.element, 'mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    this._add(window, 'mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    this._add(window, 'mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX * this.sensitivity;
      this.mouseDY += e.movementY * this.sensitivity;
    });
    this._add(window, 'wheel', (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    this._add(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) {
        this.keys.clear();
        this.mouseDown = false;
      }
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    if (!this.locked) this.element.requestPointerLock?.();
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock?.();
  }

  down(action) {
    const codes = BINDINGS[action];
    if (!codes) return false;
    return codes.some((c) => this.keys.has(c));
  }

  // True once, on the frame the action was pressed.
  pressed(action) {
    const codes = BINDINGS[action];
    if (!codes) return false;
    return codes.some((c) => this._pressed.has(c));
  }

  // Consume a 1-5 hotbar keypress; -1 when none.
  takeSlotRequest() {
    const s = this._slotRequest;
    this._slotRequest = -1;
    return s;
  }

  takeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this._pressed.clear();
  }

  dispose() {
    for (const [t, type, fn, opts] of this._listeners) t.removeEventListener(type, fn, opts);
    this._listeners = [];
  }
}
