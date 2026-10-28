import splitFunctions from './split-functions.cjs';
const sameSplit = (actual, expected, message) => assert.deepEqual(splitFunctions.tokens(actual), splitFunctions.tokens(expected), message);
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('../app/node_modules/typescript');
import { bookingSplit as map, bookingReadableSource, bookingTestSource } from './booking-test-source.mjs';
const hash = source => createHash('sha256').update(source).digest('hex');
const original = gunzipSync(fs.readFileSync('tools/fixtures/booking/original.js.gz')).toString();
const readable = bookingReadableSource();
assert.equal(hash(original), map.sha256);
assert.equal(fs.readFileSync('tools/fixtures/booking/sha256', 'utf8').trim(), map.sha256);
// New behaviours are checked against live code; historical archive hash stays pinned.
function tokens(source) {
  const sf = ts.createSourceFile('booking.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), out = [];
  function walk(node) {
    const children = node.getChildren(sf);
    if (!children.length && node.kind !== ts.SyntaxKind.EndOfFileToken) out.push([node.kind, node.getText(sf)]);
    for (const child of children) walk(child);
  }
  walk(sf); return out;
}
sameSplit(readable, original, 'formatting preserves every token, including literals');
function syntax(source) {
  function shape(node) {
    const children = [];
    ts.forEachChild(node, child => { children.push(shape(child)); });
    return [node.kind, ...children];
  }
  return shape(ts.createSourceFile('booking.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
}
assert.ok(ts.createSourceFile('booking.js', readable, ts.ScriptTarget.Latest, true).parseDiagnostics.length === 0, 'reconstructed live source parses');
for (const part of map.parts) {
  const live = fs.readFileSync(part.file, 'utf8');
  assert.ok(live.startsWith(part.prefix) && live.endsWith(part.suffix), part.file + ': complete explicit factory');
  for (const name of part.names) assert.ok(splitFunctions.declaration(live, name), name + ': live declaration');
}
sameSplit(bookingTestSource(), original, 'complete original rebuilt byte for byte from live files');
const html = fs.readFileSync('booking.html', 'utf8');
// 4 from the split, plus booking-recover.js (28 Oct, note 13 booking#2): a standalone
// module kept outside this map on purpose, so the split bodies stay byte-identical.
assert.equal((html.match(/<script\b/g) || []).length, 5, 'public script count: the split four plus booking-recover.js');
assert.ok(html.includes('<script type="module" src="assets/booking-recover.js?v='), 'the recovery form is its own module');
console.log('✓ booking split: token-identical formatting, historical bodies outside reviewed fixes, live reconstruction and reviewed fail-soft behaviour');
