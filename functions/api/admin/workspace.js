import { workspacePage } from './_workspace-page.js';
import { json, operatorActor } from '../../auth/_lib.js';
import { guard, merchantKey, workspace } from './_workspace.js';

export async function onRequestGet(context) {
  const bad = await guard(context); if (bad) return bad;
  const requested = new URL(context.request.url).searchParams.get('merchant') || '';
  if (requested && !merchantKey(requested)) return json({error:'bad-merchant'},400);
  const params = new URL(context.request.url).searchParams;
  if (params.has('source')) {
    try {
      const page = await workspacePage(context.env, params.get('source'), requested, params.get('before') || '');
      return page ? json(page) : json({error:'bad-page'},400);
    } catch (_) { return json({error:'source-read-unavailable'},503); }
  }
  const [data,actor] = await Promise.all([workspace(context.env,requested),operatorActor(context.request,context.env)]);
  return json({...data,actor});
}
