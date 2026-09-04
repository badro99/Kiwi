#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const fn = (name, next) => source.match(new RegExp(`function ${name}\\([^]*?(?=\\n    function ${next}\\()`))?.[0] || '';
const matchBody = fn('journalEntryMatchesCloudSale', 'reconcileCloudSaleInJournal');
const reconcileBody = fn('reconcileCloudSaleInJournal', 'ingestSettledCloudSales');
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log('  ✓ ' + message);
};

ok(matchBody && reconcileBody, 'the cloud/local journal reconciliation functions exist');
ok(/order\.canonicalNumberPromise\s*=\s*relayToKitchen\(order\)/.test(source.match(/function createTakeawayKitchenOrder\([^]*?(?=\n    function sendToKitchen\()/)?.[0] || ''),
  'a new takeaway exposes its permanent-number promise to payment');
ok(/tenderOrder\s*\?\s*'À emporter #'\s*\+\s*ticketNo\(tenderOrder\)/.test(source),
  'payment labels use the permanent order number, not the local sequence');
ok(/persistShift\(\)/.test(source.match(/const posted = window\.KiwiLive\.postSale\(entry\)[^]*?(?=\n\s*}\s*catch)/)?.[0] || ''),
  'the server sale identity is persisted immediately');

const journal = [
  { id: 'sale-local', time: new Date(1_000_000), label: 'À emporter #25', ref: '25', amount: 35, receipt: { number: '25' }, lines: [{ name: 'Tiramisù' }] },
  { id: 'sale-cloud', time: new Date(1_000_400), label: 'À emporter #25', ref: '86', amount: 35, origin: 'caisse' },
  { id: 'other-sale', time: new Date(1_000_500), label: 'À emporter #26', ref: '87', amount: 35 },
];
const context = {
  journal, money: (n) => Math.round(Number(n) * 100) / 100,
  attachReceipt: (entry) => { entry.rc = { ref: entry.ref }; },
};
vm.runInNewContext(`${matchBody}\n${reconcileBody}`, context);
const cloud = { id: 'sale-cloud', ts: 1_000_400, label: 'À emporter #25', orderRef: 'À emporter #25', receiptRef: '86', amount: 35 };
const kept = context.reconcileCloudSaleInJournal(cloud);

ok(journal.length === 2, 'the local row and its cloud echo collapse to one transaction');
ok(kept.id === 'sale-local' && kept.serverSaleId === 'sale-cloud', 'the richer local receipt is retained and linked to the server row');
ok(kept.ref === '86' && kept.label === 'À emporter #86' && kept.rc.ref === '86',
  'existing takeaway journal and customer receipt adopt the permanent number');
ok(journal.some((entry) => entry.id === 'other-sale'), 'a separate same-price order is not merged');

console.log('\nTakeaway ledger deduplication contract passed.');
