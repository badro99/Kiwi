// Annulations et avoirs : trois chemins où l'argent sortait des deux livres (audit du 26 nov. 2026).
//
//  A · annuler un ticket payé (en partie) par avoir ne rendait pas l'avoir ;
//  B · annuler la vente « Livraison reçue » retirait l'argent mais laissait la
//      livraison payée, et plus rien ne pouvait l'encaisser ;
//  C · un avoir émis par erreur puis annulé retenait le ticket pour toujours :
//      le remboursement en espèces était refusé, et en « chiffre à la vente »
//      le retour restait déduit du chiffre.
// Rejoué sur les vraies routes (tools/server-money-fixture.mjs).
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { fixture } = await import(pathToFileURL(path.join(ROOT, 'tools/server-money-fixture.mjs')).href);
const { onRequestPost: cancel } = await import(pathToFileURL(path.join(ROOT, 'functions/api/sale/cancel.js')).href);
const { makeSession, SESS_COOKIE } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);
let checks = 0;
const ok = (value, message, detail) => { assert.ok(value, message + (detail ? ' · ' + detail : '')); checks += 1; };
const now = Date.now();
async function voidSale(f, id) {
  const cookie = `${SESS_COOKIE}=${await makeSession('money-owner', 'fake-server-money-secret')}`;
  const r = await cancel({ env: f.env, request: new Request('https://kiwi.test/api/sale/cancel', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: f.merchant, id, source: 'dashboard' }) }) });
  return { status: r.status, body: await r.json() };
}

/* A · le ticket payé 400 avoir + 600 espèces, puis annulé */
{
  const f = await fixture(ROOT); const { sql, merchant } = f;
  sql.prepare(`INSERT INTO store_credits(id,merchant,code,customer_id,amount_cents,balance_cents,status,expires_ts,created_ts,updated_ts)
    VALUES('v1',?,'AV-TESTA','client-fixture',40000,40000,'active',?,?,?)`).run(merchant, now + 30 * 86400000, now, now);
  const red = await f.call('credit', { action: 'redeem-batch', id: 'commit-1', saleId: 'sale-A', credits: [{ code: 'AV-TESTA', amountCents: 40000 }] });
  ok(red.status === 200, 'the avoir is spent on the ticket', JSON.stringify(red.body));
  const s = await f.call('sale', { id: 'sale-A', amountCents: 60000, amount: 600, ticketAmountCents: 100000, method: 'split', ref: 'M-1', ts: now,
    paymentParts: [{ method: 'credit', amountCents: 40000 }, { method: 'cash', amountCents: 60000 }], lines: [{ name: 'Caftan', qty: 1, total: 1000 }] });
  ok(s.status === 200, 'the split ticket is recorded', JSON.stringify(s.body));
  const c = await voidSale(f, 'sale-A');
  ok(c.status === 200, 'the owner voids the ticket', JSON.stringify(c.body));
  const av = sql.prepare("SELECT balance_cents, status FROM store_credits WHERE id='v1'").get();
  ok(av.balance_cents === 40000 && av.status === 'active', 'the 400 MAD go back on the avoir, active again', JSON.stringify(av));
  ok(sql.prepare("SELECT COUNT(*) n FROM store_credit_events WHERE credit_id='v1' AND action='adjust' AND ref_id='sale-A'").get().n === 1, 'one restoring event names the voided sale');
  const again = await voidSale(f, 'sale-A');
  ok(again.status === 409 && sql.prepare("SELECT balance_cents FROM store_credits WHERE id='v1'").get().balance_cents === 40000, 'a second void gives nothing back twice');
}

/* A2 · une consommation qui nomme un ticket payé en espèces ne revient pas à son annulation */
{
  const f = await fixture(ROOT); const { sql, merchant } = f;
  sql.prepare(`INSERT INTO store_credits(id,merchant,code,customer_id,amount_cents,balance_cents,status,expires_ts,created_ts,updated_ts)
    VALUES('v2',?,'AV-TESTB','client-fixture',40000,40000,'active',?,?,?)`).run(merchant, now + 30 * 86400000, now, now);
  f.insert('sale-cash', 100000, { method: 'cash', ts: now });
  const red = await f.call('credit', { action: 'redeem-batch', id: 'commit-2', saleId: 'sale-cash', credits: [{ code: 'AV-TESTB', amountCents: 40000 }] });
  ok(red.status === 200, 'an avoir is spent under a cash ticket id', JSON.stringify(red.body));
  const c = await voidSale(f, 'sale-cash');
  ok(c.status === 200 && sql.prepare("SELECT balance_cents FROM store_credits WHERE id='v2'").get().balance_cents === 0, 'voiding that cash ticket gives no avoir back', JSON.stringify(c.body));
}

/* B · la vente « Livraison reçue » annulée rouvre le dû du livreur */
{
  const f = await fixture(ROOT);
  const d = await f.call('sale', { id: 'sale-D', amountCents: 0, amount: 0, ticketAmountCents: 50000, method: 'delivery', settlementKind: 'receivable', channel: 'delivery', ref: 'M-2', ts: now,
    paymentParts: [{ method: 'delivery', amountCents: 50000 }], lines: [{ name: 'Robe', qty: 1, total: 500 }] });
  ok(d.status === 200, 'a delivery ticket is recorded', JSON.stringify(d.body));
  const col = await f.call('collect', { saleId: 'sale-D', method: 'cash', id: 'dlv-col-0001' });
  ok(col.status === 200, 'the courier pays 500 MAD', JSON.stringify(col.body));
  const c = await voidSale(f, 'dlv-col-0001');
  ok(c.status === 200, 'the collection sale is voided', JSON.stringify(c.body));
  const r = await f.call('receivables', {});
  ok(r.body.summary && r.body.summary.dueCents === 50000, 'the delivery is due again', JSON.stringify(r.body.summary));
  const again = await f.call('collect', { saleId: 'sale-D', method: 'cash', id: 'dlv-col-0002' });
  ok(again.status === 200 && f.net() === 50000, 'and can be collected again, once', `${again.status} net ${f.net()}`);
}

/* C · un avoir annulé ne retient plus le ticket */
for (const atSale of [false, true]) {
  const f = await fixture(ROOT); const { sql, merchant } = f;
  if (atSale) sql.prepare("UPDATE merchant_config SET features='{\"revenueAtSale\":true}' WHERE merchant=?").run(merchant);
  f.insert('sale-G', 50000, { method: 'cash' });
  const iss = await f.call('credit', { action: 'issue', id: 'issue-G-0001', originalSaleId: 'sale-G', amountCents: 50000, reason: 'Retour' }, 'owner');
  ok(iss.status === 200 && iss.body.credit, `(${atSale ? 'à la vente' : 'encaissé'}) an avoir is issued on the ticket`, JSON.stringify(iss.body));
  const can = await f.call('credit', { action: 'cancel', id: 'cancel-G-0001', code: iss.body.credit.code, reason: 'la cliente voulait des espèces' }, 'owner');
  ok(can.status === 200, '  the avoir is cancelled unused', JSON.stringify(can.body));
  if (atSale) ok(f.net() === 50000, '  the return row no longer takes the goods off the revenue', `net ${f.net()}`);
  const rf = await f.refund('refund-G', 'sale-G', 50000);
  ok(rf.status === 200, '  the cash refund of the full ticket is accepted', JSON.stringify(rf.body));
  const over = await f.refund('refund-G2', 'sale-G', 100);
  ok(over.status === 409, '  and nothing more can leave on that ticket', JSON.stringify(over.body));
}
/* D · une livraison impayée plus ancienne que les 500 dernières reste due */
{
  const f = await fixture(ROOT); const { sql, merchant } = f;
  const put = (id, ts, collected) => {
    f.insert(id, 0, { method: 'delivery', channel: 'delivery', ts });
    sql.prepare('INSERT INTO sale_receipts(merchant,sale_id,gross_ticket_cents,created_ts) VALUES(?,?,?,?)').run(merchant, id, 30000, ts);
    if (collected) sql.prepare('INSERT INTO delivery_collections(merchant,collection_sale_id,sale_id,method,amount_cents,ts) VALUES(?,?,?,?,?,?)').run(merchant, 'col-' + id, id, 'cash', 30000, ts + 1);
  };
  put('old-unpaid', now - 90 * 86400000, false);
  sql.exec('BEGIN');
  for (let i = 0; i < 520; i++) put('paid-' + i, now - (520 - i) * 60000, true);
  sql.exec('COMMIT');
  const r = await f.call('receivables', {});
  ok(r.body.summary && r.body.summary.dueCents === 30000, 'the old unpaid delivery is still due behind 520 newer paid ones', JSON.stringify(r.body.summary));
  ok((r.body.open || []).some((d) => d.saleId === 'old-unpaid'), 'and listed as open');
}
console.log(`✓ money-void-credit-test : ${checks} contrôles (avoir rendu à l'annulation, livraison rouverte, avoir annulé qui ne retient plus le ticket, vieille livraison impayée encore due)`);
