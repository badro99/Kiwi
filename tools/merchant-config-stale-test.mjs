#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
 * Kiwi · une réponse /api/config lente ne s'applique pas à un autre magasin.
 *
 *   node tools/merchant-config-stale-test.mjs
 *
 * Le commerçant passe de la boutique au restaurant pendant que /api/config de la
 * boutique est encore en vol : la réponse arrivait en dernier et posait le type,
 * les modules et la liste du personnel de la boutique sur le restaurant affiché.
 * fetchConfig() (assets/merchant-config.js, extrait du fichier livré) prend
 * maintenant un ticket et retient le magasin demandé : la réponse est jetée si
 * une requête plus récente est partie, ou si le magasin à l'écran a changé.
 * ═════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/merchant-config.js'), 'utf8');

let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' introuvable');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

/* fetchConfig tel que livré (avec son compteur) ; le reste est remplacé. */
function harness({ scoped = false } = {}) {
  const calls = { applyServerType: [], applyFeatures: 0, pins: [] };
  const st = { slug: 'boutique', merchant: 'boutique', pending: [] };
  const code = [
    'let lastSlug = "", lastMerchant = "";',
    'const cfg = { features: {}, pins: [], type: "" };',
    'const document = { dispatchEvent() {} }; function CustomEvent() {}',
    'function setTimeout() {}',
    'function storeSlug() { return st.slug; } function merchant() { return st.merchant; } function isScoped() { return scoped; }',
    'function configUrl() { return "/api/config?merchant=" + st.slug; }',
    'function rememberPins(p) { calls.pins.push(p); } function reportTillZone() {} function adoptTillCutoff() {}',
    'function applyFeatures() { calls.applyFeatures++; } function applyServerType() { calls.applyServerType.push(cfg.type); }',
    'const fetch = () => new Promise((res) => st.pending.push(res));',
    'var fetchSeq = 0;',
    grab(SRC, 'function fetchConfig()'),
    'return { fetchConfig, cfg };',
  ].join('\n');
  const api = new Function('st', 'calls', 'scoped', code)(st, calls, scoped);
  const answer = (i, data) => st.pending[i]({ ok: true, json: () => Promise.resolve(data) });
  return { api, st, calls, answer };
}
const boutique = { type: 'boutique', features: { stock: true }, pins: [{ name: 'Sara', role: 'caissier' }] };
const resto = { type: 'restaurant', features: { tables: true }, pins: [{ name: 'Omar', role: 'serveur' }] };
const tick = () => new Promise((r) => setImmediate(r));

await ok('réponse normale : appliquée', async () => {
  const h = harness();
  const p = h.api.fetchConfig(); h.answer(0, boutique);
  assert.equal(await p, true);
  assert.equal(h.api.cfg.type, 'boutique');
});

await ok('magasin changé pendant le vol : la réponse de l’ancien est jetée', async () => {
  const h = harness();
  const slow = h.api.fetchConfig();           // boutique, lente
  h.st.slug = 'restaurant'; h.st.merchant = 'restaurant';
  const fresh = h.api.fetchConfig();          // restaurant
  h.answer(1, resto);
  assert.equal(await fresh, true);
  h.answer(0, boutique);                      // la boutique arrive EN DERNIER
  assert.equal(await slow, false);
  assert.equal(h.api.cfg.type, 'restaurant', 'le type du restaurant n’est pas écrasé');
  assert.deepEqual(h.api.cfg.pins, resto.pins, 'la liste du personnel non plus');
  assert.deepEqual(h.calls.applyServerType, ['restaurant']);
});

await ok('magasin changé et AUCUNE nouvelle requête : la réponse périmée n’est pas appliquée', async () => {
  const h = harness();
  const slow = h.api.fetchConfig();
  h.st.slug = 'restaurant';
  h.answer(0, boutique);
  assert.equal(await slow, false);
  assert.equal(h.api.cfg.type, '');
  assert.equal(h.calls.applyFeatures, 0);
});

await ok('deux requêtes pour le même magasin : seule la plus récente s’applique', async () => {
  const h = harness();
  const a = h.api.fetchConfig(), b = h.api.fetchConfig();
  h.answer(1, Object.assign({}, boutique, { type: 'epicerie' }));
  await b; h.answer(0, boutique); await a;
  assert.equal(h.api.cfg.type, 'epicerie');
});

await ok('vue opérateur (scoped) : la réponse n’est pas jetée quand le slug se confirme après l’envoi', async () => {
  const h = harness({ scoped: true });
  h.st.slug = '';                              // slug pas encore confirmé à l’envoi
  const p = h.api.fetchConfig();
  h.st.slug = 'client-x';                      // confirmé pendant le vol
  h.answer(0, resto);
  assert.equal(await p, true);
  assert.equal(h.api.cfg.type, 'restaurant');
});

await ok('le code livré garde le ticket et la comparaison de magasin', () => {
  const body = grab(SRC, 'function fetchConfig()');
  assert.ok(/ticket !== fetchSeq/.test(body) && /storeSlug\(\) !== askedSlug/.test(body));
});

await tick();
console.log(`\n${failed ? '✗' : '✓'} merchant-config-stale : ${passed} ok, ${failed} en échec`);
process.exit(failed ? 1 : 0);
