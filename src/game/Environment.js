// A tiny procedural sky, prefiltered into an environment map.
//
// Metal only looks like metal when it has something to reflect. The arena has
// two lights and no environment, so a `MeshStandardMaterial` gun would render
// as a black silhouette. This builds a 64x32 gradient sky with a sun blob and
// runs it through PMREM, which is enough to give the weapon models highlights
// and a sense of shape — for a few kilobytes and no asset files.
//
// It is applied to the weapon materials directly rather than via
// `scene.environment`, because in three r169 that would also light the arena's
// Lambert materials and change the look of a game that is already tuned.

import * as THREE from 'three';

const W = 64;
const H = 32;

// Sun direction matches Arena.js's directional light at (0.4, 0.75, 0.25).
const SUN = new THREE.Vector3(0.4, 0.75, 0.25).normalize();

const SKY = [0.42, 0.58, 0.78];
const HORIZON = [0.78, 0.82, 0.86];
const GROUND = [0.20, 0.19, 0.17];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function gradientSky() {
  const data = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    // v = 0 at the top of the equirect image, which is +Y.
    const elevation = (0.5 - (y + 0.5) / H) * Math.PI;    // +pi/2 .. -pi/2
    const t = Math.sin(elevation);
    const base = t >= 0
      ? mix(HORIZON, SKY, Math.pow(t, 0.6))
      : mix(HORIZON, GROUND, Math.pow(-t, 0.35));

    for (let x = 0; x < W; x++) {
      const azimuth = ((x + 0.5) / W) * Math.PI * 2 - Math.PI;
      const dir = new THREE.Vector3(
        Math.cos(elevation) * Math.sin(azimuth),
        Math.sin(elevation),
        Math.cos(elevation) * Math.cos(azimuth),
      );
      // A wide, soft sun: a hard disc would alias badly at this resolution.
      const sun = Math.pow(Math.max(0, dir.dot(SUN)), 24) * 9;
      const i = (y * W + x) * 4;
      data[i] = base[0] + sun;
      data[i + 1] = base[1] + sun * 0.95;
      data[i + 2] = base[2] + sun * 0.82;
      data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// One environment per renderer, built on first use and kept for the session —
// PMREM is not cheap enough to redo on every match start.
const _cache = new WeakMap();

export function weaponEnvironment(renderer) {
  let env = _cache.get(renderer);
  if (env) return env;
  const source = gradientSky();
  const pmrem = new THREE.PMREMGenerator(renderer);
  env = pmrem.fromEquirectangular(source).texture;
  pmrem.dispose();
  source.dispose();
  _cache.set(renderer, env);
  return env;
}
