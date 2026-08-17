// POST /api/pin/verify — verify a candidate staff PIN server-side.
// Body JSON: { merchant, pin }
import { verifyStaffPin, json } from '../../auth/_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = String(body && body.merchant || '').trim();
  const pin = String(body && body.pin || '').trim();

  if (!merchant || !pin) return json({ error: 'missing-fields' }, 400);

  const verified = await verifyStaffPin(request, env, merchant, pin, { requireTill: true });
  if (!verified.ok) {
    if (verified.response) return verified.response;
    return json({ error: verified.error }, verified.status);
  }

  return json({
    ok: true,
    staff: verified.staff,
  });
}
