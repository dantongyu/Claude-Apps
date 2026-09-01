// Objective types: eliminate | chests | survive | extract
// Every mission is fully described here: the arena is generated from `seed`,
// so a mission always plays the same map.
export const MISSIONS = [
  {
    id: 'm1', name: 'Cold Open', difficulty: 'Recruit', level: 1, seed: 10471,
    brief: 'A quiet block on the edge of the drop zone. Clear the scavs and get familiar with your gear.',
    arena: { size: 90, buildings: 8, crates: 22, chests: 5 },
    spawns: { budget: 8, maxAlive: 5, types: ['grunt', 'grunt', 'runner'] },
    objectives: [
      { type: 'eliminate', count: 8, label: 'Eliminate hostiles' },
    ],
    rewards: { credits: 220, xp: 120 },
  },
  {
    id: 'm2', name: 'Supply Sweep', difficulty: 'Recruit', level: 1, seed: 22890,
    brief: 'Loot caches were dropped here overnight. Crack them open before the scavs strip them.',
    arena: { size: 100, buildings: 11, crates: 28, chests: 9 },
    spawns: { budget: 12, maxAlive: 6, types: ['grunt', 'runner', 'runner'] },
    objectives: [
      { type: 'chests', count: 6, label: 'Open supply chests' },
      { type: 'eliminate', count: 6, label: 'Eliminate hostiles' },
    ],
    rewards: { credits: 340, xp: 180 },
  },
  {
    id: 'm3', name: 'Hold the Yard', difficulty: 'Operator', level: 3, seed: 33127,
    brief: 'Waves are inbound and they know you are here. Stay alive until exfil clears the airspace.',
    arena: { size: 95, buildings: 10, crates: 30, chests: 7 },
    spawns: { budget: 999, maxAlive: 7, types: ['grunt', 'runner', 'brute'] },
    objectives: [
      { type: 'survive', count: 150, label: 'Survive until exfil' },
    ],
    rewards: { credits: 520, xp: 300 },
  },
  {
    id: 'm4', name: 'Long Sightlines', difficulty: 'Operator', level: 5, seed: 44713,
    brief: 'Marksmen have the high ground across an open industrial lot. Break their line.',
    arena: { size: 120, buildings: 14, crates: 24, chests: 8 },
    spawns: { budget: 16, maxAlive: 7, types: ['marksman', 'grunt', 'marksman', 'runner'] },
    objectives: [
      { type: 'eliminate', count: 16, label: 'Eliminate hostiles' },
      { type: 'chests', count: 4, label: 'Open supply chests' },
    ],
    rewards: { credits: 700, xp: 420 },
  },
  {
    id: 'm5', name: 'Heavy Contact', difficulty: 'Veteran', level: 8, seed: 55901,
    brief: 'Brute squads are dug into the compound. Bring something that hits hard.',
    arena: { size: 110, buildings: 16, crates: 34, chests: 10 },
    spawns: { budget: 20, maxAlive: 8, types: ['brute', 'grunt', 'marksman', 'brute'] },
    objectives: [
      { type: 'eliminate', count: 20, label: 'Eliminate hostiles' },
    ],
    rewards: { credits: 950, xp: 620 },
  },
  {
    id: 'm6', name: 'Last Transport', difficulty: 'Veteran', level: 12, seed: 66284,
    brief: 'Strip the caches, then run for the extraction pad before the block goes hot.',
    arena: { size: 130, buildings: 18, crates: 38, chests: 12 },
    spawns: { budget: 26, maxAlive: 9, types: ['grunt', 'runner', 'brute', 'marksman'] },
    objectives: [
      { type: 'chests', count: 8, label: 'Strip supply chests' },
      { type: 'eliminate', count: 14, label: 'Eliminate hostiles' },
      { type: 'extract', count: 1, label: 'Reach the extraction pad' },
    ],
    rewards: { credits: 1400, xp: 900 },
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? null;
}
