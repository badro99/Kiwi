/* Vue opérateur · la copie locale d'un autre commerce n'est qu'un cache.
 *
 * 19 nov. 2026, Browse : le propriétaire ouvre la caisse de Browse depuis la
 * console (kiwi-caisse?op=1&merchant=browse). Ce navigateur gardait un plan de
 * salle de Browse vieux de trois mois (25 tables, sans les banquettes) et son
 * signet de révision d'août. Au premier contact, cloud-doc a FUSIONNÉ cette
 * vieille copie avec celle du serveur et l'a repoussée : le plan que l'équipe
 * venait de dessiner (26 tables, 3 banquettes) a été remplacé. Il a fallu le
 * restaurer depuis l'historique.
 *
 * Règle tenue ici : en vue opérateur (caisse ou tableau de bord), quand la
 * copie locale est en retard sur le serveur, on ADOPTE le serveur, on ne
 * remonte rien et on oublie les marques « modifié » / « refusé » laissées par
 * une ancienne visite. Une saisie faite ensuite par l'opérateur part, elle,
 * normalement. Une vraie caisse du commerce garde son comportement : sa saisie
 * hors ligne est du travail, pas un cache.
 *   node tools/cloud-doc-operator-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets', 'cloud-doc.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

const SERVER_PLAN = { tables: [{ id: 't1' }, { id: 't2' }, { id: 't26' }], elements: [{ id: 'b1', kind: 'banquette' }] };
const STALE_PLAN = { tables: [{ id: 't1' }, { id: 'old-t9' }], elements: [{ id: 'm1', kind: 'mur' }] };
const TAIL = 'floorplan:browse';

/* One browser: its localStorage (shared Map), its sessionStorage, how it is
   opened (operator till, operator dashboard, or the merchant's own till). */
function browser({ store, session, scopedSlug }, server) {
  const posts = [];
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k), key: (i) => Array.from(store.keys())[i] || null, get length() { return store.size; },
  };
  const sessionStorage = {
    getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k),
  };
  const document = { visibilityState: 'visible', addEventListener() {} };
  const window = { document, localStorage, sessionStorage, KiwiEnv: { isReal: () => true }, addEventListener() {},
    KiwiVenue: scopedSlug ? { getVenueData: (id) => (id === 'scoped' ? { id: 'scoped', slug: scopedSlug } : null) } : undefined };
  window.window = window;
  const fetch = (url, opts) => {
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      posts.push(body);
      if (body.baseRev !== server.rev) return Promise.resolve(res(409, { error: 'conflict', rev: server.rev, data: server.data }));
      server.rev += 1; server.data = body.data;
      return Promise.resolve(res(200, { ok: true, rev: server.rev }));
    }
    return Promise.resolve(res(200, { feature: 'floorplan', merchant: 'browse', rev: server.rev, data: JSON.parse(JSON.stringify(server.data)) }));
  };
  new Function('window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'setTimeout', 'clearTimeout', SOURCE)(
    window, document, localStorage, sessionStorage, fetch, setTimeout, clearTimeout);
  let local = JSON.parse(JSON.stringify(STALE_PLAN));
  const handle = window.KiwiCloudDoc.attach({ feature: 'floorplan', slug: () => 'browse', read: () => local, write: (next) => { local = next; } });
  return { handle, posts, local: () => local, setLocal: (v) => { local = v; } };
}

/* A browser that saw Browse in August: bookmark at an old revision, and a
   « modifié » mark that never left. */
function staleStore() {
  return new Map([['kiwiDocRev:v1:' + TAIL, '1200|1755700000000'], ['kiwiDocDirty:v1:' + TAIL, 'aug:old']]);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

{
  const server = { rev: 1535, data: JSON.parse(JSON.stringify(SERVER_PLAN)) };
  const store = staleStore();
  const b = browser({ store, session: new Map([['kiwi:tillOperator:v1', 'browse']]) }, server);
  await b.handle.pull(true); await wait();
  ok(b.posts.length === 0, 'operator till: a stale local plan is never pushed over the server');
  ok(server.rev === 1535 && same(server.data, SERVER_PLAN), 'operator till: the server plan is untouched');
  ok(same(b.local(), SERVER_PLAN), 'operator till: the screen shows the server plan, nothing from the old copy');
  ok(!store.has('kiwiDocDirty:v1:' + TAIL), 'operator till: the old « modifié » mark is dropped');
  ok(String(store.get('kiwiDocRev:v1:' + TAIL)).startsWith('1535|'), 'operator till: the bookmark now matches the server');

  /* After adopting, an edit the operator makes on purpose still saves. */
  b.setLocal({ tables: [...SERVER_PLAN.tables, { id: 't27' }], elements: SERVER_PLAN.elements });
  b.handle.push(0); await wait(60);
  ok(b.posts.length === 1 && b.posts[0].baseRev === 1535, 'operator till: a deliberate edit after adopting saves on the current revision');
  ok(server.rev === 1536 && server.data.tables.length === 4, 'operator till: that edit reaches the server');
}

{
  const server = { rev: 1535, data: JSON.parse(JSON.stringify(SERVER_PLAN)) };
  const b = browser({ store: staleStore(), session: new Map(), scopedSlug: 'browse' }, server);
  await b.handle.pull(false); await wait();
  ok(b.posts.length === 0 && same(server.data, SERVER_PLAN), 'operator dashboard (scoped view): same rule, nothing pushed');
  ok(same(b.local(), SERVER_PLAN), 'operator dashboard (scoped view): local copy replaced by the server');
}

{
  /* The operator flag names ANOTHER store: this browser is not looking at Browse as an operator. */
  const server = { rev: 1535, data: JSON.parse(JSON.stringify(SERVER_PLAN)) };
  const b = browser({ store: staleStore(), session: new Map([['kiwi:tillOperator:v1', 'santos-store']]) }, server);
  await b.handle.pull(false); await wait(60);
  ok(b.posts.length >= 1, 'an operator flag for another store does not change Browse\'s own sync');
}

{
  /* Browse's own till, offline edits waiting: unchanged, its work is merged and sent. */
  const server = { rev: 1535, data: JSON.parse(JSON.stringify(SERVER_PLAN)) };
  const b = browser({ store: staleStore(), session: new Map() }, server);
  await b.handle.pull(false); await wait(60);
  ok(b.posts.length >= 1, 'the merchant\'s own till still sends its pending local work');
  ok(server.data.tables.some((t) => t.id === 'old-t9') && server.data.tables.some((t) => t.id === 't26'),
    'the merchant\'s own till still merges both copies');
}

console.log(`cloud-doc-operator: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
