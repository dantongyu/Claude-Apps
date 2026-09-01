import * as THREE from 'three';
import { weaponStats } from '../data/weapons.js';
import { rarityOf } from '../data/rarities.js';
import { computeDamage, currentSpread } from './Combat.js';

const MAX_RANGE = 220;

// Builds the little first-person gun model. Deliberately abstract shapes —
// readable in the corner of the screen, cheap to draw, tinted by rarity.
function buildViewmodel(stats) {
  const group = new THREE.Group();
  const color = new THREE.Color(rarityOf(stats.rarity).color);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const accentMat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 });

  const len = stats.class === 'Sniper' ? 1.15 : stats.class === 'Pistol' ? 0.42 : 0.8;
  const bodyGeo = new THREE.BoxGeometry(0.09, 0.11, len);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.z = -len / 2;
  group.add(body);

  const gripGeo = new THREE.BoxGeometry(0.075, 0.2, 0.11);
  const grip = new THREE.Mesh(gripGeo, bodyMat);
  grip.position.set(0, -0.13, -0.1);
  grip.rotation.x = -0.25;
  group.add(grip);

  const railGeo = new THREE.BoxGeometry(0.05, 0.035, len * 0.45);
  const rail = new THREE.Mesh(railGeo, accentMat);
  rail.position.set(0, 0.075, -len * 0.45);
  group.add(rail);

  if (stats.magazine > 20) {
    const magGeo = new THREE.BoxGeometry(0.06, 0.16, 0.07);
    const mag = new THREE.Mesh(magGeo, accentMat);
    mag.position.set(0, -0.11, -len * 0.55);
    group.add(mag);
  }

  group.userData.dispose = () => {
    bodyGeo.dispose(); gripGeo.dispose(); railGeo.dispose();
    bodyMat.dispose(); accentMat.dispose();
    group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
  };
  group.userData.muzzle = new THREE.Vector3(0, 0.02, -len - 0.05);
  return group;
}

export class Weapon {
  // ctx: { camera, scene, effects, arena, enemies, player, inventory, onDamage, onKill }
  constructor(item, ctx) {
    this.item = item;
    this.ctx = ctx;
    this.stats = weaponStats(item.itemId, item.rarity);
    this.ammoType = this.stats.ammo;
    if (item.ammoInMag == null) item.ammoInMag = this.stats.magazine;
    this.mag = item.ammoInMag;

    this.cooldown = 0;
    this.reloading = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this._triggerWasDown = false;

    this.viewmodel = buildViewmodel(this.stats);
    this.viewmodel.position.set(0.17, -0.17, -0.32);
    ctx.camera.add(this.viewmodel);
    ctx.effects.attachFlashTo(this.viewmodel, this.viewmodel.userData.muzzle);

    this._kick = 0;
    this._raycaster = new THREE.Raycaster();
    this._raycaster.far = MAX_RANGE;
  }

  get magSize() { return this.stats.magazine; }
  get reserve() { return this.ctx.inventory.ammo[this.ammoType] ?? 0; }
  get isReloading() { return this.reloading > 0; }

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

  update(dt, triggerDown) {
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

    // Viewmodel: recoil kick + reload dip.
    this._kick *= Math.pow(0.001, dt);
    const reloadDip = this.reloading > 0 ? 0.12 : 0;
    this.viewmodel.position.z = -0.32 + this._kick * 0.9;
    this.viewmodel.position.y = -0.17 - reloadDip;
    this.viewmodel.rotation.x = this._kick * 2.2 - reloadDip * 2.4;
  }

  _fireOnce() {
    if (this.mag <= 0) return;
    this.mag--;
    this.syncItem();

    const { camera, player, effects } = this.ctx;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const baseDir = camera.getWorldDirection(new THREE.Vector3());

    const speed = Math.hypot(player.vel.x, player.vel.z);
    const spread = currentSpread(this.stats, speed, 7.8, !player.onGround);

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

    effects.muzzleFlash();
    this._kick = Math.min(0.09, this._kick + this.stats.recoil * 2.4);
    player.addRecoil(this.stats.recoil, (Math.random() - 0.5) * this.stats.recoil * 0.6);
    this.ctx.onShot?.(this);
  }

  _trace(origin, dir) {
    const { arena, enemies, effects } = this.ctx;
    this._raycaster.set(origin, dir);

    const targets = arena.solids.slice();
    for (const e of enemies) if (e.alive) targets.push(...e.hitMeshes);

    const hits = this._raycaster.intersectObjects(targets, false);
    const muzzle = this.viewmodel.localToWorld(this.viewmodel.userData.muzzle.clone());

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
      const result = enemy.hurt(dmg);
      effects.impact(hit.point, hit.face?.normal ?? null, isHead ? 0xff5a5a : 0xffbf6a);
      this.ctx.onDamage?.({ enemy, damage: result.total, isHead, killed: result.killed, point: hit.point });
      if (result.killed) this.ctx.onKill?.(enemy);
    } else {
      effects.impact(hit.point, hit.face?.normal ?? null, 0xd8d0c0);
    }
  }

  dispose() {
    this.syncItem();
    // Detach the shared muzzle flash first: the viewmodel's dispose() traverses
    // its children, and the flash outlives this weapon.
    this.ctx.effects.flash.removeFromParent();
    this.viewmodel.removeFromParent();
    this.viewmodel.userData.dispose?.();
  }
}
