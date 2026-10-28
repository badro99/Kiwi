#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · « Scanner un menu » : la ROUTE tourne, elle n'est pas lue.
 *
 *   node tools/menu-scan-route-test.mjs
 *
 * POST /api/ai/menu-import est appelé pour de bon, sur une base SQLite en
 * mémoire construite depuis schema.sql et un binding AI simulé. Chaque contrat
 * que tools/menu-scan-test.mjs vérifiait par expression régulière sur la source
 * (auth, quota par établissement, modèles @cf/, bornes d'image, js-only,
 * silence du journal) est ici observé dans une réponse (vague 12).
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as route from '../functions/api/ai/menu-import.js';
import { DAILY_CAPS } from '../functions/api/ai/_quota.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { let args = []; return {
  bind(...v) { args = v.map(x => x === undefined ? null : x); return this; },
  first() { return sqlite.prepare(sql).get(...args) || null; },
  all() { return { results: sqlite.prepare(sql).all(...args) }; },
  run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
}; } };
const secret = 'synthetic-menu-scan-only';
const merchant = 'menu-scan-fixture', other = 'menu-scan-other';
for (const m of [merchant, other]) sqlite.prepare("INSERT INTO merchant_config(merchant, features, status, updated_ts) VALUES (?, ?, 'active', ?)").run(m, '{}', Date.now());
const cookieFor = async (m) => `${TILL_COOKIE}=${await tillToken(secret, m)}`;
const cookie = await cookieFor(merchant);

let calls = [], aiAnswer;
const env = { DB, AUTH_SECRET: secret, AI: { async run(model, payload, opts) { calls.push({ model, payload, opts }); return aiAnswer(model, payload); } } };
const items = (list) => ({ response: JSON.stringify({ currency: 'MAD', items: list }) });
async function post(body, { auth = cookie, e = env, raw, as = merchant } = {}) {
  if (body && body.merchant === undefined) body = { merchant: as, ...body };
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Cookie = auth;
  const r = await route.onRequestPost({ request: new Request('https://kiwi.test/api/ai/menu-import', { method: 'POST', headers, body: raw ?? JSON.stringify(body) }), env: e });
  return { status: r.status, model: r.headers.get('x-kiwi-ai-model'), body: await r.json() };
}
let n = 0;
let say = console.log;
const ok = async (label, fn) => { await fn(); n++; say('  ✓ ' + label); };
console.log('■ Menu scan route (tools/menu-scan-route-test.mjs)');
const logs = [], realLog = console.log.bind(console);
for (const k of ['log', 'info', 'warn', 'error']) console[k] = (...a) => { logs.push([k, a]); };
say = (...a) => realLog(...a);

const bigImage = 'data:image/jpeg;base64,' + 'A'.repeat(64);

await ok('401 sans session ni appairage, 400 sans corps lisible, 503 sans binding AI', async () => {
  assert.deepEqual((await post({ kind: 'text', text: 'x' }, { auth: '' })).body, { ok: false, error: 'auth' });
  assert.equal((await post(null, { raw: 'pas du json' })).status, 400);
  assert.equal((await post({ kind: 'text', text: 'x' }, { e: { ...env, AI: undefined } })).status, 503);
  assert.equal(calls.length, 0, 'aucun appel modèle sans autorisation');
});
await ok('une forme inconnue, un texte vide, une image qui n\'en est pas une et un lien interdit sont refusés avant le modèle', async () => {
  assert.equal((await post({ kind: 'pdf' })).body.error, 'unsupported-kind');
  assert.equal((await post({ kind: 'text', text: '   ' })).body.error, 'empty-text');
  assert.equal((await post({ kind: 'image', image: 'data:text/html;base64,AAAA' })).body.error, 'bad-image');
  assert.equal((await post({ kind: 'url', url: 'https://localhost/menu' })).body.error, 'bad-url');
  assert.equal((await post({ kind: 'url', url: 'http://oddmenu.com/menu' })).body.error, 'bad-url');
  assert.equal(calls.length, 0);
});
await ok('une image trop lourde : 413, sans appel au modèle', async () => {
  const r = await post({ kind: 'image', image: 'data:image/png;base64,' + 'A'.repeat(4_000_000) });
  assert.equal(r.status, 413); assert.equal(r.body.error, 'image-too-big'); assert.equal(calls.length, 0);
});
await ok('un texte de carte : articles bornés rendus, modèle texte @cf/ par la passerelle kiwi, modèle annoncé en en-tête', async () => {
  aiAnswer = () => items([{ name: 'Tajine', price: '95.567', cat: 'Plats' }, { name: 'X'.repeat(300), price: 1e9 }, { price: 3 }]);
  const r = await post({ kind: 'text', text: 'Tajine 95' });
  assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.count, 2);
  assert.equal(r.body.items[0].price, 95.57); assert.equal(r.body.items[1].name.length, 120); assert.equal(r.body.items[1].price, 99999);
  assert.equal(calls.length, 1); assert.equal(calls[0].model, route.MODEL); assert.match(calls[0].model, /^@cf\//);
  assert.deepEqual(calls[0].opts, { gateway: { id: 'kiwi', cacheTtl: 0 } });
  assert.equal(r.model, route.MODEL);
});
await ok('le modèle de secours prend le relais, et c\'est lui que l\'en-tête annonce', async () => {
  calls = []; aiAnswer = (m) => { if (m === route.MODEL) throw new Error('boom'); return items([{ name: 'Thé', price: 24 }]); };
  const r = await post({ kind: 'text', text: 'Thé 24' });
  assert.equal(r.body.ok, true); assert.deepEqual(calls.map(c => c.model), [route.MODEL, route.FALLBACK_MODEL]); assert.equal(r.model, route.FALLBACK_MODEL);
  for (const m of [route.MODEL, route.FALLBACK_MODEL, route.VISION_MODEL, route.VISION_FALLBACK_MODEL]) assert.match(m, /^@cf\//);
});
await ok('une photo passe par le modèle vision, puis son secours ; les deux hors service : 200 reason model, jamais un 5xx', async () => {
  calls = []; aiAnswer = () => items([{ name: 'Café', price: 12 }]);
  let r = await post({ kind: 'image', image: bigImage });
  assert.equal(r.body.ok, true); assert.equal(calls[0].model, route.VISION_MODEL); assert.equal(r.model, route.VISION_MODEL);
  calls = []; aiAnswer = (m) => { if (m === route.VISION_MODEL) throw new Error('down'); return items([{ name: 'Café', price: 12 }]); };
  r = await post({ kind: 'image', image: bigImage });
  assert.equal(r.body.ok, true); assert.deepEqual(calls.map(c => c.model), [route.VISION_MODEL, route.VISION_FALLBACK_MODEL]);
  aiAnswer = () => { throw new Error('down'); };
  r = await post({ kind: 'image', image: bigImage });
  assert.equal(r.status, 200); assert.equal(r.body.ok, false); assert.equal(r.body.reason, 'model');
});
await ok('une réponse du modèle sans article : 200 reason unparsed (le client propose le repli)', async () => {
  aiAnswer = () => ({ response: 'je ne sais pas' });
  let r = await post({ kind: 'text', text: 'blabla' });
  assert.equal(r.status, 200); assert.equal(r.body.reason, 'unparsed');
  aiAnswer = () => items([]);
  r = await post({ kind: 'text', text: 'blabla' });
  assert.equal(r.body.reason, 'unparsed');
});
await ok('un lien public est lu (texte extrait), une page JavaScript-only répond js-only, le modèle n\'est pas appelé pour elle', async () => {
  const realFetch = globalThis.fetch;
  try {
    const page = (html) => async () => new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
    calls = []; aiAnswer = () => items([{ name: 'Pizza', price: 70 }]);
    globalThis.fetch = page('<body><h1>CARTE</h1>' + '<li>Pizza 70 MAD</li>'.repeat(20) + '</body>');
    let r = await post({ kind: 'url', url: 'https://oddmenu.com/p/carte' });
    assert.equal(r.body.ok, true); assert.equal(calls.length, 1); assert.match(JSON.stringify(calls[0].payload), /Pizza 70 MAD/);
    calls = [];
    globalThis.fetch = page('<html><body><div id="root"></div><script>app()</script></body></html>');
    r = await post({ kind: 'url', url: 'https://oddmenu.com/p/spa' });
    assert.deepEqual(r.body, { ok: false, reason: 'js-only' }); assert.equal(calls.length, 0);
    globalThis.fetch = async () => new Response('', { status: 302, headers: { Location: 'https://127.0.0.1/admin' } });
    r = await post({ kind: 'url', url: 'https://oddmenu.com/p/redirect' });
    assert.equal(r.body.reason, 'url-forbidden', 'une redirection vers une adresse privée est refusée');
  } finally { globalThis.fetch = realFetch; }
});
await ok('le quota est par établissement et par type : 60 appels « menuimport », le 61e est refusé, un autre établissement garde les siens', async () => {
  assert.equal(DAILY_CAPS.menuimport, 60);
  const used = sqlite.prepare("SELECT calls FROM ai_usage_kind WHERE merchant = ? AND kind = 'menuimport'").get(merchant).calls;
  // Un texte vide est refusé avant le quota (vision#1) : on le consomme avec de vrais appels.
  for (let i = used; i < 60; i++) assert.notEqual((await post({ kind: 'text', text: 'x' })).status, 429, 'appel ' + (i + 1));
  const over = await post({ kind: 'text', text: 'x' });
  assert.equal(over.status, 429); assert.equal(over.body.error, 'quota');
  aiAnswer = () => items([{ name: 'Thé', price: 24 }]);
  assert.equal((await post({ kind: 'text', text: 'Thé' }, { auth: await cookieFor(other), as: other })).body.ok, true);
});
await ok('la route ne journalise jamais le contenu d\'un menu', () => { assert.deepEqual(logs, []); });
await ok('les contrôles ne dépendent pas de la source : la route exporte bien ce que le test exécute', () => {
  for (const k of ['onRequestPost', 'urlAllowed', 'htmlToText', 'validateMenuItems', 'MODEL', 'FALLBACK_MODEL', 'VISION_MODEL', 'VISION_FALLBACK_MODEL']) assert.ok(k in route, k);
});
say(`✓ ${n} menu scan route checks green`);
