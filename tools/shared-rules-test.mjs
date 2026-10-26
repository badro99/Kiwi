/* Track A: each shared rule has one source and fresh browser copies. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, checkPure, exportsOf, generated, registry } from './build-shared-rules.mjs';

const problems = build({ check: true });
assert.deepEqual(problems, [], problems.join('\n'));

// The tool itself: purity scan, export list and the generated wrapper.
assert.deepEqual(exportsOf('export function a() {}\nexport const b = 1;\nconst c = 2;'), ['a', 'b']);
assert.deepEqual(checkPure('x.js', 'export function a(n) { return n * 2; }'), []);
assert.ok(checkPure('x.js', 'export function a() { return Date.now(); }').length, 'clock is impure');
assert.ok(checkPure('x.js', "import y from './y.js';\nexport function a() {}").length, 'imports are refused');
assert.ok(checkPure('x.js', 'export default 1;').length, 'default export refused');
assert.deepEqual(checkPure('x.js', "// Date.now() in a comment\nexport const a = 'window';"), [], 'comments and strings do not count');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-shared-'));
const src = path.join(tmp, 'rule.mjs');
fs.writeFileSync(src, 'export function double(n) { return n * 2; }\nexport const LIMIT = 3;\n');
const copy = generated({ name: 'KiwiProbe', source: path.relative(path.resolve('.'), src) }, '  ');
assert.match(copy, /^  \/\* GENERATED SHARED KiwiProbe BEGIN \*\//);
assert.match(copy, /return \{ double, LIMIT \};/);
const g = {};
new Function('g', copy + '\ng.KiwiProbe = KiwiProbe;')(g);
assert.equal(g.KiwiProbe.double(21), 42);
assert.equal(g.KiwiProbe.LIMIT, 3);
fs.rmSync(tmp, { recursive: true, force: true });

console.log('shared-rules-test: ' + registry().length + ' shared rule(s) current, tool checks green');
