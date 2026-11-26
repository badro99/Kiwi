// Un compte sans nom d'établissement ne désigne aucun magasin (audit du 26 nov. 2026).
//
// L'inscription acceptait business:'' ; /api/pair/create retombait alors sur
// l'e-mail pour nommer le magasin (« -@riad.nour » → riad-nour) et appairait une
// caisse sur un magasin préparé par un opérateur, sans propriétaire inscrit :
// la caisse de l'intrus lisait la paie et écrivait la présence de ce magasin.
// Le même compte se résolvait aussi en 'client', le locataire partagé des
// anciens comptes arabes : POST /api/config le lui faisait réclamer, et
// /api/menu publiait sa carte sous ce slug. Ce fichier rejoue ces chemins sur
// les vraies routes et schema.sql.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };

function makeEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const stmt = (q, p = []) => {
    const st = db.prepare(q);
    return {
      bind(...b) { return stmt(q, b); },
      async first(col) { const r = st.get(...p); return r === undefined ? null : (col ? r[col] : r); },
      async all() { return { results: st.all(...p), meta: {} }; },
      async run() { const r = st.run(...p); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      _exec() { if (/^\s*(select|with)/i.test(q) || /returning/i.test(q)) { const rows = st.all(...p); return { results: rows, meta: { changes: rows.length } }; } const r = st.run(...p); return { results: [], success: true, meta: { changes: Number(r.changes) } }; },
    };
  };
  const DB = { prepare: (q) => stmt(q), async batch(list) { db.exec('BEGIN'); try { const out = list.map((s) => s._exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } }, async exec(q) { db.exec(q); } };
  return { env: { AUTH_SECRET: 'slug-takeover-secret-0123456789-abcdef', DB }, db };
}
const req = (url, { method = 'GET', body, cookies = {} } = {}) => {
  const h = new Headers({ 'CF-Connecting-IP': '203.0.113.9', Origin: 'https://kiwi-os.com' });
  const c = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (c) h.set('Cookie', c);
  if (body !== undefined) h.set('Content-Type', 'application/json');
  return new Request('https://kiwi-os.com' + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
};
const ctx = (env, request) => ({ request, env, waitUntil() {}, next: async () => new Response('next') });

const { env, db } = makeEnv();
const lib = await imp('functions/auth/_lib.js');
const signup = await imp('functions/auth/signup.js');
const create = await imp('functions/api/pair/create.js');
const config = await imp('functions/api/config.js');
const menu = await imp('functions/api/menu.js');
const now = Date.now();
const account = (id, email, business, created = now) => db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)').run(id, email, 'x', business, 's', 'h', created);
const sessionOf = async (id) => ({ kiwi_sess: await lib.makeSession(id, env.AUTH_SECRET) });

// 1 · L'inscription exige le nom du commerce.
const su = await signup.onRequestPost(ctx(env, req('/auth/signup', { method: 'POST', body: { email: '-@riad.nour', name: 'x', business: '', password: 'Zr9!vq-Lm27#xTpa' } })));
ok(su.status === 400 && (await su.json()).error === 'business', 'signup refuses an account with no business name');
ok(!db.prepare("SELECT 1 FROM accounts WHERE email = '-@riad.nour'").get(), 'and creates no account');

// 2 · Un compte ancien sans nom (il en reste un en prod, sans magasin) ne réclame rien.
db.prepare("INSERT INTO merchant_config (merchant, features, name, type, updated_ts) VALUES ('riad-nour','{}','Riad Nour','restaurant',?)").run(now);
account('acc-blank', '-@riad.nour', '');
const blank = await sessionOf('acc-blank');
ok(await lib.accountSlug(env, '', 'acc-blank') === '', 'accountSlug of a blank business is no store, never the shared client');
let r = await create.onRequestPost(ctx(env, req('/api/pair/create', { method: 'POST', body: {}, cookies: blank })));
ok(r.status === 403 && !db.prepare('SELECT 1 FROM pairings').get(), 'a blank account gets no pairing code, from its e-mail or otherwise');
db.prepare("INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES ('acc-old','old@x.ma','o','مقهى الأطلس','s','h',1700000000000)").run();
db.prepare("INSERT INTO merchant_config (merchant, features, name, type, account_id, updated_ts) VALUES ('client','{}','مقهى','restaurant','acc-old',?)").run(now);
r = await config.onRequestPost(ctx(env, req('/api/config', { method: 'POST', cookies: blank, body: {} })));
ok(r.status === 403 && db.prepare("SELECT account_id FROM merchant_config WHERE merchant='client'").get().account_id === 'acc-old', 'a blank account cannot claim the legacy client store through /api/config');
r = await menu.onRequestPost(ctx(env, req('/api/menu', { method: 'POST', cookies: blank, body: { type: 'restaurant', name: 'Hacked', data: { cats: [{ id: 'c1', name: 'Plats' }], items: [{ id: 'i1', cat: 'c1', name: 'Tajine', price: 1 }] } } })));
ok(r.status >= 400 && !db.prepare("SELECT 1 FROM menus WHERE merchant = 'client'").get(), 'nor publish a menu under client');

// 3 · Une ligne du registre sans propriétaire n'est à personne, même pour un compte qui porte ce nom.
account('acc-riad', 'riad@x.ma', 'Riad Nour');
r = await create.onRequestPost(ctx(env, req('/api/pair/create', { method: 'POST', body: {}, cookies: await sessionOf('acc-riad') })));
ok(r.status === 403 && !db.prepare("SELECT 1 FROM pairings WHERE merchant = 'riad-nour'").get(), 'an operator-prepared store with no owner is not paired by a session that only shares its name');

// 4 · Le chemin normal reste ouvert : le propriétaire inscrit appaire sa caisse.
account('acc-atlas', 'atlas@x.ma', 'Atlas Cafe');
db.prepare("INSERT INTO merchant_config (merchant, features, name, type, account_id, updated_ts) VALUES ('atlas-cafe','{}','Atlas Cafe','restaurant','acc-atlas',?)").run(now);
r = await create.onRequestPost(ctx(env, req('/api/pair/create', { method: 'POST', body: {}, cookies: await sessionOf('acc-atlas') })));
ok(r.status === 200 && db.prepare("SELECT merchant FROM pairings WHERE used_ts IS NULL").get().merchant === 'atlas-cafe', 'the registered owner still pairs a till on its own store');

// 5 · Deux comptes au même nom : la carte n'est qu'à celui que le registre nomme.
account('acc-twin', 'twin@x.ma', 'Atlas Cafe');
r = await menu.onRequestPost(ctx(env, req('/api/menu', { method: 'POST', cookies: await sessionOf('acc-twin'), body: { type: 'restaurant', name: 'Twin', data: { cats: [{ id: 'c1', name: 'Plats' }], items: [{ id: 'i1', cat: 'c1', name: 'Tajine', price: 1 }] } } })));
ok(r.status >= 400 && !db.prepare("SELECT 1 FROM menus WHERE merchant = 'atlas-cafe'").get(), 'a same-named second account cannot publish the registered owner\'s menu');
r = await menu.onRequestPost(ctx(env, req('/api/menu', { method: 'POST', cookies: await sessionOf('acc-atlas'), body: { type: 'restaurant', name: 'Atlas', data: { cats: [{ id: 'c1', name: 'Plats' }], items: [{ id: 'i1', cat: 'c1', name: 'Tajine', price: 1 }] } } })));
ok(r.status === 200 && db.prepare("SELECT 1 FROM menus WHERE merchant = 'atlas-cafe'").get(), 'the owner publishes its own menu as before');

console.log(`✓ account-slug-takeover-test : ${checks} contrôles (inscription sans nom refusée, aucun magasin par l'e-mail, registre sans propriétaire fermé, homonymes séparés)`);
