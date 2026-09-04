import * as THREE from 'three';
import { moveActor, GRAVITY, clampToArena } from './Physics.js';

const EYE_HEIGHT = 1.62;
const CROUCH_EYE = 1.05;
const RADIUS = 0.4;
const STAND_H = 1.8;
const CROUCH_H = 1.2;
const STEP = 0.5;

const SPEED = { walk: 5.4, sprint: 7.8, crouch: 2.7, air: 1.2 };
const ACCEL = 60;
const FRICTION = 12;
const JUMP = 8.2;

export class PlayerController {
  constructor(camera, colliders, arenaHalf) {
    this.camera = camera;
    this.colliders = colliders;
    this.arenaHalf = arenaHalf;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.crouching = false;

    this.health = 100;
    this.maxHealth = 100;
    this.shield = 0;
    this.maxShield = 100;
    this.alive = true;

    // Recoil is a camera-space offset that decays back to zero, so the player's
    // own aim is never permanently displaced.
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this._bob = 0;
    this._lastDamageDir = null;
    this.baseFov = camera.fov;

    // Set by the weapon while aiming; null means "use the normal FOV".
    this.scopeFov = null;
    this.sprinting = false;
    // Last frame's mouse delta, so the viewmodel can lag behind the crosshair.
    this.lastLook = { x: 0, y: 0 };
  }

  spawn(position) {
    this.pos.copy(position);
    this.pos.y = Math.max(position.y, 0.05);
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(-this.pos.x, -this.pos.z);
    this.pitch = 0;
  }

  get height() {
    return this.crouching ? CROUCH_H : STAND_H;
  }

  get eyePosition() {
    return this.camera.position;
  }

  look(dx, dy, invertY = false) {
    this.lastLook.x = dx;
    this.lastLook.y = dy;
    this.yaw -= dx;
    this.pitch -= (invertY ? -dy : dy);
    const lim = Math.PI / 2 - 0.02;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -lim, lim);
  }

  addRecoil(pitch, yaw) {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
  }

  forwardVector(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt, input) {
    if (!this.alive) return;

    // --- intent ---
    const f = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0);
    const s = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
    this.crouching = input.down('crouch') && this.onGround;
    const sprinting = input.down('sprint') && f > 0 && !this.crouching;
    this.sprinting = sprinting;

    const wish = new THREE.Vector3(
      -Math.sin(this.yaw) * f + Math.cos(this.yaw) * s,
      0,
      -Math.cos(this.yaw) * f - Math.sin(this.yaw) * s,
    );
    if (wish.lengthSq() > 0) wish.normalize();

    const maxSpeed = this.crouching ? SPEED.crouch : sprinting ? SPEED.sprint : SPEED.walk;
    const control = this.onGround ? ACCEL : ACCEL * 0.35;

    this.vel.x += wish.x * control * dt;
    this.vel.z += wish.z * control * dt;

    // Ground friction only when there is no input, so stopping feels crisp.
    if (this.onGround && wish.lengthSq() === 0) {
      const drop = FRICTION * dt;
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > 0) {
        const scale = Math.max(0, speed - drop * Math.max(speed, 1)) / speed;
        this.vel.x *= scale;
        this.vel.z *= scale;
      }
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > maxSpeed) {
      this.vel.x = (this.vel.x / hs) * maxSpeed;
      this.vel.z = (this.vel.z / hs) * maxSpeed;
    }

    if (input.down('jump') && this.onGround) {
      this.vel.y = JUMP;
      this.onGround = false;
    }

    this.vel.y -= GRAVITY * dt;
    if (this.vel.y < -60) this.vel.y = -60;

    const delta = new THREE.Vector3(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    const res = moveActor(this.pos, delta, this.colliders, {
      radius: RADIUS, height: this.height, stepHeight: STEP,
    });
    this.onGround = res.onGround;
    if (res.onGround && this.vel.y < 0) this.vel.y = 0;
    if (res.hitCeiling && this.vel.y > 0) this.vel.y = 0;
    clampToArena(this.pos, this.arenaHalf);

    // --- view ---
    this.recoilPitch *= Math.pow(0.0008, dt);
    this.recoilYaw *= Math.pow(0.0008, dt);
    if (Math.abs(this.recoilPitch) < 1e-5) this.recoilPitch = 0;

    this._bob += hs * dt * 1.5;
    const aimDamp = this.scopeFov == null ? 1
      : Math.max(0.12, this.scopeFov / Math.max(0.001, this.baseFov));
    const bobAmt = (this.onGround ? Math.min(hs / SPEED.sprint, 1) * 0.045 : 0) * aimDamp;
    const eye = this.crouching ? CROUCH_EYE : EYE_HEIGHT;

    this.camera.position.set(
      this.pos.x,
      this.pos.y + eye + Math.sin(this._bob * 2) * bobAmt,
      this.pos.z,
    );
    const e = new THREE.Euler(
      this.pitch + this.recoilPitch,
      this.yaw + this.recoilYaw,
      Math.sin(this._bob) * bobAmt * 0.35,
      'YXZ',
    );
    this.camera.quaternion.setFromEuler(e);

    const targetFov = this.scopeFov ?? (this.baseFov + (sprinting ? 4 : 0));
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();
  }

  // Shield soaks damage first, exactly like the meta everyone expects.
  takeDamage(amount, fromPosition = null) {
    if (!this.alive) return 0;
    let remaining = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    this.health = Math.max(0, this.health - remaining);
    if (fromPosition) this._lastDamageDir = fromPosition.clone();
    if (this.health <= 0) this.alive = false;
    return amount;
  }

  heal(amount, cap) {
    const limit = Math.min(this.maxHealth, cap ?? this.maxHealth);
    if (this.health >= limit) return 0;
    const before = this.health;
    this.health = Math.min(limit, this.health + amount);
    return this.health - before;
  }

  addShield(amount, cap) {
    const limit = Math.min(this.maxShield, cap ?? this.maxShield);
    if (this.shield >= limit) return 0;
    const before = this.shield;
    this.shield = Math.min(limit, this.shield + amount);
    return this.shield - before;
  }

  // Angle (radians) of the last damage source relative to where we are facing.
  damageIndicatorAngle() {
    if (!this._lastDamageDir) return null;
    const dx = this._lastDamageDir.x - this.pos.x;
    const dz = this._lastDamageDir.z - this.pos.z;
    const worldAngle = Math.atan2(dx, dz);
    return worldAngle - (this.yaw + Math.PI);
  }

  clearDamageIndicator() {
    this._lastDamageDir = null;
  }
}
