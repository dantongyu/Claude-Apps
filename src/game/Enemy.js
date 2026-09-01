import * as THREE from 'three';
import { moveActor, hasLineOfSight, GRAVITY, clampToArena } from './Physics.js';
import { applyDamage } from './Combat.js';

const RADIUS = 0.42;

// A bot. Deliberately simple FSM: idle -> patrol -> chase -> attack, with a
// short "unstick" strafe when it walks into geometry.
export class Enemy {
  constructor(archetype, spawnPos, ctx) {
    this.def = archetype;
    this.ctx = ctx; // { scene, colliders, arenaHalf, player, onPlayerDamaged }
    this.scale = archetype.scale ?? 1;
    this.height = 1.8 * this.scale;

    this.health = archetype.health;
    this.maxHealth = archetype.health;
    this.shield = archetype.shield;
    this.maxShield = archetype.shield;
    this.alive = true;

    this.pos = spawnPos.clone();
    this.pos.y = Math.max(spawnPos.y, 0.1);
    this.vel = new THREE.Vector3();
    this.onGround = false;

    this.state = 'idle';
    this.stateTime = 0;
    this.fireTimer = 1 / archetype.fireRate;
    this.patrolTarget = null;
    this.unstick = 0;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.deathTime = 0;
    this.hitFlash = 0;

    this._build();
  }

  _build() {
    const g = new THREE.Group();
    const s = this.scale;
    const color = this.def.color;

    this.bodyGeo = new THREE.BoxGeometry(0.7 * s, 1.25 * s, 0.45 * s);
    this.bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.position.y = 0.63 * s;
    body.castShadow = true;
    body.userData.enemyRef = this;
    body.userData.part = 'body';
    g.add(body);

    this.headGeo = new THREE.BoxGeometry(0.42 * s, 0.42 * s, 0.42 * s);
    this.headMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).offsetHSL(0, 0, 0.12) });
    const head = new THREE.Mesh(this.headGeo, this.headMat);
    head.position.y = 1.5 * s;
    head.castShadow = true;
    head.userData.enemyRef = this;
    head.userData.part = 'head';
    g.add(head);

    // Stubby "arms" read as a firing pose without any animation rig.
    this.armGeo = new THREE.BoxGeometry(0.16 * s, 0.16 * s, 0.7 * s);
    this.armMat = new THREE.MeshLambertMaterial({ color: 0x33383f });
    const arms = new THREE.Mesh(this.armGeo, this.armMat);
    arms.position.set(0, 1.02 * s, -0.34 * s);
    g.add(arms);
    this.arms = arms;

    // Billboarded health bar.
    this.barGeo = new THREE.PlaneGeometry(1, 0.09);
    this.barBgMat = new THREE.MeshBasicMaterial({ color: 0x14161a, depthTest: false, transparent: true });
    this.barFgMat = new THREE.MeshBasicMaterial({ color: 0xff5f52, depthTest: false, transparent: true });
    this.barGroup = new THREE.Group();
    const bg = new THREE.Mesh(this.barGeo, this.barBgMat);
    bg.renderOrder = 10;
    const fg = new THREE.Mesh(this.barGeo, this.barFgMat);
    fg.renderOrder = 11;
    fg.position.z = 0.001;
    this.barFg = fg;
    this.barGroup.add(bg, fg);
    this.barGroup.position.y = 1.95 * s;
    this.barGroup.scale.setScalar(0.9 * s);
    this.barGroup.visible = false;
    g.add(this.barGroup);

    this.group = g;
    this.hitMeshes = [body, head];
    this.ctx.scene.add(g);
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.5 * this.scale, this.pos.z);
  }

  hurt(amount) {
    if (!this.alive) return { total: 0, killed: false };
    const res = applyDamage(this, amount);
    this.hitFlash = 0.12;
    this.barGroup.visible = true;
    if (this.health <= 0) {
      this.alive = false;
      this.deathTime = 0;
      this.barGroup.visible = false;
      for (const m of this.hitMeshes) m.userData.enemyRef = null;
    } else if (this.state === 'idle' || this.state === 'patrol') {
      this.state = 'chase'; // being shot at is an excellent reason to move
    }
    return res;
  }

  _setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.stateTime = 0;
  }

  update(dt, playerPos, playerAlive) {
    if (!this.alive) {
      this.deathTime += dt;
      // Topple and sink, then the match reaps us.
      const t = Math.min(1, this.deathTime / 0.8);
      this.group.rotation.x = -t * Math.PI * 0.5;
      this.group.position.y = this.pos.y - t * 0.5;
      return;
    }

    this.stateTime += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.bodyMat.emissive?.setHex(this.hitFlash > 0 ? 0x661111 : 0x000000);

    const eye = this.eyePos;
    const target = playerPos.clone().setY(playerPos.y + 1.4);
    const dist = this.pos.distanceTo(playerPos);
    const sees = playerAlive
      && dist < this.def.aggroRange
      && hasLineOfSight(eye, target, this.ctx.colliders);

    if (sees) {
      this._setState(dist > this.def.preferredRange * 1.25 ? 'chase' : 'attack');
    } else if (this.state === 'chase' || this.state === 'attack') {
      // Push toward the last known position for a while before giving up.
      if (this.stateTime > 4) this._setState('patrol');
      else this._setState('chase');
    } else if (this.state === 'idle' && this.stateTime > 1.5) {
      this._setState('patrol');
    }

    const wish = new THREE.Vector3();
    if (this.state === 'chase') {
      wish.subVectors(playerPos, this.pos).setY(0);
    } else if (this.state === 'attack') {
      const away = new THREE.Vector3().subVectors(this.pos, playerPos).setY(0);
      if (dist < this.def.preferredRange * 0.6) wish.copy(away);
      else {
        // Strafe around the player at their preferred engagement range.
        wish.set(-away.z, 0, away.x).multiplyScalar(this.strafeSign);
        if (this.stateTime % 3 < dt) this.strafeSign *= -1;
      }
    } else if (this.state === 'patrol') {
      if (!this.patrolTarget || this.pos.distanceTo(this.patrolTarget) < 2.5) {
        const h = this.ctx.arenaHalf - 6;
        this.patrolTarget = new THREE.Vector3(
          THREE.MathUtils.randFloatSpread(h * 2), 0, THREE.MathUtils.randFloatSpread(h * 2),
        );
      }
      wish.subVectors(this.patrolTarget, this.pos).setY(0);
    }

    if (this.unstick > 0) {
      this.unstick -= dt;
      const side = new THREE.Vector3(-wish.z, 0, wish.x).multiplyScalar(this.strafeSign);
      wish.addScaledVector(side.normalize(), 1.6);
    }
    if (wish.lengthSq() > 0) wish.normalize();

    this.vel.x = wish.x * this.def.speed;
    this.vel.z = wish.z * this.def.speed;
    this.vel.y -= GRAVITY * dt;

    const res = moveActor(
      this.pos,
      new THREE.Vector3(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt),
      this.ctx.colliders,
      { radius: RADIUS, height: this.height, stepHeight: 0.55 },
    );
    this.onGround = res.onGround;
    if (res.onGround && this.vel.y < 0) this.vel.y = 0;
    if (res.hitWall && this.unstick <= 0) {
      this.unstick = 0.8;
      this.strafeSign *= -1;
    }
    clampToArena(this.pos, this.ctx.arenaHalf);

    // Face the player when engaged, otherwise face travel direction.
    const faceTarget = sees ? playerPos : this.pos.clone().add(wish);
    const yaw = Math.atan2(faceTarget.x - this.pos.x, faceTarget.z - this.pos.z);
    this.group.rotation.y = yaw;
    this.group.position.copy(this.pos);

    // --- firing ---
    this.fireTimer -= dt;
    if (sees && dist <= this.def.range && this.fireTimer <= 0) {
      this.fireTimer = 1 / this.def.fireRate;
      this._shoot(playerPos, dist);
    }

    if (this.barGroup.visible) {
      const frac = (this.health + this.shield) / (this.maxHealth + this.maxShield);
      this.barFg.scale.x = Math.max(0.001, frac);
      this.barFg.position.x = -(1 - frac) / 2;
      this.barGroup.lookAt(this.ctx.player.camera.position); // billboard toward the player
    }
  }

  _shoot(playerPos, dist) {
    const hits = Math.random() < this.def.accuracy;
    const muzzle = this.eyePos;
    const aim = playerPos.clone().setY(playerPos.y + 1.2);
    if (!hits) {
      aim.x += THREE.MathUtils.randFloatSpread(3);
      aim.y += THREE.MathUtils.randFloatSpread(2);
      aim.z += THREE.MathUtils.randFloatSpread(3);
    }
    this.ctx.effects?.tracer(muzzle, aim);
    if (!hits) return;
    // Bots fall off over distance too, so long-range plinking is survivable.
    const falloff = dist > this.def.range * 0.6 ? 0.7 : 1;
    this.ctx.onPlayerDamaged?.(this.def.damage * falloff, this.pos);
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.bodyGeo.dispose(); this.headGeo.dispose(); this.armGeo.dispose(); this.barGeo.dispose();
    this.bodyMat.dispose(); this.headMat.dispose(); this.armMat.dispose();
    this.barBgMat.dispose(); this.barFgMat.dispose();
  }
}
