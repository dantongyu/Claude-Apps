import { makeWeapon, makeConsumable } from '../inventory/Item.js';

const KEY = 'dropzone.save.v1';
const VERSION = 1;

export function defaultProfile() {
  const starter = [
    makeWeapon('pistol', 'common'),
    makeWeapon('smg', 'common'),
    makeConsumable('bandage', 3),
  ];
  return {
    version: VERSION,
    createdAt: Date.now(),
    level: 1,
    xp: 0,
    credits: 500,
    stash: starter,
    // uids of stash items carried into the next mission (max 5)
    loadout: [starter[0].uid, starter[1].uid, starter[2].uid],
    ammo: { light: 240, medium: 180, heavy: 60, shell: 40 },
    skins: ['default'],
    activeSkin: 'default',
    shop: { day: null, stock: [], bought: [] },
    stats: { missions: 0, completed: 0, kills: 0, chests: 0, deaths: 0, credits: 0 },
    settings: { sensitivity: 1.0, fov: 78, volume: 0.6, invertY: false },
  };
}

// Future schema bumps hook in here so in-progress saves survive.
function migrate(raw) {
  let data = raw;
  if (!data || typeof data !== 'object') return defaultProfile();
  if (data.version === VERSION) return withDefaults(data);
  // No older versions shipped yet; anything unrecognised starts fresh but keeps
  // whatever fields still make sense.
  return withDefaults({ ...defaultProfile(), ...data, version: VERSION });
}

// Guards against a save written before a field existed.
function withDefaults(data) {
  const d = defaultProfile();
  return {
    ...d,
    ...data,
    ammo: { ...d.ammo, ...(data.ammo ?? {}) },
    shop: { ...d.shop, ...(data.shop ?? {}) },
    stats: { ...d.stats, ...(data.stats ?? {}) },
    settings: { ...d.settings, ...(data.settings ?? {}) },
    stash: Array.isArray(data.stash) ? data.stash : d.stash,
    loadout: Array.isArray(data.loadout) ? data.loadout : d.loadout,
    skins: Array.isArray(data.skins) ? data.skins : d.skins,
  };
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('[save] unreadable save, starting fresh', err);
    return defaultProfile();
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
    return true;
  } catch (err) {
    console.warn('[save] could not persist', err);
    return false;
  }
}

export function wipeProfile() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
