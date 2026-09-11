// functions/api/ai/_run.js — l'appel Workers AI partagé par toutes les routes AI.
//
// Passerelle Cloudflare AI Gateway « kiwi » (journal, coût par modèle, limites),
// cacheTtl 0 : aucune réponse financière en cache. Une panne ou un refus de la
// passerelle ne doit jamais contourner ses limites via un appel direct.
export const GATEWAY_OPTS = { gateway: { id: 'kiwi', cacheTtl: 0 } };

export async function runAiWithGateway(env, model, payload) {
  return env.AI.run(model, payload, GATEWAY_OPTS);
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
