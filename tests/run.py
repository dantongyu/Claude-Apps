#!/usr/bin/env python3
"""Run the pure-logic and physics suites without a JS toolchain.

No node is assumed on this machine, so each suite is assembled by concatenating
the relevant modules (with ES module syntax stripped), prepending a small
environment stub, and evaluating the result with whichever JS engine is around:
JavaScriptCore via `osascript -l JavaScript` on macOS, or SpiderMonkey via `gjs`
on a Linux desktop.

    python3 tests/run.py
"""
import pathlib, re, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
TESTS = ROOT / 'tests'

IMPORT_RE = re.compile(r'^\s*import\s+[^;]*?;\s*$', re.M | re.S)
EXPORT_RE = re.compile(r'^(\s*)export\s+(?=(?:const|let|var|function|class|async))', re.M)

BASE_PRELUDE = """
var RESULTS = [];
var console = { warn: function () {}, log: function () {}, error: function () {} };
"""

STORAGE_STUB = """
var __store = {};
var localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null; },
  setItem: function (k, v) { __store[k] = String(v); },
  removeItem: function (k) { delete __store[k]; },
};
var THREE = {};
"""

# Physics.js only touches these four Three.js primitives, so they are cheap to
# stand in for. Ray.intersectBox is the standard slab test.
THREE_STUB = """
var THREE = (function () {
  function Vector3(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  Vector3.prototype.set = function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
  Vector3.prototype.copy = function (v) { return this.set(v.x, v.y, v.z); };
  Vector3.prototype.clone = function () { return new Vector3(this.x, this.y, this.z); };
  Vector3.prototype.subVectors = function (a, b) {
    return this.set(a.x - b.x, a.y - b.y, a.z - b.z);
  };
  Vector3.prototype.length = function () {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  };
  Vector3.prototype.divideScalar = function (s) { return this.set(this.x / s, this.y / s, this.z / s); };
  Vector3.prototype.distanceTo = function (v) {
    var dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  function Box3(min, max) { this.min = min; this.max = max; }
  function Ray() { this.origin = new Vector3(); this.direction = new Vector3(); }
  Ray.prototype.set = function (o, d) { this.origin.copy(o); this.direction.copy(d); return this; };
  Ray.prototype.intersectBox = function (box, target) {
    var o = this.origin, d = this.direction;
    var tmin = -Infinity, tmax = Infinity;
    var axes = ['x', 'y', 'z'];
    for (var i = 0; i < 3; i++) {
      var a = axes[i];
      if (Math.abs(d[a]) < 1e-12) {
        if (o[a] < box.min[a] || o[a] > box.max[a]) return null;
        continue;
      }
      var t1 = (box.min[a] - o[a]) / d[a];
      var t2 = (box.max[a] - o[a]) / d[a];
      if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    var t = tmin >= 0 ? tmin : tmax;
    if (t < 0) return null;
    return target.set(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
  };
  return {
    Vector3: Vector3, Box3: Box3, Ray: Ray,
    MathUtils: {
      clamp: function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
      randFloatSpread: function (r) { return r * (Math.random() - 0.5); },
    },
  };
})();
"""

SUITES = [
    {
        'name': 'logic',
        'prelude': BASE_PRELUDE + STORAGE_STUB,
        'modules': [
            'core/Emitter.js', 'core/Random.js',
            'data/rarities.js', 'data/weapons.js', 'data/shop.js',
            'inventory/Item.js', 'inventory/Inventory.js', 'inventory/Stash.js',
            'economy/Wallet.js', 'economy/Shop.js',
            'save/SaveGame.js',
            'game/Combat.js', 'game/Objectives.js', 'game/Loot.js',
        ],
        'test': 'logic.test.js',
    },
    {
        'name': 'net',
        'prelude': BASE_PRELUDE,
        'modules': ['net/Protocol.js', 'net/Interpolator.js', 'net/Roster.js'],
        'test': 'net.test.js',
    },
    {
        'name': 'physics',
        'prelude': BASE_PRELUDE + THREE_STUB,
        'modules': ['game/Physics.js'],
        'test': 'physics.test.js',
    },
]


def strip_module(src):
    src = IMPORT_RE.sub('', src)
    src = EXPORT_RE.sub(r'\1', src)
    return re.sub(r'^\s*export\s*\{[^}]*\};?\s*$', '', src, flags=re.M)


def run_suite(suite):
    parts = [suite['prelude']]
    for rel in suite['modules']:
        parts.append(f"\n// ===== {rel} =====\n")
        parts.append(strip_module((SRC / rel).read_text()))
    parts.append("\n// ===== tests =====\n")
    parts.append(strip_module((TESTS / suite['test']).read_text()))
    proc = run_js(''.join(parts))
    out = (proc.stdout or '').strip()
    err = (proc.stderr or '').strip()

    print(f"--- {suite['name']} ---")
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    return bool(out) and 'FAIL' not in out and not err


# osascript returns the script's final expression; gjs needs an explicit print.
def run_js(script):
    if shutil.which('osascript'):
        return subprocess.run(
            ['osascript', '-l', 'JavaScript', '-e', script + '\nRESULTS.join("\\n");\n'],
            capture_output=True, text=True,
        )
    if shutil.which('gjs'):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
            f.write(script + '\nprint(RESULTS.join("\\n"));\n')
            path = f.name
        try:
            return subprocess.run(['gjs', path], capture_output=True, text=True)
        finally:
            pathlib.Path(path).unlink(missing_ok=True)
    sys.exit('no JS engine found: install gjs (Linux) or run on macOS (osascript)')


def main():
    results = [run_suite(s) for s in SUITES]
    print()
    if all(results):
        print('all suites passed')
        return 0
    print('SUITE FAILURES')
    return 1


if __name__ == '__main__':
    sys.exit(main())
