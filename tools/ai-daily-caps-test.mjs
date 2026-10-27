// Plafonds AI du jour : une seule table (DAILY_CAPS de functions/api/ai/_quota.js).
//   · chaque route AI lit son plafond dans la table (aucun nombre écrit dans la route) ;
//   · les chiffres sont ceux d'avant la centralisation ;
//   · au plafond, la route répond 429 avec un JSON que l'interface affiche tel quel
//     (phrase FR/EN/AR, plafond, type d'appel), et garde le code d'erreur historique ;
//   · sous le plafond, l'appel passe le contrôle de quota.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './server-money-fixture.mjs';
import { makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { DAILY_CAPS, QUOTA_MESSAGES, quotaBody, quotaDay, ensureAiUsageSchema } from '../functions/api/ai/_quota.js';

const root = new URL('..', import.meta.url).pathname;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };

const tiny = 'data:image/png;base64,iVBORw0KGgo=';
const sha = 'a'.repeat(64);

/* file, kind (clé de DAILY_CAPS), code historique, plafond d'avant, corps valide jusqu'au contrôle de quota */
const ROUTES = [
  ['ask', 'ask', 'quota', 200, { messages: [{ role: 'user', content: 'bonjour' }] }],
  ['intake', 'intake', 'daily-quota-exceeded', 100, { action: 'commit', sha256: sha, mime: 'application/pdf', size: 1000, docType: 'supplier_invoice' }],
  ['invoice', 'invoice', 'quota', 200, { text: 'Facture 1' }],
  ['menu-import', 'menuimport', 'quota', 60, { kind: 'text', text: 'Thé 10 MAD' }],
  ['menu-translate', 'menutranslate', 'quota', 120, { targetLang: 'en' }],
  ['salle-import', 'salleimport', 'quota', 20, { image: tiny }],
  ['voice', 'transcribe', 'quota', 100, { audio: 'AAAA' }],
  ['vision-inspect', 'visioninspect', 'quota', 150, { image: tiny }],
  ['whatsapp-campaign', 'campaign', 'daily-quota-exceeded', 60, {}],
  ['product-scan', 'product', 'daily-quota-exceeded', 150, { image: tiny }],
  ['reservation-parse', 'reservation', 'daily-quota-exceeded', 200, { text: 'table pour 4' }],
  ['prep-forecast', 'prepforecast', 'daily-quota-exceeded', 60, {}],
  ['menu-rank', 'menurank', 'daily-quota-exceeded', 200, {}],
  ['audio-order', 'audioorder', 'daily-quota-exceeded', 150, { text: 'deux thés' }],
  ['pressing-defect', 'pressing', 'daily-quota-exceeded', 150, { image: tiny }],
  ['recipe-suggest', 'recipe', 'daily-quota-exceeded', 100, { text: 'tajine' }],
  ['menu-operations', 'menuoperations', 'daily-quota-exceeded', 60, { kind: 'inspect' }],
  ['shift-debrief', 'debrief', 'daily-quota-exceeded', 100, { text: 'service calme' }],
  ['product-enhance', 'productenhance', 'daily-quota-exceeded', 100, { image: tiny }],
  ['tpe-reconcile', 'tpe', 'daily-quota-exceeded', 100, { image: tiny }],
  ['expense-ocr', 'expense', 'daily-quota-exceeded', 200, { image: tiny }],
  ['loss-watchdog', 'watchdog', 'daily-quota-exceeded', 100, {}],
  ['invoice-match', 'invoicematch', 'daily-quota-exceeded', 150, {}],
  ['planning-generate', 'planning', 'daily-quota-exceeded', 60, {}],
];

const f = await fixture(root);
f.env.AI = { async run() { throw new Error('model must not run on a refused or unreached call'); } };
f.env.__cookie = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;
await ensureAiUsageSchema(f.env.DB);
const day = await quotaDay(f.env.DB, f.merchant);
const setCalls = (kind, n) => {
  f.sql.prepare('DELETE FROM ai_usage_kind WHERE merchant=? AND kind=?').run(f.merchant, kind);
  f.sql.prepare('INSERT INTO ai_usage_kind(merchant,day,kind,calls) VALUES(?,?,?,?)').run(f.merchant, day, kind, n);
};
const post = async (route, body) => {
  const response = await route({ env: f.env, request: new Request('https://kiwi.test/api/ai/x', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: f.env.__cookie },
    body: JSON.stringify({ merchant: f.merchant, ...body }) }) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

for (const [file, kind, legacyError, was, body] of ROUTES) {
  const { onRequestPost } = await import(`../functions/api/ai/${file}.js`);
  ok(DAILY_CAPS[kind] === was, `${file}: the shared table keeps the cap of ${was} for "${kind}"`);
  setCalls(kind, DAILY_CAPS[kind]);
  const refused = await post(onRequestPost, body);
  ok(refused.status === 429, `${file}: a spent day answers 429`);
  ok(refused.body.error === legacyError && refused.body.ok === false, `${file}: the error code stays "${legacyError}"`);
  ok(refused.body.kind === kind && refused.body.cap === was, `${file}: the answer names the call kind and the cap (${was})`);
  ok(['fr', 'en', 'ar'].every((l) => typeof refused.body.message?.[l] === 'string' && refused.body.message[l].length > 10), `${file}: the answer carries a plain sentence in FR, EN and AR`);
  const used = Number(f.sql.prepare('SELECT calls FROM ai_usage_kind WHERE merchant=? AND kind=?').get(f.merchant, kind).calls);
  ok(used === DAILY_CAPS[kind], `${file}: a refused call does not push the counter past the cap`);
}

// Sous le plafond : le dernier appel du jour passe le quota (product-scan répond ensuite 400, photo absente).
{
  const { onRequestPost } = await import('../functions/api/ai/product-scan.js');
  setCalls('product', DAILY_CAPS.product - 1);
  const last = await post(onRequestPost, {});
  ok(last.status === 400 && last.body.error === 'image-required', 'product-scan: one call left in the day gets past the quota check');
  const next = await post(onRequestPost, { image: tiny });
  ok(next.status === 429, 'product-scan: the call after the last one is refused');
}

// La phrase est la même que celle que `quotaBody` fabrique : l'interface n'en lit qu'une.
const body = quotaBody('salleimport');
ok(body.message.fr === QUOTA_MESSAGES.fr && body.message.en === QUOTA_MESSAGES.en && body.message.ar === QUOTA_MESSAGES.ar && body.cap === 20, 'quotaBody carries the shared sentences and the cap');
body.message.fr = 'changé';
ok(quotaBody('salleimport').message.fr === QUOTA_MESSAGES.fr, 'quotaBody hands out a copy, not the shared sentences');
ok(!/[—]/.test(Object.values(QUOTA_MESSAGES).join('')), 'the sentences carry no em dash');

// Aucune route AI ne garde un plafond écrit dans son fichier (une seule assertion sur l'ensemble).
const dir = path.join(root, 'functions/api/ai');
const hardCoded = fs.readdirSync(dir).filter((n) => n.endsWith('.js')
  && /(?:const|let)\s+(?:[A-Z_]*DAILY_CAP[A-Z_]*)\s*=\s*\d/.test(fs.readFileSync(path.join(dir, n), 'utf8')));
ok(hardCoded.length === 0, 'no AI route hard-codes a daily cap' + (hardCoded.length ? ': ' + hardCoded.join(', ') : ''));

f.close();
console.log(`ai-daily-caps: ${checks} checks`);
