// Vision / import : le quota ne se dépense qu'après les contrôles locaux, et
// chaque appel de modèle coûteux se compte (y compris le repêchage prose→JSON
// du plan de salle).
//   · une photo trop grosse, un type illisible, un texte vide ou une URL refusée
//     ne consomment plus une place du jour ;
//   · une demande valide en consomme une (deux pour le plan de salle quand le
//     modèle texte est rappelé pour structurer la prose).
import assert from 'node:assert/strict';
import { fixture } from './server-money-fixture.mjs';
import { onRequestPost as menuImport } from '../functions/api/ai/menu-import.js';
import { onRequestPost as expenseOcr } from '../functions/api/ai/expense-ocr.js';
import { onRequestPost as salleImport } from '../functions/api/ai/salle-import.js';

const root = new URL('..', import.meta.url).pathname;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };

const f = await fixture(root);
let modelCalls = 0, scripted = [];
f.env.AI = { async run() { modelCalls++; const next = scripted.shift(); if (next instanceof Error) throw next; return next || { response: '{}' }; } };
const calls = (kind) => { try { const r = f.sql.prepare('SELECT calls FROM ai_usage_kind WHERE merchant=? AND kind=?').get(f.merchant, kind); return r ? Number(r.calls) : 0; } catch (_) { return 0; } };
const post = async (route, body) => {
  const response = await route({ env: f.env, request: new Request('https://kiwi.test/api/ai/x', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: f.env.__cookie }, body: JSON.stringify({ merchant: f.merchant, ...body }) }) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
// the fixture's owner cookie, built the same way
const { makeSession, SESS_COOKIE } = await import('../functions/auth/_lib.js');
f.env.__cookie = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;

const tiny = 'data:image/png;base64,iVBORw0KGgo=';
const huge = 'data:image/jpeg;base64,' + 'A'.repeat(3_000_000);

// menu-import
for (const [label, body, status] of [
  ['an oversized photo', { kind: 'image', image: huge }, 413],
  ['a non-image data URL', { kind: 'image', image: 'data:text/plain;base64,AAAA' }, 400],
  ['an unsupported kind', { kind: 'pdf' }, 400],
  ['an empty text', { kind: 'text', text: '   ' }, 400],
  ['a refused URL', { kind: 'url', url: 'http://127.0.0.1/menu' }, 400],
]) {
  const r = await post(menuImport, body);
  ok(r.status === status, `menu-import answers ${status} for ${label}`);
  ok(calls('menuimport') === 0 && modelCalls === 0, `menu-import: ${label} spends no quota and calls no model`);
}
scripted = [{ response: JSON.stringify({ currency: 'MAD', items: [{ name: 'Thé', price: 10 }] }) }];
const goodMenu = await post(menuImport, { kind: 'text', text: 'Thé 10 MAD' });
ok(goodMenu.status === 200 && calls('menuimport') === 1, 'menu-import: a valid request spends exactly one slot');

// expense-ocr
for (const [label, body, status] of [
  ['no image', {}, 400],
  ['a non-image string', { image: 'hello' }, 400],
  ['an oversized photo', { image: huge }, 413],
]) {
  const r = await post(expenseOcr, body);
  ok(r.status === status, `expense-ocr answers ${status} for ${label}`);
  ok(calls('expense') === 0, `expense-ocr: ${label} spends no quota`);
}
scripted = [{ response: JSON.stringify({ amount: 12, category: 'marche' }) }];
const goodExpense = await post(expenseOcr, { image: tiny });
ok(goodExpense.status === 200 && calls('expense') === 1, 'expense-ocr: a valid photo spends exactly one slot');

// salle-import
for (const [label, body, status] of [['a non-image', { image: 'nope' }, 400], ['an oversized photo', { image: huge }, 413]]) {
  const r = await post(salleImport, body);
  ok(r.status === status && calls('salleimport') === 0, `salle-import: ${label} (${status}) spends no quota`);
}
modelCalls = 0;
scripted = [
  { response: 'Je vois une salle avec huit tables rondes de quatre places, bien alignées devant.' },
  { response: JSON.stringify({ venue: 'restaurant', tables: [{ shape: 'round', seats: 4, count: 8 }] }) },
];
const rescued = await post(salleImport, { image: tiny });
ok(rescued.status === 200 && rescued.body.ok === true && modelCalls === 2, 'salle-import: the prose rescue ran (two model calls)');
ok(calls('salleimport') === 2, 'salle-import: the rescue call is counted too (' + calls('salleimport') + ' slots)');

// the rescue respects the cap
f.sql.prepare("UPDATE ai_usage_kind SET calls = 19 WHERE merchant=? AND kind='salleimport'").run(f.merchant);
modelCalls = 0;
scripted = [{ response: 'Je vois une salle avec huit tables rondes de quatre places, bien alignées devant.' }];
const capped = await post(salleImport, { image: tiny });
ok(capped.status === 429 && modelCalls === 1, 'salle-import: the rescue is refused once the daily cap is reached (no extra model call)');
f.close();
console.log(`ai-quota-order: ${checks} checks passed`);
