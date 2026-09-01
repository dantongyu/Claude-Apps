import * as THREE from 'three';
import { Random } from '../core/Random.js';
import { makeBox } from './Physics.js';

const PALETTE = [0x8d8f93, 0x9aa0a6, 0x7d8288, 0xa8a093, 0x6f757c, 0x9b9184];
const CRATE_COLORS = [0x8a6d4b, 0x7a6242, 0x6f7c85];

// Builds a deterministic arena from a mission's `arena` block + seed.
// Everything the rest of the match needs (colliders, raycast targets, spawn
// points) comes out of here so no other system has to know the layout.
export function buildArena(config, seed) {
  const rng = new Random(seed);
  const size = config.size;
  const half = size / 2;

  const group = new THREE.Group();
  const colliders = [];
  const solids = []; // meshes worth raycasting against
  const footprints = []; // {x, z, hx, hz} used to keep placements apart

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const disposables = [boxGeo];

  const addBox = (cx, cy, cz, sx, sy, sz, color, opts = {}) => {
    const mat = new THREE.MeshLambertMaterial({ color });
    disposables.push(mat);
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(cx, cy, cz);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (opts.solid !== false) {
      colliders.push(makeBox(cx, cy, cz, sx, sy, sz));
      solids.push(mesh);
    }
    return mesh;
  };

  // --- ground ---
  const groundGeo = new THREE.PlaneGeometry(size, size);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a5148 });
  disposables.push(groundGeo, groundMat);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  solids.push(ground);
  // A thick slab under the floor catches anything moving fast downward.
  colliders.push(makeBox(0, -2, 0, size * 2, 4, size * 2));

  // --- perimeter ---
  const wallH = 12;
  const wallT = 2;
  addBox(0, wallH / 2, -half, size, wallH, wallT, 0x3f464d);
  addBox(0, wallH / 2, half, size, wallH, wallT, 0x3f464d);
  addBox(-half, wallH / 2, 0, wallT, wallH, size, 0x3f464d);
  addBox(half, wallH / 2, 0, wallT, wallH, size, 0x3f464d);

  const fits = (x, z, hx, hz, pad = 3) => {
    if (Math.abs(x) + hx > half - 4 || Math.abs(z) + hz > half - 4) return false;
    for (const f of footprints) {
      if (Math.abs(x - f.x) < hx + f.hx + pad && Math.abs(z - f.z) < hz + f.hz + pad) return false;
    }
    return true;
  };

  // --- buildings, each with a climbable stack of steps up to its roof ---
  let placed = 0;
  for (let attempt = 0; attempt < config.buildings * 25 && placed < config.buildings; attempt++) {
    const w = rng.range(7, 16);
    const d = rng.range(7, 16);
    const h = rng.range(3.5, 9);
    const x = rng.range(-half + 8, half - 8);
    const z = rng.range(-half + 8, half - 8);
    if (!fits(x, z, w / 2, d / 2)) continue;

    addBox(x, h / 2, z, w, h, d, rng.pick(PALETTE));
    footprints.push({ x, z, hx: w / 2, hz: d / 2 });
    placed++;

    // Steps on a random side so roofs are reachable (0.45 rise clears stepHeight).
    const steps = Math.ceil(h / 0.45);
    const side = rng.int(0, 3);
    const sx = side === 0 ? x - w / 2 - 0.6 : side === 1 ? x + w / 2 + 0.6 : x;
    const sz = side === 2 ? z - d / 2 - 0.6 : side === 3 ? z + d / 2 + 0.6 : z;
    const alongX = side >= 2;
    for (let s = 0; s < steps; s++) {
      const off = -(steps * 0.55) / 2 + s * 0.55;
      const stepH = (s + 1) * 0.45;
      addBox(
        alongX ? sx + off : sx,
        stepH / 2,
        alongX ? sz : sz + off,
        alongX ? 0.55 : 1.6,
        stepH,
        alongX ? 1.6 : 0.55,
        0x6a7078,
      );
    }
  }

  // --- cover crates, sometimes stacked ---
  for (let i = 0; i < config.crates; i++) {
    const s = rng.range(1.1, 2.2);
    const x = rng.range(-half + 6, half - 6);
    const z = rng.range(-half + 6, half - 6);
    if (!fits(x, z, s / 2, s / 2, 1.2)) continue;
    addBox(x, s / 2, z, s, s, s, rng.pick(CRATE_COLORS));
    footprints.push({ x, z, hx: s / 2, hz: s / 2 });
    if (rng.next() < 0.3) {
      const s2 = s * 0.8;
      addBox(x + rng.range(-0.2, 0.2), s + s2 / 2, z + rng.range(-0.2, 0.2), s2, s2, s2, rng.pick(CRATE_COLORS));
    }
  }

  // --- open positions for spawns, chests and the extraction pad ---
  const openSpot = (minDistFromOrigin = 0) => {
    for (let i = 0; i < 200; i++) {
      const x = rng.range(-half + 6, half - 6);
      const z = rng.range(-half + 6, half - 6);
      if (Math.hypot(x, z) < minDistFromOrigin) continue;
      if (fits(x, z, 1.4, 1.4, 1.0)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(rng.range(-half + 8, half - 8), 0, rng.range(-half + 8, half - 8));
  };

  const playerSpawn = new THREE.Vector3(-half + 7, 0.2, -half + 7);
  const enemySpawns = [];
  for (let i = 0; i < 14; i++) enemySpawns.push(openSpot(22));
  const chestSpots = [];
  for (let i = 0; i < config.chests; i++) chestSpots.push(openSpot(10));

  // Extraction pad sits opposite the player spawn.
  const extractPos = new THREE.Vector3(half - 9, 0, half - 9);
  const padGeo = new THREE.CylinderGeometry(3.2, 3.2, 0.25, 28);
  const padMat = new THREE.MeshBasicMaterial({ color: 0x3ad6a0, transparent: true, opacity: 0.55 });
  disposables.push(padGeo, padMat);
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.copy(extractPos).setY(0.12);
  pad.visible = false;
  group.add(pad);

  // --- lighting ---
  const hemi = new THREE.HemisphereLight(0xbcd4e6, 0x4a4a42, 1.05);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.5);
  sun.position.set(size * 0.4, size * 0.75, size * 0.25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
  sc.near = 1; sc.far = size * 2.2;
  group.add(sun);
  group.add(sun.target);

  return {
    group, colliders, solids, size, half,
    playerSpawn, enemySpawns, chestSpots, extractPos, extractPad: pad,
    dispose() {
      for (const d of disposables) d.dispose?.();
      group.clear();
    },
  };
}
