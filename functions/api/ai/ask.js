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

/* Qwen plutôt que Llama, et le choix se chiffre. Fenêtre 32 768 jetons contre
 * 24 000, multilingue annoncé (le commerçant marocain écrit en français, en
 * arabe, et souvent dans la même phrase), et 0,051 $/M en entrée contre 0,29 —
 * six fois moins cher des deux côtés. C'est aussi la famille sur laquelle
 * assets/agent.js a déjà arbitré pour l'arabe côté navigateur. */
const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

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

/* Le quota journalier par établissement. Généreux — un commerçant curieux ne
 * doit pas se cogner à un mur — mais il empêche une boucle de câblage cassée de
 * consommer l'allocation du compte en une nuit. */
const DAILY_CAP = 200;

/* Bornes d'entrée. La fenêtre du modèle est large, la facture ne l'est pas :
 * l'historique côté navigateur est déjà coupé à 8 tours, on refuse simplement
 * qu'un client bricolé envoie autre chose. */
const MAX_MESSAGES = 12;
const MAX_CHARS = 24000;

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* Compte l'appel et dit s'il reste du quota. Fail-soft dans les deux sens :
 * sans D1 et sans table (migration pas passée), on laisse passer plutôt que de
 * livrer une fonctionnalité morte — MAX_TOKENS borne déjà le coût unitaire. Le
 * jour où la table existe, le plafond s'applique tout seul. */
async function quotaOk(env, merchant) {
  if (!env.DB) return true;
  try {
    const row = await env.DB.prepare(
      'SELECT calls FROM ai_usage WHERE merchant = ? AND day = ?'
    ).bind(merchant, today()).first();
    if (row && row.calls >= DAILY_CAP) return false;
    await env.DB.prepare(
      'INSERT INTO ai_usage (merchant, day, calls) VALUES (?, ?, 1) ' +
      'ON CONFLICT(merchant, day) DO UPDATE SET calls = calls + 1'
    ).bind(merchant, today()).run();
    return true;
  } catch (_) {
    /* pas de table → pas de compteur */
    return true;
  }
}

/* Ne garde que ce qu'un échange de chat peut contenir. Un rôle inventé ou un
 * contenu non textuel n'a aucune raison d'atteindre le modèle. */
function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  let chars = 0;
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'system' || m.role === 'assistant' ? m.role : 'user';
    const content = String(m.content == null ? '' : m.content);
    if (!content.trim()) continue;
    chars += content.length;
    if (chars > MAX_CHARS) break;
    out.push({ role, content });
  }
  return out.length ? out : null;
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

  if (!(await quotaOk(env, who))) return json({ ok: false, error: 'quota' }, 429);

  let stream;
  try {
    stream = await env.AI.run(MODEL, {
      messages,
      stream: true,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      top_p: TOP_P,
    });
  } catch (_) {
    return json({ ok: false, error: 'model' }, 502);
  }

  /* On relaie le SSE tel quel. Le navigateur relit les `data:` et applique
   * EXACTEMENT les mêmes garde-fous que pour le modèle local — découpage par
   * phrase terminée, redactUnsupported(), note de garde, historique qui ne
   * stocke que la version expurgée. Un seul rendu, deux moteurs. */
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-kiwi-ai': 'cloud',
    },
  });
}
