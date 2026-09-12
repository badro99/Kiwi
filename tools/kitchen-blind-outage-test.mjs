#!/usr/bin/env node
/* #0065 · « une panne de base ressemble à une cuisine vide et en bonne santé ».
 *
 * Quand toutes les lectures de la table `orders` échouent, l'API répond HTTP
 * 200 avec une liste vide et `ordersAvailable: false`. Elle dit donc la vérité
 * — mais AUCUN client ne lisait ce drapeau. Le passe affichait « lien OK »
 * au-dessus d'un écran vide : la panne était indiscernable d'un creux de
 * service. Et la liste vide continuait sa route dans le balayage des bons
 * périmés, effaçant des plats en cours de cuisson.
 *
 * Ce contrôle exécute la vraie boucle du passe et le vrai sondeur OrderPro.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cuisine = fs.readFileSync(path.join(ROOT, 'kiwi-cuisine.html'), 'utf8');
const queue = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');
const inbox = fs.readFileSync(path.join(ROOT, 'assets/orderpro-inbox.js'), 'utf8');

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };
const wait = () => new Promise((r) => setTimeout(r, 10));

/* ── 1 · Le serveur dit bien la vérité. C'est le point de départ : si un jour
 *        il se met à prétendre que la file est disponible, tout le reste de ce
 *        contrôle devient décoratif. */
ok('une lecture impossible répond « file indisponible », pas « file vide »',
  /if \(!rows\) return json\(\{ ok: true, orders: \[\], sessions: \[\], now: pollCursor\(now\), ordersAvailable: false \}\);/.test(queue));
ok('une lecture réussie l’annonce disponible',
  /ok: true, orders, sessions, closedSessions,[\s\S]{0,600}ordersAvailable: true,/.test(queue));

/* ── 2 · Le passe. On exécute sa vraie fonction `pull`. ─────────────────── */
const slice = (start, end) => {
  const a = cuisine.indexOf(start);
  assert.notEqual(a, -1, `repère absent : ${start}`);
  const b = cuisine.indexOf(end, a);
  assert.notEqual(b, -1, `repère absent : ${end}`);
  return cuisine.slice(a, b);
};
const pullSrc = slice('  function pull() {', '  function setLive(up) {')
  + slice('  function setLive(up) {', '\n  /* Un bon qui arrive');

function pass(reply) {
  const linkEl = { className: '', textContent: '' };
  const txtEl = { textContent: '' };
  const cooking = { 'ord-1': 1 };
  const orders = { 'ord-1': { id: 'ord-1', status: 'accepted', created_ts: Date.now(), lines: [] } };
  const S = { since: 42, live: true, orders, cooking, seen: { 'ord-1': 1 }, seenVoids: {}, muted: true };
  const ctx = vm.createContext({
    S, STALE_MS: 6 * 3600 * 1000,
    T: (k) => k,
    $: (id) => (id === 'link' ? linkEl : txtEl),
    KiwiKitchenRelay: { pullAll: () => Promise.resolve(reply) },
    paint() {}, announce() {}, announceVoid() {}, saveCooking() {}, saveSeen() {},
    setTimeout, Date, Object, Array, Promise, JSON, Math, String, Number,
    navigator: {}, window: {}, console: { log() {}, warn() {}, error() {} },
  });
  ctx.window = ctx;
  vm.runInContext(pullSrc, ctx);
  ctx.pull();
  return { S, linkEl, txtEl };
}

/* Le cas sain reste sain · une file lisible et vide EST une cuisine calme. */
{
  const { S, linkEl } = pass({ ok: true, orders: [], now: 99, ordersAvailable: true });
  await wait();
  ok('une file lisible et vide laisse le passe en ligne',
    S.live === true && /\bok\b/.test(linkEl.className || 'link ok'));
}

/* Le cas de la panne. */
{
  const { S, linkEl } = pass({ ok: true, orders: [], now: 99, ordersAvailable: false });
  await wait();
  ok('une base muette fait tomber le bandeau au lieu de mentir', S.live === false);
  ok('et le bandeau le montre', /down/.test(linkEl.className));
  ok('le curseur n’avance pas sur une lecture qui n’a rien lu', S.since === 42);
  ok('les plats en cuisson ne sont PAS effacés par une panne',
    !!S.orders['ord-1'] && !!S.cooking['ord-1']);
}

/* ── 3 · Le sondeur OrderPro du comptoir. Il RECONSTRUIT `sessions` à chaque
 *        tour : une lecture ratée éteignait toutes les places téléphone. */
ok('le sondeur du comptoir traite « indisponible » comme une lecture illisible',
  /if \(j\.ordersAvailable === false\) return -1;/.test(inbox));
ok('…et il le fait AVANT de reconstruire sessions et expirés',
  inbox.indexOf('if (j.ordersAvailable === false) return -1;')
  < inbox.indexOf('state.sessions = j.sessions || [];'));

console.log(`\nkitchen-blind-outage-test: ${passed} controls passed\n`);
