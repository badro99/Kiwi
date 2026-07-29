import assert from 'node:assert/strict';
import {
  TABLES,
  normalizeRow,
  parseJsonValue,
} from './migrate-d1-to-supabase.mjs';

assert.equal(TABLES.length, 19);
assert.equal(new Set(TABLES.map((item) => item.name)).size, TABLES.length);

assert.deepEqual(parseJsonValue('{"enabled":true}', 'merchant_config', 'features'), {
  enabled: true,
});
assert.equal(parseJsonValue('', 'sale_audit', 'impact'), null);
assert.throws(
  () => parseJsonValue('{broken', 'menus', 'data'),
  /menus\.data contains invalid JSON/,
);

const normalized = normalizeRow(
  { name: 'orders', json: ['lines', 'customer'] },
  { id: 'ord-1', lines: '[{"name":"Tea"}]', customer: '', total: 20 },
);
assert.deepEqual(normalized.lines, [{ name: 'Tea' }]);
assert.equal(normalized.customer, null);
assert.equal(normalized.total, 20);

console.log('Supabase migration transform tests passed');
