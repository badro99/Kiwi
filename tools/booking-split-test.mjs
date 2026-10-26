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
assert.equal(hash(readable), map.formattedSha256);
function tokens(source) {
  const sf = ts.createSourceFile('booking.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), out = [];
  function walk(node) {
    const children = node.getChildren(sf);
    if (!children.length && node.kind !== ts.SyntaxKind.EndOfFileToken) out.push([node.kind, node.getText(sf)]);
    for (const child of children) walk(child);
  }
  walk(sf); return out;
}
assert.deepEqual(tokens(readable), tokens(original), 'formatting preserves every token, including literals');
function syntax(source) {
  function shape(node) {
    const children = [];
    ts.forEachChild(node, child => { children.push(shape(child)); });
    return [node.kind, ...children];
  }
  return shape(ts.createSourceFile('booking.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
}
assert.deepEqual(syntax(readable), syntax(original), 'formatting preserves parsing and automatic semicolon insertion');
for (const part of map.parts) {
  const live = fs.readFileSync(part.file, 'utf8');
  assert.equal(live, part.prefix + part.fragments.map(f => readable.slice(f.start, f.end) + '\n').join('') + part.suffix, part.file + ': complete module accounted for');
  for (const f of part.fragments) assert.equal(live.slice(f.offset, f.offset + f.length), readable.slice(f.start, f.end), part.file + ': exact moved body');
}
assert.equal(bookingTestSource(), original, 'complete original rebuilt byte for byte from live files');
const html = fs.readFileSync('booking.html', 'utf8');
assert.equal((html.match(/<script\b/g) || []).length, 4, 'public script count unchanged');
console.log('✓ booking split: token-identical formatting, unchanged bodies, byte-exact original reconstruction');
