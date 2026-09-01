// Collision tests. Runs against a minimal Three.js stub (see tests/run.py) —
// Physics.js only needs Vector3, Box3, Ray and MathUtils.clamp.
const T = [];
function test(name, fn) { T.push([name, fn]); }
function ok(v, msg) { if (!v) throw new Error(msg ?? 'expected truthy'); }
function close(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg ?? 'expected'}: ${a} !~ ${b}`);
}

const PLAYER = { radius: 0.4, height: 1.8, stepHeight: 0.5 };
const floor = () => makeBox(0, -2, 0, 200, 4, 200); // top face at y = 0

test('an actor lands on the floor and reports grounded', () => {
  const world = [floor()];
  const pos = new THREE.Vector3(0, 5, 0);
  let res;
  for (let i = 0; i < 120; i++) {
    res = moveActor(pos, new THREE.Vector3(0, -0.2, 0), world, PLAYER);
    if (res.onGround) break;
  }
  ok(res.onGround, 'should land');
  close(pos.y, 0, 1e-3, 'rests on the floor top');
});

test('a wall blocks horizontal movement instead of letting the actor through', () => {
  const world = [floor(), makeBox(3, 2, 0, 1, 4, 10)]; // wall spanning x 2.5..3.5
  const pos = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < 60; i++) moveActor(pos, new THREE.Vector3(0.2, 0, 0), world, PLAYER);
  ok(pos.x < 2.5, `stopped before the wall, got x=${pos.x}`);
  close(pos.x, 2.5 - PLAYER.radius, 0.01, 'flush against the wall face');
});

test('the actor slides along a wall rather than sticking', () => {
  const world = [floor(), makeBox(3, 2, 0, 1, 4, 20)];
  const pos = new THREE.Vector3(0, 0, 0);
  // Push diagonally into the wall: x is blocked, z should still advance.
  for (let i = 0; i < 30; i++) moveActor(pos, new THREE.Vector3(0.2, 0, 0.2), world, PLAYER);
  ok(pos.x < 2.5, 'x is blocked');
  ok(pos.z > 4, `z keeps moving, got z=${pos.z}`);
});

test('low ledges are stepped onto, tall ones are not', () => {
  const low = [floor(), makeBox(3, 0.2, 0, 2, 0.4, 6)];  // 0.4 high — under stepHeight
  const pos = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < 40; i++) moveActor(pos, new THREE.Vector3(0.2, 0, 0), low, PLAYER);
  ok(pos.x > 3, `walked onto the ledge, got x=${pos.x}`);
  close(pos.y, 0.4, 0.02, 'stands on top of the ledge');

  const high = [floor(), makeBox(3, 0.75, 0, 2, 1.5, 6)]; // 1.5 high — a wall
  const pos2 = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < 40; i++) moveActor(pos2, new THREE.Vector3(0.2, 0, 0), high, PLAYER);
  ok(pos2.x < 2, `blocked by the tall ledge, got x=${pos2.x}`);
  close(pos2.y, 0, 1e-3, 'stays on the ground');
});

test('a ceiling stops upward movement', () => {
  const world = [floor(), makeBox(0, 2.4, 0, 6, 0.4, 6)]; // underside at y = 2.2
  const pos = new THREE.Vector3(0, 0, 0);
  const res = moveActor(pos, new THREE.Vector3(0, 1.0, 0), world, PLAYER);
  ok(res.hitCeiling, 'reports a ceiling hit');
  ok(pos.y + PLAYER.height <= 2.21, `head stays below the ceiling, got ${pos.y + PLAYER.height}`);
});

test('a fast fall does not tunnel through the floor', () => {
  const world = [floor()];
  const pos = new THREE.Vector3(0, 40, 0);
  const res = moveActor(pos, new THREE.Vector3(0, -45, 0), world, PLAYER);
  ok(res.onGround, 'caught by the thick floor slab');
  ok(pos.y >= -0.001, `did not fall through, got y=${pos.y}`);
});

test('standing still on a surface still counts as grounded', () => {
  const world = [floor()];
  const pos = new THREE.Vector3(0, 0, 0);
  const res = moveActor(pos, new THREE.Vector3(0, 0, 0), world, PLAYER);
  ok(res.onGround, 'grounded while idle');
});

test('line of sight is blocked by geometry between two points', () => {
  const wall = [makeBox(0, 2, 0, 1, 4, 10)];
  const a = new THREE.Vector3(-5, 1.5, 0);
  const b = new THREE.Vector3(5, 1.5, 0);
  ok(!hasLineOfSight(a, b, wall), 'wall blocks the line');
  ok(hasLineOfSight(a, new THREE.Vector3(-2, 1.5, 0), wall), 'clear line before the wall');
  ok(hasLineOfSight(a, b, []), 'nothing in the way');
});

test('actors are clamped inside the arena bounds', () => {
  const pos = new THREE.Vector3(500, 0, -500);
  clampToArena(pos, 50);
  close(pos.x, 49, 1e-9);
  close(pos.z, -49, 1e-9);
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
