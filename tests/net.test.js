// Wire-format and interpolation tests. Both modules are deliberately free of
// Three.js and the DOM so they can be tested without a browser.
const T = [];
function test(name, fn) { T.push([name, fn]); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg ?? 'expected'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}
function ok(v, msg) { if (!v) throw new Error(msg ?? 'expected truthy'); }
function close(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg ?? 'expected'}: ${a} !~ ${b}`);
}

// ---------------------------------------------------------------- room codes

test('generated room codes are always valid', () => {
  for (let i = 0; i < 500; i++) {
    const code = makeRoomCode();
    eq(code.length, CODE_LENGTH, 'length');
    ok(isValidRoomCode(code), `generated an invalid code: ${code}`);
  }
});

test('room codes avoid characters people misread', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) for (const ch of makeRoomCode()) seen.add(ch);
  for (const bad of ['O', '0', 'I', '1', 'S', '5']) {
    ok(!seen.has(bad), `alphabet should not contain ${bad}`);
  }
});

test('codes are normalised from whatever the player types', () => {
  eq(normaliseRoomCode(' a2-b3 '), 'A2B3', 'trims, upcases, strips punctuation');
  eq(normaliseRoomCode('q7k4'), 'Q7K4');
  ok(isValidRoomCode('  q7k4  '), 'sloppy input still validates');
  ok(!isValidRoomCode('Q7K'), 'too short');
  ok(!isValidRoomCode('Q7K44'), 'too long');
  ok(!isValidRoomCode('Q7K0'), 'contains an excluded character');
  ok(!isValidRoomCode(''), 'empty');
  ok(!isValidRoomCode(null), 'null');
});

test('peer ids are namespaced and round-trip', () => {
  const code = 'Q7K4';
  const id = peerIdForRoom(code);
  ok(id.length > code.length, 'namespaced away from other PeerJS apps');
  eq(roomFromPeerId(id), code, 'round-trips');
  eq(roomFromPeerId('some-other-app-abc'), null, 'foreign ids are rejected');
  eq(peerIdForRoom(' q7k4 '), id, 'normalises before building the id');
});

test('player names are cleaned and bounded', () => {
  eq(cleanName('  Dan  '), 'Dan');
  eq(cleanName(''), 'Operator', 'falls back');
  eq(cleanName(null), 'Operator');
  eq(cleanName('a'.repeat(50)).length, 16, 'capped');
  eq(cleanName('two   spaces'), 'two spaces', 'collapses whitespace');
});

// ---------------------------------------------------------------- packing

test('player state survives a round trip', () => {
  const p = {
    id: 'p1', pos: { x: 1.239, y: 0.5, z: -3.7 }, yaw: 1.5708, pitch: -0.25,
    health: 87.6, shield: 30.2, alive: true, firing: false,
    weaponId: 'rifle', rarity: 'epic',
  };
  const back = unpackPlayer(packPlayer(p));
  eq(back.id, 'p1');
  close(back.pos.x, 1.24, 0.005, 'position quantised to ~1cm');
  close(back.pos.z, -3.7, 0.005);
  close(back.yaw, 1.571, 0.001);
  eq(back.health, 88, 'health rounds to a whole point');
  eq(back.alive, true);
  eq(back.firing, false);
  eq(back.weaponId, 'rifle');
  eq(back.rarity, 'epic');
});

test('enemy state survives a round trip', () => {
  const e = {
    id: 7, type: 'brute', pos: { x: -12.345, y: 0, z: 8.9 },
    yaw: 3.14159, health: 120.7, shield: 0, alive: true,
  };
  const back = unpackEnemy(packEnemy(e));
  eq(back.id, 7);
  eq(back.type, 'brute');
  close(back.pos.x, -12.345, 0.01, 'within one quantisation step');
  eq(back.health, 121);
  eq(back.alive, true);
});

test('a dead entity round-trips as dead', () => {
  const e = { id: 1, type: 'grunt', pos: { x: 0, y: 0, z: 0 }, yaw: 0, health: 0, shield: 0, alive: false };
  eq(unpackEnemy(packEnemy(e)).alive, false);
});

test('snapshots carry players, enemies and objectives', () => {
  const snap = packSnapshot({
    time: 12.3456,
    players: [{ id: 'a', pos: { x: 1, y: 2, z: 3 }, yaw: 0, pitch: 0, health: 100, shield: 0, alive: true, firing: false, weaponId: 'smg', rarity: 'rare' }],
    enemies: [{ id: 1, type: 'grunt', pos: { x: 4, y: 0, z: 5 }, yaw: 1, health: 70, shield: 0, alive: true }],
    objectives: [{ label: 'Kill', done: false, text: '2/8', pct: 0.25 }],
  });
  eq(snap.m, MSG.SNAPSHOT, 'tagged as a snapshot');
  const back = unpackSnapshot(snap);
  close(back.time, 12.346, 0.001);
  eq(back.players.length, 1);
  eq(back.enemies.length, 1);
  eq(back.objectives[0].text, '2/8');
  eq(unpackSnapshot({ t: 0 }).players.length, 0, 'missing lists decode as empty');
});

test('quantisation keeps snapshots small', () => {
  const players = [];
  for (let i = 0; i < 4; i++) {
    players.push({
      id: 'p' + i, pos: { x: Math.random() * 100, y: Math.random(), z: Math.random() * 100 },
      yaw: Math.random() * 6, pitch: Math.random(), health: 100, shield: 50,
      alive: true, firing: false, weaponId: 'rifle', rarity: 'epic',
    });
  }
  const enemies = [];
  for (let i = 0; i < 8; i++) {
    enemies.push({
      id: i, type: 'grunt', pos: { x: Math.random() * 100, y: 0, z: Math.random() * 100 },
      yaw: Math.random() * 6, health: 70, shield: 0, alive: true,
    });
  }
  const size = JSON.stringify(packSnapshot({ time: 1, players, enemies, objectives: [] })).length;
  ok(size < 1400, `a full snapshot should stay small, got ${size} bytes`);
});

// ---------------------------------------------------------------- interpolation

test('angle interpolation takes the short way around', () => {
  close(lerpAngle(0, Math.PI / 2, 0.5), Math.PI / 4, 1e-9, 'simple case');
  // 350deg -> 10deg should cross zero, not sweep backwards through 180.
  const a = (350 * Math.PI) / 180;
  const b = (10 * Math.PI) / 180;
  const mid = lerpAngle(a, b, 0.5);
  const deg = ((mid * 180) / Math.PI + 360) % 360;
  close(deg, 0, 0.001, 'wraps through zero');
});

test('out-of-order snapshots are dropped', () => {
  const it = new Interpolator();
  ok(it.push({ time: 1, players: [], enemies: [], objectives: [] }), 'first accepted');
  ok(it.push({ time: 2, players: [], enemies: [], objectives: [] }), 'newer accepted');
  ok(!it.push({ time: 1.5, players: [], enemies: [], objectives: [] }), 'stale rejected');
  ok(!it.push({ time: 2, players: [], enemies: [], objectives: [] }), 'duplicate rejected');
  eq(it.latest.time, 2);
});

test('sampling blends between the two bracketing snapshots', () => {
  const it = new Interpolator(0.1);
  const mk = (t, x) => ({
    time: t, objectives: [], enemies: [],
    players: [{ id: 'a', pos: { x, y: 0, z: 0 }, yaw: 0, pitch: 0 }],
  });
  it.push(mk(1.0, 0));
  it.push(mk(1.2, 20));
  // Newest is 1.2, delay 0.1 => render at 1.1, exactly halfway.
  const s = it.sample();
  close(s.time, 1.1, 1e-9);
  close(s.players[0].pos.x, 10, 1e-6, 'halfway between 0 and 20');
});

test('render time trails the newest snapshot by the delay', () => {
  const it = new Interpolator(0.12);
  it.push({ time: 5, players: [], enemies: [], objectives: [] });
  close(it.renderTime(), 4.88, 1e-9);
});

test('entities that appear mid-stream are not blended from nothing', () => {
  const it = new Interpolator(0.1);
  it.push({ time: 1.0, players: [], enemies: [], objectives: [] });
  it.push({
    time: 1.2, objectives: [], enemies: [],
    players: [{ id: 'new', pos: { x: 5, y: 0, z: 0 }, yaw: 0, pitch: 0 }],
  });
  const s = it.sample();
  eq(s.players.length, 1);
  close(s.players[0].pos.x, 5, 1e-9, 'uses its first known position as-is');
});

test('objectives always come from the newest snapshot', () => {
  const it = new Interpolator(0.1);
  it.push({ time: 1.0, players: [], enemies: [], objectives: [{ text: '1/8' }] });
  it.push({ time: 1.2, players: [], enemies: [], objectives: [{ text: '2/8' }] });
  eq(it.sample().objectives[0].text, '2/8', 'discrete state is never interpolated');
});

test('an empty interpolator samples null', () => {
  eq(new Interpolator().sample(), null);
});

test('the buffer does not grow without bound', () => {
  const it = new Interpolator();
  for (let i = 0; i < 200; i++) {
    it.push({ time: i, players: [], enemies: [], objectives: [] });
  }
  ok(it.buffer.length <= 24, `buffer capped, got ${it.buffer.length}`);
  eq(it.latest.time, 199, 'keeps the newest');
});

// ---------------------------------------------------------------- positions

test('positions pack to arrays and back', () => {
  const back = unpackPos(packPos({ x: 1.234, y: -0.006, z: 99.999 }));
  close(back.x, 1.23, 1e-9);
  close(back.y, -0.01, 1e-9, 'rounds, does not truncate');
  close(back.z, 100, 1e-9);
});

// ---------------------------------------------------------------- roster

const mkRoster = () => {
  const r = new Roster({ maxPlayers: 3, timeout: 8 });
  r.add('host', { name: 'Dan', color: '#e4633c', host: true, now: 0 });
  return r;
};

test('players join in order and the list is broadcast-safe', () => {
  const r = mkRoster();
  ok(r.add('p2', { name: 'Kim', color: '#4f9d5c', now: 1 }).ok);
  const list = r.list();
  eq(list.length, 2);
  eq(list[0].id, 'host'); eq(list[0].host, true);
  eq(list[1].name, 'Kim'); eq(list[1].host, false);
  ok(!('lastSeen' in list[1]), 'timestamps stay private');
});

test('a full room refuses with a readable reason', () => {
  const r = mkRoster();
  r.add('p2', { name: 'a' }); r.add('p3', { name: 'b' });
  const res = r.add('p4', { name: 'c' });
  eq(res.ok, false);
  eq(res.reason, 'room is full');
});

test('nobody joins once the mission has started', () => {
  const r = mkRoster();
  r.lock();
  eq(r.add('p2', { name: 'late' }).reason, 'mission already in progress');
  r.unlock();
  ok(r.add('p2', { name: 'late' }).ok, 'open again between missions');
});

test('duplicate ids and names are handled', () => {
  const r = mkRoster();
  eq(r.add('host', { name: 'x' }).reason, 'already in the room');
  r.add('p2', { name: 'Operator' });
  r.add('p3', { name: 'Operator' });
  r.add('p4', { name: '' }); // full: 3 max, so this one is refused
  const names = r.list().map((p) => p.name);
  eq(names[1], 'Operator');
  eq(names[2], 'Operator 2', 'second same-named player gets a suffix');
});

test('names are cleaned and colours validated on the way in', () => {
  const r = mkRoster();
  const { player } = r.add('p2', { name: '   Kim   Lee  ', color: 'javascript:alert(1)' });
  eq(player.name, 'Kim Lee');
  eq(player.color, '#5b8dd6', 'bad colour falls back to the default skin');
});

test('quiet peers go stale after the timeout, the host never does', () => {
  const r = mkRoster();
  r.add('p2', { name: 'a', now: 0 });
  r.add('p3', { name: 'b', now: 0 });
  r.touch('p3', 7);
  eq(r.stale(9).join(','), 'p2', 'p2 silent for 9s, p3 for 2s');
  eq(r.stale(100).sort().join(','), 'p2,p3');
  ok(!r.stale(100).includes('host'), 'the host is never dropped by its own roster');
  r.remove('p2');
  eq(r.size, 2);
  eq(r.remove('nobody'), null);
});

let pass = 0;
const failures = [];
for (const [name, fn] of T) {
  try { fn(); pass++; RESULTS.push('ok   ' + name); }
  catch (e) { failures.push(name); RESULTS.push('FAIL ' + name + '\n       ' + e.message); }
}
RESULTS.push('');
RESULTS.push(pass + '/' + T.length + ' tests passed');
if (failures.length) RESULTS.push('failed: ' + failures.join(', '));
