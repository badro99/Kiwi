#!/usr/bin/env node
/* Un modèle retiré par Cloudflare ne doit ni rester dans une route, ni manger
 * le budget du jour. Le 21 nov. 2026 Qwen 3 (retiré le 20, réponse 410
 * « Model has been deprecated ») ouvrait chaque appel texte et y gardait sa
 * réservation : 31 traductions de carte avaient porté le compteur commun à
 * 9 869 neurones pour 374 réellement facturés, et l'assistant photo d'Amira
 * Boutique répondait 429. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AI = path.join(ROOT, 'functions/api/ai');
const load = (f) => import(new URL('file://' + path.join(AI, f)).href);
const M = await load('_models.js');
const { quotaOk } = await load('_quota.js');
const { budgets, estimateNeurons } = await load('_neurons.js');
const { runWithFallback, thinkingOff } = await load('_run.js');
const { budgetRoute } = await load('_budget-route.js');
let passed = 0;
const ok = (v, m) => { assert.ok(v, m); passed++; };

/* ── 1 · aucune route n'appelle Qwen ─────────────────────────────────────── */
const RETIRED = [M.QWEN];
ok(!RETIRED.includes(M.TEXT_PRIMARY) && !RETIRED.includes(M.TEXT_FALLBACK), 'le couple texte ne contient aucun modèle retiré');
ok(M.TEXT_PRIMARY !== M.TEXT_FALLBACK, 'le secours texte est un autre modèle que le principal');
for (const f of fs.readdirSync(AI).filter((n) => n.endsWith('.js') && !n.startsWith('_'))) {
  const mod = await load(f);
  for (const [k, v] of Object.entries(mod)) {
    if (typeof v === 'string' && v.startsWith('@cf/')) ok(!RETIRED.includes(v), `${f} · ${k} n'est pas un modèle retiré (${v})`);
  }
  const src = fs.readFileSync(path.join(AI, f), 'utf8');
  ok(!/\bQWEN\b|qwen3-30b/.test(src), `${f} ne nomme pas Qwen`);
}

/* ── 2 · DeepSeek répond sans réfléchir, Gemma aussi ─────────────────────── */
const ds = thinkingOff(M.DEEPSEEK_FLASH, { messages: [{ role: 'user', content: 'x' }], chat_template_kwargs: { keep: 1 } });
ok(ds.chat_template_kwargs.thinking === false && ds.chat_template_kwargs.keep === 1, 'DeepSeek : chat_template_kwargs.thinking=false, le reste gardé');
ok(thinkingOff(M.GEMMA_VISION, { messages: [] }).chat_template_kwargs.enable_thinking === false, 'Gemma : enable_thinking=false');

/* ── 3 · un refus « modèle retiré » rend sa réservation ──────────────────── */
const db = new DatabaseSync(':memory:');
const env = { DB: { prepare(sql) { let args; return { bind(...a) { args = a; return this; },
  async first() { return db.prepare(sql).get(...args) || null; },
  async run() { return db.prepare(sql).run(...(args || [])); } }; } } };
const used = (m) => db.prepare("SELECT calls FROM ai_usage_kind WHERE merchant=? AND kind='neurons'").get(m)?.calls || 0;
const fallbackCost = estimateNeurons({ models: [M.TEXT_FALLBACK], maxTokens: 700 });

let calls = [];
env.AI = { async run(model) {
  calls.push(model);
  if (model === M.TEXT_PRIMARY) throw new Error('AiError: Model has been deprecated: ' + model + ' was deprecated on 2026-11-20.');
  return { response: '{"ok":true}', usage: undefined };
} };
const route = budgetRoute(async ({ env }) => {
  assert.equal(await quotaOk(env, 'boutique', 'menutranslate', 120, { models: [M.TEXT_PRIMARY, M.TEXT_FALLBACK], maxTokens: 700 }), true);
  const r = await runWithFallback(env, M.TEXT_PRIMARY, M.TEXT_FALLBACK, { messages: [{ role: 'user', content: 'x' }], max_tokens: 700 });
  return Response.json({ ok: true, model: r.model });
}, 'menutranslate');
const res = await route({ env });
ok(res.status === 200 && (await res.json()).model === M.TEXT_FALLBACK, 'le secours répond quand le principal est retiré');
ok(calls.join() === [M.TEXT_PRIMARY, M.TEXT_FALLBACK].join(), 'un appel au principal, un au secours');
ok(used('boutique') === fallbackCost && used('*global*') === fallbackCost,
  `seul le secours reste compté (${fallbackCost}), pas le refus du modèle retiré : boutique ${used('boutique')}, global ${used('*global*')}`);

/* Une vraie panne d'inférence, elle, garde sa réservation : rien ne dit
   qu'elle n'a rien coûté. */
db.exec('DELETE FROM ai_usage_kind'); calls = [];
env.AI = { async run(model) { calls.push(model); throw new Error('AiError: 3007: Request timeout'); } };
const down = budgetRoute(async ({ env }) => {
  assert.equal(await quotaOk(env, 'boutique', 'menutranslate', 120, { models: [M.TEXT_PRIMARY, M.TEXT_FALLBACK], maxTokens: 700 }), true);
  try { await runWithFallback(env, M.TEXT_PRIMARY, M.TEXT_FALLBACK, { messages: [], max_tokens: 700 }); } catch (_) {}
  return Response.json({ ok: false }, { status: 502 });
}, 'menutranslate');
await down({ env });
ok(used('*global*') > fallbackCost, 'un délai dépassé garde sa réservation (prudence inchangée)');
budgets.delete(env);

/* ── 4 · passerelle « kiwi » absente : l'appel va au modèle directement ─────
 * Du 19 au 21 nov. 2026 toute l'IA de production répondait « 2001: Please
 * configure AI Gateway in the Cloudflare dashboard » : la passerelle n'existait
 * plus, aucun modèle n'était atteint. Un refus de la passerelle (limite,
 * autorisation) n'est jamais contourné ; seule son absence l'est. */
const { runAiWithGateway, _resetGatewayMemo } = await load('_run.js');
db.exec('DELETE FROM ai_usage_kind'); _resetGatewayMemo();
let sent = [];
env.AI = { async run(model, payload, opts) {
  sent.push(opts && opts.gateway ? 'gateway' : 'direct');
  if (opts && opts.gateway) throw new Error('2001: Please configure AI Gateway in the Cloudflare dashboard');
  return { response: '{"ok":true}', usage: { prompt_tokens: 1000, completion_tokens: 300 } };
} };
const direct = budgetRoute(async ({ env }) => {
  assert.equal(await quotaOk(env, 'boutique', 'visioninspect', 150, { models: [M.GEMMA_VISION], maxTokens: 700 }), true);
  await runAiWithGateway(env, M.GEMMA_VISION, { messages: [], max_tokens: 700 });
  return Response.json({ ok: true });
}, 'visioninspect');
ok((await direct({ env })).status === 200, 'passerelle absente : le modèle répond quand même');
ok(sent.join() === 'gateway,direct', 'un essai par la passerelle, puis le modèle directement');
const settled = Math.ceil((1000 * .1 + 300 * .3) / 11);
ok(used('boutique') === settled, `une seule réservation, réglée au coût réel (${settled}) : ${used('boutique')}`);
sent = [];
await direct({ env });
ok(sent.join() === 'direct', 'la même instance ne repasse pas par la passerelle absente pendant 10 min');
_resetGatewayMemo(); sent = [];
env.AI = { async run(model, payload, opts) {
  sent.push(opts && opts.gateway ? 'gateway' : 'direct');
  throw Object.assign(new Error('Gateway rate limit exceeded'), { status: 429 });
} };
try { await runAiWithGateway(env, M.GEMMA_VISION, { messages: [] }); } catch (_) {}
ok(sent.join() === 'gateway', 'un refus de la passerelle (limite) n’est jamais contourné par un appel direct');
for (const [msg, status] of [['Rate limit: 2001 requests per minute exceeded', 429], ['Gateway rule 2001 blocked this request', 403], ['2001: Please configure AI Gateway in the Cloudflare dashboard', 429]]) {
  _resetGatewayMemo(); sent = [];
  env.AI = { async run(model, payload, opts) { sent.push(opts && opts.gateway ? 'gateway' : 'direct'); throw Object.assign(new Error(msg), { status }); } };
  try { await runAiWithGateway(env, M.GEMMA_VISION, { messages: [] }); } catch (_) {}
  ok(sent.join() === 'gateway', `« ${msg} » (${status}) n’ouvre pas d’appel direct`);
}
budgets.delete(env);

console.log(`✓ ai-retired-model · ${passed} contrôles : aucune route sur Qwen retiré, DeepSeek sans réflexion, un refus « retiré » ne mange pas le budget`);
