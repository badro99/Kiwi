// Compatibility helpers must be inert on a database built only from migrations.
// Optional before-directory runs exactly the same generated inputs on the old code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ROOT, freshDb, applyMigrations, shapeOf } from './d1-migrations.mjs';
const helpers = {
  'api/_demo-requests.js': ['ensureDemoRequests'],
  'api/_invoice-series.js': ['ensureInvoicingSchema'],
  'api/_store-credit-ledger.js': ['ensureCreditEvents'],
  'api/clients.js': ['ensurePurchaseEvents', 'ensureRewardEvents', 'ensureClientSyncSequence'],
  'api/employee-clients.js': ['ensureEmployeeLoyaltyEvents'],
  'api/foodcost.js': ['ensureSchema'],
  'api/invoice.js': ['ensureInvoiceSchema'],
  'api/operations.js': ['ensureSchema', 'ensurePurchase', 'ensurePurchaseStock', 'ensureDevices'],
  'api/receivables.js': ['ensureCollectionSchema'],
  'api/sale.js': ['ensureReceiptSchema'],
  'api/store-credits.js': ['ensureSchema'],
  'api/z-reconciliation.js': ['schema'],
  'auth/_lib.js': ['ensureTillDevices'],
  'api/agent/_core.js': ['ensureTables'],
  'api/agent/_oauth.js': ['ensureOAuthTables'],
  'api/comptable/_lib.js': ['ensureAccountantAccess'],
  'api/inventory/counts.js': ['ensureSchema'],
  'api/inventory/internal-requests.js': ['ensureSchema'],
  'api/inventory/movements.js': ['ensureSchema'],
  'api/order/_queue-create.js': ['ensureFollowingTable'],
  'api/order/game.js': ['ensureScoresTable'],
  'api/push/morning.js': ['ensureSentTable'],
  'api/shopify/_inbound-stock.js': ['ensure'],
};
const before = process.env.KIWI_SCHEMA_BEFORE_DIR;
const outputs = [];
let checked = 0;
for (const [file, names] of Object.entries(helpers)) {
  const path = resolve(ROOT, 'functions', file);
  const old = before && resolve(before, file.replaceAll('/', '__'));
  let source = fs.readFileSync(old || path, 'utf8');
  source = source.replace(/(from\s*|import\s*\()(['"])(\.{1,2}\/[^'"]+)\2/g,
    (_, prefix, quote, relative) => prefix + quote + pathToFileURL(resolve(dirname(path), relative)).href + quote);
  source += '\n' + names.map((name, i) => `export { ${name} as __helper${i} };`).join('\n');
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const db = applyMigrations(freshDb());
  const initial = shapeOf(db);
  let ddl = 0;
  const D1 = {
    prepare(sql) {
      if (/^\s*(CREATE|ALTER)\b/i.test(sql)) ddl++;
      const statement = {
        args: [], bind(...args) { this.args = args; return this; },
        async run() { return { meta: db.prepare(sql).run(...this.args) }; },
        async first() { return db.prepare(sql).get(...this.args) || null; },
        async all() { return { results: db.prepare(sql).all(...this.args) }; },
      };
      return statement;
    },
  };
  // Generated inputs cover fresh and repeated calls, several merchant keys and
  // database handles; the same rows and return values are compared before/after.
  for (let i = 0; i < 24; i++) {
    const merchant = `schema-proof-${i % 6}`;
    db.prepare('INSERT OR IGNORE INTO ticket_sequences VALUES (?, ?, ?, ?)').run(merchant, 2026, 1000 + i, i);
    for (let j = 0; j < names.length; j++) {
      const fn = module[`__helper${j}`];
      const param = /^\s*(?:async\s+)?function[^\(]*\(\s*(\w+)/.exec(fn.toString())?.[1];
      const result = await fn(param === 'db' || param === 'DB' ? D1 : { DB: D1 }, merchant);
      outputs.push([file, names[j], i, result ?? null]);
      checked++;
    }
  }
  assert.deepEqual(shapeOf(db), initial, `${file}: helper changed migrated schema`);
  if (!before) assert.equal(ddl, 0, `${file}: helper still sends DDL`);
  outputs.push([file, db.prepare('SELECT * FROM ticket_sequences ORDER BY merchant').all()]);
  db.close();
}
// Allocation is one of the routes with inline DDL, rather than an ensure helper.
{
  const path = resolve(ROOT, 'functions/api/ticket-sequence.js');
  let source = fs.readFileSync(before ? resolve(before, 'api__ticket-sequence.js') : path, 'utf8');
  source = source.replace(/(from\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,
    (_, prefix, quote, relative) => prefix + quote + pathToFileURL(resolve(dirname(path), relative)).href + quote);
  const { reserveTicketRange } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const db = applyMigrations(freshDb());
  const D1 = { prepare(sql) { let args = []; return { bind(...v) { args = v; return this; }, async run() { return { meta: db.prepare(sql).run(...args) }; }, async first() { return db.prepare(sql).get(...args) || null; } }; } };
  for (let i = 0; i < 120; i++) outputs.push(await reserveTicketRange({ DB: D1 }, `route-proof-${i % 9}`, 1 + (i * 17 % 99), 1000 + i, 2026));
  db.close();
}
if (process.env.KIWI_SCHEMA_PROOF_OUTPUT) fs.writeFileSync(process.env.KIWI_SCHEMA_PROOF_OUTPUT, JSON.stringify(outputs));
console.log(`${checked} helper calls and 120 ticket allocations on migrations only`);
