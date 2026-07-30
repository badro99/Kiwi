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

  if (!process.exitCode) console.log('\n✓ 12 live-link resilience checks passed.');
})().catch((e) => { console.error(e); process.exit(1); });
