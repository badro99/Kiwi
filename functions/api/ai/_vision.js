// functions/api/ai/_vision.js — le duo vision partagé : qui lit l'image, et dans quelle forme.
//
// Avant : menu-import et salle-import lisaient les photos avec llama-3.2-11b-vision
// (2024), les sept autres routes vision avaient GLM 5.3 Flash devant et le MÊME
// llama derrière. Or les deux familles ne parlent pas le même dialecte :
//   · GLM 5.3 Flash et Gemma 4 26B sont des modèles « chat completions » : l'image
//     voyage dans messages[].content[] sous { type:'image_url', image_url:{ url } }
//     (URL data: acceptée), aucun champ `image` / `prompt` à côté.
//   · Llama 3.2 vision (fiche Workers AI) n'annonce que { prompt, image:[octets] }.
//     Le repli recevait donc le payload GLM tel quel, et rien ne garantissait qu'il
//     l'accepte : un secours qui échoue en silence est pire que pas de secours.
//   · `reasoning_effort` n'existe que dans le schéma de GLM. Gemma ne le déclare
//     pas : on ne le lui envoie pas.
// Ici, UNE source de vérité : chaque route décrit sa requête au format GLM (celui
// de ses tests), et payloadForModel() la traduit pour le modèle qui la reçoit.
import { runWithPayloadFallback } from './_payload-fallback.js';
import { runAiWithGateway } from './_run.js';

/* Primaire : natif multimodal, 0,15 $ / 0,50 $ le million de tokens.
 * Secours : Gemma 4 26B (A4B), vision, 0,10 $ / 0,30 $ — un autre éditeur, donc
 * une panne ou un refus de GLM ne tombe pas sur le même modèle. */
export const VISION_PRIMARY_MODEL = '@cf/zai-org/glm-5.3-flash';
export const VISION_FALLBACK_MODEL = '@cf/google/gemma-4-26b-a4b-it';

export function visionFamily(model) {
  const m = String(model || '');
  if (m.startsWith('@cf/zai-org/glm-')) return 'glm';
  if (m.startsWith('@cf/google/gemma-')) return 'gemma';
  if (m.startsWith('@cf/meta/llama-3.2-') && /vision/.test(m)) return 'llama-vision';
  return 'other';
}

/* Les messages « chat » d'une requête vision : un système, puis un utilisateur
 * dont le contenu est un tableau [texte, image]. C'est la forme que GLM et Gemma
 * déclarent tous les deux (user.content[].type ∈ text | image_url). */
export function visionMessages({ system, text, dataUrl }) {
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ];
}

/* Octets d'une URL data: — pour la forme native de Llama uniquement. */
function dataUrlBytes(dataUrl) {
  const bin = atob(String(dataUrl).slice(String(dataUrl).indexOf(',') + 1));
  const bytes = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* La forme native de Llama 3.2 vision : { prompt, image:[octets], max_tokens }.
 * N'est plus le chemin par défaut ; gardée pour l'évaluation (tools/ai-model-eval.mjs)
 * et pour un éventuel retour arrière. */
export function nativeLlamaPayload(payload) {
  const msgs = Array.isArray(payload && payload.messages) ? payload.messages : [];
  const system = msgs.find((m) => m.role === 'system');
  const user = msgs.find((m) => m.role === 'user');
  const parts = Array.isArray(user && user.content) ? user.content : [];
  const text = (parts.find((p) => p.type === 'text') || {}).text || '';
  const img = parts.find((p) => p.type === 'image_url');
  const out = {
    prompt: [system && system.content, text].filter(Boolean).join('\n\n'),
    image: img ? dataUrlBytes(img.image_url.url) : undefined,
    max_tokens: payload.max_tokens,
  };
  if (payload.temperature != null) out.temperature = payload.temperature;
  if (payload.top_p != null) out.top_p = payload.top_p;
  return out;
}

/* Traduit une requête vision décrite au format GLM vers le modèle qui la reçoit.
 *   glm   → telle quelle (reasoning_effort fait partie de son schéma)
 *   autre → les mêmes messages, SANS reasoning_effort (absent de leur schéma)
 * Ne mute jamais l'original : le secours reçoit une copie neuve. */
export function payloadForModel(model, payload) {
  const family = visionFamily(model);
  if (family === 'glm') return payload;
  const out = { ...payload };
  delete out.reasoning_effort;
  return out;
}

/* Les modèles Meta sont sous licence : le premier appel du COMPTE doit être le
 * prompt littéral « agree » (erreur 5016 sinon). Plus aucun modèle du duo par
 * défaut n'y est soumis ; le réflexe reste pour un compte neuf qui retomberait
 * dessus (ou un retour arrière vers Llama) au lieu d'exiger la console. Borné :
 * 16 tokens, pas de raisonnement à payer sur GLM. */
export async function agreeIfGated(env, err, models) {
  if (!/5016|submit the prompt 'agree'/i.test(String((err && err.message) || err || ''))) return false;
  let agreed = false;
  for (const m of [...new Set(models)]) {
    try { await runAiWithGateway(env, m, { prompt: 'agree', max_tokens: 16 }); agreed = true; }
    catch (_) { /* ce modèle-là n'était pas le bloqué */ }
  }
  return agreed;
}

/* Une lecture d'image : primaire, puis secours si le primaire échoue (hors refus
 * de politique/quota, jamais contournés — voir _payload-fallback.js). Chaque
 * modèle reçoit SA forme de requête. Renvoie { result, model } ou lève. */
export async function runVisionPair(env, primary, fallback, payload) {
  const attempt = () => runWithPayloadFallback(
    env,
    primary, payloadForModel(primary, payload),
    fallback, () => payloadForModel(fallback, payload),
  );
  try { return await attempt(); }
  catch (e) {
    if (await agreeIfGated(env, e, [primary, fallback])) return await attempt();
    throw e;
  }
}
