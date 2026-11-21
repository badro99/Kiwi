// Fournisseurs en compétition (build 48, 20 nov. 2026) : chaque fournisseur a
// son dossier, et la boutique voit lequel vend, marge et revient le moins.
// Le classement est calculé côté serveur, sur les ventes D1 (pas sur le grand
// livre local, partiel), le catalogue et les bons de réception.
import assert from 'node:assert/strict';
import { fixture } from './server-money-fixture.mjs';
import { onRequestGet as rankingRoute, rankSuppliers, withPrevious } from '../functions/api/suppliers/ranking.js';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

const DAY = 86400000, now = Date.UTC(2026, 10, 20, 12);
const products = [
  { id: 'prod_1', name: 'Trench beige', cost: 280, supplierId: 'sup_atlas' },
  { id: 'prod_2', name: 'Manteau rayé', cost: 300, supplierId: 'sup_atlas' },
  { id: 'prod_3', name: 'Jean droit', cost: 90 },                 // relié par un BL scanné
  { id: 'prod_4', name: 'Pull col roulé', cost: 0, supplierId: 'sup_nord' },
  { id: 'prod_5', name: 'Écharpe', cost: 20 },                    // aucun fournisseur
];
const variants = [
  { id: 'v1', productId: 'prod_1', stock: 4 }, { id: 'v2', productId: 'prod_2', stock: 10 },
  { id: 'v3', productId: 'prod_3', stock: 2 }, { id: 'v4', productId: 'prod_4', stock: 30 },
  { id: 'v5', productId: 'prod_5', stock: 5 },
];
const suppliers = [{ id: 'sup_atlas', name: 'Textiles Atlas' }, { id: 'sup_nord', name: 'Nord Tricot' }, { id: 'sup_denim', name: 'Denim Casa' }];
const receipts = [{ id: 'rcv_1', supplierId: 'sup_denim', receivedAt: now - 20 * DAY, lines: [{ itemId: 'prod_3', qty: 12, unitCost: 90 }] }];
const line = (i, q, t, n) => ({ n: n || i, q, t, i, kd: 'product' });
const sales = [
  { ts: now - 2 * DAY, ref: 'A1', lines: [line('prod_1', 2, 1000, 'Trench beige M'), line('prod_3', 3, 600, 'Jean droit 38')] },
  { ts: now - 3 * DAY, ref: 'A2', lines: [line('prod_3', 5, 1000, 'Jean droit 40'), line('prod_5', 1, 50)] },
  { ts: now - 4 * DAY, ref: 'A3', lines: [line('prod_4', 1, 250, 'Pull col roulé L')] },
  { ts: now - 45 * DAY, ref: 'OLD', lines: [line('prod_4', 50, 12500)] },   // hors période
];
const returns = [{ saleRef: 'A1', kind: 'avoir', ts: now - DAY, items: [{ name: 'Trench beige', size: 'M', qty: 1, amount: 500 }] }];

const out = rankSuppliers({ products, variants, suppliers, receipts, sales, returns, days: 30, now });
const by = Object.fromEntries(out.suppliers.map((s) => [s.id, s]));

// Le dossier d'un fournisseur : ses articles par fiche, ou par le BL qui les a fait entrer.
assert.deepEqual(by.sup_denim.products.map((p) => p.id), ['prod_3'], 'un BL scanné relie l\'article à son fournisseur');
assert.equal(by.sup_atlas.productCount, 2);
// Chiffres de la période (30 jours), ventes annulées et anciennes exclues.
assert.equal(by.sup_denim.revenue, 1600);
assert.equal(by.sup_denim.units, 8);
assert.equal(by.sup_denim.margin, 1600 - 8 * 90, 'marge = CA moins coût d\'achat × quantité');
assert.equal(by.sup_atlas.revenue, 1000);
assert.equal(by.sup_atlas.margin, 1000 - 2 * 280);
assert.equal(by.sup_nord.revenue, 250, 'la vente d\'il y a 45 jours ne compte pas');
assert.equal(by.sup_nord.marginRate, null, 'sans prix d\'achat, la marge reste inconnue, jamais 100 %');
// Écoulement : vendu / (vendu + en stock).
assert.equal(by.sup_denim.sellThrough, 8 / (8 + 2));
assert.equal(by.sup_atlas.sellThrough, 2 / (2 + 14));
// Retours : l'article rendu est retrouvé par son nom.
assert.equal(by.sup_atlas.returnedUnits, 1);
assert.equal(by.sup_atlas.returnRate, 0.5);
assert.equal(by.sup_denim.returnedUnits, 0);
// Articles dormants : du stock, aucune vente sur la période.
assert.equal(by.sup_atlas.deadProducts, 1, 'le manteau rayé n\'a rien vendu');
assert.equal(by.sup_atlas.top.id, 'prod_1');
// Le prix d'achat de chaque article part avec lui : la fiche estime le coût d'une commande.
assert.equal(by.sup_atlas.products.find((p) => p.id === 'prod_1').cost, 280);
assert.equal(by.sup_nord.products[0].cost, null, 'sans prix d\'achat, aucun coût inventé');
// Classement : Denim Casa (CA, marge, écoulement, zéro retour) passe devant.
assert.deepEqual(out.suppliers.map((s) => s.id), ['sup_denim', 'sup_atlas', 'sup_nord']);
assert.deepEqual(out.suppliers.map((s) => s.rank), [1, 2, 3]);
assert.ok(out.suppliers.every((s) => s.score >= 0 && s.score <= 100));
// Le score s'explique : ses quatre parts font le score, chacune sous son plafond.
out.suppliers.forEach((s) => {
  const p = s.parts;
  assert.ok(p.sales <= 40 && p.margin <= 30 && p.sell <= 20 && p.returns <= 10, 'chaque part reste sous son plafond');
  assert.ok(Math.abs(p.sales + p.margin + p.sell + p.returns - s.score) <= 0.6, `les parts de ${s.id} font son score`);
});
assert.equal(by.sup_nord.parts.margin, 15, 'sans prix d\'achat, la marge compte pour moitié');
// La courbe : douze tranches de la période, qui somment les ventes.
out.suppliers.forEach((s) => {
  assert.equal(s.series.length, 12);
  assert.ok(Math.abs(s.series.reduce((a, b) => a + b, 0) - s.revenue) < 0.01, `la courbe de ${s.id} somme ses ventes`);
});
assert.ok(by.sup_denim.series[11] > 0 && by.sup_denim.series[0] === 0, 'les ventes récentes tombent dans les dernières tranches');
// La place d'avant : la même durée juste avant. Nord Tricot vendait seul il y a 45 jours.
const before = rankSuppliers({ products, variants, suppliers, receipts, sales, returns, days: 30, now: now - 30 * DAY });
const withPrev = withPrevious(rankSuppliers({ products, variants, suppliers, receipts, sales, returns, days: 30, now }), before);
const prevBy = Object.fromEntries(withPrev.suppliers.map((s) => [s.id, s]));
assert.equal(prevBy.sup_nord.prevRank, 1, 'Nord Tricot était premier sur la période d\'avant');
assert.equal(prevBy.sup_denim.prevRank, null, 'qui ne vendait rien n\'avait pas de place');
// Ce qui n'a pas de fournisseur est compté à part, pour qu'on le range.
assert.equal(out.untagged.products, 1);
assert.equal(out.untagged.revenue, 50);
assert.equal(out.period.days, 30);
// Un fournisseur sans article reste listé, en dernier, sans score inventé.
const lonely = rankSuppliers({ products, variants, suppliers: suppliers.concat({ id: 'sup_x', name: 'Vide' }), receipts, sales, returns, days: 30, now });
assert.equal(lonely.suppliers.at(-1).id, 'sup_x');
assert.equal(lonely.suppliers.at(-1).productCount, 0);
assert.equal(lonely.suppliers.at(-1).score, null);

// La route : le propriétaire lit le classement de SA boutique, sur D1.
const f = await fixture(new URL('..', import.meta.url).pathname);
const t = Date.now();
f.sql.prepare('INSERT INTO catalogs(merchant, data, rev, updated_ts) VALUES(?,?,1,?)').run(f.merchant, JSON.stringify({ products, variants, categories: [] }), t);
f.sql.prepare("INSERT INTO store_docs(merchant, feature, data, rev, updated_ts) VALUES(?, 'procurement', ?, 1, ?)").run(f.merchant, JSON.stringify({ suppliers, receipts: receipts.map((r) => ({ ...r, receivedAt: t - DAY })) }), t);
f.sql.prepare("INSERT INTO store_docs(merchant, feature, data, rev, updated_ts) VALUES(?, 'returns', ?, 1, ?)").run(f.merchant, JSON.stringify({ list: returns.map((r) => ({ ...r, ts: t - DAY })) }), t);
const ins = f.sql.prepare('INSERT INTO sales(id, merchant, amount, amount_cents, method, ref, ts, lines, void_ts) VALUES(?,?,?,?,?,?,?,?,?)');
sales.forEach((s, k) => ins.run('s' + k, f.merchant, 0, 0, 'cash', s.ref, t - (now - s.ts), JSON.stringify(s.lines), null));
ins.run('void1', f.merchant, 0, 0, 'cash', 'V', t - DAY, JSON.stringify([line('prod_1', 9, 9000)]), t);   // annulée : ne compte pas
ins.run('other', 'server-other-shop', 0, 0, 'cash', 'O', t - DAY, JSON.stringify([line('prod_1', 9, 9000)]), null);
const owner = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;
const get = async (q, cookie) => {
  const res = await rankingRoute({ env: f.env, request: new Request('https://kiwi.test/api/suppliers/ranking?' + q, { headers: { Cookie: cookie || '' } }) });
  return { status: res.status, body: await res.json() };
};
const ok = await get(`merchant=${f.merchant}&days=30`, owner);
assert.equal(ok.status, 200);
assert.deepEqual(ok.body.suppliers.map((s) => s.id), ['sup_denim', 'sup_atlas', 'sup_nord']);
assert.equal(ok.body.suppliers.find((s) => s.id === 'sup_atlas').revenue, 1000, 'la vente annulée et l\'autre boutique ne comptent pas');
assert.equal(ok.body.suppliers.find((s) => s.id === 'sup_nord').revenue, 250, 'la route lit deux périodes mais n\'en compte qu\'une');
assert.equal(ok.body.suppliers.find((s) => s.id === 'sup_nord').prevRank, 1, 'la route donne la place d\'avant');
assert.equal(ok.body.salesRead, 3, 'salesRead compte les ventes de la période');
assert.equal((await get(`merchant=${f.merchant}`, '')).status, 403, 'sans session : refusé');
const foreign = await get('merchant=nobody-else', owner);
assert.notEqual(foreign.body.merchant, 'nobody-else', 'une boutique qui n\'est pas la sienne n\'est jamais lue : le slug revient à la sienne');
f.close();
console.log('supplier-ranking: ok');
