// Pure damage maths — no scene access, so it can be reasoned about (and tested)
// on its own.

// Full damage inside `range`, falling off linearly to `falloff` at 2x range and
// holding there. Keeps shotguns lethal up close and useless across the map.
export function rangeMultiplier(stats, distance) {
  if (distance <= stats.range) return 1;
  const t = Math.min(1, (distance - stats.range) / stats.range);
  return 1 + (stats.falloff - 1) * t;
}

export function computeDamage(stats, distance, isHeadshot) {
  const base = stats.damage * rangeMultiplier(stats, distance);
  return base * (isHeadshot ? stats.headshot : 1);
}

// Shield absorbs first, then health. Returns what actually landed.
export function applyDamage(target, amount) {
  let remaining = amount;
  let toShield = 0;
  if (target.shield > 0) {
    toShield = Math.min(target.shield, remaining);
    target.shield -= toShield;
    remaining -= toShield;
  }
  const toHealth = Math.min(target.health, remaining);
  target.health -= toHealth;
  return { toShield, toHealth, total: toShield + toHealth, killed: target.health <= 0 };
}

// Spread grows while moving so run-and-gun is a real trade-off.
export function currentSpread(stats, speed, maxSpeed, airborne) {
  const moveFactor = Math.min(1, speed / Math.max(0.001, maxSpeed));
  return stats.spread + stats.moveSpread * moveFactor + (airborne ? stats.moveSpread * 0.8 : 0);
}
