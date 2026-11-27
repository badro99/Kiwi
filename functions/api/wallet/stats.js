// GET /api/wallet/stats?merchant= — the dashboard's Wallet card counts (owner,
// operator or paired till of that shop). Spec:
// docs/superpowers/specs/2026-11-27-wallet-loyalty-card-design.md.
import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { walletStats } from './_store.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const merchant = await tenantFor(request, env, new URL(request.url).searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  return json({ ok: true, ...(await walletStats(env.DB, merchant)) });
}
