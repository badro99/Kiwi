#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* La fiche de livraison (functions/api/_delivery-card.js), sur le vrai schéma.
 *
 * Une vente en livraison porte son destinataire (nom, téléphone, ville,
 * adresse, commentaire) pour qu'on la retrouve quand le colis revient. On
 * vérifie que la caisse l'envoie avec la vente et que le serveur l'écrit une
 * seule fois, que la page Livraisons la relit, qu'une fiche incomplète ne
 * bloque jamais la vente, et que ce destinataire n'entre pas dans le carnet
 * de clients. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as salePost } from '../functions/api/sale.js';
import { onRequestGet as receivablesGet } from '../functions/api/receivables.js';
import { cleanDeliveryCard } from '../functions/api/_delivery-card.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import fs from 'node:fs';
import vm from 'node:vm';

const MERCHANT = 'boutique-card-test';
const SECRET = 'card-test-secret';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(coreTestSource.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async run() { const r = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    };
    return statement;
  },
  async batch(statements) {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
const env = { DB, AUTH_SECRET: SECRET };
sqlite.prepare(`INSERT INTO merchant_config (merchant, features, name, type, status, till_epoch, updated_ts)
  VALUES (?, '{}', 'TEST KIWI', 'boutique', 'active', 0, ?)`).run(MERCHANT, Date.now());
const till = `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT)}`;

let controls = 0;
const ok = (cond, label) => { assert.ok(cond, label); controls += 1; console.log('  ✓ ' + label); };

const CARD = { name: '  Salma   Benali ', phone: '+212 6 12 34 56 78', city: 'Casablanca', address: 'Maarif, rue 12, n° 4', note: 'Après 18 h' };
const deliverySale = (id, card, extra = {}) => ({
  id, merchant: MERCHANT, amount: 0, amountCents: 0, method: 'delivery', channel: 'delivery', settlementKind: 'receivable',
  paymentParts: [{ method: 'delivery', amountCents: 45000 }], ticketAmountCents: 45000, label: 'Robe lin', ref: id.toUpperCase(), ts: Date.now(),
  lines: [{ itemId: 'prod_1', variantId: 'prod_1:M:bleu', name: 'Robe lin M', qty: 1, total: 450, cat: 'Robes', unit: 'piece', kind: 'product' }],
  deliveryCard: card, ...extra,
});
const post = async (body) => {
  const res = await salePost({ request: new Request('https://kiwi.test/api/sale', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: till }, body: JSON.stringify(body) }), env, waitUntil() {} });
  return { status: res.status, body: await res.json() };
};
const cards = (id) => sqlite.prepare("SELECT impact FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-card'").all(MERCHANT, id);

/* La règle des champs. */
ok(cleanDeliveryCard(CARD).name === 'Salma Benali', 'the card is trimmed and its spaces folded');
ok(cleanDeliveryCard({ ...CARD, note: '' }) !== null, 'the comment is optional');
for (const k of ['name', 'city', 'address']) ok(cleanDeliveryCard({ ...CARD, [k]: '  ' }) === null, `a card without ${k} is refused`);
ok(cleanDeliveryCard({ ...CARD, phone: '06 12' }) === null, 'a phone number with fewer than 8 digits is refused');
ok(cleanDeliveryCard({ ...CARD, address: 'x'.repeat(500) }).address.length === 200, 'a field is capped');

/* La vente l'emporte avec elle. */
let r = await post(deliverySale("dlv-card-1", CARD));
ok(r.status === 200 && r.body.ok, 'a delivery sale with its card is booked');
ok(cards('dlv-card-1').length === 1 && JSON.parse(cards('dlv-card-1')[0].impact).city === 'Casablanca', 'its card is written once, next to the sale');
r = await post(deliverySale('dlv-card-1', { ...CARD, name: 'Autre personne' }));
ok(r.status === 200 && cards('dlv-card-1').length === 1 && JSON.parse(cards('dlv-card-1')[0].impact).name === 'Salma Benali', 'resending the same ticket never writes a second card nor overwrites the first');

r = await post(deliverySale('dlv-card-2', { ...CARD, city: '' }));
ok(r.status === 200 && r.body.ok && cards('dlv-card-2').length === 0, 'an incomplete card never blocks the sale: it is booked without one');

r = await post({ ...deliverySale('counter-1', CARD), method: 'cash', channel: 'counter', settlementKind: undefined, amount: 450, amountCents: 45000,
  paymentParts: [{ method: 'cash', amountCents: 45000 }], ticketAmountCents: 45000 });
ok(r.status === 200 && cards('counter-1').length === 0, 'a counter sale never stores a delivery card');

/* La file hors ligne de la caisse rebâtit chaque vente champ par champ : la
   fiche doit y survivre, sinon elle se perd en silence au premier envoi. */
{
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const window = { localStorage };
  vm.runInNewContext(fs.readFileSync(new URL('../assets/live-link/queue-store.js', import.meta.url), 'utf8'), { window, localStorage, console });
  const queue = window.KiwiSaleQueueStore.create({ on: () => true, merchant: () => MERCHANT, tenantHold: () => null, stableId: (m, e) => e.id,
    serverSession: () => '', pingLocal() {}, flushQueue() {} });
  const entry = deliverySale('dlv-queued', CARD);
  queue.enqueue({ ...entry, time: entry.ts });
  const body = JSON.parse(store.get('kiwiSaleQueue') || '[]').find((x) => x.id === 'dlv-queued');
  ok(body && body.deliveryCard && body.deliveryCard.name === CARD.name && body.deliveryCard.address === CARD.address && body.channel === 'delivery',
    'the till queue keeps the card on a delivery sale it holds for sending');
  r = await post(body);
  ok(r.status === 200 && cards('dlv-queued').length === 1, 'a queued delivery sale sent later still writes its card');
}

/* La page Livraisons la relit. */
const res = await receivablesGet({ request: new Request(`https://kiwi.test/api/receivables?lines=1&merchant=${MERCHANT}`, { headers: { Cookie: till } }), env });
const data = await res.json();
const one = (data.open || []).find((d) => d.saleId === 'dlv-card-1');
ok(res.status === 200 && one && one.customer && one.customer.phone === '+212 6 12 34 56 78' && one.customer.address === 'Maarif, rue 12, n° 4' && one.customer.note === 'Après 18 h',
  'the Livraisons list carries the recipient: name, phone, city, address, comment');
const two = (data.open || []).find((d) => d.saleId === 'dlv-card-2');
ok(two && two.customer === null, 'an order without a card is still listed, with no recipient');

/* Ce n'est pas une cliente du carnet. */
ok(sqlite.prepare('SELECT COUNT(*) AS n FROM clients').get().n === 0, 'the recipient never enters the client book (no loyalty, no points)');

console.log(`\n${controls} controls · delivery cards hold.`);
