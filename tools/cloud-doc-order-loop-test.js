#!/usr/bin/env node
'use strict';

/* Deux appareils, un même document, un ordre différent : pas de ping-pong.
 *
 * Relevé en production du 4 au 7 novembre 2026 : le document « returns » de
 * Santos Store gagnait jusqu'à 1 500 révisions par soirée, et la caisse faisait
 * jusqu'à 30 requêtes par seconde. Un retour noté sur la caisse A se met en tête
 * de sa liste ; la caisse B le reçoit et la fusion (le local d'abord) le range
 * en queue. Mêmes lignes, autre ordre : la comparaison (JSON.stringify) voyait
 * une différence, chacune repoussait son ordre, et la socket réveillait l'autre
 * 400 ms plus tard, sans fin, jusqu'à ce qu'un des deux postes se ferme.
 *
 * La règle tenue ici : une fusion qui n'apporte rien de nouveau au serveur
 * (mêmes lignes, même contenu, seul l'ordre diffère) adopte la copie du serveur
 * et ne remonte rien. Une vraie différence remonte toujours, et une saisie
 * locale en attente garde son ordre. */

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
const ids = (doc) => doc.list.map((x) => x.id).join(',');

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
function device(srv, list) {
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
  const dev = { doc: { list: clone(list) } };
  dev.h = window.KiwiCloudDoc.attach({
    feature: 'returns', slug: () => 'santos-test',
    read: () => dev.doc,
    write: (next) => { dev.doc = clone(next); },
    isEmpty: (d) => !d || !Array.isArray(d.list) || !d.list.length,
  });
  return dev;
}

(async function () {
  console.log('cloud-doc · deux appareils ne se renvoient pas un ordre');

  /* 1 · Le cas Santos : un retour noté sur A, B le range ailleurs. */
  {
    const srv = server({ list: [{ id: 'r1', amount: 10 }, { id: 'r2', amount: 20 }] });
    const A = device(srv, []);
    const B = device(srv, []);
    await A.h.pull(true); await B.h.pull(true);
    A.doc.list.unshift({ id: 'r3', amount: 30 });
    A.h.push(0);
    await wait();
    ok(srv.rev === 2 && ids(srv.data) === 'r3,r1,r2', 'the return recorded on A reaches the server');
    const before = srv.posts;
    for (let round = 0; round < 6; round++) {
      await B.h.pull(); await wait();
      await A.h.pull(); await wait();
    }
    ok(srv.posts === before, `six wake-ups on both devices write nothing more (${srv.posts - before} writes)`);
    ok(ids(A.doc) === ids(srv.data) && ids(B.doc) === ids(srv.data), `both devices hold the server order (${ids(A.doc)} · ${ids(B.doc)})`);
  }

  /* 2 · B tenait déjà le même contenu dans un autre ordre (état laissé par les
     soirées de ping-pong) : il adopte l'ordre du serveur, sans écrire. */
  {
    const srv = server({ list: [{ id: 'r3' }, { id: 'r1' }, { id: 'r2' }] });
    const B = device(srv, [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);
    await B.h.pull(); await wait();
    ok(srv.posts === 0, 'same rows in another order: nothing is written');
    ok(ids(B.doc) === 'r3,r1,r2', 'the device takes the server order');
  }

  /* 3 · Une vraie différence remonte toujours, et les deux appareils convergent. */
  {
    const srv = server({ list: [{ id: 'r1' }] });
    const A = device(srv, []);
    const B = device(srv, []);
    await A.h.pull(true); await B.h.pull(true);
    A.doc.list.unshift({ id: 'a2' }); A.h.push(0);
    B.doc.list.unshift({ id: 'b2' }); B.h.push(0);
    await wait(80);
    for (let round = 0; round < 6; round++) { await A.h.pull(); await wait(); await B.h.pull(); await wait(); }
    const set = (d) => d.list.map((x) => x.id).sort().join(',');
    ok(set(srv.data) === 'a2,b2,r1', `both devices' additions reach the server (${set(srv.data)})`);
    ok(set(A.doc) === 'a2,b2,r1' && set(B.doc) === 'a2,b2,r1', 'both devices hold every row');
    const settled = srv.posts;
    for (let round = 0; round < 6; round++) { await A.h.pull(); await wait(); await B.h.pull(); await wait(); }
    ok(srv.posts === settled, `once merged, nobody writes again (${srv.posts - settled} writes)`);
  }

  /* 4 · Le même id avec un contenu différent n'est pas « le même document ». */
  {
    const srv = server({ list: [{ id: 'r1', amount: 10 }] });
    const B = device(srv, []);
    await B.h.pull(true);
    srv.rev++; srv.data = { list: [{ id: 'r0', amount: 5 }, { id: 'r1', amount: 10 }] };
    B.doc.list[0].amount = 12;
    await B.h.pull(); await wait();
    ok(srv.posts === 1 && srv.data.list.some((x) => x.id === 'r1' && x.amount === 12), 'a changed row is still pushed');
  }

  /* 5 · Comparaison canonique : clés d'objet dans un autre ordre, pas d'écriture ;
     une liste de valeurs sans identité garde son ordre (un tracé n'est pas un ensemble). */
  {
    const w = {};
    new Function('window', 'document', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout', SOURCE)(
      w, { addEventListener() {} }, { getItem() { return null; }, setItem() {}, removeItem() {}, key() { return null; }, length: 0 },
      () => Promise.reject(new Error('offline')), setTimeout, clearTimeout);
    const same = w.KiwiCloudDoc.sameContent;
    ok(typeof same === 'function', 'KiwiCloudDoc.sameContent is exposed for the features that merge themselves');
    if (typeof same === 'function') {
      ok(same({ list: [{ id: 'a', x: 1, y: 2 }, { id: 'b' }] }, { list: [{ id: 'b' }, { y: 2, x: 1, id: 'a' }] }), 'rows with an id compare as a set, keys in any order');
      ok(!same({ pts: [1, 2] }, { pts: [2, 1] }), 'a list of plain values keeps its order');
      ok(!same({ list: [{ id: 'a', v: 1 }] }, { list: [{ id: 'a', v: 2 }] }), 'a changed field is a difference');
      ok(!same({ list: [{ id: 'a' }] }, { list: [{ id: 'a' }, { id: 'a' }] }), 'a duplicated row is a difference');
    }
  }

  console.log(`\ncloud-doc-order-loop: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
