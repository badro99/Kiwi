#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'live-link.js'), 'utf8');
const data = new Map([
  ['kiwiLive', '1'],
  ['kiwiPairedVenue', JSON.stringify({ merchant: 'amira-boutique', name: 'Amira Boutique' })],
]);
const localStorage = {
  getItem: (k) => data.has(k) ? data.get(k) : null,
  setItem: (k, v) => data.set(k, String(v)),
  removeItem: (k) => data.delete(k),
};
let reply = () => Promise.reject(new Error('offline'));
const window = {
  localStorage,
  KiwiEnv: { isReal: () => true },
  addEventListener: () => {}, dispatchEvent: () => {},
  crypto: { randomUUID: () => 'random-only-when-no-receipt' },
};
const document = { readyState: 'loading', addEventListener: () => {}, hidden: false, createElement: () => ({}) };
const context = {
  window, document, localStorage,
  location: { search: '', hostname: 'kiwi.test' },
  URLSearchParams, CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
  fetch: (...args) => reply(...args),
  setTimeout: () => 1, clearTimeout: () => {}, console,
};
vm.runInNewContext(source, context, { filename: 'live-link.js' });

const wait = () => new Promise((resolve) => setImmediate(resolve));
const queue = () => JSON.parse(data.get('kiwiSaleQueue') || '[]');
function check(ok, label) {
  if (!ok) { console.error(`  ✗ ${label}`); process.exitCode = 1; return; }
  console.log(`  ✓ ${label}`);
}

(async () => {
  const sale = { id: 'MM-1208-A7', amount: 500, method: 'cash', ref: 'MM-1208-A7', time: new Date(1000) };
  const first = window.KiwiLive.postSale(sale);
  await wait(); await wait();
  check(first && first.queued && queue().length === 1, 'offline sale remains queued');

  const duplicate = window.KiwiLive.postSale(sale);
  check(duplicate && duplicate.duplicate && queue().length === 1, 'same receipt cannot enter queue twice');

  reply = () => Promise.resolve({ ok: false, status: 400 });
  window.KiwiLive.flush();
  await wait(); await wait();
  check(queue().length === 1 && queue()[0]._blocked === true, 'rejected sale is quarantined, never deleted');

  reply = () => Promise.resolve({ ok: true, status: 200 });
  window.KiwiLive.postSale({ id: 'MM-1209-A7', amount: 90, ref: 'MM-1209-A7' });
  await wait(); await wait(); await wait();
  check(queue().length === 1 && queue()[0].id === first.id, 'blocked sale does not hold later valid sales hostage');

  data.set('kiwiSaleQueue', '[]');
  reply = () => Promise.resolve({ ok: false, status: 403 });
  window.KiwiLive.postSale({ id: 'MM-1210-A7', amount: 70, ref: 'MM-1210-A7' });
  await wait(); await wait();
  check(queue().length === 1 && !queue()[0]._blocked, 'authentication failure stays retryable');

  /* A re-paired till may still owe the former merchant a queued sale. Keep it,
   * but do not submit it with the new till cookie and do not let it hold the new
   * merchant's valid sales behind it. */
  data.set('kiwiSaleQueue', JSON.stringify([{ id: 'old-debt', merchant: 'amira-boutique', amount: 40, ref: '1040' }]));
  data.set('kiwiPairedVenue', JSON.stringify({ merchant: 'rival-shop', name: 'Rival Shop' }));
  const sent = [];
  reply = (_url, opts) => { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, status: 200 }); };
  window.KiwiLive.postSale({ id: 'sale-rival', amount: 55, ref: '1000' });
  await wait(); await wait(); await wait();
  check(sent.length === 1 && sent[0].merchant === 'rival-shop',
    'un ancien locataire ne bloque pas la nouvelle caisse');
  check(queue().length === 1 && queue()[0].merchant === 'amira-boutique' && window.KiwiLive.queueStatus().foreign === 1,
    'la dette de l’ancien commerce reste conservée pour support');
  data.set('kiwiPairedVenue', JSON.stringify({ merchant: 'amira-boutique', name: 'Amira Boutique' }));

  data.set('kiwiSaleQueue', '[]');
  reply = () => new Promise(() => {});
  for (let i = 0; i < 205; i++) window.KiwiLive.postSale({ id: 'LONG-' + i, amount: i + 1, ref: 'LONG-' + i });
  check(queue().length === 205, 'long outage does not trim the oldest sales');
  check(window.KiwiLive.queueStatus().pending === 205, 'cashier status exposes the true pending count');

  /* ── Le miroir est-il allumé, et pour qui ? ──────────────────────────────
   * Le journal de caisse est la seule donnée du commerce qui n'existait nulle
   * part ailleurs que dans le stockage d'un onglet : le stock revient de
   * /api/catalog, le carnet de /api/clients, la carte de /api/menu. Les ventes,
   * non. Un iPad remplacé, un « effacer les données du site », et le chiffre
   * d'affaires n'était plus nulle part.
   *
   * Les deux sens comptent autant l'un que l'autre. Allumé chez un vrai
   * commerçant, sinon la correction ne sert à rien ; ÉTEINT en démonstration,
   * sinon une vente fabriquée part sous le locataire partagé — et c'est cette
   * moitié-là qu'on casse sans s'en apercevoir. */
  const wasReal = window.KiwiEnv.isReal;
  data.delete('kiwiLive');
  check(window.KiwiLive.isOn() === true, 'un vrai commerçant miroite ses ventes sans rien régler');

  window.KiwiEnv.isReal = () => false;
  check(window.KiwiLive.isOn() === false, 'une démonstration locale n\'envoie rien au serveur');

  data.set('kiwiLive', '1');
  check(window.KiwiLive.isOn() === true, 'le forçage explicite reste possible en démonstration');

  window.KiwiEnv.isReal = wasReal;
  data.set('kiwiLive', '0');
  check(window.KiwiLive.isOn() === false, 'le refus explicite prime sur le défaut');

  delete window.KiwiEnv;
  data.delete('kiwiLive');
  check(window.KiwiLive.isOn() === false, 'sans KiwiEnv on se tait plutôt que de deviner');
  window.KiwiEnv = { isReal: wasReal };
  data.set('kiwiLive', '1');

  /* The customer-facing number is not an idempotency key. Two legitimate
   * records carrying the same printed reference must remain two records when
   * their internal UUIDs differ. */
  data.set('kiwiSaleQueue', '[]');
  reply = () => new Promise(() => {});
  const twinA = window.KiwiLive.postSale({ id: 'sale-uuid-a', amount: 80, ref: '1000' });
  const twinB = window.KiwiLive.postSale({ id: 'sale-uuid-b', amount: 90, ref: '1000' });
  check(twinA && twinB && queue().length === 2 && queue()[0].id !== queue()[1].id,
    'deux UUID distincts survivent même avec la même référence imprimée');

  if (!process.exitCode) console.log('\n✓ 15 live-link resilience checks passed.');
})().catch((e) => { console.error(e); process.exit(1); });
