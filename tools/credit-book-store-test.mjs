#!/usr/bin/env node
/* Le carnet de crédit dans son propre document (functions/api/_credit-book-store.js).
 *
 * Avant : le carnet vivait dans l'instantané partagé `verticalops`. Une
 * modification du pressing ou de la cuisine sur un appareil faisait échouer la
 * dette notée au comptoir sur un autre, et chaque dette notée faisait échouer
 * l'appareil suivant. Ce fichier rejoue, par les vraies routes et une vraie
 * base SQLite :
 *   1. une modification d'un autre métier ne bloque plus une dette : elle est
 *      enregistrée tout de suite, et une dette notée ne fait plus monter la
 *      révision de verticalops (un autre métier ne reçoit plus de conflit) ;
 *   2. la copie paresseuse depuis verticalops se fait une fois, même quand deux
 *      appareils écrivent en même temps, puis le carnet quitte verticalops ;
 *   3. aucun solde ne bouge pendant le déménagement (cas tirés au hasard) ;
 *   4. la lecture rend le carnet à son ancienne place, et le cache HTTP voit
 *      chaque nouvelle ligne ;
 *   5. un remboursement d'avance sur un carnet pas encore déménagé crée le
 *      document et ne paie qu'une fois ;
 *   6. le retour en arrière (recopier le carnet dans verticalops, supprimer la
 *      ligne creditbook) rend exactement le même carnet.
 * Données synthétiques uniquement (« TEST KIWI »). */
import assert from 'node:assert/strict';
import { ROOT } from './invoice-vat-harness.mjs';
import { fixture } from './server-money-fixture.mjs';
import { onRequestGet, onRequestPost } from '../functions/api/store.js';
import { makeSession, SESS_COOKIE, tillDeviceToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const f = await fixture(ROOT);
const cookies = { owner: `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}` };
for (let i = 0; i < 3; i++) cookies[i] = `${TILL_COOKIE}=${await tillDeviceToken(f.env.AUTH_SECRET, f.merchant, 0, 'term_book_fixture_' + i)}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
const C = (x) => Math.round(x * 100);

let passed = 0;
const failures = [];
async function check(label, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + label); }
  catch (e) { failures.push(label); console.log('  ✗ ' + label + '\n      ' + String(e && e.message).split('\n').slice(0, 4).join('\n      ')); }
}

async function call(role, { data, baseRev = 0, etag } = {}) {
  const get = data === undefined;
  const url = new URL('https://kiwi.test/api/store');
  if (get) { url.searchParams.set('feature', 'verticalops'); url.searchParams.set('merchant', f.merchant); }
  const headers = { Cookie: cookies[role] || '', 'Content-Type': 'application/json' };
  if (etag) headers['If-None-Match'] = etag;
  const r = await (get ? onRequestGet : onRequestPost)({ env: f.env, request: new Request(url, {
    method: get ? 'GET' : 'POST', headers,
    ...(get ? {} : { body: JSON.stringify({ merchant: f.merchant, feature: 'verticalops', data, baseRev }) }),
  }) });
  return { status: r.status, etag: r.headers.get('ETag'), body: r.status === 304 ? null : await r.json() };
}
async function refund(id, amountCents, clientId = 'client') {
  const r = await onRequestPost({ env: f.env, request: new Request('https://kiwi.test/api/store', {
    method: 'POST', headers: { Cookie: cookies.owner, 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant: f.merchant, feature: 'verticalops', action: 'credit-book-refund', clientId, id, amountCents, method: 'transfer' }),
  }) });
  return { status: r.status, body: await r.json() };
}
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
const reset = () => f.sql.exec("DELETE FROM store_docs; DELETE FROM doc_history; DELETE FROM sales WHERE channel='credit-book'; DELETE FROM sale_audit WHERE action='credit-book-refund';");
const row = (feature) => f.sql.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').get(f.merchant, feature);
const bookRows = () => f.sql.prepare("SELECT COUNT(*) n FROM store_docs WHERE merchant = ? AND feature = 'creditbook'").get(f.merchant).n;
const storedBook = () => JSON.parse(row('creditbook').data).carnet;

const doc = (carnet) => ({
  verticals: {
    epicerie: { schema: 1, device: 'fixture', updatedAt: 1, data: { v: 2, carnet, day: {} } },
    pressing: { schema: 1, device: 'fixture', updatedAt: 1, data: { racks: ['A1'] } },
  },
  commands: [], seq: 0,
});
const book = () => [{ id: 'client', name: 'TEST KIWI', hist: [{ id: 'e0', type: 'debt', amt: 50, at: '2026-10-27T08:00:00Z', label: 'TEST KIWI' }] }];
const hist = (d) => d.verticals.epicerie.data.carnet[0].hist;
const append = (d, id, type, amt) => hist(d).push({ id, type, amt, at: '2026-10-27T09:00:00Z', label: 'TEST KIWI' });
const balance = (carnet) => Object.fromEntries(carnet.map((c) => [c.id, (c.hist || []).reduce((n, h) => n + (h.type === 'debt' ? 1 : -1) * C(h.amt), 0)]));
const seedLegacy = (carnet) => f.sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, 1)')
  .run(f.merchant, 'verticalops', JSON.stringify(doc(carnet)));

await check('une modification du pressing ne bloque plus une dette : la dette est enregistrée tout de suite', async () => {
  reset();
  ok(await call('owner', { data: doc(book()) }));
  const base = ok(await call(0));
  const pressing = clone(base.data); pressing.verticals.pressing.data.racks.push('B2'); pressing.verticals.pressing.updatedAt = 2;
  ok(await call(1, { data: pressing, baseRev: base.rev }));
  const till = clone(base.data); append(till, 'e1', 'debt', 12);
  const r = await call(0, { data: till, baseRev: base.rev });
  assert.equal(r.status, 409, 'le reste du document de cette caisse est en retard : elle relit');
  assert.ok(storedBook()[0].hist.some((h) => h.id === 'e1'), 'mais la dette e1 est déjà enregistrée');
  assert.ok(r.body.data.verticals.pressing.data.racks.includes('B2'), 'la relecture porte le pressing de l’autre appareil');
  assert.ok(hist(r.body.data).some((h) => h.id === 'e1'), 'et le carnet avec la dette');
});

await check('une dette notée ne fait plus monter la révision de verticalops : le pressing suivant passe sans conflit', async () => {
  reset();
  ok(await call('owner', { data: doc(book()) }));
  const base = ok(await call(0));
  const till = clone(base.data); append(till, 'e1', 'debt', 12);
  const saved = ok(await call(0, { data: till, baseRev: base.rev }));
  assert.equal(saved.rev, base.rev, 'la révision de verticalops ne bouge pas');
  const pressing = clone(base.data); pressing.verticals.pressing.data.racks.push('B2'); pressing.verticals.pressing.updatedAt = 2;
  ok(await call(1, { data: pressing, baseRev: base.rev }));
  const after = ok(await call('owner'));
  assert.ok(hist(after.data).some((h) => h.id === 'e1') && after.data.verticals.pressing.data.racks.includes('B2'), 'les deux modifications tiennent');
});

await check('deux caisses notent chacune une dette en même temps : les deux restent, chacune une fois', async () => {
  reset();
  ok(await call('owner', { data: doc(book()) }));
  const base = ok(await call(0));
  const a = clone(base.data), b = clone(base.data);
  append(a, 'ea', 'debt', 7); append(b, 'eb', 'debt', 9);
  const rs = await Promise.all([call(0, { data: a, baseRev: base.rev }), call(1, { data: b, baseRev: base.rev })]);
  assert.ok(rs.every((r) => r.status === 200 || (r.status === 409 && r.body.error === 'stale')), JSON.stringify(rs.map((r) => r.status)));
  const ids = storedBook()[0].hist.map((h) => h.id);
  assert.deepEqual(ids.slice().sort(), ['e0', 'ea', 'eb'], 'chaque dette est enregistrée une fois, sans relance');
});

await check('une ligne déjà écrite ne se modifie pas (refus) et ne s’efface pas (ignorée) par le document', async () => {
  reset();
  ok(await call('owner', { data: doc(book()) }));
  const base = ok(await call(0));
  const tamper = clone(base.data); hist(tamper)[0].amt = 1;
  assert.equal((await call(0, { data: tamper, baseRev: base.rev })).status, 409);
  const erase = clone(base.data); hist(erase).splice(0, 1);
  await call(0, { data: erase, baseRev: base.rev });
  assert.deepEqual(storedBook()[0].hist.map((h) => [h.id, h.amt]), [['e0', 50]], 'un carnet amputé n’efface rien : la ligne enregistrée est intacte');
});

await check('une dette sur un client en avance est refusée pour CE client seulement : le reste de la caisse passe', async () => {
  reset();
  const at = '2026-10-27T08:00:00Z';
  ok(await call('owner', { data: doc([
    { id: 'advance', name: 'TEST KIWI A', hist: [{ id: 'a0', type: 'pay', amt: 30, at, label: 'TEST KIWI' }] },
    { id: 'client', name: 'TEST KIWI', hist: [{ id: 'e0', type: 'debt', amt: 50, at, label: 'TEST KIWI' }] },
  ]) }));
  const base = ok(await call(0));
  const till = clone(base.data);
  const [adv, other] = till.verticals.epicerie.data.carnet;
  adv.hist.push({ id: 'a1', type: 'debt', amt: 12, at: '2026-10-27T09:00:00Z', label: 'TEST KIWI' });
  other.hist.push({ id: 'e1', type: 'debt', amt: 7, at: '2026-10-27T09:00:00Z', label: 'TEST KIWI' });
  till.verticals.pressing.data.racks.push('C3'); till.verticals.pressing.updatedAt = 2;
  const r = await call(0, { data: till, baseRev: base.rev });
  assert.equal(r.status, 200, 'une avance ne bloque plus toute la caisse: ' + JSON.stringify(r.body));
  const stored = Object.fromEntries(storedBook().map((c) => [c.id, c]));
  assert.ok(stored.client.hist.some((h) => h.id === 'e1'), 'la dette de l’autre client est enregistrée');
  assert.ok(!stored.advance.hist.some((h) => h.id === 'a1'), 'la dette sur l’avance reste refusée (règle de la vague D)');
  assert.equal(balance(storedBook()).advance, -3000, 'l’avance est conservée au centime');
  const alerts = stored.advance.creditAlerts || [];
  assert.equal(alerts.length, 1, 'le client porte une alerte');
  assert.equal(alerts[0].kind, 'debt-on-advance');
  assert.equal(alerts[0].debtCents, 1200);
  assert.deepEqual((r.body.creditConflicts || []).map((c) => c.clientId), ['advance'], 'la réponse nomme le client en conflit');
  assert.ok(ok(await call(1)).data.verticals.pressing.data.racks.includes('C3'), 'le reste du document de la caisse est enregistré');
  ok(await call(0, { data: till, baseRev: r.body.rev }));
  assert.equal(Object.fromEntries(storedBook().map((c) => [c.id, c])).advance.creditAlerts.length, 1, 'un nouvel envoi ne double pas l’alerte');
  ok(await refund('refund-advance-a', 3000, 'advance'));
  ok(await call(0, { data: till, baseRev: r.body.rev }));
  const settled = Object.fromEntries(storedBook().map((c) => [c.id, c])).advance;
  assert.ok(settled.hist.some((h) => h.id === 'a1'), 'une fois l’avance remboursée, la même dette passe');
  assert.equal((settled.creditAlerts || []).length, 0, 'et l’alerte disparaît');
});

await check('copie paresseuse : deux appareils qui écrivent en même temps créent un seul carnet, sans perte', async () => {
  reset();
  seedLegacy(book());
  assert.equal(bookRows(), 0);
  const legacy = ok(await call(0));
  assert.deepEqual(legacy.data.verticals.epicerie.data.carnet, book(), 'avant le déménagement, la lecture rend la copie de verticalops');
  const a = clone(legacy.data), b = clone(legacy.data);
  append(a, 'ea', 'debt', 3); append(b, 'eb', 'pay', 4);
  await Promise.all([call(0, { data: a, baseRev: legacy.rev }), call(1, { data: b, baseRev: legacy.rev })]);
  assert.equal(bookRows(), 1, 'une seule ligne creditbook');
  assert.deepEqual(storedBook()[0].hist.map((h) => h.id).sort(), ['e0', 'ea', 'eb']);
  const ops = JSON.parse(row('verticalops').data);
  assert.equal(ops.verticals.epicerie.data.carnet, undefined, 'le carnet a quitté verticalops après l’écriture réussie');
  assert.deepEqual(ops.verticals.pressing.data.racks, ['A1'], 'le reste de verticalops est intact');
});

await check('aucun solde ne bouge pendant le déménagement (200 carnets tirés au hasard)', async () => {
  let seed = 0x5eed;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (let n = 0; n < 200; n++) {
    reset();
    const carnet = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, i) => ({
      id: 'c' + i, name: 'TEST KIWI ' + i,
      hist: Array.from({ length: Math.floor(rnd() * 6) }, (_, k) => ({
        id: `c${i}e${k}`, type: k === 0 || rnd() < 0.6 ? 'debt' : 'pay', amt: (1 + Math.floor(rnd() * 50000)) / 100,
        at: '2026-10-27T0' + (k % 10) + ':00:00Z', label: 'TEST KIWI',
      })),
    }));
    seedLegacy(carnet);
    const before = ok(await call(0));
    ok(await call(0, { data: before.data, baseRev: before.rev }));
    const after = ok(await call(1));
    assert.deepEqual(balance(after.data.verticals.epicerie.data.carnet), balance(carnet), 'case ' + n);
    const plain = (list) => JSON.stringify(list.map(({ creditAlerts, ...c }) => c));
    assert.equal(plain(after.data.verticals.epicerie.data.carnet), plain(before.data.verticals.epicerie.data.carnet), 'carnet identique (hors alertes recalculées), case ' + n);
    if (carnet.some((c) => c.hist.length)) assert.equal(bookRows(), 1, 'case ' + n);
  }
});

await check('le cache HTTP voit chaque nouvelle ligne du carnet', async () => {
  reset();
  ok(await call('owner', { data: doc(book()) }));
  const first = await call(0);
  assert.equal((await call(0, { etag: first.etag })).status, 304, 'rien n’a bougé : 304');
  const till = clone(first.body.data); append(till, 'e1', 'debt', 2);
  ok(await call(1, { data: till, baseRev: first.body.rev }));
  const again = await call(0, { etag: first.etag });
  assert.equal(again.status, 200, 'une dette notée change l’ETag même si verticalops n’a pas bougé');
  assert.ok(hist(again.body.data).some((h) => h.id === 'e1'));
});

await check('remboursement d’avance sur un carnet pas encore déménagé : le document naît, un seul paiement', async () => {
  reset();
  seedLegacy([{ id: 'client', name: 'TEST KIWI', hist: [{ id: 'p0', type: 'pay', amt: 30, at: '2026-10-27T08:00:00Z', label: 'TEST KIWI' }] }]);
  const rs = await Promise.all([refund('refund-book-a', 3000), refund('refund-book-a', 3000)]);
  assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.map((r) => r.body)));
  assert.equal(bookRows(), 1);
  assert.equal(storedBook()[0].hist.filter((h) => h.kind === 'advance-refund').length, 1, 'un seul remboursement inscrit');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM sales WHERE channel='credit-book'").get().n, 1, 'une seule vente de remboursement');
  const after = ok(await call(0));
  assert.equal(balance(after.data.verticals.epicerie.data.carnet).client, 0, 'l’avance est soldée');
});

await check('retour en arrière : recopier le carnet dans verticalops et supprimer creditbook rend le même carnet', async () => {
  reset();
  ok(await call('owner', { data: doc(book()) }));
  const base = ok(await call(0));
  const till = clone(base.data); append(till, 'e1', 'debt', 5);
  ok(await call(0, { data: till, baseRev: base.rev }));
  const moved = ok(await call(0)).data.verticals.epicerie.data.carnet;
  const ops = JSON.parse(row('verticalops').data);
  ops.verticals.epicerie.data.carnet = storedBook();
  f.sql.prepare("UPDATE store_docs SET data = ? WHERE merchant = ? AND feature = 'verticalops'").run(JSON.stringify(ops), f.merchant);
  f.sql.prepare("DELETE FROM store_docs WHERE merchant = ? AND feature = 'creditbook'").run(f.merchant);
  assert.deepEqual(ok(await call(1)).data.verticals.epicerie.data.carnet, moved);
});

if (failures.length) {
  console.log(`\n✗ carnet dans son document : ${passed} ok, ${failures.length} échec(s)`);
  process.exit(1);
}
console.log(`✓ carnet dans son document : ${passed} scénarios (dette jamais bloquée par un autre métier, copie paresseuse unique, soldes intacts, cache, remboursement, retour en arrière)`);
