#!/usr/bin/env node
/* #0062 · « accepté par le relais » était traité comme « sorti sur le papier ».
 *
 * `relayEnqueue` rend `{ok:true, queued:true, id}` dès que le SERVEUR a pris le
 * travail · l'impression physique vient après, et peut échouer ou expirer. La
 * file lisait ce `ok` comme une réussite : elle soldait le travail, le retirait
 * de la file et l'inscrivait au registre `done` · plus aucun moyen de le
 * reprendre, jamais.
 *
 * Et comme un bon est découpé en un travail PAR POSTE, le ticket du bar
 * pouvait sortir pendant que celui de la cuisine mourait en silence. C'est
 * exactement le symptôme rapporté : « le ticket ne contenait pas toute la
 * commande ».
 *
 * On exécute la vraie file, avec un vrai relais qui accepte puis tranche.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');
const bridge = fs.readFileSync(path.join(ROOT, 'assets/printer-bridge.js'), 'utf8');

let passed = 0;
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log(`  ✓ ${label}`); };
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/* Le point de départ : le pont rend bien un « accepté, pas encore imprimé »,
 * et sait dire les trois verdicts. Si cela change, tout le reste est décor. */
ok('le relais rend « accepté et mis en file », pas « imprimé »',
  /return \{ ok: true, via: 'relay', queued: true, id: id \};/.test(bridge));
ok('le pont annonce la réussite, l’échec et l’incertitude sur le même canal',
  /detail: \{ ok: true, id: id, bytes:/.test(bridge)
  && /detail: \{ ok: false, id: id, reason: reason \}/.test(bridge)
  && /detail: \{ ok: false, uncertain: true, id: id, reason: uncertainReason \}/.test(bridge));

function boot() {
  const memory = new Map();
  const listeners = Object.create(null);
  const relayed = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Promise, Date, JSON, Math, Object, Array, String, Number, Boolean,
    localStorage: {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
    },
    document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach((fn) => fn(event)); },
    KiwiKitchenRelay: { merchant: () => 'mixmax' },
    KiwiPrinter: {
      isConnected: () => true,
      /* Un vrai pont distant : il ACCEPTE, il n'imprime pas encore. */
      printKitchen(payload) {
        const id = 'relay-job-' + (relayed.length + 1);
        relayed.push({ id, payload });
        return Promise.resolve({ ok: true, via: 'relay', queued: true, id });
      },
    },
  };
  ctx.window = ctx;
  vm.runInNewContext(source, ctx, { filename: 'assets/kitchen-print-queue.js' });
  const verdict = (detail) => ctx.dispatchEvent(new ctx.CustomEvent('kiwi:printer-relay-status', { detail }));
  return { ctx, relayed, verdict, api: ctx.KiwiKitchenPrint };
}

const ticket = (station) => ({
  id: 'ord-155:' + station, createdAt: Date.now(), station,
  payload: { title: station.toUpperCase(), order: '#155', station, items: [{ q: 1, n: 'Pizza' }] },
});

/* ── 1 · Un travail accepté n'est PAS soldé. ────────────────────────────── */
{
  const { api, relayed, verdict } = boot();
  api.enqueue([ticket('cuisson')], { remote: false });
  await wait();
  ok('le relais a bien reçu le bon', relayed.length === 1);
  ok('mais le travail reste dans la file · il n’est pas encore sorti',
    api.status().pending === 1 && api.status().awaitingRelay === 1);

  verdict({ ok: true, id: relayed[0].id });
  await wait();
  ok('le verdict « imprimé » solde le travail', api.status().pending === 0);

  /* Et une fois vraiment imprimé, le registre reprend son office. */
  api.enqueue([ticket('cuisson')], { remote: false });
  await wait();
  ok('un bon réellement imprimé ne repart pas au sondage suivant',
    relayed.length === 1 && api.status().pending === 0);
}

/* ── 2 · Le cas du ticket, exactement : deux postes, un seul sort. ──────── */
{
  const { api, relayed, verdict } = boot();
  api.enqueue([ticket('bar'), ticket('cuisson')], { remote: false });
  await wait(); await wait();
  ok('les deux postes sont partis au relais', relayed.length === 2);

  verdict({ ok: true, id: relayed[0].id });                                  // le bar sort
  verdict({ ok: false, id: relayed[1].id, reason: 'printer-offline' });      // la cuisine meurt
  await wait(); await wait();

  const left = api._readQueue();
  ok('le poste qui a imprimé est soldé · il a quitté la file',
    !left.some((j) => j.id.endsWith(':bar')));
  ok('le poste qui a échoué est REVENU en file au lieu de disparaître',
    left.some((j) => j.id.endsWith(':cuisson')));
  ok('il n’est pas inscrit au registre des bons imprimés',
    api._alreadyDone('ord-155:cuisson') === false && api._alreadyDone('ord-155:bar') === true);
  await wait(2500);
  ok('et il repart tout seul · le relais le revoit',
    relayed.length === 3 && relayed[2].payload.station === 'cuisson');
}

/* ── 3 · L'incertain. Ni réimprimer d'office, ni abandonner. ────────────── */
{
  const { api, relayed, verdict } = boot();
  api.enqueue([ticket('cuisson')], { remote: false });
  await wait();
  verdict({ ok: false, uncertain: true, id: relayed[0].id, reason: 'output-unknown-ack-timeout' });
  await wait();
  ok('un verdict incertain garde le travail en file', api.status().pending === 1);
  ok('et le compte comme tel, pour que le comptoir le voie', api.status().uncertain === 1);
  await wait(2000);
  ok('il ne se réimprime PAS tout seul · un plat doublé est aussi une faute',
    relayed.length === 1);

  /* La décision humaine · le bouton qui existait déjà. */
  api.retryNow();
  await wait();
  ok('le comptoir peut trancher et le renvoyer', relayed.length === 2);
  ok('et l’incertitude est levée', api.status().uncertain === 0);
}

/* ── 4 · Le silence. Le pont cesse de sonder à douze secondes alors que le
 *        serveur garde le travail dix minutes : un silence n'est donc pas une
 *        réussite, et ce n'est pas non plus une raison de réimprimer. */
{
  const { ctx, api, relayed } = boot();
  api.enqueue([ticket('cuisson')], { remote: false });
  await wait();
  ok('le travail attend son verdict', api.status().awaitingRelay === 1);

  /* On vieillit l'attente plutôt que d'immobiliser la suite vingt secondes. */
  const key = 'kiwiKitchenPrintQueueV1:mixmax';
  const q = JSON.parse(ctx.localStorage.getItem(key));
  q.forEach((job) => { job.awaitingUntil = Date.now() - 1; job.nextAt = 0; });
  ctx.localStorage.setItem(key, JSON.stringify(q));

  await api.flush();
  await wait();
  ok('un verdict qui ne vient jamais devient « incertain », pas « imprimé »',
    api.status().uncertain === 1 && api._alreadyDone('ord-155:cuisson') === false);
  ok('et surtout pas une réimpression silencieuse', relayed.length === 1);
}

console.log(`\nrelay-print-verdict-test: ${passed} controls passed\n`);
/* Le module tient un intervalle (bail du hub) : sans sortie explicite le
   processus ne rend jamais la main, et check.js le lirait comme un échec. */
process.exit(0);
