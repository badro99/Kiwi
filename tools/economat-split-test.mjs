#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { reconstructEconomat } from './economat-source.mjs';
const read = file => fs.readFileSync(file, 'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/economat/original.js.gz')).toString('utf8');
const map = JSON.parse(read('tools/fixtures/economat/split.json'));
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
const route = read('functions/api/inventory/internal-requests.js');
assert.ok(route.startsWith(map.prefix));
assert.doesNotMatch(route, /(?:INSERT(?:\s+OR\s+IGNORE)?\s+INTO|UPDATE|DELETE\s+FROM)\s+inventory_request_reservations\b/i, 'les écritures de réservation appartiennent aux étapes privées');
assert.equal(route.split(map.insertion).length, 2);
const fields = ['merchant', 'request_id', 'line_no', 'item_id', 'location_id', 'qty_milli', 'review_revision', 'created_ts'];
// Contrats de propriété : INSERT initialise une ligne, UPDATE modifie seulement
// les champs nommés, DELETE libère une ligne entière sous la garde CAS existante.
const contracts = {
  review: { insert: [], update: [], delete: false },
  substitution: { insert: [], update: [], delete: false },
  reservation: { insert: fields, update: [], delete: false },
  cancellation: { insert: [], update: [], delete: true },
  handover: { insert: fields, update: ['qty_milli', 'review_revision', 'created_ts'], delete: true },
};
for (const part of map.segments) {
  const source = read(part.file);
  assert.ok(part.file.split('/').at(-1).startsWith('_'));
  assert.ok(source.startsWith(part.header));
  assert.ok(source.endsWith(part.footer));
  assert.equal(source.slice(part.header.length, -part.footer.length), original.slice(part.start, part.end), part.file);
  if (part.marker) assert.equal(route.split(part.marker).length, 2);
  const stage = part.file.split('/').at(-1).slice(1, -3);
  const mod = await import(new URL('../' + part.file, import.meta.url));
  assert.deepEqual(mod.reservationContract, contracts[stage], `${stage} : contrat explicite conservé`);
  const contract = mod.reservationContract;
  // Inspect actual SQL literals via the parser, excluding comments and headers.
  const ts = (await import('../app/node_modules/typescript/lib/typescript.js')).default;
  const ast = ts.createSourceFile(part.file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const sql = node.getText(ast);
      for (const match of sql.matchAll(/INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+inventory_request_reservations\s*\(([^)]+)\)/gi)) {
        for (const field of match[1].split(',').map(s => s.trim())) assert.ok(contract.insert.includes(field), `${stage} INSERT ${field}`);
      }
      for (const match of sql.matchAll(/UPDATE\s+inventory_request_reservations\s+SET\s+([\s\S]*?)\s+WHERE/gi)) {
        for (const field of [...match[1].matchAll(/(?:^|,)\s*(\w+)\s*=/g)].map(m => m[1])) assert.ok(contract.update.includes(field), `${stage} UPDATE ${field}`);
      }
      if (/DELETE\s+FROM\s+inventory_request_reservations/i.test(sql)) assert.ok(contract.delete, `${stage} DELETE`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(!Object.keys(mod).some(key => key.startsWith('onRequest')));
}
assert.equal(reconstructEconomat(), original, 'reconstruction intégrale octet par octet');
assert.deepEqual(Object.keys(await import('../functions/api/inventory/internal-requests.js')).sort(), ['allocateTransferAllocation', 'allocateTransferCost', 'buildReviewAtpGuard', 'onRequestGet', 'onRequestPost'].sort());
console.log('✓ economat : cinq étapes privées, contrats de réservation, corps et reconstruction identiques, exports conservés');
