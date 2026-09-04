// Wire format for co-op play. Kept in one place, free of any Three.js or DOM
// dependency, so both ends agree on the shape and it can be tested directly.
//
// Message keys are short because snapshots go out ~15 times a second to every
// peer; positions and angles are quantised for the same reason.

export const PROTOCOL_VERSION = 1;

export const MSG = {
  HELLO: 'h',        // client -> host: I am joining
  WELCOME: 'w',      // host -> client: you are in, here is the room
  LOBBY: 'l',        // host -> all: the player list changed
  START: 's',        // host -> all: deploying to this mission
  STATE: 'st',       // client -> host: my player state
  SNAPSHOT: 'sn',    // host -> all: the authoritative world
  ENEMY_HIT: 'eh',   // client -> host: I hit this bot
  CHEST_OPEN: 'co',  // client -> host: I want to open this chest
  CHEST_DONE: 'cd',  // host -> all: that chest is now open
  LOOT_SPAWN: 'ls',  // host -> all: loot exists here
  LOOT_TAKE: 'lt',   // client -> host: I want this pickup
  LOOT_GONE: 'lk',   // host -> all: that pickup is claimed
  PLAYER_HURT: 'ph', // host -> one client: a bot shot you
  PLAYER_DOWN: 'pd', // client -> host: I went down
  MISSION_END: 'me', // host -> all: mission over
  BYE: 'b',          // either way: leaving
};

// Unambiguous alphabet: no O/0, I/1, or S/5, so codes survive being read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
export const CODE_LENGTH = 4;
const ROOM_PREFIX = 'dropzone-v1-';

export function makeRoomCode(random = Math.random) {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function normaliseRoomCode(input) {
  return String(input ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidRoomCode(code) {
  const c = normaliseRoomCode(code);
  if (c.length !== CODE_LENGTH) return false;
  return [...c].every((ch) => CODE_ALPHABET.includes(ch));
}

// The signalling broker is shared with every other PeerJS app, so the room code
// is namespaced before it becomes a peer id.
export function peerIdForRoom(code) {
  return ROOM_PREFIX + normaliseRoomCode(code);
}

export function roomFromPeerId(peerId) {
  return String(peerId ?? '').startsWith(ROOM_PREFIX)
    ? peerId.slice(ROOM_PREFIX.length)
    : null;
}

export function cleanName(name, fallback = 'Operator') {
  const trimmed = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return trimmed || fallback;
}

// --- quantisation ----------------------------------------------------------
// Two decimals on positions is ~1cm, well under what anyone can see at these
// speeds, and it roughly halves the JSON.

const q2 = (n) => Math.round(n * 100) / 100;
const q3 = (n) => Math.round(n * 1000) / 1000;

export function packPlayer(p) {
  return {
    i: p.id,
    p: [q2(p.pos.x), q2(p.pos.y), q2(p.pos.z)],
    y: q3(p.yaw),
    t: q3(p.pitch),
    h: Math.round(p.health),
    s: Math.round(p.shield),
    a: p.alive ? 1 : 0,
    f: p.firing ? 1 : 0,
    w: p.weaponId ?? null,
    r: p.rarity ?? null,
  };
}

export function unpackPlayer(d) {
  return {
    id: d.i,
    pos: { x: d.p[0], y: d.p[1], z: d.p[2] },
    yaw: d.y,
    pitch: d.t,
    health: d.h,
    shield: d.s,
    alive: d.a === 1,
    firing: d.f === 1,
    weaponId: d.w,
    rarity: d.r,
  };
}

export function packEnemy(e) {
  return {
    i: e.id,
    k: e.type,
    p: [q2(e.pos.x), q2(e.pos.y), q2(e.pos.z)],
    y: q3(e.yaw),
    h: Math.round(e.health),
    s: Math.round(e.shield),
    a: e.alive ? 1 : 0,
  };
}

export function unpackEnemy(d) {
  return {
    id: d.i,
    type: d.k,
    pos: { x: d.p[0], y: d.p[1], z: d.p[2] },
    yaw: d.y,
    health: d.h,
    shield: d.s,
    alive: d.a === 1,
  };
}

export function packSnapshot({ time, players, enemies, objectives }) {
  return {
    m: MSG.SNAPSHOT,
    t: q3(time),
    p: players.map(packPlayer),
    e: enemies.map(packEnemy),
    o: objectives,
  };
}

export function unpackSnapshot(msg) {
  return {
    time: msg.t,
    players: (msg.p ?? []).map(unpackPlayer),
    enemies: (msg.e ?? []).map(unpackEnemy),
    objectives: msg.o ?? [],
  };
}
