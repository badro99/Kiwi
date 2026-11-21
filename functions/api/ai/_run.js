import { meteredAttempt } from './_neurons.js';
import { GEMMA_PREFIX, QWEN, DEEPSEEK_FLASH } from './_models.js';

/* Gemma 4 et Qwen 3 ignorent reasoning_effort 'low' : sur le vrai prompt de
 * menu-rank, les deux passaient leurs 1200 tokens à réfléchir et ne rendaient
 * aucun JSON (18 nov. 2026 : 10/21 et 9/21 réponses lisibles). Gemma s'arrête
 * avec chat_template_kwargs.enable_thinking=false (230 tokens, 7 s), Qwen avec
 * « /no_think » sur le dernier message utilisateur. Les autres familles passent
 * telles quelles. Ne modifie jamais l'objet reçu. */
const NO_THINK = ' /no_think';
export function thinkingOff(model, payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (String(model).startsWith(GEMMA_PREFIX)) {
    return { ...payload, chat_template_kwargs: { ...(payload.chat_template_kwargs || {}), enable_thinking: false } };
  }
  /* DeepSeek V4.1 Flash réfléchit par défaut et peut épuiser max_tokens avant
     le JSON (invoice.js, 20 nov.) : chat_template_kwargs.thinking=false. */
  if (model === DEEPSEEK_FLASH) {
    return { ...payload, chat_template_kwargs: { ...(payload.chat_template_kwargs || {}), thinking: false } };
  }
  if (model !== QWEN) return payload;
  const tag = (s) => (s.endsWith(NO_THINK) ? s : s + NO_THINK);
  if (Array.isArray(payload.messages)) {
    const i = payload.messages.map((m) => m && m.role).lastIndexOf('user');
    if (i < 0 || typeof payload.messages[i].content !== 'string') return payload;
    const messages = payload.messages.slice();
    messages[i] = { ...messages[i], content: tag(messages[i].content) };
    return { ...payload, messages };
  }
  return typeof payload.prompt === 'string' ? { ...payload, prompt: tag(payload.prompt) } : payload;
}
// functions/api/ai/_run.js — l'appel Workers AI partagé par toutes les routes AI.
//
// Passerelle Cloudflare AI Gateway « kiwi » (journal, coût par modèle, limites),
// cacheTtl 0 : aucune réponse financière en cache. Une panne ou un refus de la
// passerelle ne doit jamais contourner ses limites via un appel direct.
export const GATEWAY_OPTS = { gateway: { id: 'kiwi', cacheTtl: 0 } };

/* Passerelle ABSENTE (≠ refus) : du 19 au 21 nov. 2026 Cloudflare répondait
 * « 2001: Please configure AI Gateway in the Cloudflare dashboard » à chaque
 * appel, et toute l'IA de production échouait sans qu'aucun modèle soit
 * atteint. Seule cette réponse-là mène au modèle directement : une limite ou un
 * refus de la passerelle n'est jamais contourné. Le plafond de Kiwi
 * (_neurons.js, 10 000 gratuits par jour) borne toujours le coût. L'instance
 * retient l'absence 10 min pour ne pas payer un aller-retour par appel. */
const GATEWAY_MISSING = /\b2001\b|configure AI Gateway/i;
const GATEWAY_MEMO_MS = 10 * 60 * 1000;
let gatewayMissingUntil = 0;
export function _resetGatewayMemo() { gatewayMissingUntil = 0; }

export async function runAiWithGateway(env, model, payload) {
  const sent = thinkingOff(model, payload);
  return meteredAttempt(env, model, sent, async () => {
    if (Date.now() < gatewayMissingUntil) return env.AI.run(model, sent);
    try { return await env.AI.run(model, sent, GATEWAY_OPTS); }
    catch (error) {
      if (!GATEWAY_MISSING.test(String(error && error.message || error))) throw error;
      gatewayMissingUntil = Date.now() + GATEWAY_MEMO_MS;
      console.warn('[ai] passerelle « kiwi » absente (2001) : appel direct au modèle', model);
      return env.AI.run(model, sent);
    }
  });
}

/* Texte d'une réponse Workers AI, quel que soit le modèle : `response` (Qwen,
 * Llama) ou `choices[0].message.content` (GLM, gpt-oss). Jamais l'enveloppe
 * entière : son JSON se parse comme un objet vide et le validateur en ferait un
 * « rien à signaler ». Sans texte, la route doit répondre « illisible ». */
export function aiText(result) {
  if (typeof result === 'string') return result;
  const r = result && (result.response ?? result.choices?.[0]?.message?.content ?? result.description);
  if (typeof r === 'string') return r;
  return r && typeof r === 'object' ? JSON.stringify(r) : '';
}

function policyFailure(error) {
  const status = Number(error && (error.status || error.statusCode || error.response?.status));
  return [401, 403, 429].includes(status)
    || /quota|rate.?limit|unauthori[sz]ed|forbidden|policy|access.?denied/i.test(String(error && error.message || error));
}

/* Modèle principal puis modèle de secours, chacun via runAiWithGateway : au
 * plus deux tentatives, toujours via la passerelle. Renvoie { result, model } ou lève. */
export async function runWithFallback(env, primary, fallback, payload) {
  try {
    return { result: await runAiWithGateway(env, primary, payload), model: primary };
  } catch (error) {
    if (policyFailure(error)) throw error;
    return { result: await runAiWithGateway(env, fallback, payload), model: fallback };
  }
}
