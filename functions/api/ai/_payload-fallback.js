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

export async function runWithPayloadFallback(env, primary, primaryPayload, fallback, fallbackPayload = primaryPayload) {
  try {
    return { result: await runAiWithGateway(env, primary, primaryPayload), model: primary };
  } catch (error) {
    if (policyFailure(error)) throw error;
    const payload = typeof fallbackPayload === 'function' ? fallbackPayload() : fallbackPayload;
    return { result: await runAiWithGateway(env, fallback, payload), model: fallback };
  }
}
