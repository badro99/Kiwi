// A payload-shape fallback still belongs to the metered AI Gateway path.
// Do not retry a policy, quota, or authorization refusal with another model.
import { runAiWithGateway } from './_run.js';

function policyFailure(error) {
  const status = Number(error && (error.status || error.statusCode || error.response?.status));
  return [401, 403, 429].includes(status)
    || /quota|rate.?limit|unauthori[sz]ed|forbidden|policy|access.?denied/i.test(
      String(error && error.message || error)
    );
}

/* Un modèle qui ne répond pas dans `ms` est une panne comme une autre : le
   secours prend la main. Sans délai, rien ne change (ms absent ou 0). */
function inTime(run, ms) {
  if (!(ms > 0)) return run;
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('model-timeout')), ms); });
  return Promise.race([run, late]).finally(() => clearTimeout(timer));
}

export async function runWithPayloadFallback(env, primary, primaryPayload, fallback, fallbackPayload = primaryPayload, opts = {}) {
  const ms = Number(opts && opts.timeoutMs) || 0;
  try {
    return { result: await inTime(runAiWithGateway(env, primary, primaryPayload), ms), model: primary };
  } catch (error) {
    if (policyFailure(error)) throw error;
    const payload = typeof fallbackPayload === 'function' ? fallbackPayload() : fallbackPayload;
    return { result: await inTime(runAiWithGateway(env, fallback, payload), ms), model: fallback };
  }
}
