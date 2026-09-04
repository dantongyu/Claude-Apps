import * as THREE from 'three';
import { weaponStats, opticFor } from '../data/weapons.js';
import { computeDamage, currentSpread } from './Combat.js';
import { buildWeaponModel } from './WeaponModel.js';

const MAX_RANGE = 220;

// Where the gun rests when you are not aiming. These are view-space metres in
// the viewmodel layer's fixed 52-degree camera, so they mean the same thing
// whatever FOV the player has chosen for the world.
const HIP = new THREE.Vector3(0.17, -0.205, -0.40);

// Guns are modelled life-size; hands hold them a little closer than the eye
// wants to see them, so the viewmodel is drawn slightly under scale.
const MODEL_SCALE = 0.72;

// How far out the gun sits once aimed. Closer than the hip pose, but not so
// close that the receiver swallows the screen.
const ADS_Z = -0.30;

// The gun is angled a few degrees across the view rather than pointing straight
// down -Z. Dead-on, you only see the back of the receiver; angled, you see the
// side profile and the barrel receding, which is what reads as a gun.
const BASE_YAW = 0.14;
const BASE_PITCH = -0.015;

function damp(current, target, rate, dt) {
  return current + (target - current) * Math.min(1, rate * dt);
}

export class Weapon {
  // ctx: { camera, scene, effects, arena, enemies, player, inventory, onDamage, onKill, applyHit? }
  constructor(item, ctx) {
    this.item = item;
    this.ctx = ctx;
    this.stats = weaponStats(item.itemId, item.rarity);
    this.optic = opticFor(this.stats, item.attachments?.optic ?? null);
    this.ammoType = this.stats.ammo;
    if (item.ammoInMag == null) item.ammoInMag = this.stats.magazine;
    this.mag = item.ammoInMag;

    this.cooldown = 0;
    this.reloading = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this._triggerWasDown = false;

    this.viewmodel = buildWeaponModel(this.stats, this.optic.id === 'iron' ? null : this.optic);
    this.viewmodel.scale.setScalar(MODEL_SCALE);
    this.viewmodel.position.copy(HIP);
    ctx.viewmodels.add(this.viewmodel);
    ctx.effects.attachFlashTo(this.viewmodel, this.viewmodel.userData.muzzle);

    // Aiming pose: the sight line goes exactly on the camera axis, rather than
    // sliding the gun to x=0 by eye — otherwise the reticle drifts per weapon.
    // Only x and y matter for alignment; z is just how far the gun is pulled in.
    const sight = this.viewmodel.userData.sight.clone().multiplyScalar(MODEL_SCALE);
    this._adsPose = new THREE.Vector3(-sight.x, -sight.y, ADS_Z);

    this.ads = 0;              // 0 = hip, 1 = fully aimed
    this.scoped = !!this.optic.scoped;
    this._kick = 0;
    this._swayX = 0;
    this._swayY = 0;
    this._bob = 0;
    this._idle = 0;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = MAX_RANGE;
  }

  get magSize() { return this.stats.magazine; }
  get reserve() { return this.ctx.inventory.ammo[this.ammoType] ?? 0; }
  get isReloading() { return this.reloading > 0; }
  get zoom() { return this.optic.zoom; }
  // Slowing the mouse in proportion to magnification is what makes an 8x usable.
  get aimSensitivity() { return 1 / (1 + (this.optic.zoom - 1) * this.ads); }
  // The scope picture is only worth a second render pass once you are most of
  // the way into the aim.
  get scopeActive() { return this.scoped && this.ads > 0.75; }

  // Persist the partially-spent magazine back onto the item.
  syncItem() {
    this.item.ammoInMag = this.mag;
  }

  startReload() {
    if (this.reloading > 0 || this.mag >= this.magSize || this.reserve <= 0) return false;
    this.reloading = this.stats.reload;
    return true;
  }

  _finishReload() {
    const want = this.magSize - this.mag;
    const got = this.ctx.inventory.takeAmmo(this.ammoType, want);
    this.mag += got;
    this.syncItem();
  }

  update(dt, triggerDown, adsDown = false) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this._finishReload();
      }
    }

    // Burst weapons keep firing their burst after the trigger is released.
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0 && this.reloading === 0) {
        this._fireOnce();
        this.burstLeft--;
        this.burstTimer = 1 / (this.stats.fireRate * 1.6);
      }
    } else if (triggerDown && this.reloading === 0 && this.cooldown <= 0) {
      const canFire = this.stats.auto || !this._triggerWasDown;
      if (canFire) {
        if (this.mag > 0) {
          this._fireOnce();
          this.cooldown = 1 / this.stats.fireRate;
          if (this.stats.burst) {
            this.burstLeft = this.stats.burst - 1;
            this.burstTimer = 1 / (this.stats.fireRate * 1.6);
            this.cooldown = (this.stats.burst / (this.stats.fireRate * 1.6)) + 0.18;
          }
        } else if (!this._triggerWasDown) {
          this.startReload();
        }
      }
    }
    this._triggerWasDown = triggerDown;

    this._updateAim(dt, adsDown);
    this._animate(dt);
  }

  // --- aiming ----------------------------------------------------------------

  _updateAim(dt, adsDown) {
    const player = this.ctx.player;
    const sprinting = player.sprinting && !adsDown;
    const want = adsDown && this.reloading === 0 && !sprinting ? 1 : 0;
    const rate = 1 / Math.max(0.05, this.optic.adsTime);
    this.ads = want > this.ads
      ? Math.min(1, this.ads + dt * rate)
      : Math.max(0, this.ads - dt * rate * 1.4);

    // PlayerController already lerps `camera.fov` toward `scopeFov` every tick;
    // all this has to do is choose the target.
    player.scopeFov = this.ads > 0.001
      ? player.baseFov / (1 + (this.optic.zoom - 1) * this.ads)
      : null;
  }

  // --- viewmodel animation ---------------------------------------------------

  _animate(dt) {
    const vm = this.viewmodel;
    const player = this.ctx.player;
    const parts = vm.userData.moving ?? {};

    this._kick *= Math.pow(0.001, dt);
    this._idle += dt;

    const speed = Math.hypot(player.vel.x, player.vel.z);
    const moving = player.onGround && speed > 0.5;
    this._bob += dt * (moving ? 6 + speed * 0.9 : 0);
    const bobAmt = moving ? Math.min(1, speed / 7.8) * 0.016 : 0;

    // Look sway: the gun lags the crosshair, then springs back.
    const look = player.lastLook ?? { x: 0, y: 0 };
    this._swayX = damp(this._swayX, -look.x * 1.6, 9, dt);
    this._swayY = damp(this._swayY, -look.y * 1.2, 9, dt);

    // Reload: dip and roll the gun, drop the magazine out and back in.
    const r = this._reloadPhase();
    const sprint = player.sprinting && speed > 1 && this.ads < 0.05 ? 1 : 0;

    // Aiming damps every cosmetic motion — a steady sight picture is the point.
    const free = (1 - this.ads * 0.85) * (1 - r.blend * 0.5);

    const base = HIP.clone().lerp(this._adsPose, this.ads);
    vm.position.set(
      base.x + (this._swayX + Math.sin(this._idle * 1.1) * 0.0022) * free + sprint * 0.05,
      base.y + (this._swayY + Math.cos(this._idle * 0.9) * 0.0026
        + Math.sin(this._bob * 2) * bobAmt) * free
        - r.dip - sprint * 0.06,
      base.z + this._kick * 0.9,
    );
    // Aiming straightens the gun out: the sight has to end up square to the eye.
    vm.rotation.set(
      BASE_PITCH * free + this._kick * 2.2 - this._swayY * 1.4 * free - r.pitch + sprint * 0.22,
      BASE_YAW * (1 - this.ads) - this._swayX * 1.2 * free + r.yaw,
      Math.sin(this._bob) * bobAmt * 6 * free + r.roll + sprint * 0.5,
    );

    // Moving parts. Slides and bolts ride the recoil; magazines drop on reload.
    const kickN = Math.min(1, this._kick / 0.09);
    if (parts.slide) parts.slide.position.z = -0.15 + kickN * 0.03;
    if (parts.charging) parts.charging.position.z = (parts.charging.userData.z ??= parts.charging.position.z) + kickN * 0.025;
    if (parts.pump) parts.pump.position.z = -0.50 + r.magOut * 0.10;
    if (parts.bolt) parts.bolt.rotation.z = -0.5 + r.magOut * 1.1;
    if (parts.mag) {
      parts.mag.position.y = (parts.mag.userData.y ??= parts.mag.position.y) - r.magOut * 0.28;
      parts.mag.rotation.z = r.magOut * 0.5;
    }
  }

  // Splits the reload countdown into a pose the model can be driven from.
  _reloadPhase() {
    if (this.reloading <= 0) return { blend: 0, dip: 0, pitch: 0, yaw: 0, roll: 0, magOut: 0 };
    const total = Math.max(0.001, this.stats.reload);
    const t = 1 - this.reloading / total;             // 0 -> 1 across the reload
    // Ease in and out so the gun does not snap at either end.
    const blend = Math.min(1, Math.min(t, 1 - t) * 6);
    // The magazine is out through the middle of the animation.
    const magOut = Math.min(1, Math.max(0, (t - 0.15) / 0.25)) * (1 - Math.min(1, Math.max(0, (t - 0.6) / 0.25)));
    return {
      blend,
      dip: blend * 0.09,
      pitch: blend * 0.35,
      yaw: blend * 0.12,
      roll: blend * 0.55,
      magOut,
    };
  }

  // --- firing ----------------------------------------------------------------

  _fireOnce() {
    if (this.mag <= 0) return;
    this.mag--;
    this.syncItem();

    const { camera, player, effects } = this.ctx;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const baseDir = camera.getWorldDirection(new THREE.Vector3());

    const spread = this.currentSpread();

    const pellets = this.stats.pellets ?? 1;
    for (let i = 0; i < pellets; i++) {
      const dir = baseDir.clone();
      if (spread > 0) {
        // Uniform point in a cone around the aim direction.
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(dir, up).normalize();
        const trueUp = new THREE.Vector3().crossVectors(right, dir).normalize();
        dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(trueUp, Math.sin(a) * r).normalize();
      }
      this._trace(origin, dir);
    }

    effects.muzzleFlash(1 - this.ads * 0.5, this.muzzleWorld());
    this._kick = Math.min(0.09, this._kick + this.stats.recoil * 2.4 * (1 - this.ads * 0.3));
    player.addRecoil(this.stats.recoil * (1 - this.ads * 0.35),
      (Math.random() - 0.5) * this.stats.recoil * 0.6);
    this.ctx.onShot?.(this);
  }

  // The live cone, in radians — aiming tightens it by the optic's factor.
  currentSpread() {
    const player = this.ctx.player;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const hip = currentSpread(this.stats, speed, 7.8, !player.onGround);
    const aimed = hip * (this.optic.spreadMul ?? 0.5);
    return hip + (aimed - hip) * this.ads;
  }

  // The viewmodel is drawn by a separate camera at the origin, so its own local
  // space IS view space — one more transform by the world camera puts the muzzle
  // where the tracer should start.
  muzzleWorld() {
    const view = this.viewmodel.localToWorld(this.viewmodel.userData.muzzle.clone());
    return this.ctx.camera.localToWorld(view);
  }

  _trace(origin, dir) {
    const { arena, enemies, effects } = this.ctx;
    this._raycaster.set(origin, dir);

    const targets = arena.solids.slice();
    for (const e of enemies) if (e.alive) targets.push(...e.hitMeshes);

    const hits = this._raycaster.intersectObjects(targets, false);
    const muzzle = this.muzzleWorld();

    if (hits.length === 0) {
      effects.tracer(muzzle, origin.clone().addScaledVector(dir, MAX_RANGE));
      return;
    }

    const hit = hits[0];
    effects.tracer(muzzle, hit.point);

    const enemy = hit.object.userData.enemyRef;
    if (enemy && enemy.alive) {
      const isHead = hit.object.userData.part === 'head';
      const dmg = computeDamage(this.stats, hit.distance, isHead);
      // A co-op client reports the hit to the host instead of applying it.
      const result = this.ctx.applyHit ? this.ctx.applyHit(enemy, dmg, isHead) : enemy.hurt(dmg);
      effects.impact(hit.point, hit.face?.normal ?? null, isHead ? 0xff5a5a : 0xffbf6a);
      this.ctx.onDamage?.({ enemy, damage: result.total, isHead, killed: result.killed, point: hit.point });
      if (result.killed) this.ctx.onKill?.(enemy);
    } else {
      effects.impact(hit.point, hit.face?.normal ?? null, 0xd8d0c0);
    }
  }

  dispose() {
    this.syncItem();
    this.ctx.player.scopeFov = null;
    // Detach the shared muzzle flash first: the viewmodel's dispose() traverses
    // its children, and the flash outlives this weapon. There is only one flash
    // mesh, so only take it back if this weapon is actually holding it.
    if (this.ctx.effects.flash.parent === this.viewmodel) {
      this.ctx.effects.flash.removeFromParent();
    }
    this.viewmodel.removeFromParent();
    this.viewmodel.userData.dispose?.();
  }
}
