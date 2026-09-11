// /api/admin/attendance-link — the store-specific URL written to its physical
// attendance NFC tag. Read-only: the token is deterministically signed from the
// merchant and AUTH_SECRET, so no migration or mutable secret row is required.
import { json, isOperator, attendanceTagToken } from '../../auth/_lib.js';

export async function onRequestGet({ request, env }) {
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env || !env.AUTH_SECRET || !env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  const store = await env.DB.prepare('SELECT merchant FROM merchant_config WHERE merchant = ?').bind(merchant).first();
  if (!store) return json({ error: 'merchant-not-found' }, 404);
  const token = await attendanceTagToken(env.AUTH_SECRET, merchant);
  return json({
    ok: true,
    merchant,
    link: `${url.origin}/kiwi-serveur?pointage=${encodeURIComponent(token)}`,
  });
}
