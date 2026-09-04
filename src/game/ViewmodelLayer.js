// The first-person weapon renders in its own pass.
//
// The world camera runs at the player's chosen FOV (60-110), and a gun drawn
// through that lens is either enormous or postage-stamp sized depending on a
// setting that has nothing to do with the gun. Every shooter solves this the
// same way: a second pass with a fixed, narrower camera over a cleared depth
// buffer. It also means the viewmodel can never clip into a wall, never takes
// world fog, and its aim pose is exact instead of hand-tuned per FOV.
//
// The layer's camera sits at the origin looking down -Z, so anything added here
// is positioned directly in view space — which is the space the weapon already
// worked in when it was parented to the world camera.

import * as THREE from 'three';

const VIEWMODEL_FOV = 52;

export class ViewmodelLayer {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, 1, 0.01, 10);

    // Its own lighting, so the gun reads the same in every arena.
    this.key = new THREE.DirectionalLight(0xfff4e2, 1.15);
    this.key.position.set(0.8, 1.0, 0.5);
    this.fill = new THREE.HemisphereLight(0xb4cadc, 0x232320, 0.65);
    this.rim = new THREE.DirectionalLight(0x9fc4e0, 0.45);
    this.rim.position.set(-0.7, 0.15, 0.7);
    this.scene.add(this.key, this.fill, this.rim);
  }

  add(object) { this.scene.add(object); }

  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render(renderer) {
    const prev = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prev;
  }

  dispose() {
    this.scene.clear();
  }
}
