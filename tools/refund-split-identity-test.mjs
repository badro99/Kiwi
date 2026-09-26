#!/usr/bin/env node
/* Exercise the shipped refund selector with split receipts sharing one printed
 * table reference. A display ref is never sufficient payment identity. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'kiwi-caisse.html'), 'utf8');
function extract(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `source markers present: ${start}`);
  return source.slice(from, to);
}
const card = { id: 'card-unique', ref: 'Table 1', label: 'part 1', amount: 5,
  method: 'card', time: new Date('2026-09-26T12:28:00Z') };
const cash = { id: 'cash-unique', ref: 'Table 1', label: 'part 2', amount: 5,
  method: 'cash', time: new Date('2026-09-26T12:30:00Z') };
const journal = [card, cash];
const body = { innerHTML: '' };
let selected = null;
const context = {
  journal, refundState: { search: '' }, window: {},
  $: (selector) => selector === '#rf-list' ? body : null,
  refundableLeft: () => 5,
  fmtMAD: (n) => `${n} MAD`,
  escTeam: (s) => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
  openRefundConfirm: (sale) => { selected = sale; },
  currentMerchantSlug: () => 'amira-cafe',
};
vm.createContext(context);
vm.runInContext(extract('    function refundableJournal()', '    function renderRefundList()'), context);
vm.runInContext(extract('    function renderRefundList()', '    function renderRefundPreview()'), context);
vm.runInContext(extract('    function refundOriginalFor(entry)', '    function refundableJournal()'), context);
vm.runInContext('renderRefundList()', context);
assert.match(body.innerHTML, /data-rf-id="cash-unique"/);
assert.match(body.innerHTML, /data-rf-id="card-unique"/);
assert.ok(body.innerHTML.indexOf('cash-unique') < body.innerHTML.indexOf('card-unique'),
  'newest split part renders first');

const handler = extract("      const entry = e.target.closest('[data-rf-id]');", '\n    });');
const click = vm.runInContext(`(function(e) { ${handler} })`, context);
click({ target: { closest: () => ({ disabled: false, dataset: { rfId: 'cash-unique' } }) } });
assert.equal(selected, cash, 'cash row selects cash ID, not first sale with shared Table 1 ref');
click({ target: { closest: () => ({ disabled: false, dataset: { rfId: 'card-unique' } }) } });
assert.equal(selected, card, 'card row selects card ID');

const exactRefund = { kind: 'refund', refundOf: 'Table 1', refundOfId: 'cash-unique' };
const legacyAmbiguous = { kind: 'refund', refundOf: 'Table 1' };
assert.equal(vm.runInContext('refundOriginalFor', context)(exactRefund), cash,
  'new refund retains exact original identity');
assert.equal(vm.runInContext('refundOriginalFor', context)(legacyAmbiguous), null,
  'ambiguous legacy refund never attaches to a guessed split part');
const journalBody = { innerHTML: '' };
const journalContext = {
  journal: [card, cash], journalSearch: '', journalFilter: 'all', lastSaleId: '', window: {},
  $: (selector) => selector === '#journal-body' ? journalBody : null,
  fmtMAD: (n) => `${n} MAD`, rpEsc: String, escTeam: context.escTeam,
};
vm.createContext(journalContext);
vm.runInContext(extract('    function renderJournalList()', '    /* Le chef d\'orchestre.'), journalContext);
vm.runInContext('renderJournalList()', journalContext);
assert.match(journalBody.innerHTML, /data-jr-id="cash-unique"/);
assert.match(journalBody.innerHTML, /data-jr-id="card-unique"/);
assert.match(journalBody.innerHTML, /data-jr-print="cash-unique"/);
assert.match(source, /journal\.find\(en => en\.id === row\.dataset\.jrId\)/,
  'journal receipt preview resolves the unique payment ID');
assert.match(source, /journal\.find\(en => en\.id === pr\.dataset\.jrPrint\)/,
  'journal reprint resolves the unique payment ID');
assert.match(source, /data-action="cancel-sale"/,
  'restaurant has an accessible audited sale-void control');
const reprintSource = fs.readFileSync(path.join(root, 'assets/pos-reprint.js'), 'utf8');
const rowsStart = reprintSource.indexOf('  function rows(vertical) {');
const rowsEnd = reprintSource.indexOf('  /* ── l\'écriture du journal', rowsStart);
assert.ok(rowsStart >= 0 && rowsEnd > rowsStart);
const splitLocal = [
  { ref: 'Table 1', label: 'part 1', total: 5, ts: Date.now(), method: 'card' },
  { ref: 'Table 1', label: 'part 2', total: 5, ts: Date.now(), method: 'cash' },
];
const splitRemote = [
  { ref: 'Table 1', label: 'part 1', total: 5, ts: Date.now(), method: 'card', saleId: 'card-server' },
  { ref: 'Table 1', label: 'part 2', total: 5, ts: Date.now(), method: 'cash', saleId: 'cash-server' },
];
const rowsContext = { providers: { restaurant: () => splitLocal }, serverDay: { restaurant: splitRemote },
  window: {}, Date, Array, sameDay: () => true };
vm.createContext(rowsContext);
vm.runInContext(reprintSource.slice(rowsStart, rowsEnd), rowsContext);
const displayed = vm.runInContext("rows('restaurant')", rowsContext);
assert.equal(splitLocal[0].saleId, undefined, 'ambiguous ref never gives card the cash server ID');
assert.equal(splitLocal[1].saleId, undefined, 'ambiguous ref never gives cash the card server ID');
assert.deepEqual(displayed.filter((row) => row.saleId).map((row) => row.saleId).sort(),
  ['card-server', 'cash-server'], 'both exact server receipts remain individually cancellable');
const reusedTableLocal = [{ ref: 'Table 1', label: 'older visit', total: 5, ts: Date.now() }];
const reusedTableRemote = [{ ref: 'Table 1', label: 'newer visit', total: 5, ts: Date.now(), saleId: 'newer-sale' }];
rowsContext.providers.restaurant = () => reusedTableLocal;
rowsContext.serverDay.restaurant = reusedTableRemote;
vm.runInContext("rows('restaurant')", rowsContext);
assert.equal(reusedTableLocal[0].saleId, undefined,
  'a reused table label cannot give an older local receipt a newer server sale ID');
console.log('✓ refund split identity: exact row selection and safe legacy handling');
