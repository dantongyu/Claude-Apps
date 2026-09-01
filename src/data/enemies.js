// Bot archetypes. `accuracy` is the fraction of shots that track the player;
// the rest are deliberately thrown wide so fights stay readable.
export const ENEMIES = {
  grunt: {
    id: 'grunt', name: 'Scav', health: 70, shield: 0, speed: 3.4, color: 0xc0563f,
    damage: 8, fireRate: 2.0, range: 32, accuracy: 0.42, aggroRange: 34,
    preferredRange: 12, xp: 12, weight: 60,
  },
  runner: {
    id: 'runner', name: 'Runner', health: 55, shield: 0, speed: 5.2, color: 0xd8a13a,
    damage: 6, fireRate: 3.4, range: 18, accuracy: 0.34, aggroRange: 40,
    preferredRange: 6, xp: 16, weight: 25,
  },
  brute: {
    id: 'brute', name: 'Brute', health: 190, shield: 50, speed: 2.6, color: 0x7a4fd6,
    damage: 15, fireRate: 1.2, range: 26, accuracy: 0.55, aggroRange: 30,
    preferredRange: 10, xp: 40, weight: 12, scale: 1.35,
  },
  marksman: {
    id: 'marksman', name: 'Marksman', health: 80, shield: 25, speed: 3.0, color: 0x3fa9c0,
    damage: 26, fireRate: 0.55, range: 70, accuracy: 0.62, aggroRange: 65,
    preferredRange: 30, xp: 30, weight: 18,
  },
};

export const ENEMY_LIST = Object.values(ENEMIES);
