import * as THREE from 'three';

// Pooled tracers, impact sparks and floating damage numbers. Pooling matters
// here: an LMG fires 9 rounds a second and allocating per shot would stutter.
const TRACER_POOL = 40;
const IMPACT_POOL = 30;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this._disposables = [];
    this.time = 0;

    const tracerGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true);
    tracerGeo.translate(0, 0.5, 0);
    tracerGeo.rotateX(-Math.PI / 2); // extend along -Z, which is where lookAt aims
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe6a0, transparent: true, opacity: 0.9, depthWrite: false,
    });
    this._disposables.push(tracerGeo, tracerMat);

    this.tracers = [];
    for (let i = 0; i < TRACER_POOL; i++) {
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this._disposables.push(m.material);
      this.tracers.push({ mesh: m, life: 0 });
    }

    const impactGeo = new THREE.SphereGeometry(0.09, 6, 5);
    const impactMat = new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true });
    this._disposables.push(impactGeo, impactMat);
    this.impacts = [];
    for (let i = 0; i < IMPACT_POOL; i++) {
      const m = new THREE.Mesh(impactGeo, impactMat.clone());
      m.visible = false;
      scene.add(m);
      this._disposables.push(m.material);
      this.impacts.push({ mesh: m, life: 0 });
    }

    // Muzzle flash lives on the camera so it tracks the viewmodel for free.
    const flashGeo = new THREE.SphereGeometry(0.11, 8, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd884, transparent: true, depthTest: false });
    this._disposables.push(flashGeo, flashMat);
    this.flash = new THREE.Mesh(flashGeo, flashMat);
    this.flash.visible = false;
    this.flash.renderOrder = 999;
    this.flashLife = 0;

    // A real light for the flash: it costs one light for 45ms and is most of
    // what makes a shot read as a shot indoors. It lives in the world scene
    // rather than on the flash mesh, because the mesh is drawn by the separate
    // viewmodel camera and a light parented there would illuminate nothing.
    this.flashLight = new THREE.PointLight(0xffc266, 0, 10, 2);
    this.flashLight.visible = false;
    scene.add(this.flashLight);
  }

  attachFlashTo(parent, offset) {
    parent.add(this.flash);
    this.flash.position.copy(offset);
  }

  tracer(from, to) {
    const slot = this.tracers.find((t) => t.life <= 0) ?? this.tracers[0];
    const dist = from.distanceTo(to);
    slot.mesh.position.copy(from);
    slot.mesh.lookAt(to);
    slot.mesh.scale.set(1, 1, dist);
    slot.mesh.visible = true;
    slot.mesh.material.opacity = 0.9;
    slot.life = 0.06;
  }

  impact(point, normal, color = 0xffd08a) {
    const slot = this.impacts.find((t) => t.life <= 0) ?? this.impacts[0];
    slot.mesh.position.copy(point).addScaledVector(normal ?? new THREE.Vector3(0, 1, 0), 0.05);
    slot.mesh.material.color.setHex(color);
    slot.mesh.material.opacity = 1;
    slot.mesh.scale.setScalar(1);
    slot.mesh.visible = true;
    slot.life = 0.22;
  }

  muzzleFlash(scale = 1, worldPosition = null) {
    this.flash.visible = true;
    this.flash.scale.setScalar((0.8 + Math.random() * 0.6) * scale);
    if (worldPosition) this.flashLight.position.copy(worldPosition);
    this.flashLight.visible = true;
    this.flashLight.intensity = 16 * scale;
    this.flashLife = 0.045;
  }

  update(dt) {
    this.time += dt;
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.06) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const s of this.impacts) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = Math.max(0, s.life / 0.22);
      s.mesh.material.opacity = k;
      s.mesh.scale.setScalar(0.6 + (1 - k) * 1.6);
      if (s.life <= 0) s.mesh.visible = false;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flashLight.intensity *= Math.pow(0.0001, dt);
      if (this.flashLife <= 0) {
        this.flash.visible = false;
        this.flashLight.visible = false;
      }
    }
  }

  dispose() {
    for (const t of this.tracers) this.scene.remove(t.mesh);
    for (const s of this.impacts) this.scene.remove(s.mesh);
    this.flash.removeFromParent();
    this.flashLight.removeFromParent();
    for (const d of this._disposables) d.dispose?.();
    this.tracers = [];
    this.impacts = [];
  }
}
