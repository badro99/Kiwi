#!/usr/bin/env node
'use strict';

/* Un réglage (le programme de fidélité) : la copie serveur fait foi quand
 * l'appareil n'a pas de saisie en attente.
 *
 * Relevé le 21/11/2026 sur Amira Boutique : le propriétaire enregistrait
 * « 1 000 pts → −12 % » sur le tableau de bord ; la caisse, qui tenait encore
 * « 200 pts → −10 % », relisait le document toutes les 30 s, fusionnait sa
 * vieille copie par-dessus (la fusion par défaut fait gagner l'appareil sur
 * chaque valeur) et la renvoyait. Le serveur revenait à 200 / −10 % en moins
 * d'une minute (révision 60), la caisse donnait −10 % et ne débitait que 200
 * points. serverWins (cloud-doc.js) : sans saisie locale, on adopte. */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets', 'cloud-doc.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.log('  ✗ ' + message); }
}
const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));
const prog = (d) => d.amount.threshold + ' / ' + d.amount.reward;

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

/* Le serveur : compare-and-swap sur la révision, comme /api/store. */
function server(initial) {
  const s = { rev: 1, data: clone(initial), posts: 0 };
  s.fetch = (url, opts) => {
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      s.posts++;
      if (+body.baseRev !== s.rev) return Promise.resolve(response(409, { error: 'conflict', rev: s.rev, data: clone(s.data) }));
      s.rev++;
      s.data = clone(body.data);
      return Promise.resolve(response(200, { ok: true, rev: s.rev }));
    }
    return Promise.resolve(response(200, { rev: s.rev, data: clone(s.data) }));
  };
  return s;
}

/* Un appareil : son propre localStorage, la vraie cloud-doc.js, le document
   « returns » branché comme dans pos-boutique.js. */
function device(srv, cfg, serverWins) {
  const store = new Map();
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    key(i) { return Array.from(store.keys())[i] || null; },
    get length() { return store.size; },
  };
  const document = { visibilityState: 'visible', addEventListener() {} };
  const window = { document, localStorage, KiwiEnv: { isReal: () => true }, addEventListener() {} };
  window.window = window;
  new Function('window', 'document', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout', SOURCE)(
    window, document, localStorage, (u, o) => srv.fetch(u, o), setTimeout, clearTimeout);
  const dev = { doc: clone(cfg) };
  dev.h = window.KiwiCloudDoc.attach({
    feature: 'fidelity', slug: () => 'amira-test', serverWins: serverWins,
    read: () => dev.doc,
    write: (next) => { dev.doc = clone(next); },
    isEmpty: (d) => !d || !d.model || !!d.auto,
  });
  return dev;
}

(async function () {
  console.log('cloud-doc · serverWins : un vieux cache ne réimpose pas un ancien réglage');
  const OLD = { model: 'amount', visit: { target: 10, reward: '1 offert' }, amount: { perMad: 1, threshold: 200, reward: '−10 %' }, product: { item: 'Café', target: 10, reward: '1 offert' } };
  const NEW = clone(OLD); NEW.amount.threshold = 1000; NEW.amount.reward = '−12 %';

  for (const wins of [false, true]) {
    const srv = server(OLD);
    const till = device(srv, OLD, wins);
    const dash = device(srv, OLD, wins);
    await till.h.pull(true); await dash.h.pull(true); await wait();
    dash.doc = clone(NEW); dash.h.push(0); await wait();
    ok(prog(srv.data) === '1000 / −12 %', (wins ? 'serverWins' : 'old merge') + ': the dashboard save reaches the server');
    for (let round = 0; round < 3; round++) { await till.h.pull(); await wait(); await dash.h.pull(); await wait(); }
    if (wins) {
      ok(prog(srv.data) === '1000 / −12 %', `serverWins: the till no longer reverts the programme (server ${prog(srv.data)})`);
      ok(prog(till.doc) === '1000 / −12 %', `serverWins: the till takes the new programme (${prog(till.doc)})`);
    } else {
      ok(srv.rev >= 5, `control: without serverWins the till and the dashboard keep rewriting each other, as in production (rev ${srv.rev})`);
    }
  }

  /* Une saisie locale en attente gagne toujours : enregistrer sur une base
     périmée (409) garde ce que le propriétaire vient d'écrire. */
  {
    const srv = server(OLD);
    const dash = device(srv, OLD, true);
    await dash.h.pull(true); await wait();
    srv.rev++;                                   // un autre appareil a écrit entre-temps
    dash.doc = clone(NEW); dash.h.push(0); await wait(1500);
    ok(prog(srv.data) === '1000 / −12 %', `serverWins: an owner edit on a stale base still wins the 409 (${prog(srv.data)})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
