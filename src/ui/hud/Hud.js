import { itemDef, itemColor } from '../../inventory/Item.js';
import { AMMO_TYPES } from '../../data/weapons.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// The in-match overlay. Plain DOM on top of the canvas — cheap, and far easier
// to style than sprites.
export class Hud {
  constructor(root) {
    this.root = root;
    this.root.innerHTML = '';
    this.root.classList.add('hud-active');

    this.crosshair = el('div', 'crosshair');
    this.crosshair.innerHTML = '<i></i><i></i><i></i><i></i>';
    this.hitmarker = el('div', 'hitmarker');
    this.crosshair.appendChild(this.hitmarker);
    this.root.appendChild(this.crosshair);

    this.damageFlash = el('div', 'damage-flash');
    this.root.appendChild(this.damageFlash);

    this.dirIndicator = el('div', 'dir-indicator');
    this.root.appendChild(this.dirIndicator);

    // bottom-left: health + shield
    const vitals = el('div', 'vitals');
    this.shieldBar = el('div', 'bar shield');
    this.shieldFill = el('i');
    this.shieldText = el('span', 'bar-text', '0');
    this.shieldBar.append(this.shieldFill, this.shieldText);
    this.healthBar = el('div', 'bar health');
    this.healthFill = el('i');
    this.healthText = el('span', 'bar-text', '100');
    this.healthBar.append(this.healthFill, this.healthText);
    vitals.append(this.shieldBar, this.healthBar);
    this.root.appendChild(vitals);

    // bottom-right: ammo
    this.ammoBox = el('div', 'ammo-box');
    this.magEl = el('span', 'mag', '--');
    this.reserveEl = el('span', 'reserve', '/ --');
    this.ammoTypeEl = el('div', 'ammo-type', '');
    this.reloadHint = el('div', 'reload-hint', '');
    this.ammoBox.append(el('div', 'ammo-line'), this.reloadHint, this.ammoTypeEl);
    this.ammoBox.querySelector('.ammo-line').append(this.magEl, this.reserveEl);
    this.root.appendChild(this.ammoBox);

    // bottom-centre: hotbar
    this.hotbar = el('div', 'hotbar');
    this.slotEls = [];
    for (let i = 0; i < 5; i++) {
      const s = el('div', 'slot');
      s.append(el('span', 'slot-key', String(i + 1)), el('span', 'slot-name', ''), el('span', 'slot-count', ''));
      this.hotbar.appendChild(s);
      this.slotEls.push(s);
    }
    this.root.appendChild(this.hotbar);

    // top-right: objectives
    this.objectives = el('div', 'objectives');
    this.root.appendChild(this.objectives);

    // top-centre: mission banner + interact prompt
    this.banner = el('div', 'banner');
    this.root.appendChild(this.banner);
    this.prompt = el('div', 'prompt');
    this.root.appendChild(this.prompt);

    // toasts + floating damage numbers
    this.toasts = el('div', 'toasts');
    this.root.appendChild(this.toasts);
    this.floaters = el('div', 'floaters');
    this.root.appendChild(this.floaters);

    this.killfeed = el('div', 'killfeed');
    this.root.appendChild(this.killfeed);

    this._hitT = 0;
    this._flashT = 0;
    this._dirT = 0;
    this._objSig = '';
  }

  setBanner(text, sub = '') {
    this.banner.innerHTML = '';
    this.banner.append(el('div', 'banner-title', text));
    if (sub) this.banner.append(el('div', 'banner-sub', sub));
    this.banner.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.banner.classList.remove('show'), 3200);
  }

  setPrompt(text) {
    this.prompt.textContent = text ?? '';
    this.prompt.classList.toggle('show', !!text);
  }

  vitals(health, shield) {
    this.healthFill.style.width = `${Math.max(0, health)}%`;
    this.healthText.textContent = String(Math.ceil(Math.max(0, health)));
    this.shieldFill.style.width = `${Math.max(0, shield)}%`;
    this.shieldText.textContent = String(Math.ceil(Math.max(0, shield)));
    this.shieldBar.classList.toggle('empty', shield <= 0);
  }

  ammo(weapon) {
    if (!weapon) {
      this.magEl.textContent = '--';
      this.reserveEl.textContent = '';
      this.ammoTypeEl.textContent = '';
      this.reloadHint.textContent = '';
      this.ammoBox.classList.add('dim');
      return;
    }
    this.ammoBox.classList.remove('dim');
    this.magEl.textContent = String(weapon.mag);
    this.reserveEl.textContent = `/ ${weapon.reserve}`;
    this.ammoTypeEl.textContent = AMMO_TYPES[weapon.ammoType].name;
    this.magEl.classList.toggle('low', weapon.mag <= Math.ceil(weapon.magSize * 0.25));
    if (weapon.isReloading) this.reloadHint.textContent = 'RELOADING';
    else if (weapon.mag === 0) this.reloadHint.textContent = weapon.reserve > 0 ? 'PRESS R' : 'NO AMMO';
    else this.reloadHint.textContent = '';
  }

  hotbarState(inventory) {
    for (let i = 0; i < this.slotEls.length; i++) {
      const s = this.slotEls[i];
      const item = inventory.slots[i];
      s.classList.toggle('active', inventory.active === i);
      s.classList.toggle('filled', !!item);
      const nameEl = s.querySelector('.slot-name');
      const countEl = s.querySelector('.slot-count');
      if (!item) {
        nameEl.textContent = '';
        countEl.textContent = '';
        s.style.borderColor = '';
        continue;
      }
      nameEl.textContent = itemDef(item)?.name ?? '?';
      countEl.textContent = item.kind === 'consumable' ? `x${item.count}` : '';
      s.style.borderColor = itemColor(item);
    }
  }

  objectiveList(view) {
    const sig = JSON.stringify(view);
    if (sig === this._objSig) return; // avoid rebuilding DOM every frame
    this._objSig = sig;
    this.objectives.innerHTML = '';
    for (const o of view) {
      const row = el('div', `obj${o.done ? ' done' : ''}${o.locked ? ' locked' : ''}`);
      row.append(el('span', 'obj-label', o.label), el('span', 'obj-count', o.locked ? 'LOCKED' : o.text));
      const track = el('div', 'obj-track');
      const fill = el('i');
      fill.style.width = `${o.pct * 100}%`;
      track.appendChild(fill);
      row.appendChild(track);
      this.objectives.appendChild(row);
    }
  }

  toast(text, color = '#e8e8e8') {
    const t = el('div', 'toast', text);
    t.style.borderLeftColor = color;
    this.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), 1600);
    setTimeout(() => t.remove(), 2200);
  }

  kill(text) {
    const k = el('div', 'kill', text);
    this.killfeed.appendChild(k);
    setTimeout(() => k.classList.add('out'), 1800);
    setTimeout(() => k.remove(), 2400);
  }

  hitMark(isHead) {
    this.hitmarker.classList.toggle('head', isHead);
    this.hitmarker.classList.add('show');
    this._hitT = 0.14;
  }

  damageNumber(screenX, screenY, amount, isHead) {
    const f = el('div', `floater${isHead ? ' head' : ''}`, String(Math.round(amount)));
    f.style.left = `${screenX}px`;
    f.style.top = `${screenY}px`;
    this.floaters.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  tookDamage(angle) {
    this._flashT = 0.35;
    this.damageFlash.style.opacity = '0.5';
    if (angle != null) {
      this.dirIndicator.style.transform = `rotate(${angle}rad)`;
      this.dirIndicator.style.opacity = '1';
      this._dirT = 1.1;
    }
  }

  update(dt) {
    if (this._hitT > 0) {
      this._hitT -= dt;
      if (this._hitT <= 0) this.hitmarker.classList.remove('show');
    }
    if (this._flashT > 0) {
      this._flashT -= dt;
      this.damageFlash.style.opacity = String(Math.max(0, this._flashT / 0.35) * 0.5);
    }
    if (this._dirT > 0) {
      this._dirT -= dt;
      this.dirIndicator.style.opacity = String(Math.max(0, this._dirT / 1.1));
    }
  }

  dispose() {
    clearTimeout(this._bannerT);
    this.root.classList.remove('hud-active');
    this.root.innerHTML = '';
  }
}
