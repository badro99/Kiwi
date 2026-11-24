#!/usr/bin/env node
/* Kiwi · channel-sales-import-test · reprendre l'historique des ventes d'une boutique en ligne.
 *
 * Owner, 24 November 2026 (CHICTRATEC SL, the Startoner Shopify shop): after the
 * catalogue import, « sales as well ». The shop's stock was imported as it stands
 * TODAY, so the past orders are already out of it: they enter the books as sales,
 * on their own date, and never move stock a second time.
 *
 * Holds, against the real route and an in-memory D1 built from schema.sql:
 *   access   · a named operator only (403 with the shared operator code alone,
 *              403 with nothing); an unknown store is 404;
 *   books    · each order is one sale: id derived from store + order, its date,
 *              its amount in cents, its payment method, its lines, channel
 *              'shopify', written_by 'import:shopify';
 *   once     · the same orders sent twice add nothing (inserted 0, existing N);
 *   refusals · a malformed order is refused by reason and never half-written;
 *              the rest of the batch still lands;
 *   stock    · no catalogue row and no stock movement is written;
 *   trace    · one audit row per import says who and how many.
 *   node tools/channel-sales-import-test.mjs
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as importSales } from '../functions/api/admin/channel-sales.js';
import { operatorToken, operatorIdToken } from '../functions/auth/_lib.js';

let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail !== undefined ? ' · ' + JSON.stringify(detail) : '')); } };

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
// D1 counts the rows its triggers write in meta.changes (sales_change_insert adds one per sale);
// node:sqlite's .changes does not, so the fixture reports what production reports.
const total = () => db.prepare('SELECT total_changes() n').get().n;
const DB = { prepare(sql) {
  const st = db.prepare(sql), bind = (args) => ({ first: async () => st.get(...args) || null, all: async () => ({ results: st.all(...args) }), run: async () => { const before = total(); st.run(...args); return { meta: { changes: total() - before } }; } });
  return { ...bind([]), bind: (...args) => bind(args) };
}, async batch(stmts) { db.exec('BEGIN'); try { const out = []; for (const st of stmts) out.push(await st.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
const env = { DB, AUTH_SECRET: 'channel-sales-fixture-auth-secret' };
db.exec("INSERT INTO operators (id,label,salt,hash,created_ts) VALUES ('op','Fixture','s','h',1)");
db.prepare("INSERT INTO merchant_config (merchant,features,updated_ts) VALUES ('startoner-fixture','{}',1)").run();
const named = 'kiwi_op=' + await operatorToken(env.AUTH_SECRET) + '; kiwi_op_id=' + await operatorIdToken(env.AUTH_SECRET, 'op');
const shared = 'kiwi_op=' + await operatorToken(env.AUTH_SECRET);
const post = async (cookie, body) => { const r = await importSales({ env, request: new Request('https://fixture.test/api/admin/channel-sales', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); return { status: r.status, body: await r.json() }; };

const orders = [
  { ref: '#1001', ts: Date.parse('2025-10-08T09:22:20Z'), totalCents: 3288, method: 'card', lines: [{ n: 'Tóner HP 83A CF283A compatible', q: 2, t: 19.96 }, { n: 'Envío', q: 1, t: 12.92 }] },
  { ref: '#1002', ts: Date.parse('2026-11-24T02:46:59Z'), totalCents: 1198, method: 'wallet', lines: [{ n: 'Tóner Kyocera TK1170 compatible', q: 1, t: 11.98 }] },
];

console.log('■ qui peut importer');
let r = await post('', { merchant: 'startoner-fixture', channel: 'shopify', orders });
ok(r.status === 403, 'sans opérateur : 403', r.status);
r = await post(shared, { merchant: 'startoner-fixture', channel: 'shopify', orders });
ok(r.status === 403, 'le code partagé de l’équipe seul : 403 (le geste doit être imputable)', r.status);
r = await post(named, { merchant: 'nobody', channel: 'shopify', orders });
ok(r.status === 404, 'un commerce inconnu : 404', r.status);
r = await post(named, { merchant: 'startoner-fixture', channel: 'caisse', orders });
ok(r.status === 400, 'un canal qui n’est pas une boutique en ligne connue : 400', r.status);
ok(db.prepare('SELECT COUNT(*) n FROM sales').get().n === 0, 'aucun refus n’écrit de vente');

console.log('■ les ventes entrent dans les livres');
r = await post(named, { merchant: 'startoner-fixture', channel: 'shopify', orders });
ok(r.status === 200 && r.body.inserted === 2 && r.body.existing === 0 && r.body.refused.length === 0, 'deux commandes, deux ventes', r.body);
const rows = db.prepare("SELECT * FROM sales WHERE merchant = 'startoner-fixture' ORDER BY ts").all();
ok(rows.length === 2 && rows.every((s) => s.channel === 'shopify' && s.written_by === 'import:shopify' && s.void_ts == null), 'canal shopify, écrites par l’import, vivantes', rows.map((s) => [s.channel, s.written_by]));
ok(rows[0].ts === orders[0].ts && rows[0].amount_cents === 3288 && rows[0].amount === 33 && rows[0].method === 'card' && rows[0].ref === '#1001' && /Shopify #1001/.test(rows[0].label), 'datée de la commande, montant en centimes, moyen de paiement, référence', rows[0]);
ok(JSON.parse(rows[0].lines).length === 2 && JSON.parse(rows[0].lines)[0].q === 2, 'les lignes du panier sont gardées', rows[0].lines);
ok(rows[1].method === 'wallet', 'un paiement en ligne hors carte garde son moyen', rows[1].method);

console.log('■ une seule fois');
r = await post(named, { merchant: 'startoner-fixture', channel: 'shopify', orders });
ok(r.status === 200 && r.body.inserted === 0 && r.body.existing === 2, 'renvoyer les mêmes commandes n’ajoute rien', r.body);
ok(db.prepare("SELECT COUNT(*) n FROM sales WHERE merchant = 'startoner-fixture'").get().n === 2, 'toujours deux ventes');

console.log('■ un nouvel import rafraîchit le détail, jamais le montant');
const fixed = orders.map((o) => ({ ...o, totalCents: o.totalCents + 999, lines: o.lines.filter((l) => l.n !== 'Envío') }));
r = await post(named, { merchant: 'startoner-fixture', channel: 'shopify', orders: fixed });
const after = db.prepare("SELECT * FROM sales WHERE merchant = 'startoner-fixture' ORDER BY ts").all();
ok(r.status === 200 && r.body.inserted === 0 && r.body.existing === 2 && r.body.refreshed === 1, 'une commande dont le détail a changé est rafraîchie', r.body);
ok(JSON.parse(after[0].lines).length === 1 && JSON.parse(after[0].lines)[0].n.startsWith('Tóner'), 'la ligne de port a quitté le détail', after[0].lines);
ok(after[0].amount_cents === 3288 && after[1].amount_cents === 1198, 'les montants déjà dans les livres ne bougent pas', after.map((s) => s.amount_cents));
db.prepare("INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ts, lines, written_by) VALUES ('shp:startoner-fixture:9000', 'startoner-fixture', 1, 100, 'cash', 'caisse', 1700000000000, '[]', 'till:dev')").run();
r = await post(named, { merchant: 'startoner-fixture', channel: 'shopify', orders: [{ ref: '#9000', ts: Date.parse('2026-01-01'), totalCents: 100, method: 'card', lines: [{ n: 'Autre', q: 1, t: 1 }] }] });
ok(db.prepare("SELECT lines FROM sales WHERE id = 'shp:startoner-fixture:9000'").get().lines === '[]' && r.body.refreshed === 0, 'une vente écrite par quelqu’un d’autre n’est jamais réécrite', r.body);
db.prepare("DELETE FROM sales WHERE id = 'shp:startoner-fixture:9000'").run();

console.log('■ refus ligne par ligne');
r = await post(named, { merchant: 'startoner-fixture', channel: 'shopify', orders: [
  { ref: '', ts: Date.now(), totalCents: 100, method: 'card', lines: [] },
  { ref: '#2001', ts: Date.parse('1999-01-01'), totalCents: 100, method: 'card', lines: [] },
  { ref: '#2002', ts: Date.now(), totalCents: -5, method: 'card', lines: [] },
  { ref: '#2003', ts: Date.now(), totalCents: 100, method: 'bitcoin', lines: [] },
  { ref: '#2004', ts: Date.now() + 3 * 86400e3, totalCents: 100, method: 'card', lines: [] },
  { ref: '#2005', ts: Date.parse('2026-01-15T10:00:00Z'), totalCents: 2599, method: 'transfer', lines: [{ n: 'Tambor', q: 1, t: 25.99 }] },
] });
ok(r.status === 200 && r.body.inserted === 1 && r.body.refused.length === 5, 'cinq commandes illisibles refusées, la bonne entre', r.body);
ok(r.body.refused.map((x) => x.reason).join() === 'ref,date,amount,method,date', 'chaque refus dit pourquoi', r.body.refused);
r = await post(named, { merchant: 'startoner-fixture', channel: 'shopify', orders: Array.from({ length: 501 }, (_, i) => ({ ref: '#x' + i, ts: Date.now(), totalCents: 1, method: 'card', lines: [] })) });
ok(r.status === 413, 'plus de 500 commandes en un envoi : 413, rien n’est écrit', r.status);

console.log('■ le stock ne bouge pas');
ok(db.prepare('SELECT COUNT(*) n FROM catalogs').get().n === 0, 'aucun catalogue écrit');
const moves = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%move%'").all().map((t) => db.prepare(`SELECT COUNT(*) n FROM ${t.name}`).get().n).reduce((a, b) => a + b, 0);
ok(moves === 0, 'aucun mouvement de stock', moves);

console.log('■ la trace');
const audit = db.prepare("SELECT action, actor, detail FROM account_audit WHERE merchant = 'startoner-fixture' AND action = 'channel-sales-import'").all();
ok(audit.length === 5 && audit[0].actor === 'Fixture' && JSON.parse(audit[0].detail).inserted === 2, 'chaque import écrit qui et combien', audit);

console.log(bad ? `✗ ${bad} échec(s), ${n} contrôles passés` : `✓ historique des ventes en ligne : ${n} contrôles`);
process.exitCode = bad ? 1 : 0;
