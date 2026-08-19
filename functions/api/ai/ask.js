// /api/ai/ask — le modèle de secours, côté serveur, pour les appareils qui ne
// peuvent PAS faire tourner l'assistant local.
//
// L'assistant de assets/agent.js répond d'abord par son moteur déterministe
// (embauche, prix, seuil de rentabilité, marges…). Ce qu'il ne sait pas calculer
// part vers un modèle open-source téléchargé DANS le navigateur (WebLLM, Qwen
// 1,2 Go, WebGPU) — et l'interface le promet noir sur blanc, en trois langues :
// « aucune donnée ne part ailleurs ». Cette promesse n'est pas négociable et cet
// endpoint ne l'annule pas.
//
// Le problème qu'il règle est ailleurs. llmCapability() refuse quatre familles
// d'appareils : pas de WebGPU, WebGPU annoncé mais aucune carte qui répond,
// moins de 1,6 Go de stockage libre, moins de 4 Go de mémoire. Autrement dit :
// l'iPad du comptoir, le vieux portable de la caisse, le téléphone du serveur.
// Sur ceux-là l'assistant s'arrête net sur une phrase polie. Le commerçant qui
// paie le même abonnement que le voisin n'a simplement pas la fonctionnalité.
//
// D'où la forme retenue, et la seule qui ne fasse pas mentir le produit : le
// modèle serveur est une route SÉPARÉE, NOMMÉE, et proposée seulement à ces
// appareils-là, avec une phrase qui dit franchement que la question et les
// chiffres partent chez Kiwi. Jamais un remplacement silencieux de WebLLM sur un
// appareil qui pouvait s'en passer.
//
// Confiance : rien de public ici. tenantFor() est la même règle unique que
// /api/store et /api/catalog — session du compte, deuxième établissement
// possédé, caisse appairée, ou opérateur. Une session de démo et un visiteur
// anonyme résolvent tous les deux sur '' et prennent un 401 : un endpoint
// FACTURÉ à l'appel n'a rien à faire ouvert.
//
// Toujours « fail-soft », comme le reste de functions/ : pas de binding AI, pas
// de table de quota, base qui tousse — on renvoie un code précis, jamais une
// pile d'erreur, et le client retombe sur exactement ce qu'il affichait avant
// que cet endpoint existe.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { quotaOk } from './_quota.js';
import { GATEWAY_OPTS, runAiWithGateway, runWithFallback } from './_run.js';
export { GATEWAY_OPTS, runAiWithGateway };

/* gpt-oss-120b plutôt que Qwen, et l'arbitrage est mesuré, pas lu sur une
 * fiche. Même question de seuil de rentabilité posée en darija aux deux, le
 * 2026-08-19 : gpt-oss répond EN DARIJA, juste, en 1,3 s ; Qwen3-30b répond en
 * français, juste, en 7,5 s après deux mille caractères de raisonnement caché.
 * C'est le modèle ouvert d'OpenAI, mais il tourne CHEZ Cloudflare (binding
 * @cf/, données dans la région du compte) — pas un modèle tiers. 0,35 $/M en
 * entrée, 0,75 $/M en sortie : sept fois Qwen à l'entrée, deux fois en sortie,
 * soit quelques dirhams par mois pour cent commerçants.
 *
 * Deux particularités, et sans elles la bascule casse en silence :
 * - `reasoning_effort: 'low'` est OBLIGATOIRE : par défaut le modèle dépense
 *   tout max_tokens à réfléchir et renvoie un contenu vide (constaté) ;
 * - il streame au format OpenAI (`choices[0].delta.content`, avec des deltas
 *   `reasoning` intercalés), pas au format `{response}` de Qwen. Le lecteur
 *   côté navigateur (assets/agent.js, llmChunkText) accepte les deux formes et
 *   ignore le raisonnement. Qwen ignore reasoning_effort (vérifié), ce qui en
 *   fait un secours enfichable sans second payload. */
export const MODEL = '@cf/openai/gpt-oss-120b';

/* Modèle de secours si gpt-oss est indisponible : le précédent titulaire, le
 * meilleur des modèles bon marché en arabe. */
export const FALLBACK_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

/* Effort de raisonnement : voir ci-dessus. 'low' suffit à un copilote qui
 * rédige ; les chiffres viennent du moteur déterministe, pas de sa réflexion. */
const REASONING_EFFORT = 'low';

/* Workers AI plafonne max_tokens à 256 par défaut. Une question sur un prix de
 * vente recevrait une phrase et demie, coupée au milieu d'un chiffre. 700 laisse
 * une vraie réponse tout en bornant le coût par appel — c'est la seule limite de
 * dépense qui marche TOUJOURS, y compris quand la table de quota n'est pas
 * encore passée sur la base déployée. */
const MAX_TOKENS = 700;

/* Mêmes réglages que runLlm() côté navigateur, et pour la même raison : cet
 * assistant répond avec l'argent réel du commerçant. On reste sous les 1.0/1.0
 * livrés par défaut avec Qwen. */
const TEMPERATURE = 0.7;
const TOP_P = 0.8;

/* Le quota journalier par établissement pour le copilote. */
const DAILY_CAP = 200;

/* Bornes d'entrée. La fenêtre du modèle est large, la facture ne l'est pas :
 * l'historique côté navigateur est déjà coupé à 8 tours, on refuse simplement
 * qu'un client bricolé envoie autre chose. */
const MAX_MESSAGES = 16;
const MAX_CHARS = 24000;

/* Appel de fonctions. Le navigateur décrit des outils (lectures sur ce que le
 * tableau de bord tient déjà), le modèle en demande l'exécution, le NAVIGATEUR
 * exécute — les données du commerce sont côté client — et renvoie les résultats.
 * Deux tours au plus : round 'tools' (JSON : appels ou réponse directe), puis
 * round 'answer' (flux, tool_choice 'none' : le modèle ne peut plus redemander).
 * Bornes serrées : un client bricolé ne décrit pas cent outils. */
const MAX_TOOLS = 12;
const TOOL_NAME_RX = /^[a-z_]{3,32}$/;
const MAX_TOOL_JSON = 2000;
const MAX_TOOL_CALLS = 4;
const MAX_TOOL_RESULT = 2000;

/* Ne garde que ce qu'un échange de chat peut contenir. Un rôle inventé ou un
 * contenu non textuel n'a aucune raison d'atteindre le modèle. */
export function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  let chars = 0;
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'system' || m.role === 'assistant' || m.role === 'tool' ? m.role : 'user';
    const content = String(m.content == null ? '' : m.content);
    /* Un message outil : résultat borné, id d'appel et nom propres. */
    if (role === 'tool') {
      const name = String(m.name || '');
      if (!TOOL_NAME_RX.test(name) || !content.trim()) continue;
      const c = content.slice(0, MAX_TOOL_RESULT);
      chars += c.length;
      if (chars > MAX_CHARS) break;
      out.push({ role, content: c, tool_call_id: String(m.tool_call_id || '').slice(0, 80), name });
      continue;
    }
    /* Un message assistant qui porte des appels d'outils : noms valides,
     * arguments texte bornés, quatre au plus. */
    const calls = role === 'assistant' && Array.isArray(m.tool_calls) ? cleanToolCalls(m.tool_calls) : null;
    if (!content.trim() && !(calls && calls.length)) continue;
    chars += content.length;
    if (chars > MAX_CHARS) break;
    const msg = { role, content };
    if (calls && calls.length) msg.tool_calls = calls;
    out.push(msg);
  }
  return out.length ? out : null;
}

export function cleanToolCalls(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw.slice(0, MAX_TOOL_CALLS)) {
    const fn = c && (c.function || c);
    const name = String((fn && fn.name) || '');
    if (!TOOL_NAME_RX.test(name)) continue;
    let args = fn && fn.arguments;
    args = typeof args === 'string' ? args : JSON.stringify(args || {});
    out.push({ id: String((c && c.id) || '').slice(0, 80), type: 'function', function: { name, arguments: args.slice(0, MAX_TOOL_JSON) } });
  }
  return out;
}

/* Les outils décrits par le client : nom, description courte, schéma JSON
 * borné en taille. Tout le reste est jeté. */
export function cleanTools(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const t of raw.slice(0, MAX_TOOLS)) {
    const fn = t && (t.function || t);
    const name = String((fn && fn.name) || '');
    if (!TOOL_NAME_RX.test(name)) continue;
    const description = String((fn && fn.description) || '').slice(0, 300);
    let parameters = fn && fn.parameters && typeof fn.parameters === 'object' ? fn.parameters : { type: 'object', properties: {} };
    let json = '';
    try { json = JSON.stringify(parameters); } catch (_) { json = ''; }
    if (!json || json.length > MAX_TOOL_JSON) parameters = { type: 'object', properties: {} };
    out.push({ type: 'function', function: { name, description, parameters } });
  }
  return out.length ? out : null;
}

/* Ce que le modèle a demandé, filtré sur les outils que le client a
 * déclarés : un nom inconnu est ignoré, jamais relayé. */
export function allowedToolCalls(message, tools) {
  const names = new Set((tools || []).map((t) => t.function.name));
  const calls = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return cleanToolCalls(calls).filter((c) => names.has(c.function.name)).map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments }));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = null;
  try { body = await request.json(); } catch (_) { body = null; }
  if (!body) return json({ ok: false, error: 'body' }, 400);

  const who = await tenantFor(request, env, body.merchant);
  if (!who) return json({ ok: false, error: 'auth' }, 401);

  /* Le binding se pose dans le tableau de bord Cloudflare (Pages → Settings →
   * Bindings → Workers AI), pas dans ce dépôt : il n'y a pas de wrangler.toml.
   * Tant qu'il manque, on le DIT au client, qui réaffiche simplement le message
   * déterministe d'avant. Un 500 laisserait le commerçant devant une erreur. */
  if (!env.AI) return json({ ok: false, error: 'unbound' }, 503);

  const messages = cleanMessages(body.messages);
  if (!messages) return json({ ok: false, error: 'messages' }, 400);

  if (!(await quotaOk(env, who, 'ask', DAILY_CAP))) return json({ ok: false, error: 'quota' }, 429);

  const tools = cleanTools(body.tools);
  const round = body.round === 'tools' && tools ? 'tools' : 'answer';

  const payload = {
    messages,
    stream: round === 'answer',
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    top_p: TOP_P,
    reasoning_effort: REASONING_EFFORT,
  };
  if (tools) {
    payload.tools = tools;
    /* Au tour de réponse le modèle ne peut PLUS demander d'outil : deux tours
     * au plus, jamais de boucle. Les outils restent déclarés pour qu'il
     * comprenne les appels déjà présents dans l'historique. */
    payload.tool_choice = round === 'tools' ? 'auto' : 'none';
  }

  let result = null;
  let usedModel = MODEL;
  try {
    const r = await runWithFallback(env, MODEL, FALLBACK_MODEL, payload);
    result = r.result;
    usedModel = r.model;
  } catch (_) {
    return json({ ok: false, error: 'model' }, 502);
  }

  if (round === 'tools') {
    /* Réponse JSON non streamée : soit des appels d'outils (filtrés sur la
     * liste déclarée), soit le texte directement quand le modèle n'avait
     * besoin de rien. */
    const msg = result && Array.isArray(result.choices) && result.choices[0] ? result.choices[0].message : null;
    /* gpt-oss : choices[0].message.tool_calls ; Qwen (secours) : tool_calls au
     * niveau racine à côté de response. Les deux passent par le même filtre. */
    const calls = allowedToolCalls(msg && msg.tool_calls ? msg : result, tools);
    let text = '';
    if (!calls.length) {
      if (msg && typeof msg.content === 'string') text = msg.content;
      else if (result && typeof result.response === 'string') text = result.response;
    }
    return json({ ok: true, tool_calls: calls, text }, 200, { 'x-kiwi-ai': 'cloud', 'x-kiwi-ai-model': usedModel });
  }
  const stream = result;

  /* On relaie le SSE tel quel. Le navigateur relit les `data:` et applique
   * EXACTEMENT les mêmes garde-fous que pour le modèle local — découpage par
   * phrase terminée, redactUnsupported(), note de garde, historique qui ne
   * stocke que la version expurgée. Un seul rendu, deux moteurs. */
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-kiwi-ai': 'cloud',
      'x-kiwi-ai-model': usedModel,
    },
  });
}
