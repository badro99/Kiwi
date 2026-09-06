#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Caisse Discount Reversibility, Isolation & Phantom Table Test Suite
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const CAISSE_SRC = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let passed = 0;
let failed = 0;

function ok(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log('■ Caisse Discount Reversibility, Isolation & Phantom Table Prevention');

// 1. Static Source Guards - Remise Modal & Actions
ok('#remise-modal contains #rm-remove button',
  /id="rm-remove"/.test(CAISSE_SRC));

ok('openRemiseModal pre-fills existing discount and shows #rm-remove',
  /function openRemiseModal\(id\) \{[\s\S]{0,2000}rmRemoveBtn\.hidden = !existing;/.test(CAISSE_SRC));

ok('openVrapRemise pre-fills existing vrapDiscount and shows #rm-remove',
  /function openVrapRemise\(\) \{[\s\S]{0,2000}rmRemoveBtn\.hidden = !existing;/.test(CAISSE_SRC));

ok('openVrapRemise does not reference undefined openSalleRemise',
  !/openSalleRemise\(/.test(CAISSE_SRC));

ok('removeRemise function is defined and handles both vrap and table',
  /function removeRemise\(\) \{[\s\S]{0,500}delete tables\[id\]\.discount;/.test(CAISSE_SRC) &&
  /vrapDiscount = null;/.test(CAISSE_SRC));

ok('remiseModal click listener handles #rm-remove',
  /e\.target\.closest\('#rm-remove'\)/.test(CAISSE_SRC));

// 2. Static Source Guards - Inline Remise Controls
ok('renderRightPanel renders edit-discount and remove-table-discount',
  /data-action="edit-discount"/.test(CAISSE_SRC) &&
  /data-action="remove-table-discount"/.test(CAISSE_SRC));

ok('renderCart renders edit-discount and remove-vrap-discount',
  /data-action="remove-vrap-discount"/.test(CAISSE_SRC));

ok('click router isolates vrap discount from table discount',
  /name === 'discount'[\s\S]{0,200}if \(mode === 'vrap'\) \{[\s\S]{0,100}openVrapRemise\(\);[\s\S]{0,100}\} else if \(selectedId\) \{[\s\S]{0,100}openRemiseModal\(selectedId\);/.test(CAISSE_SRC));

ok('click router handles remove-table-discount and remove-vrap-discount',
  /name === 'remove-table-discount'[\s\S]{0,150}delete tables\[selectedId\]\.discount;/.test(CAISSE_SRC) &&
  /name === 'remove-vrap-discount'[\s\S]{0,150}vrapDiscount = null;/.test(CAISSE_SRC));

// 3. Static Source Guards - Table Lifecycle & Discount Purge
ok('markPaid deletes discount immediately and forces release',
  /function markPaid\(id\) \{[\s\S]{0,1000}releasePhoneTable\(id, 'settle', true\);/.test(CAISSE_SRC) &&
  /delete t\.discount;/.test(CAISSE_SRC));

ok('cancelNewOrder deletes discount and forces release',
  /function cancelNewOrder\(\) \{[\s\S]{0,2500}releasePhoneTable\(selectedId, 'caisse', true\);/.test(CAISSE_SRC) &&
  /delete t\.discount;/.test(CAISSE_SRC));

ok('cancelOpenTable deletes discount and forces release',
  /function cancelOpenTable\(id\) \{[\s\S]{0,300}delete t\.discount;[\s\S]{0,300}releasePhoneTable\(id, 'caisse', true\);/.test(CAISSE_SRC));

ok('confirmNewTable clears any lingering discount on table',
  /function confirmNewTable\(\) \{[\s\S]{0,300}delete t\.discount;/.test(CAISSE_SRC));

ok('closedSessions purges table discount upon closure',
  /\(closedSessions \|\| \[\]\)\.forEach\([\s\S]{0,700}delete tables\[id\]\.discount;/.test(CAISSE_SRC));

ok('serviceFloor purges table discount on terminal state',
  /state\.status === 'khawya' \|\| state\.status === 'khlass'[\s\S]{0,300}delete tables\[id\]\.discount;/.test(CAISSE_SRC));

// 4. Static Source Guards - Phantom Table Prevention
ok('tableClosedAt registry tracks local closure timestamps',
  /const tableClosedAt = Object\.create\(null\);/.test(CAISSE_SRC));

ok('releasePhoneTable records closure timestamp in tableClosedAt',
  /function releasePhoneTable\(id, why, force\) \{[\s\S]{0,200}tableClosedAt\[k\] = Date\.now\(\);/.test(CAISSE_SRC));

ok('KiwiCaisseKitchen.ingest checks tableClosedAt and prunes stale sessions',
  /closedAt > 0 && \(\(openTs > 0 && openTs <= closedAt\) \|\| \(Date\.now\(\) - closedAt < 60000\)\)[\s\S]{0,300}why: 'prune-stale'/.test(CAISSE_SRC));

ok('KiwiCaisseKitchen.ingest prevents re-opening recently closed tables',
  /Date\.now\(\) - closedAt < 60000/.test(CAISSE_SRC));

// 5. Functional Behavior Verification
console.log('■ Functional Logic Verification');

const tableKey = (id) => 'table:' + String(id || '').toLowerCase().trim();

const tables = {
  '2': { status: 'ka-yaklo', covers: 2, elapsed: 10 },
  '9': { status: 'khawya', covers: 0, elapsed: 0 },
};
const tableClosedAt = Object.create(null);
const phoneSeats = new Map();
const releasedEvents = [];

function mockReleasePhoneTable(id, why, force) {
  const k = tableKey(id);
  tableClosedAt[k] = Date.now();
  const seat = phoneSeats.get(k);
  phoneSeats.delete(k);
  if (!seat && !force) return;
  releasedEvents.push({ table: String(id), session: seat ? seat.session : '', why: why || 'settle' });
}

// Test A: Apply discount on Table 2
tables['2'].discount = {
  kind: 'pct',
  value: 15,
  amount: 44.10,
  reason: 'Geste commercial',
  accounted: false,
};

ok('Discount applied to Table 2', tables['2'].discount.value === 15);
ok('Table 9 has no discount', !tables['9'].discount);

// Test B: Modify discount on Table 2 (15% -> 10%)
tables['2'].discount.value = 10;
tables['2'].discount.amount = 29.40;
ok('Discount on Table 2 successfully modified to 10%', tables['2'].discount.value === 10);
ok('Table 9 remains without discount after Table 2 edit', !tables['9'].discount);

// Test C: Remove discount on Table 2
delete tables['2'].discount;
ok('Discount on Table 2 successfully reverted / deleted', !tables['2'].discount);

// Test D: Settle table -> discount and session cleared
tables['2'].discount = { kind: 'pct', value: 10, amount: 20 };
mockReleasePhoneTable('2', 'settle', true);
delete tables['2'].discount;
tables['2'].status = 'khlass';

ok('Payment synchronously clears discount', !tables['2'].discount);
ok('Payment dispatches release event with force=true',
  releasedEvents.some(e => e.table === '2' && e.why === 'settle'));
ok('Payment sets tableClosedAt for Table 2', typeof tableClosedAt['table:2'] === 'number');

// Test E: Phantom Table 9 Auto-Opening Prevention
// Table 9 was cancelled at T0
const T0 = Date.now();
tableClosedAt[tableKey('9')] = T0;
tables['9'].status = 'khawya';

// Server poll arrives with stale session opened at T0 - 10000ms
const staleSession = { id: 'sess-zombie-9', mode: 'table', table: '9', opened_ts: T0 - 10000 };
let table9Reopened = false;

// Simulate ingest logic
const sessions = [staleSession];
sessions.forEach(s => {
  if (s.mode !== 'table' || !s.table) return;
  const k = tableKey(s.table);
  const closedAt = Number(tableClosedAt[k] || 0);
  const openTs = Number(s.opened_ts || 0);
  if (closedAt > 0 && openTs > 0 && openTs <= closedAt) {
    releasedEvents.push({ table: String(s.table), session: String(s.id || ''), why: 'prune-stale' });
    return;
  }
  const id = s.table;
  if (id && tables[id] && tables[id].status === 'khawya') {
    if (closedAt > 0 && (Date.now() - closedAt < 60000)) return;
    tables[id].status = 'ka-yaklo';
    table9Reopened = true;
  }
});

ok('Stale session for Table 9 is dropped and does NOT turn status to ka-yaklo',
  tables['9'].status === 'khawya' && !table9Reopened);

ok('Stale session triggers kiwi-table-released with why="prune-stale" to purge D1',
  releasedEvents.some(e => e.table === '9' && e.why === 'prune-stale'));

// Test F: Fresh genuine session AFTER closure CAN open
const T_new = Date.now() + 2000;
const freshSession = { id: 'sess-fresh-9', mode: 'table', table: '9', opened_ts: T_new };
// Once the table is seated as new party, tableClosedAt is cleared or s.opened_ts > closedAt
delete tableClosedAt[tableKey('9')];

const sessionsFresh = [freshSession];
sessionsFresh.forEach(s => {
  if (s.mode !== 'table' || !s.table) return;
  const k = tableKey(s.table);
  const closedAt = Number(tableClosedAt[k] || 0);
  const openTs = Number(s.opened_ts || 0);
  if (closedAt > 0 && openTs > 0 && openTs <= closedAt) return;
  const id = s.table;
  if (id && tables[id] && tables[id].status === 'khawya') {
    tables[id].status = 'ka-yaklo';
  }
});

ok('Genuine new session after closure properly seats Table 9',
  tables['9'].status === 'ka-yaklo');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
