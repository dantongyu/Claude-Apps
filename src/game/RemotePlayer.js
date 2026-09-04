import * as THREE from 'three';

// The visible body of another player in co-op. Same box-figure approach as the
// bots, tinted with that player's skin, plus a name tag. It is driven purely
// from interpolated snapshots: no physics, no input, ever.
export class RemotePlayer {
  constructor(scene, { name, color }) {
    this.scene = scene;
    this.name = name;
    this.alive = true;
    this.pos = new THREE.Vector3();
    this.deathTime = 0;
    this._build(color);
  }

  _build(color) {
    const tint = new THREE.Color(color ?? '#5b8dd6');
    const g = new THREE.Group();

    this.bodyGeo = new THREE.BoxGeometry(0.62, 1.2, 0.4);
    this.bodyMat = new THREE.MeshLambertMaterial({ color: tint });
    const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    g.add(body);

    this.headGeo = new THREE.BoxGeometry(0.38, 0.38, 0.38);
    this.headMat = new THREE.MeshLambertMaterial({ color: tint.clone().offsetHSL(0, 0, 0.14) });
    const head = new THREE.Mesh(this.headGeo, this.headMat);
    head.position.y = 1.42;
    head.castShadow = true;
    g.add(head);

    // The gun is pitched with the player's aim so you can see where they look.
    this.gunGeo = new THREE.BoxGeometry(0.12, 0.14, 0.7);
    this.gunMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
    this.gun = new THREE.Mesh(this.gunGeo, this.gunMat);
    this.gun.position.set(0.22, 1.05, -0.35);
    g.add(this.gun);

    this.tag = this._makeTag(this.name, tint);
    this.tag.position.y = 1.95;
    g.add(this.tag);

    this.group = g;
    this.scene.add(g);
  }

  _makeTag(text, tint) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(10,14,18,0.7)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = `#${tint.getHexString()}`;
    ctx.fillRect(0, 0, 8, 64);
    ctx.font = '700 30px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 132, 34);
    this.tagTex = new THREE.CanvasTexture(canvas);
    this.tagMat = new THREE.SpriteMaterial({ map: this.tagTex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(this.tagMat);
    sprite.scale.set(1.6, 0.4, 1);
    sprite.renderOrder = 12;
    return sprite;
  }

  // `s` is an unpacked, interpolated player state from the snapshot.
  apply(s, dt) {
    this.pos.set(s.pos.x, s.pos.y, s.pos.z);
    if (this.alive && !s.alive) {
      this.alive = false;
      this.deathTime = 0;
    } else if (!this.alive && s.alive) {
      this.alive = true;
      this.group.rotation.x = 0;
    }
    this.group.position.copy(this.pos);
    // Same convention as PlayerController: yaw about Y with -Z as forward, so
    // the gun (built along -Z) points where they are looking.
    this.group.rotation.y = s.yaw;
    this.gun.rotation.x = s.pitch ?? 0;
    if (!this.alive) {
      this.deathTime += dt;
      const t = Math.min(1, this.deathTime / 0.8);
      this.group.rotation.x = -t * Math.PI * 0.5;
      this.group.position.y = this.pos.y - t * 0.4;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.bodyGeo.dispose(); this.headGeo.dispose(); this.gunGeo.dispose();
    this.bodyMat.dispose(); this.headMat.dispose(); this.gunMat.dispose();
    this.tagMat.dispose(); this.tagTex.dispose();
  }
}
