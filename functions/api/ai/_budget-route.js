import { budgets } from './_neurons.js';
import { quotaBody } from './_quota.js';

// Each invocation owns its environment facade, including concurrent same-tenant calls.
export function budgetRoute(handler, kind, errorCode = 'quota') {
  return async (context) => {
    const env = Object.create(context.env);
    const state = {};
    budgets.set(env, state);
    try {
      const response = await handler({ ...context, env });
      if (!state.denied) return response;
    } catch (error) {
      if (!state.denied) throw error;
    } finally { budgets.delete(env); }
    return Response.json(quotaBody(kind, errorCode), { status: 429 });
  };
}
