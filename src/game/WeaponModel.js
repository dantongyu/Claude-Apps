// Procedural first-person gun models.
//
// Every weapon is assembled from the same small parts kit — receiver, barrel,
// handguard, magazine, stock, grip — so the seven guns share a visual language
// while each keeping a silhouette you can name at a glance. No textures, no
// asset files: it is all primitives, which keeps the "no build step" promise.
//
// Convention: the gun points down -Z (the direction the camera looks), +Y is up,
// the origin sits at the shooter's hand. `userData.sight` is the point that must
// land on the camera axis when aiming down sights.

import * as THREE from 'three';
import { rarityOf } from '../data/rarities.js';
import { ironSightsFor } from '../data/weapons.js';

// --- materials -------------------------------------------------------------
// Shared across every weapon instance, so they are created once and never
// disposed by an individual gun's teardown.

const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: 0x363b42, metalness: 0.85, roughness: 0.42 }),
  blued: new THREE.MeshStandardMaterial({ color: 0x1e2228, metalness: 0.8, roughness: 0.35 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x1b1f25, metalness: 0.05, roughness: 0.82 }),
  furniture: new THREE.MeshStandardMaterial({ color: 0x2c2a26, metalness: 0.0, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x0d1a22, metalness: 0.3, roughness: 0.1,
    emissive: 0x1b3a4a, emissiveIntensity: 0.4,
  }),
};

const _accents = new Map();
function accentMat(hex) {
  let m = _accents.get(hex);
  if (!m) {
    const c = new THREE.Color(hex);
    m = new THREE.MeshStandardMaterial({
      color: c, metalness: 0.6, roughness: 0.4, emissive: c, emissiveIntensity: 0.18,
    });
    if (_env) { m.envMap = _env; m.envMapIntensity = ENV_INTENSITY; }
    _accents.set(hex, m);
  }
  return m;
}

// Reflections come from a small procedural sky (see Environment.js) applied to
// these materials only, so the arena's own look is untouched.
const ENV_INTENSITY = 0.7;
let _env = null;

export function setWeaponEnvironment(texture) {
  if (_env === texture) return;
  _env = texture;
  for (const m of [...Object.values(MAT), ..._accents.values()]) {
    m.envMap = texture;
    m.envMapIntensity = ENV_INTENSITY;
    m.needsUpdate = true;
  }
}

// Disposing shared materials would break every other weapon, so only geometry
// created by a build is tracked and freed.
function partsBin() {
  const geos = [];
  return {
    geos,
    box(w, h, d, mat, x = 0, y = 0, z = 0) {
      const g = new THREE.BoxGeometry(w, h, d);
      geos.push(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      return m;
    },
    // A cylinder lying along -Z (three.js cylinders stand along +Y by default).
    tube(radius, length, mat, x = 0, y = 0, z = 0, seg = 10) {
      const g = new THREE.CylinderGeometry(radius, radius, length, seg);
      g.rotateX(Math.PI / 2);
      geos.push(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      return m;
    },
    // A cylinder standing along +Y — bipod legs, drum mags, scope turrets.
    post(radius, length, mat, x = 0, y = 0, z = 0, seg = 8) {
      const g = new THREE.CylinderGeometry(radius, radius, length, seg);
      geos.push(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      return m;
    },
  };
}

// --- shared sub-assemblies -------------------------------------------------

function pistolGrip(P, mat, x, y, z, tilt = -0.3) {
  const g = new THREE.Group();
  g.add(P.box(0.05, 0.17, 0.065, mat, 0, -0.085, 0));
  g.add(P.box(0.056, 0.03, 0.072, mat, 0, -0.175, 0));      // base plate
  g.position.set(x, y, z);
  g.rotation.x = tilt;
  return g;
}

function triggerGuard(P, mat, z) {
  const g = new THREE.Group();
  g.add(P.box(0.014, 0.012, 0.085, mat, 0, -0.062, z - 0.04));  // bottom bar
  g.add(P.box(0.014, 0.038, 0.012, mat, 0, -0.045, z - 0.082)); // front post
  return g;
}

function stock(P, mat, len, z, drop = 0.02) {
  const g = new THREE.Group();
  g.add(P.box(0.045, 0.062, len, mat, 0, -drop, z + len / 2));       // tube / comb
  g.add(P.box(0.05, 0.10, 0.035, mat, 0, -drop - 0.015, z + len));   // butt pad
  return g;
}

function ventedHandguard(P, mat, w, h, len, z, vents = 3) {
  const g = new THREE.Group();
  g.add(P.box(w, h, len, mat, 0, 0, z));
  for (let i = 0; i < vents; i++) {
    const vz = z - len / 2 + (len / (vents + 1)) * (i + 1);
    g.add(P.box(w + 0.004, 0.012, 0.022, MAT.blued, 0, 0.004, vz));
  }
  return g;
}

function bipod(P, z) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = P.post(0.006, 0.17, MAT.steel, s * 0.03, -0.075, z);
    leg.rotation.z = s * 0.32;
    leg.rotation.x = 0.18;
    g.add(leg);
  }
  g.add(P.box(0.03, 0.02, 0.04, MAT.blued, 0, -0.02, z));
  return g;
}

// --- per-class recipes -----------------------------------------------------
// Each returns { group, muzzle, sightY, sightZ, opticZ, moving }.
// `moving` names the meshes animation is allowed to slide around.

function buildPistol(P, accent) {
  const g = new THREE.Group();
  const slide = P.box(0.048, 0.055, 0.29, MAT.blued, 0, 0.022, -0.15);
  g.add(slide);
  g.add(P.box(0.044, 0.042, 0.24, MAT.polymer, 0, -0.02, -0.13));
  g.add(P.box(0.020, 0.012, 0.05, MAT.steel, 0, 0.055, -0.06));   // rear sight block
  g.add(P.box(0.008, 0.014, 0.010, MAT.steel, 0, 0.056, -0.285)); // front post
  g.add(P.tube(0.009, 0.06, MAT.blued, 0, 0.022, -0.30, 8));      // exposed barrel
  g.add(P.box(0.014, 0.014, 0.05, accent, 0, 0.022, 0.005));      // rear serrations
  const mag = P.box(0.04, 0.15, 0.06, MAT.blued, 0, -0.10, -0.015);
  g.add(mag);
  g.add(pistolGrip(P, MAT.polymer, 0, -0.03, -0.01, -0.24));
  g.add(triggerGuard(P, MAT.polymer, -0.06));
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.022, -0.34),
    sightY: 0.062, sightZ: -0.06, opticZ: -0.09, opticY: 0.052,
    moving: { slide, mag },
  };
}

function buildSMG(P, accent) {
  const g = new THREE.Group();
  g.add(P.box(0.058, 0.082, 0.36, MAT.blued, 0, 0.01, -0.22));
  g.add(P.box(0.032, 0.022, 0.30, MAT.steel, 0, 0.056, -0.24));    // top rail
  g.add(ventedHandguard(P, MAT.polymer, 0.052, 0.05, 0.17, -0.47, 3));
  g.add(P.tube(0.010, 0.13, MAT.blued, 0, 0.01, -0.60, 8));
  g.add(P.box(0.024, 0.024, 0.045, accent, 0, 0.01, -0.665));      // compensator
  const charging = P.box(0.012, 0.012, 0.05, accent, 0.034, 0.03, -0.11);
  g.add(charging);
  const mag = P.box(0.042, 0.20, 0.058, MAT.polymer, 0, -0.115, -0.20);
  mag.rotation.x = 0.10;
  g.add(mag);
  g.add(pistolGrip(P, MAT.polymer, 0, -0.03, -0.05));
  g.add(triggerGuard(P, MAT.polymer, -0.10));
  // Skeleton folding stock.
  g.add(P.box(0.012, 0.012, 0.12, MAT.steel, 0.022, 0.005, 0.05));
  g.add(P.box(0.012, 0.012, 0.12, MAT.steel, -0.022, 0.005, 0.05));
  g.add(P.box(0.056, 0.055, 0.022, MAT.furniture, 0, 0.005, 0.11));
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.01, -0.70),
    sightY: 0.075, sightZ: -0.15, opticZ: -0.20, opticY: 0.068,
    moving: { mag, charging },
  };
}

function buildRifle(P, accent, burst) {
  const g = new THREE.Group();
  g.add(P.box(0.056, 0.092, 0.32, MAT.blued, 0, 0.008, -0.25));
  g.add(P.box(0.030, 0.018, 0.30, MAT.steel, 0, 0.056, -0.25));     // receiver rail
  for (let i = 0; i < 7; i++) {                                     // rail slots
    g.add(P.box(0.034, 0.010, 0.012, MAT.blued, 0, 0.058, -0.13 - i * 0.038));
  }
  g.add(P.box(0.028, 0.016, 0.20, MAT.steel, 0, 0.050, -0.56));     // handguard rail
  g.add(ventedHandguard(P, MAT.polymer, 0.052, 0.058, 0.27, -0.56, 4));
  g.add(P.tube(0.0095, 0.20, MAT.blued, 0, 0.008, -0.79, 8));
  g.add(P.box(0.008, 0.036, 0.014, MAT.steel, 0, 0.040, -0.72));    // gas block post
  if (burst) {
    g.add(P.box(0.026, 0.026, 0.06, accent, 0, 0.008, -0.90));      // 3-prong flash hider
    g.add(P.box(0.010, 0.034, 0.05, accent, 0, 0.008, -0.90));
  } else {
    g.add(P.tube(0.016, 0.06, accent, 0, 0.008, -0.90, 8));         // birdcage
  }
  const charging = P.box(0.014, 0.014, 0.055, accent, 0, 0.055, -0.075);
  g.add(charging);
  // Curved STANAG-ish magazine: two boxes hinged into a banana.
  const mag = new THREE.Group();
  const magA = P.box(0.042, 0.13, 0.062, MAT.polymer, 0, -0.065, 0);
  const magB = P.box(0.042, 0.10, 0.060, MAT.polymer, 0, -0.175, 0.030);
  magB.rotation.x = -0.30;
  mag.add(magA, magB, P.box(0.046, 0.018, 0.066, accent, 0, -0.222, 0.045));
  mag.position.set(0, -0.03, -0.235);
  mag.rotation.x = 0.06;
  g.add(mag);
  g.add(pistolGrip(P, MAT.polymer, 0, -0.035, -0.06));
  g.add(triggerGuard(P, MAT.polymer, -0.12));
  g.add(stock(P, MAT.furniture, 0.16, -0.09, 0.012));
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.008, -0.94),
    sightY: 0.082, sightZ: -0.18, opticZ: -0.26, opticY: 0.070,
    moving: { mag, charging },
  };
}

function buildShotgun(P, accent) {
  const g = new THREE.Group();
  g.add(P.box(0.062, 0.088, 0.27, MAT.blued, 0, 0.006, -0.20));
  g.add(P.tube(0.018, 0.46, MAT.blued, 0, 0.030, -0.55, 12));       // barrel
  g.add(P.tube(0.013, 0.40, MAT.steel, 0, -0.020, -0.52, 10));      // magazine tube
  const pump = P.box(0.058, 0.055, 0.15, MAT.furniture, 0, -0.020, -0.50);
  g.add(pump);
  g.add(P.box(0.062, 0.010, 0.15, MAT.blued, 0, -0.050, -0.50));    // pump rails
  g.add(P.box(0.008, 0.014, 0.010, accent, 0, 0.048, -0.775));      // bead sight
  g.add(P.box(0.020, 0.020, 0.03, accent, 0.030, 0.006, -0.10));    // ejection port
  g.add(pistolGrip(P, MAT.furniture, 0, -0.030, -0.04, -0.36));
  g.add(triggerGuard(P, MAT.blued, -0.09));
  g.add(stock(P, MAT.furniture, 0.18, -0.06, 0.03));
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.030, -0.79),
    sightY: 0.056, sightZ: -0.20, opticZ: -0.20, opticY: 0.052,
    moving: { pump },
  };
}

function buildSniper(P, accent) {
  const g = new THREE.Group();
  g.add(P.box(0.058, 0.085, 0.34, MAT.blued, 0, 0.005, -0.26));
  // Fluted barrel: a tube with four shallow grooves cut in as darker strips.
  g.add(P.tube(0.014, 0.50, MAT.steel, 0, 0.005, -0.70, 12));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.add(P.box(0.006, 0.006, 0.44, MAT.blued,
      Math.cos(a) * 0.013, 0.005 + Math.sin(a) * 0.013, -0.70));
  }
  g.add(P.tube(0.021, 0.08, accent, 0, 0.005, -0.98, 10));          // muzzle brake
  g.add(P.box(0.046, 0.014, 0.05, MAT.blued, 0, 0.006, -0.99));     // brake ports
  // Bolt handle, sticking out to the right.
  const bolt = new THREE.Group();
  bolt.add(P.post(0.007, 0.07, MAT.steel, 0.045, 0, 0));
  bolt.add(P.post(0.011, 0.018, accent, 0.062, 0.032, 0));
  bolt.rotation.z = -0.5;
  bolt.position.set(0, 0.02, -0.13);
  g.add(bolt);
  const mag = P.box(0.040, 0.09, 0.075, MAT.blued, 0, -0.075, -0.24);
  g.add(mag);
  g.add(pistolGrip(P, MAT.polymer, 0, -0.035, -0.055));
  g.add(triggerGuard(P, MAT.blued, -0.11));
  // Chassis stock with a cheek riser and a thumbhole gap.
  g.add(stock(P, MAT.polymer, 0.19, -0.08, 0.005));
  g.add(P.box(0.048, 0.035, 0.11, MAT.polymer, 0, 0.048, -0.01));   // cheek riser
  g.add(bipod(P, -0.63));
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.005, -1.03),
    sightY: 0.105, sightZ: -0.22, opticZ: -0.26, opticY: 0.062,
    moving: { bolt, mag },
  };
}

function buildLMG(P, accent) {
  const g = new THREE.Group();
  g.add(P.box(0.074, 0.10, 0.40, MAT.blued, 0, 0.005, -0.28));
  g.add(P.box(0.040, 0.026, 0.22, MAT.steel, 0, 0.065, -0.20));     // feed tray cover
  g.add(P.box(0.030, 0.055, 0.16, MAT.steel, 0, 0.090, -0.14));     // carry handle
  g.add(P.box(0.030, 0.014, 0.16, MAT.blued, 0, 0.118, -0.14));
  // Heat-shrouded barrel.
  g.add(P.tube(0.012, 0.34, MAT.steel, 0, 0.005, -0.65, 10));
  for (let i = 0; i < 5; i++) {
    g.add(P.box(0.038, 0.038, 0.014, MAT.blued, 0, 0.005, -0.53 - i * 0.055));
  }
  g.add(P.tube(0.019, 0.07, accent, 0, 0.005, -0.85, 10));
  // Belt box.
  const mag = new THREE.Group();
  mag.add(P.box(0.095, 0.135, 0.16, MAT.polymer, 0, 0, 0));
  mag.add(P.box(0.100, 0.020, 0.165, accent, 0, -0.070, 0));
  mag.position.set(0, -0.115, -0.26);
  g.add(mag);
  g.add(pistolGrip(P, MAT.polymer, 0, -0.040, -0.05));
  g.add(triggerGuard(P, MAT.polymer, -0.11));
  g.add(stock(P, MAT.polymer, 0.17, -0.10, 0.015));
  g.add(bipod(P, -0.72));
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.005, -0.90),
    sightY: 0.098, sightZ: -0.16, opticZ: -0.22, opticY: 0.082,
    moving: { mag },
  };
}

const RECIPES = {
  Pistol: buildPistol,
  SMG: buildSMG,
  'Assault Rifle': (P, a, burst) => buildRifle(P, a, burst),
  Shotgun: buildShotgun,
  Sniper: buildSniper,
  LMG: buildLMG,
};

// --- optics ----------------------------------------------------------------

// Builds the sight sitting on the rail and returns the height of its centreline,
// which is what ADS has to line up with the camera axis.
function buildOptic(P, def, accent, mountY, mountZ) {
  const g = new THREE.Group();
  const scoped = !!def.scoped;
  const big = def.zoom >= 4;

  if (def.zoom <= 1.6) {
    // Reflex / holo: an open frame with a glass pane leaning back.
    const h = 0.055;
    g.add(P.box(0.042, 0.012, 0.055, MAT.blued, 0, 0, 0));           // base
    for (const s of [-1, 1]) g.add(P.box(0.008, h, 0.05, MAT.blued, s * 0.021, h / 2, 0));
    g.add(P.box(0.040, h * 0.85, 0.010, MAT.blued, 0, h / 2, 0.026)); // rear hood
    const glass = P.box(0.036, h * 0.8, 0.004, MAT.glass, 0, h / 2, -0.018);
    glass.rotation.x = -0.14;
    g.add(glass);
    g.position.set(0, mountY, mountZ);
    return { group: g, sightY: mountY + h / 2, sightZ: mountZ, scoped: false, lensRadius: 0 };
  }

  // Magnified: a real tube on rings, with an objective bell and turrets.
  const len = big ? 0.30 : 0.22;
  const r = big ? 0.021 : 0.017;
  const rise = big ? 0.055 : 0.045;
  g.add(P.tube(r, len, MAT.blued, 0, rise, -len * 0.10, 14));
  g.add(P.tube(r * 1.45, 0.07, MAT.blued, 0, rise, -len * 0.55, 14));   // objective bell
  g.add(P.tube(r * 1.15, 0.05, MAT.blued, 0, rise, len * 0.36, 14));    // eyepiece
  for (const z of [-len * 0.30, len * 0.20]) {
    g.add(P.box(0.030, rise + 0.02, 0.020, MAT.steel, 0, rise / 2, z)); // rings
  }
  g.add(P.post(0.010, 0.026, accent, 0, rise + r + 0.010, -len * 0.05)); // elevation turret
  const wind = P.post(0.010, 0.026, accent, r + 0.011, rise, -len * 0.05); // windage turret

  wind.rotation.z = Math.PI / 2;
  g.add(wind);
  // Front lens: a dark disc so the objective reads as glass, not a hole.
  const lensR = r * 1.35;
  g.add(P.tube(lensR, 0.004, MAT.glass, 0, rise, -len * 0.55 - 0.036, 16));
  g.position.set(0, mountY, mountZ);
  return {
    group: g, sightY: mountY + rise, sightZ: mountZ,
    scoped, lensRadius: lensR, lensOffset: new THREE.Vector3(0, mountY + rise, mountZ + len * 0.36),
  };
}

// --- public API ------------------------------------------------------------

// stats: from weaponStats(). optic: an OPTICS entry, or null for iron sights.
export function buildWeaponModel(stats, optic = null) {
  const P = partsBin();
  const accent = accentMat(rarityOf(stats.rarity).color);
  const recipe = RECIPES[stats.class] ?? buildRifle;
  const built = recipe(P, accent, stats.id === 'burst');
  const group = built.group;

  let sightY = built.sightY;
  let sightZ = built.sightZ;
  let scopeInfo = null;

  const def = optic ?? ironSightsFor(stats);
  if (def && def.id !== 'iron') {
    const o = buildOptic(P, def, accent, built.opticY, built.opticZ);
    group.add(o.group);
    sightY = o.sightY;
    sightZ = o.sightZ;
    if (o.scoped) scopeInfo = { lensRadius: o.lensRadius, lensOffset: o.lensOffset };
  }

  group.traverse((o) => {
    if (!o.isMesh) return;
    // The viewmodel lives in the world scene so it inherits camera motion for
    // free — but it must not inherit the arena's distance fog.
    o.material.fog = false;
    o.renderOrder = 2;
  });

  group.userData.dispose = () => { for (const g of P.geos) g.dispose(); };
  group.userData.muzzle = built.muzzle;
  group.userData.moving = built.moving ?? {};
  // The point on the gun that ADS puts on the camera axis.
  group.userData.sight = new THREE.Vector3(0, sightY, sightZ);
  group.userData.scope = scopeInfo;
  return group;
}
