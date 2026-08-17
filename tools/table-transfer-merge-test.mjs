// tools/table-transfer-merge-test.mjs — Comprehensive test suite for Table Transfer & Merge
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

test('schema.sql includes table_transfers definition and index', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS table_transfers'), 'table_transfers table must be defined');
  assert.ok(sql.includes('from_table'), 'table_transfers must have from_table');
  assert.ok(sql.includes('to_table'), 'table_transfers must have to_table');
  assert.ok(sql.includes('is_merge'), 'table_transfers must have is_merge flag');
  assert.ok(sql.includes('idx_table_transfers_live'), 'table_transfers index must exist');
});

test('functions/api/order/queue.js handles transferTable and mergeTables', () => {
  const code = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');
  assert.ok(code.includes('b.transferTable'), 'queue.js must handle transferTable payload');
  assert.ok(code.includes('target-table-occupied'), 'queue.js must guard against target table collision');
  assert.ok(code.includes('UPDATE table_sessions SET table_no = ?'), 'queue.js must retarget active session');
  assert.ok(code.includes('INSERT INTO table_transfers'), 'queue.js must write audit trail');
  assert.ok(code.includes('b.mergeTables'), 'queue.js must handle mergeTables payload');
  assert.ok(code.includes('merged-into-'), 'queue.js must mark source session as merged');
});

test('kiwi-serveur.html has transfer and merge UI and modal handlers', () => {
  const html = fs.readFileSync(path.join(ROOT, 'kiwi-serveur.html'), 'utf8');
  assert.ok(html.includes('id="transfer-table-modal"'), 'transfer-table-modal must exist');
  assert.ok(html.includes('id="merge-table-modal"'), 'merge-table-modal must exist');
  assert.ok(html.includes('data-action="transfer-table"'), 'transfer-table action button must exist');
  assert.ok(html.includes('data-action="merge-table"'), 'merge-table action button must exist');
  assert.ok(html.includes('openTransferTableModal'), 'openTransferTableModal must be defined');
  assert.ok(html.includes('openMergeTableModal'), 'openMergeTableModal must be defined');
  assert.ok(html.includes('confirmTransferTable'), 'confirmTransferTable must be defined');
  assert.ok(html.includes('confirmMergeTable'), 'confirmMergeTable must be defined');
});

test('kiwi-caisse.html has transfer and merge UI and modal handlers', () => {
  const html = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
  assert.ok(html.includes('id="caisse-transfer-modal"'), 'caisse-transfer-modal must exist');
  assert.ok(html.includes('id="caisse-merge-modal"'), 'caisse-merge-modal must exist');
  assert.ok(html.includes('id="rp-transfer-table"'), 'rp-transfer-table button must exist');
  assert.ok(html.includes('id="rp-merge-table"'), 'rp-merge-table button must exist');
  assert.ok(html.includes('openCaisseTransferModal'), 'openCaisseTransferModal must be defined');
  assert.ok(html.includes('openCaisseMergeModal'), 'openCaisseMergeModal must be defined');
  assert.ok(html.includes('confirmCaisseTransfer'), 'confirmCaisseTransfer must be defined');
  assert.ok(html.includes('confirmCaisseMerge'), 'confirmCaisseMerge must be defined');
});
