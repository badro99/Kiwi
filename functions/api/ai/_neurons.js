import { GLM_FLASH, GEMMA_VISION, QWEN, GLM_LEGACY, GPT_OSS, WHISPER, WHISPER_TURBO, CLEF } from './_models.js';

// Source: https://developers.cloudflare.com/workers-ai/platform/pricing/
// Free allocation: 10,000 neurons/account/UTC day; $0.011 per 1,000 neurons.
// Model token prices: Workers AI model pages, local snapshot 2026-10-11 in
// tools/ai-model-eval.mjs (GLM $0.15/$0.50, Gemma $0.10/$0.30 per million).
// Qwen/GPT rates: tools/copilot-model-eval.mjs, local snapshot 2026-10-18.
// Clef input-only rate: functions/api/_support-triage.js, local model notes.
// Legacy GLM retains the conservative $0.35/$0.75 envelope until re-priced.
// Text prompts get 4096 tokens. Vision gets 8192 for the prompt plus GLM/Gemma
// image patches/crops; image token counts vary with resolution, so settle usage.
// One attempt only. Failed attempts without usage retain their reservation.
// Whisper pricing is duration-based (pricing page): reserve 60 neurons, roughly
// one minute at Whisper's 41.14 neurons/minute, with headroom for short clips.
// No network lookup is performed by accounting. Local model eval confirms the
// GLM chat usage shape; tolerate the input_tokens/output_tokens alias too.
export const FREE_DAILY_NEURONS = 10000;
export const INPUT_TOKEN_ALLOWANCE = 4096;
export const budgets = new WeakMap();
const RATES = new Map([[GLM_FLASH, [.15, .5]], [GEMMA_VISION, [.1, .3]],
  [CLEF, [.24, 0]], [QWEN, [.051, .335]], [GLM_LEGACY, [.35, .75]], [GPT_OSS, [.35, .75]],
  [WHISPER, [.35, .75]], [WHISPER_TURBO, [.35, .75]]]);
export function estimateNeurons({ models = [GLM_FLASH], maxTokens = 8192, vision = false } = {}) {
  if (!models.length) return 0; // Intake commit stores a document, without model inference.
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1) return Infinity;
  const costs = models.map((model) => {
    const rate = RATES.get(model);
    if (model === WHISPER || model === WHISPER_TURBO) return 60;
    return rate ? ((vision ? 8192 : INPUT_TOKEN_ALLOWANCE) * rate[0] + maxTokens * rate[1]) / 11 : Infinity;
  });
  return Math.ceil(Math.max(...costs));
}
function limit(raw, ceiling) {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, ceiling) : ceiling;
}
export async function reserveNeurons(env, merchant, day, estimate) {
  const global = limit(env.AI_GLOBAL_DAILY_NEURONS, FREE_DAILY_NEURONS);
  const account = limit(env.AI_MERCHANT_DAILY_NEURONS ?? Math.floor(global / 2), global);
  if (!Number.isSafeInteger(estimate) || estimate > account || estimate > global) return false;
  const bump = 'INSERT INTO ai_usage_kind (merchant, day, kind, calls) VALUES (?, ?, \'neurons\', ?) ' +
    'ON CONFLICT(merchant, day, kind) DO UPDATE SET calls = calls + excluded.calls ' +
    'WHERE ai_usage_kind.calls + excluded.calls <= ? RETURNING calls';
  const mine = await env.DB.prepare(bump).bind(merchant, day, estimate, account).first();
  if (!mine) return false;
  try {
    const shared = await env.DB.prepare(bump).bind('*global*', day, estimate, global).first();
    if (shared) return true;
  } catch (_) { /* Fail closed and release only this reservation. */ }
  await env.DB.prepare("UPDATE ai_usage_kind SET calls = calls - ? WHERE merchant = ? AND day = ? AND kind = 'neurons'")
    .bind(estimate, merchant, day).run();
  return false;
}

// Atomic deltas preserve concurrent reservations and never make a counter negative.
export async function adjustNeurons(env, merchant, day, delta) {
  for (const m of [merchant, '*global*']) {
    await env.DB.prepare("UPDATE ai_usage_kind SET calls = MAX(0, calls + ?) WHERE merchant = ? AND day = ? AND kind = 'neurons'")
      .bind(delta, m, day).run();
  }
}
export async function meteredAttempt(env, model, payload, run) {
  const budget = budgets.get(env);
  if (!budget) return run(); // Evaluation/helpers outside a merchant route.
  try {
    if (budget.denied) throw new Error('neuron quota');
    const vision = !!payload.image || payload.messages?.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'));
    const amount = estimateNeurons({ models: [model], maxTokens: payload.max_tokens || 8192, vision });
    if (budget.pending != null) {
      const pending = budget.pending;
      budget.pending = null;
      if (amount <= pending) await adjustNeurons(env, budget.merchant, budget.day, amount - pending);
      else if (!(await reserveNeurons(env, budget.merchant, budget.day, amount - pending))) throw new Error('neuron quota');
    } else if (!(await reserveNeurons(env, budget.merchant, budget.day, amount))) throw new Error('neuron quota');
    let result;
    try { result = await run(); } catch (error) { error.aiInference = true; throw error; }
    const usage = result?.usage || result?.result?.usage;
    const input = usage?.prompt_tokens ?? usage?.input_tokens;
    const output = usage?.completion_tokens ?? usage?.output_tokens;
    const rate = RATES.get(model);
    if (rate && model !== WHISPER && model !== WHISPER_TURBO &&
        Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0) {
      const actual = Math.ceil((input * rate[0] + output * rate[1]) / 11);
      await adjustNeurons(env, budget.merchant, budget.day, actual - amount);
    }
    return result;
  } catch (error) {
    // Inference errors may use fallback; accounting errors must fail closed.
    if (!error.aiInference) { budget.denied = true; error.status = 429; }
    throw error;
  }
}
