import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
const root = process.env.KIWI_VISION_TEST_ROOT || '..';
const { quotaOk } = await import(new URL(root + '/functions/api/ai/_quota.js', import.meta.url));
const { estimateNeurons, budgets } = await import(new URL(root + '/functions/api/ai/_neurons.js', import.meta.url));
const { runAiWithGateway, runWithFallback } = await import(new URL(root + '/functions/api/ai/_run.js', import.meta.url));
const { budgetRoute } = await import(new URL(root + '/functions/api/ai/_budget-route.js', import.meta.url));
const db = new DatabaseSync(':memory:');
const env = { DB: {
  prepare(sql) { let args; return { bind(...a) { args = a; return this; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { return db.prepare(sql).run(...(args || [])); } }; }
} };
const model = '@cf/zai-org/glm-5.3-flash';
const { MODEL: translateModel } = await import('../functions/api/ai/menu-translate.js');
const { MODEL: textModel } = await import('../functions/api/ai/ask.js');
const used = (merchant = 'a') => db.prepare("SELECT calls FROM ai_usage_kind WHERE merchant=? AND kind='neurons'").get(merchant)?.calls || 0;
const reset = () => { db.exec('DELETE FROM ai_usage_kind'); budgets.delete(env); delete env.AI_GLOBAL_DAILY_NEURONS; delete env.AI_MERCHANT_DAILY_NEURONS; };
for (let i = 0; i < 15; i++) assert.equal(await quotaOk(env, 'a', 'menutranslate', 120, { models: [model], maxTokens: 4000 }), true);
reset();
for (let i = 0; i < 40; i++) assert.equal(await quotaOk(env, 'a', 'ask', 200, { models: [model], maxTokens: 700 }), true);
reset();
let allowed = 0;
while (await quotaOk(env, 'a', 'visioninspect', 150, { models: [model], maxTokens: 8192, vision: true })) allowed++;
assert.ok(allowed > 0 && allowed < 15, 'large vision burst hits budget');
reset();
assert.equal(await quotaOk(env, 'a', 'ask', 200, { models: ['unknown'], maxTokens: 1 }), false);
env.AI_GLOBAL_DAILY_NEURONS = '1000000'; env.AI_MERCHANT_DAILY_NEURONS = '1000000';
const amount = estimateNeurons({ models: [model], maxTokens: 8192, vision: true });
const results = await Promise.all(Array.from({ length: 40 }, (_, i) => quotaOk(env, 'm' + i, 'visioninspect', 150, { models: [model], maxTokens: 8192, vision: true })));
assert.equal(results.filter(Boolean).length, Math.floor(10000 / amount));
assert.ok(used('*global*') <= 10000, 'env cannot raise free ceiling');
reset();
const begin = async () => { budgets.set(env, {}); assert.equal(await quotaOk(env, 'a', 'ask', 200, { models: [model], maxTokens: 700 }), true); };
await begin();
env.AI = { async run() { return { usage: { prompt_tokens: 100, completion_tokens: 100 } }; } };
await runAiWithGateway(env, model, { max_tokens: 700 });
assert.equal(used(), 6, 'unused reservation refunded');
assert.equal(used('*global*'), 6);
reset(); await begin();
env.AI = { async run() { return { usage: { input_tokens: 10000, output_tokens: 10000 } }; } };
await runAiWithGateway(env, model, { max_tokens: 700 });
assert.equal(used(), 591, 'overrun recorded');
assert.equal(used('*global*'), 591);
reset(); await begin();
env.AI = { async run() { return {}; } };
await runAiWithGateway(env, model, { max_tokens: 700 });
const one = estimateNeurons({ models: [model], maxTokens: 700 });
assert.equal(used(), one, 'missing usage keeps reservation');
let attempts = 0;
env.AI = { async run() { if (++attempts === 1) throw new Error('model unavailable'); return {}; } };
await runWithFallback(env, model, model, { max_tokens: 700 });
assert.equal(used(), 3 * one, 'each retry reserves separately');
reset();
env.AI_MERCHANT_DAILY_NEURONS = String(one);
attempts = 0;
env.AI = { async run() { attempts++; throw new Error('model unavailable'); } };
const route = budgetRoute(async ({ env }) => {
  assert.equal(await quotaOk(env, 'a', 'ask', 200, { models: [model], maxTokens: 700 }), true);
  try { await runWithFallback(env, model, model, { max_tokens: 700 }); } catch (_) {}
  return Response.json({ error: 'model-failed' }, { status: 502 });
}, 'ask');
const denied = await route({ env });
assert.equal(denied.status, 429);
assert.equal((await denied.json()).error, 'quota');
assert.equal(attempts, 1, 'budget exhausted fallback never reaches AI');
assert.equal(estimateNeurons({ models: ['@cf/openai/whisper'] }), Math.ceil(41.14), 'whisper without a size reserves one minute');
reset();
env.AI = { async run() { return { usage: { prompt_tokens: 1000, completion_tokens: 300 } }; } };
for (const [kind, count, maxTokens, actualModel] of [['menutranslate', 15, 4000, translateModel], ['ask', 40, 700, textModel]]) {
  const typical = budgetRoute(async ({ env }) => {
    assert.equal(await quotaOk(env, 'a', kind, 200, { models: [actualModel], maxTokens }), true);
    await runAiWithGateway(env, actualModel, { max_tokens: maxTokens });
    return Response.json({ ok: true });
  }, kind);
  for (let i = 0; i < count; i++) assert.equal((await typical({ env })).status, 200);
}
assert.equal(used(), 15 * 14 + 40 * 53, '15 translations plus 40 typical text calls share one merchant day');
reset(); await begin();
env.AI = { async run() { return { usage: { prompt_tokens: 0, completion_tokens: 0 } }; } };
await runAiWithGateway(env, model, { max_tokens: 700 });
assert.equal(used(), 0, 'full refund never falls below zero');
reset(); await begin();
let invokedWithoutAccounting = 0;
env.AI = { async run() { invokedWithoutAccounting++; return {}; } };
const broken = Object.create(env);
broken.DB = { prepare() { throw new Error('accounting offline'); } };
budgets.set(broken, { merchant: 'a', day: new Date().toISOString().slice(0, 10) });
await assert.rejects(runAiWithGateway(broken, model, { max_tokens: 700 }), error => error.status === 429);
assert.equal(invokedWithoutAccounting, 0, 'unavailable retry accounting fails closed');
{ // Whisper bills by duration: a long clip reserves more, and the reported duration settles it.
  const whisper = (await import(new URL(root + '/functions/api/ai/_models.js', import.meta.url))).WHISPER_TURBO;
  const big = estimateNeurons({ models: [whisper], audioBytes: 1572864 }), small = estimateNeurons({ models: [whisper], audioBytes: 102400 });
  assert.ok(big > 8 * small, 'a 1.5 MB clip reserves far more than a short one');
  reset(); budgets.set(env, {}); assert.equal(await quotaOk(env, 'a', 'voice', 200, { models: [whisper] }), true);
  env.AI = { async run() { return { text: 'ok', transcription_info: { duration: 30 } }; } };
  await runAiWithGateway(env, whisper, { audio: 'A'.repeat(2 * 1024 * 1024) });
  assert.equal(used(), Math.ceil(0.5 * 41.14), 'whisper settles to the reported 30 s');
  reset();
}
console.log('✓ realistic daily capacity, bounded vision, settlement, overruns, no usage, separate retries and clean 429');

// The real scan route returns its existing error, without invoking the binding.
const { fixture } = await import('./server-money-fixture.mjs');
const f = await fixture(new URL('..', import.meta.url).pathname);
try {
  f.env.AI_GLOBAL_DAILY_NEURONS = '100';
  let invoked = 0;
  f.env.AI = { async run() { invoked++; return {}; } };
  const { makeSession, SESS_COOKIE } = await import('../functions/auth/_lib.js');
  const cookie = `${SESS_COOKIE}=${await makeSession('money-owner', f.env.AUTH_SECRET)}`;
  const { onRequestPost } = await import('../functions/api/ai/menu-import.js');
  const response = await onRequestPost({ env: f.env, request: new Request('https://kiwi.test/api/ai/menu-import', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ merchant: f.merchant, kind: 'image', image: 'data:image/png;base64,AAAA' }),
  }) });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'quota');
  assert.equal(invoked, 0);
} finally { f.close(); }
console.log('✓ exhausted neuron budget returns the existing scan quota error before AI.run');
