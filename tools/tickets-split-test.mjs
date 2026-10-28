import splitFunctions from './split-functions.cjs';
const sameSplit = (actual, expected, message) => assert.deepEqual(splitFunctions.tokens(actual), splitFunctions.tokens(expected), message);
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { ticketsTestSource, ticketsMap, ticketsFiles } from './tickets-test-source.mjs';
const read = file => fs.readFileSync(file, 'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/tickets/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), ticketsMap.sha256);
assert.equal(read('tools/fixtures/tickets/sha256').trim(), ticketsMap.sha256);
sameSplit(ticketsTestSource(), original, 'live files rebuild the original byte for byte');
for (const p of ticketsMap.parts) {
  const source = read(p.file);
  assert.ok(source.startsWith(p.header), p.file + ': explicit injected interface');
  for (const f of p.fragments) sameSplit(splitFunctions.declaration(source, f.name), original.slice(f.start,f.end), f.name + ': live function body');
  sameSplit(source, p.header + p.fragments.map(f => original.slice(f.start,f.end) + '\n\n').join('') + p.footer + p.ownerSuffix, p.file + ': no unrecorded module code');
  const mod = await import(new URL('../'+p.file, import.meta.url));
  assert.deepEqual(Object.keys(mod).sort(), p.name === 'data' ? ['createData','createTicketState'] : ['create'+p.name[0].toUpperCase()+p.name.slice(1)]);
  const args = Object.fromEntries(p.deps.map(key => [key, () => {}]));
  const instance = mod['create'+p.name[0].toUpperCase()+p.name.slice(1)](args);
  assert.ok(Object.isFrozen(instance));
  assert.deepEqual(Object.keys(instance),p.exports);
  for (const f of p.fragments) sameSplit(String(instance[f.name]), original.slice(f.start,f.end).trimStart(), f.name + ': actual exported function source');
}
const entry = read('assets/tickets.js');
const imports = [...entry.matchAll(/^import .* from '([^']+)';/gm)].map(m => m[1].replace('./','assets/').replace(/\?v=\d+$/,''));
assert.deepEqual(imports,ticketsMap.parts.map(p=>p.file));
assert.match(read('tickets.html'), /<script type="module" src="assets\/tickets.js\?v=\d+" defer><\/script>/);
assert.equal((read('tickets.html').match(/<script\b[^>]*src=/g)||[]).length,4,'no additional script tags');
const stamps = (await import('./stamps.js')).default.scan();
for (const file of ticketsFiles) {
  assert.ok(stamps.has(file),file+': stamp-discoverable');
  if (file !== 'assets/tickets.js') assert.ok(read('kiwi-sw.js').includes("'/"+file+'?v='),file+': precached');
}
console.log('✓ tickets split: live reconstruction, live exported bodies, explicit factories, module loading, stamps and precache');
