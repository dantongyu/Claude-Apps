// The sight picture for a magnified scope.
//
// A flat FOV cut reads as "the world got bigger", not as "I am looking through
// a tube". So the world is re-rendered through a second, narrow camera into a
// texture, and that texture is shown inside a circle with a black surround and
// an etched reticle drawn over it — which is what a scope actually looks like.
//
// The second pass only runs while the player is actually scoped in.

import * as THREE from 'three';

const RES = 1024;
const RADIUS = 0.86;   // fraction of half-height the eyepiece circle fills

function line(w, h, x, y, mat) {
  const g = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, 0.01);
  return m;
}

export class ScopeOverlay {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = false;

    this.target = new THREE.WebGLRenderTarget(RES, RES, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.camera = new THREE.PerspectiveCamera(10, 1, 0.05, 600);

    // Screen-space compositing scene.
    this.scene = new THREE.Scene();
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
    this.ortho.position.z = 5;

    this._geos = [];
    this._mats = [];

    const lensGeo = new THREE.CircleGeometry(RADIUS, 64);
    const lensMat = new THREE.MeshBasicMaterial({ map: this.target.texture });
    this.lens = new THREE.Mesh(lensGeo, lensMat);
    this.scene.add(this.lens);
    this._geos.push(lensGeo);
    this._mats.push(lensMat);

    // Black surround. A ring wide enough to cover any aspect ratio, plus four
    // bars so the corners are never left showing the world.
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this._mats.push(blackMat);
    const ringGeo = new THREE.RingGeometry(RADIUS, 6, 64);
    const ring = new THREE.Mesh(ringGeo, blackMat);
    ring.position.z = 0.005;
    this.scene.add(ring);
    this._geos.push(ringGeo);

    // Soft inner shadow so the glass edge is not a hard cut.
    const vigGeo = new THREE.RingGeometry(RADIUS * 0.82, RADIUS, 64);
    const vigMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 });
    const vig = new THREE.Mesh(vigGeo, vigMat);
    vig.position.z = 0.004;
    this.scene.add(vig);
    this._geos.push(vigGeo);
    this._mats.push(vigMat);

    this.reticle = new THREE.Group();
    this.scene.add(this.reticle);
    this._buildReticle('mildot');
  }

  _buildReticle(kind) {
    for (const c of [...this.reticle.children]) {
      c.geometry.dispose();
      this.reticle.remove(c);
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0x0a0d0f });
    this._mats.push(mat);
    const t = 0.0045;                  // stadia thickness
    const r = RADIUS;

    // Heavy outer posts that thin out towards the centre — the classic duplex.
    this.reticle.add(line(t * 3, r * 0.55, 0, r * 0.72, mat));   // top
    this.reticle.add(line(t * 3, r * 0.55, 0, -r * 0.72, mat));  // bottom
    this.reticle.add(line(r * 0.55, t * 3, -r * 0.72, 0, mat));  // left
    this.reticle.add(line(r * 0.55, t * 3, r * 0.72, 0, mat));   // right
    this.reticle.add(line(t, r * 0.9, 0, 0, mat));               // fine vertical
    this.reticle.add(line(r * 0.9, t, 0, 0, mat));               // fine horizontal

    if (kind === 'mildot') {
      // Ranging dots down the lower vertical, the way a real mil-dot reads.
      for (let i = 1; i <= 4; i++) {
        const y = -i * r * 0.11;
        this.reticle.add(line(t * 2.4, t * 2.4, 0, y, mat));
        this.reticle.add(line(t * 2.4, t * 2.4, i * r * 0.11, 0, mat));
        this.reticle.add(line(t * 2.4, t * 2.4, -i * r * 0.11, 0, mat));
      }
    }
  }

  resize(width, height) {
    const aspect = width / Math.max(1, height);
    this.ortho.left = -aspect;
    this.ortho.right = aspect;
    this.ortho.updateProjectionMatrix();
  }

  // Renders the magnified picture, then composites it over the main frame.
  render(scene, sourceCamera, fov) {
    const r = this.renderer;
    this.camera.fov = fov;
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    sourceCamera.getWorldPosition(this.camera.position);
    sourceCamera.getWorldQuaternion(this.camera.quaternion);

    // The viewmodel lives in its own scene, so the scope picture is naturally
    // free of the gun that is holding it.
    const prevTarget = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, this.camera);
    r.setRenderTarget(prevTarget);

    const prevAutoClear = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.ortho);
    r.autoClear = prevAutoClear;
  }

  dispose() {
    for (const c of [...this.reticle.children]) c.geometry.dispose();
    for (const g of this._geos) g.dispose();
    for (const m of this._mats) m.dispose();
    this.target.dispose();
    this.scene.clear();
  }
}
