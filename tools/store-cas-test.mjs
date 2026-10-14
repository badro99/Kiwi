#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · /api/store : compare-and-swap pour TOUS les documents
 *
 * Avant : seuls reservations, printhub et monthreport écrivaient avec
 * `UPDATE … WHERE rev = ?`. Tous les autres passaient le contrôle
 * `baseRev === rev lu`, puis finissaient en upsert aveugle : si un second
 * appareil écrivait entre la lecture et l'écriture, sa modification était
 * écrasée sans un mot.
 *
 *   A. un document ordinaire (fidelity) dont la révision bouge entre la lecture
 *      et l'écriture rend 409 + la copie serveur, et n'écrase rien ;
 *   B. le document team ne réécrit pas le miroir d'accès quand il perd ;
 *   C. le chemin heureux reste un 200 qui avance la révision d'un cran ;
 *   D. une première écriture simultanée (aucune ligne) perd proprement ;
 *   E. assets/cloud-doc.js garde la révision PAR magasin : revenir sur un
 *      magasin déjà lu n'envoie pas la révision de l'autre en baseRev.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as postStore } from '../functions/api/store.js';

let failures = 0;
function ok(label, cond, detail) {
  if (cond) { console.log('  ✓ ' + label); return; }
  failures++;
  console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
}
console.log('■ Store · compare-and-swap généralisé (tools/store-cas-test.mjs)');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'store-cas-test-secret-32-bytes!!!!';
const SHOP = 'cas-shop';

function freshEnv() {
  const sql = new DatabaseSync(':memory:');
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of raw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    try { sql.exec(stmt); } catch (_) { /* sans objet ici */ }
  }
  const now = Date.now();
  sql.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-cas','cas@t.ma','C','cas-shop','00','00',?)").run(now);
  sql.prepare("INSERT INTO merchant_config (merchant,features,account_id,name,updated_ts) VALUES (?,'{}','acc-cas','CAS',?)").run(SHOP, now);
  const hooks = { afterRead: null };
  const env = {
    sql, hooks, AUTH_SECRET: SECRET,
    DB: {
      prepare(q) {
        let args = [];
        const st = {
          bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
          first() {
            const r = sql.prepare(q).get(...args);
            /* Le point de course : juste après la lecture de la révision, un autre
               appareil écrit. */
            if (hooks.afterRead && q.startsWith('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?')) {
              const run = hooks.afterRead; hooks.afterRead = null; run();
            }
            return r === undefined ? null : r;
          },
          all() { return { results: sql.prepare(q).all(...args) }; },
          run() { const r = sql.prepare(q).run(...args); return { success: true, meta: { changes: r.changes } }; },
        };
        return st;
      },
      async batch(stmts) {
        sql.exec('BEGIN');
        try { const out = []; for (const s of stmts) out.push(await s.run()); sql.exec('COMMIT'); return out; }
        catch (e) { sql.exec('ROLLBACK'); throw e; }
      },
    },
  };
  return env;
}
const cookie = `${SESS_COOKIE}=${await makeSession('acc-cas', SECRET)}`;
async function save(env, feature, data, baseRev) {
  const res = await postStore({
    env,
    request: new Request('https://kiwi.test/api/store', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ feature, merchant: SHOP, baseRev, data }),
    }),
  });
  return { status: res.status, body: await res.json() };
}
const row = (env, feature) => env.sql.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').get(SHOP, feature);
const doc = (n) => ({ model: 'm' + n, visit: n, amount: n, product: n });

/* ── C · chemin heureux ───────────────────────────────────────────────────── */
{
  const env = freshEnv();
  const first = await save(env, 'fidelity', doc(1), 0);
  ok('première écriture : 200, révision 1', first.status === 200 && first.body.rev === 1, JSON.stringify(first));
  const second = await save(env, 'fidelity', doc(2), 1);
  ok('écriture suivante sur la bonne révision : 200, révision 2', second.status === 200 && second.body.rev === 2, JSON.stringify(second));
  ok('le document stocké est le dernier', JSON.parse(row(env, 'fidelity').data).model === 'm2');
}

/* ── A · course entre lecture et écriture ─────────────────────────────────── */
{
  const env = freshEnv();
  await save(env, 'fidelity', doc(1), 0);
  env.hooks.afterRead = () => env.sql.prepare("UPDATE store_docs SET data=?, rev=2, updated_ts=? WHERE merchant=? AND feature='fidelity'")
    .run(JSON.stringify(doc(99)), Date.now(), SHOP);
  const lost = await save(env, 'fidelity', doc(2), 1);
  ok('deux appareils au même instant : le second reçoit 409 stale', lost.status === 409 && lost.body.error === 'stale', JSON.stringify(lost));
  ok('… avec la copie du serveur pour fusionner', lost.body.data && lost.body.data.model === 'm99' && lost.body.rev === 2, JSON.stringify(lost.body));
  ok('… et l\'écriture du premier appareil n\'est pas écrasée', JSON.parse(row(env, 'fidelity').data).model === 'm99' && row(env, 'fidelity').rev === 2);
  const retry = await save(env, 'fidelity', doc(3), 2);
  ok('après fusion, la nouvelle tentative sur la révision rendue passe', retry.status === 200 && retry.body.rev === 3, JSON.stringify(retry));
}

/* ── D · première écriture simultanée ─────────────────────────────────────── */
{
  const env = freshEnv();
  env.hooks.afterRead = () => env.sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,'fidelity',?,1,?)")
    .run(SHOP, JSON.stringify(doc(50)), Date.now());
  const lost = await save(env, 'fidelity', doc(1), 0);
  ok('création simultanée : la perdante reçoit 409, pas un écrasement', lost.status === 409 && lost.body.data && lost.body.data.model === 'm50', JSON.stringify(lost));
  ok('la ligne du premier appareil est intacte', JSON.parse(row(env, 'fidelity').data).model === 'm50');
}

/* ── B · team : le miroir d'accès ne bouge pas quand on perd ──────────────── */
{
  const env = freshEnv();
  const member = (id, email, pin) => ({ id, firstName: id, lastName: 'T', email, pinCode: pin, password: pin, function: 'serveur' });
  const first = await save(env, 'team', { members: [member('m1', 'one@t.ma', '1111')] }, 0);
  ok('team : première écriture', first.status === 200, JSON.stringify(first));
  const mirrorBefore = row(env, 'employee-access');
  ok('… le miroir d\'accès porte m1', mirrorBefore && JSON.parse(mirrorBefore.data).members.some((m) => m.id === 'm1'));
  env.hooks.afterRead = () => {
    env.sql.prepare("UPDATE store_docs SET data=?, rev=2, updated_ts=? WHERE merchant=? AND feature='team'")
      .run(JSON.stringify({ members: [member('m2', 'two@t.ma', '2222')] }), Date.now(), SHOP);
    env.sql.prepare("UPDATE store_docs SET data=?, rev=rev+1, updated_ts=? WHERE merchant=? AND feature='employee-access'")
      .run(JSON.stringify({ members: [{ id: 'm2', email: 'two@t.ma', pinCode: '2222', password: '2222', authVersion: 0 }] }), Date.now(), SHOP);
  };
  const lost = await save(env, 'team', { members: [member('m1', 'one@t.ma', '1111'), member('m3', 'three@t.ma', '3333')] }, 1);
  ok('team : la sauvegarde périmée reçoit 409', lost.status === 409 && lost.body.error === 'stale', JSON.stringify(lost));
  const mirror = JSON.parse(row(env, 'employee-access').data).members.map((m) => m.id);
  ok('team : le miroir d\'accès garde les codes de l\'autre appareil (m2), sans m3', mirror.length === 1 && mirror[0] === 'm2', JSON.stringify(mirror));
  const after = await save(env, 'team', { members: [member('m2', 'two@t.ma', '2222'), member('m3', 'three@t.ma', '3333')] }, 2);
  ok('team : la tentative suivante sur la bonne révision passe et réécrit le miroir',
    after.status === 200 && JSON.parse(row(env, 'employee-access').data).members.some((m) => m.id === 'm3'), JSON.stringify(after));
}

/* ── E · cloud-doc : révision par magasin ─────────────────────────────────── */
{
  const src = fs.readFileSync(path.join(ROOT, 'assets/cloud-doc.js'), 'utf8');
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k), key: (i) => Array.from(store.keys())[i], get length() { return store.size; },
  };
  const serverRev = { 'shop-a': 5, 'shop-b': 2 };
  const posts = [];
  const window = { localStorage, KiwiEnv: { isReal: () => true }, addEventListener() {}, dispatchEvent() {} };
  window.window = window;
  const ctx = {
    window, localStorage, console, JSON, Date, Math, Object, Array, String, Promise, setTimeout, clearTimeout,
    document: { visibilityState: 'visible', addEventListener() {} },
    fetch: (url, init) => {
      if (init && init.method === 'POST') {
        const b = JSON.parse(init.body);
        posts.push({ slug: b.merchant, baseRev: b.baseRev });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, rev: b.baseRev + 1 }) });
      }
      const slug = new URL('https://x' + url).searchParams.get('merchant');
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: { items: ['srv-' + slug] }, rev: serverRev[slug] }) });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'cloud-doc.js' });
  let current = 'shop-a';
  let local = { items: ['mine'] };
  const h = window.KiwiCloudDoc.attach({
    feature: 'fidelity', slug: () => current, read: () => local, write: (d) => { local = d; },
  });
  await h.bind();                       // lit shop-a : révision 5
  current = 'shop-b'; await h.bind();   // lit shop-b : révision 2
  current = 'shop-a';                   // retour sur un magasin déjà lu
  ok('la révision exposée suit le magasin courant', h.rev() === 5, String(h.rev()));
  await h.pushNow({ explicit: true, data: { items: ['edit'] } });
  ok('retour sur shop-a : baseRev est la révision de shop-a (5), pas celle de shop-b', posts.length === 1 && posts[0].slug === 'shop-a' && posts[0].baseRev === 5, JSON.stringify(posts));
  current = 'shop-b';
  ok('shop-b garde sa propre révision (2)', h.rev() === 2, String(h.rev()));
}

console.log(failures ? `\n✗ ${failures} échec(s)\n` : '\n✓ store : compare-and-swap partout, tout est vert.\n');
process.exitCode = failures ? 1 : 0;
