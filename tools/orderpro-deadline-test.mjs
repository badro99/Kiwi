// The named deadline gate also executes the main modular transport.
import './net1-request-test.mjs';
import assert from 'node:assert/strict';
import harness from './orderpro-reliability-harness.cjs';
for (const method of ['getJSON', 'postJSON']) for (const stage of ['transport', 'body']) {
  let expire, cleared = 0, signal, bodyRead = false;
  const { api } = harness.guest({ fetch: async (_, options) => {
    signal = options.signal;
    if (stage === 'transport') return new Promise(() => {});
    return { ok: true, json: () => { bodyRead = true; return new Promise(() => {}); } };
  }, timers: { setTimeout(fn, ms) { assert.ok(ms > 11900 && ms <= 12000); expire = fn; return 1; }, clearTimeout() { cleared++; } } });
  const pending = api[method]('/test', {});
  await new Promise(setImmediate);
  assert.equal(typeof expire, 'function', method + ' arms a deadline');
  if (stage === 'body') assert.ok(bodyRead);
  expire();
  const result = await Promise.race([pending, new Promise(resolve => setImmediate(() => resolve(null)))]);
  assert.equal(result?.error, 'request-timeout');
  assert.equal(signal.aborted, true);
  assert.equal(cleared, stage === 'body' ? 2 : 1);
  if (method === 'postJSON') assert.equal(result.uncertain, true);
}
for (const lang of ['fr', 'en', 'ar']) {
  const { api, messages, I18N } = harness.guest({ lang, fetch: async () => { throw Error('lost response'); } });
  api.Q.quiz = { id: 'quiz', title: 'Quiz' };
  api.silenceGames();
  await api.finishQuiz();
  assert.equal(messages[0], I18N[lang].gx_uncertain);
  assert.ok(messages[0] && messages[0] !== 'gx_uncertain');
}
console.log('✓ OrderPro: transport and body deadlines settle reads and uncertain writes in 12 seconds');
