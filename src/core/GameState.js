import { Emitter } from './Emitter.js';

export const State = {
  LOBBY: 'LOBBY',
  MISSIONS: 'MISSIONS',
  INVENTORY: 'INVENTORY',
  SHOP: 'SHOP',
  MATCH: 'MATCH',
  RESULTS: 'RESULTS',
};

// Owns the current screen. UI and the render loop subscribe to `change`.
export class GameState extends Emitter {
  constructor() {
    super();
    this.current = State.LOBBY;
    this.payload = null;
  }

  go(next, payload = null) {
    if (!State[next]) throw new Error(`unknown state: ${next}`);
    const prev = this.current;
    this.current = next;
    this.payload = payload;
    this.emit('change', { prev, next, payload });
  }

  is(state) {
    return this.current === state;
  }
}
