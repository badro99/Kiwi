// functions/api/ai/_run.js — l'appel Workers AI partagé par toutes les routes AI.
//
// Passerelle Cloudflare AI Gateway « kiwi » (journal, coût par modèle, limites),
// cacheTtl 0 : une réponse sur l'argent d'un commerçant ne se sert jamais depuis
// un cache. Tant que la passerelle n'est pas créée dans le tableau de bord,
// l'appel avec l'option lève — on réessaie aussitôt SANS l'option, pour que la
// fonctionnalité ne dépende jamais d'un clic d'administration.
export const GATEWAY_OPTS = { gateway: { id: 'kiwi', cacheTtl: 0 } };

export async function runAiWithGateway(env, model, payload) {
  try {
    return await env.AI.run(model, payload, GATEWAY_OPTS);
  } catch (_) {
    return await env.AI.run(model, payload);
  }
}

/* Modèle principal puis modèle de secours, chacun via runAiWithGateway : au
 * plus quatre tentatives, jamais de boucle. Renvoie { result, model } ou lève. */
export async function runWithFallback(env, primary, fallback, payload) {
  try {
    return { result: await runAiWithGateway(env, primary, payload), model: primary };
  } catch (_) {
    return { result: await runAiWithGateway(env, fallback, payload), model: fallback };
  }
}
