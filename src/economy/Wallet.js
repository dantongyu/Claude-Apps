// Credits and the XP curve. Pure functions over the profile object so they are
// trivially testable and the UI can preview a reward before it is granted.

export function xpForLevel(level) {
  // Level 1->2 costs 150, growing ~120 per level. Gentle, mission rewards keep pace.
  return Math.round(150 + (level - 1) * 120);
}

export function levelProgress(profile) {
  const need = xpForLevel(profile.level);
  return { xp: profile.xp, need, pct: Math.min(1, profile.xp / need) };
}

// Returns how many levels were gained.
export function grantXp(profile, amount) {
  profile.xp += Math.max(0, Math.round(amount));
  let gained = 0;
  while (profile.xp >= xpForLevel(profile.level)) {
    profile.xp -= xpForLevel(profile.level);
    profile.level += 1;
    gained += 1;
  }
  return gained;
}

export function grantCredits(profile, amount) {
  const n = Math.max(0, Math.round(amount));
  profile.credits += n;
  profile.stats.credits += n;
  return n;
}

export function canAfford(profile, price) {
  return profile.credits >= price;
}

export function spend(profile, price) {
  if (!canAfford(profile, price)) return false;
  profile.credits -= price;
  return true;
}

export function formatCredits(n) {
  return n.toLocaleString('en-US');
}
