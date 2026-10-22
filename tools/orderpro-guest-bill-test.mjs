#!/usr/bin/env node
import orderProTestSource from './orderpro-test-source.cjs';
// OrderPro · ce que le client voit de SES commandes (audit 2026-10-14).
//
// Exécute les fonctions livrées de OrderPro.html dans un bac à sable :
//   · les prix gardent leurs centimes (14,50 + 3,50 = 18, pas 18,5) ;
//   · une commande refusée sort de l'addition et du partage ;
//   · « Mes commandes » survit à un rechargement de la page, pour la même
//     session seulement ;
//   · le refus d'une commande PRÉCÉDENTE est annoncé, avec son numéro ;
//   · l'écran de confirmation ne dit « en cuisine » qu'une fois acceptée ;
//   · une file pleine ne dit pas « réessayez ».
// Run: node tools/orderpro-guest-bill-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = orderProTestSource();
function slice(start, end) {
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'production slice exists: ' + start.trim().slice(0, 40));
  return src.slice(a, b);
}
const moneySource = slice('    const cur = () => ', '\n    function lineKey(');
const sentSource = slice('    const ORDER_DONE = new Set', '    /* Aucun pourboire présélectionné');
const statusSource = slice('    function onOrderStatus(id, status) {', '    function applyOrderStatus(status) {');

let passed = 0, failed = 0;
function ok(name, run) {
  try { run(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message.split('\n')[0]); }
}

function guest(storage = new Map(), lang = 'fr') {
  const toasts = [], applied = [], rendered = [];
  const ctx = vm.createContext({
    Math, Number, String, JSON, Set, Array, isFinite,
    currentLang: lang, t: (k) => ({ currency: 'MAD', order_refused_n: 'Commande {n} refusée' })[k] || k,
    NET: { slug: 'cafe' }, SESSION: { id: 'tsx-A' },
    localStorage: {
      getItem: (k) => storage.has(k) ? storage.get(k) : null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      key: (i) => [...storage.keys()][i] ?? null,
      get length() { return storage.size; },
    },
    $: (sel) => ({ classList: { contains: () => sel === '#bill-sheet' } }),
    renderBill: () => rendered.push(1), setTipPercent() {}, tipPercent: 0,
    showToast: (m) => toasts.push(m), applyOrderStatus: (s) => applied.push(s),
    currentOrderId: '', sentOrders: [], sentLines: [], sessionTotal: 0,
  });
  vm.runInContext(moneySource + sentSource + statusSource
    + '\nglobalThis.api = { fmtAmount, money, toCents, rebuildSent, saveSent, loadSent, clearSent, onOrderStatus };', ctx);
  return { ctx, api: ctx.api, toasts, applied, rendered, storage };
}
const order = (id, number, total, lines) => ({ id, number, status: 'pending', total, lines });

console.log('OrderPro · l’addition du client');

ok('les centimes restent : 14,50 + 3,50 = 18 MAD, 14,50 s’écrit 14,50', () => {
  const { api } = guest();
  assert.equal(api.money(14.5 + 3.5), '18 MAD');
  assert.equal(api.money(14.5), '14,50 MAD');
  assert.equal(api.money(3 * 14.55), '43,65 MAD');
  assert.equal(guest(new Map(), 'en').api.fmtAmount(18.5), '18.50');
});
ok('la carte n’arrondit plus le prix au dirham', () => {
  assert.ok(/price: Math\.max\(0, toCents\(it\.price\) \/ 100\)/.test(src));
  assert.ok(!/price: Math\.max\(0, Math\.round\(Number\(it\.price\)/.test(src));
});
ok('aucun prix n’est écrit sans passer par money()/fmtAmount()', () => {
  assert.deepEqual((src.match(/\$\{[^{}`]+\} \$\{cur\(\)\}/g) || []).filter((m) => !m.includes('fmtAmount')), []);
});

ok('une commande refusée sort de l’addition, les autres restent', () => {
  const g = guest();
  g.ctx.sentOrders.push(order('ord-a', '61', 108, [{ id: 'cafe', qty: 1, unitPrice: 18 }, { id: 'tajine', qty: 1, unitPrice: 90 }]));
  g.ctx.sentOrders.push(order('ord-b', '62', 35, [{ id: 'tarte', qty: 1, unitPrice: 35 }]));
  g.api.rebuildSent();
  assert.equal(g.ctx.sessionTotal, 143);
  g.ctx.currentOrderId = 'ord-b';
  g.api.onOrderStatus('ord-a', 'rejected');
  assert.equal(g.ctx.sessionTotal, 35);
  assert.deepEqual(g.ctx.sentLines.map((l) => l.id), ['tarte']);
  assert.equal(g.rendered.length, 1, 'an open bill re-renders');
});
ok('le refus d’une commande PRÉCÉDENTE est annoncé avec son numéro', () => {
  const g = guest();
  g.ctx.sentOrders.push(order('ord-a', '61', 20, [{ id: 'jus', qty: 1, unitPrice: 20 }]));
  g.ctx.sentOrders.push(order('ord-b', '62', 35, [{ id: 'tarte', qty: 1, unitPrice: 35 }]));
  g.ctx.currentOrderId = 'ord-b';
  g.api.onOrderStatus('ord-a', 'rejected');
  assert.deepEqual(g.toasts, ['Commande 61 refusée']);
  assert.deepEqual(g.applied, [], 'the screen belongs to the latest order');
  g.api.onOrderStatus('ord-b', 'accepted');
  assert.deepEqual(g.applied, ['accepted']);
});
ok('« Mes commandes » survit au rechargement, pour la même session seulement', () => {
  const storage = new Map();
  const first = guest(storage);
  first.ctx.sentOrders.push(order('ord-a', '61', 108, [{ id: 'cafe', qty: 1, unitPrice: 18 }]));
  first.api.rebuildSent(); first.api.saveSent();
  const reloaded = guest(storage);
  reloaded.api.loadSent('tsx-A');
  assert.equal(reloaded.ctx.sentOrders.length, 1);
  assert.equal(reloaded.ctx.sessionTotal, 108);
  const nextVisit = guest(storage);
  nextVisit.ctx.SESSION.id = 'tsx-B';
  nextVisit.api.loadSent('tsx-B');
  assert.equal(nextVisit.ctx.sentOrders.length, 0);
  assert.equal(storage.has('kiwi-op-sent:cafe:tsx-A'), false, 'an old visit is forgotten');
});
ok('fermer la session efface sa liste', () => {
  assert.ok(/hadOrder: [^\n]*\}\);\n\s*clearSent\(\);\n\s*onSessionClosed\(\);/.test(src));
});
ok('la session reprise relit ses commandes', () => {
  assert.ok(/this\._write\(\{ id: this\.id, mode: this\.mode, table: this\.table \}\);\n\s*if \(this\.mode === 'table'\) loadSent\(this\.id\);/.test(src));
});
ok('l’addition reprend les prix du serveur, ligne par ligne', () => {
  assert.ok(/unitPrice: sameShape && isFinite\(Number\(serverLines\[i\]\.unitPrice\)\)/.test(src));
});
ok('la boucle suit toutes les commandes encore en jeu, pas seulement la dernière', () => {
  assert.ok(/const watched = new Set\(sentOrders\.filter\(o => !ORDER_DONE\.has\(o\.status\)\)/.test(src));
});

ok('« en cuisine » seulement une fois acceptée ; plus de « prêt dans En attente »', () => {
  assert.ok(/<em data-i18n="success_title_em">à l’équipe\.<\/em>/.test(src));
  assert.ok(/success_title_em_kitchen: "en cuisine\."/.test(src));
  assert.equal((src.match(/success_eta_mid: "·",/g) || []).length, 3);
  assert.ok(!/prêt dans<\/span> <em/.test(src));
  assert.ok(/status === 'pending' \|\| status === 'rejected'\s*\? t\('success_title_em'\) : t\('success_title_em_kitchen'\)/.test(src));
});
ok('une file pleine ne dit pas « réessayez »', () => {
  assert.ok(/err === 'queue-full' \|\| err === 'table-queue-full'[\s\S]{0,160}showToast\(t\('order_busy'\)\)/.test(src));
});
ok('les nouveaux libellés existent en FR, EN et AR', () => {
  for (const key of ['prep_ready', 'order_refused_n', 'order_busy', 'bill_order_label', 'bill_order_refused', 'success_title_em_kitchen']) {
    assert.equal((src.match(new RegExp('\\n\\s+' + key + ': "')) || []).length >= 1, true, key);
    assert.equal(src.split('\n').filter((l) => new RegExp('^\\s+' + key + ': "').test(l)).length, 3, key + ' in 3 languages');
  }
});

console.log(failed ? `✗ ${passed} ok, ${failed} échec(s)` : `orderpro-guest-bill: ${passed} passed, 0 failed`);
process.exit(failed ? 1 : 0);
