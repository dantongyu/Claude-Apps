import * as THREE from 'three';

// Axis-aligned box world. Actors are upright boxes (feet at position.y) resolved
// one axis at a time, which is stable and cheap for a world made of boxes.
export const GRAVITY = 24;
const EPS = 1e-4;

export function makeBox(cx, cy, cz, sx, sy, sz) {
  return new THREE.Box3(
    new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
    new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
  );
}

function overlaps(box, pos, r, h) {
  return (
    pos.x + r > box.min.x && pos.x - r < box.max.x &&
    pos.y + h > box.min.y && pos.y < box.max.y &&
    pos.z + r > box.min.z && pos.z - r < box.max.z
  );
}

function anyOverlap(colliders, pos, r, h) {
  for (const b of colliders) if (overlaps(b, pos, r, h)) return true;
  return false;
}

// Moves `pos` by `delta`, resolving against colliders. Mutates pos.
// Returns { onGround, hitWall, hitCeiling }.
export function moveActor(pos, delta, colliders, opts) {
  const r = opts.radius;
  const h = opts.height;
  const step = opts.stepHeight ?? 0;
  let onGround = false;
  let hitWall = false;
  let hitCeiling = false;

  // --- horizontal, one axis at a time so sliding along walls works ---
  for (const axis of ['x', 'z']) {
    const move = delta[axis];
    if (move === 0) continue;
    pos[axis] += move;

    for (const box of colliders) {
      if (!overlaps(box, pos, r, h)) continue;

      // Step up onto low ledges (kerbs, crate edges) instead of stopping dead.
      const rise = box.max.y - pos.y;
      if (step > 0 && rise > 0 && rise <= step) {
        const probe = pos.clone();
        probe.y = box.max.y + EPS;
        if (!anyOverlap(colliders, probe, r, h)) {
          pos.y = probe.y;
          onGround = true;
          continue;
        }
      }

      // Otherwise push back out along the axis we moved on.
      if (move > 0) pos[axis] = box.min[axis] - r - EPS;
      else pos[axis] = box.max[axis] + r + EPS;
      hitWall = true;
    }
  }

  // --- vertical ---
  if (delta.y !== 0) {
    pos.y += delta.y;
    for (const box of colliders) {
      if (!overlaps(box, pos, r, h)) continue;
      if (delta.y <= 0) {
        pos.y = box.max.y;
        onGround = true;
      } else {
        pos.y = box.min.y - h - EPS;
        hitCeiling = true;
      }
    }
  }

  // Standing still on top of something still counts as grounded.
  if (!onGround && delta.y <= 0) {
    const probe = pos.clone();
    probe.y -= 0.06;
    if (anyOverlap(colliders, probe, r, h)) onGround = true;
  }

  return { onGround, hitWall, hitCeiling };
}

// Cheap line-of-sight test against the box world (used by bot AI).
const _dir = new THREE.Vector3();
const _ray = new THREE.Ray();
export function hasLineOfSight(from, to, colliders) {
  _dir.subVectors(to, from);
  const dist = _dir.length();
  if (dist < EPS) return true;
  _dir.divideScalar(dist);
  _ray.set(from, _dir);
  const hit = new THREE.Vector3();
  for (const box of colliders) {
    if (_ray.intersectBox(box, hit) && from.distanceTo(hit) < dist - 0.1) return false;
  }
  return true;
}

export function clampToArena(pos, half) {
  pos.x = THREE.MathUtils.clamp(pos.x, -half + 1, half - 1);
  pos.z = THREE.MathUtils.clamp(pos.z, -half + 1, half - 1);
}
