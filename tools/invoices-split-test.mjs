#!/usr/bin/env node
// Preuve figée : extraction et reconstruction intégrales, octet par octet.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const read = file => fs.readFileSync(file, 'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/invoices/original.js.gz')).toString('utf8');
const map = JSON.parse(read('tools/fixtures/invoices/split.json'));
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
const route = read('functions/api/invoices.js').replace("import { registerSummary } from './invoices/_summary.js';\n", '').replace("  if (url.searchParams.has('summary')) return json({ok:true, summary:await registerSummary(ctx, today)});\n", '');
assert.ok(route.startsWith(map.prefix));
let rebuilt = route.slice(map.prefix.length);
for (const part of map.segments) {
  const source = read(part.file);
  assert.ok(part.file.split('/').at(-1).startsWith('_'), 'module privé Pages');
  assert.ok(source.startsWith(part.header));
  assert.ok(source.endsWith(part.footer));
  const body = source.slice(part.header.length, part.footer ? -part.footer.length : undefined);
  assert.equal(body, original.slice(part.start, part.end), part.file + ' : corps inchangé');
  assert.equal(rebuilt.split(part.marker).length, 2, 'une seule délégation');
  rebuilt = rebuilt.replace(part.marker, () => body);
  const mod = await import(new URL('../' + part.file, import.meta.url));
  assert.ok(!Object.keys(mod).some(key => key.startsWith('onRequest')), 'aucun export routable');
}
for (const removed of [...map.removed].sort((a, b) => original.indexOf(a) - original.indexOf(b))) {
  const at = original.indexOf(removed);
  rebuilt = rebuilt.slice(0, at) + removed + rebuilt.slice(at);
}
assert.equal(rebuilt, original, 'reconstruction intégrale du fichier figé');
assert.deepEqual(Object.keys(await import('../functions/api/invoices.js')).sort(),
  ['DOC_TYPES', 'PAYMENT_METHODS', 'VAT_RATES', 'computeTotals', 'onRequestGet', 'onRequestPost'].sort(), 'API exportée conservée');
console.log('✓ invoices : sept modules privés, corps et reconstruction identiques octet par octet, API conservée');
