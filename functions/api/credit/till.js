/* Le carnet de crédit au comptoir (caisse appairée, ou le patron lui-même).
 * GET  /api/credit/till?merchant=…   les plafonds, { "carnet:k1": 50000, … }
 * POST /api/credit/till { merchant, action, source, customer, … }
 *   'check'   { addCents, localOwedCents }  la vente à crédit dépasse-t-elle le plafond ?
 *   'approve' { addCents, localOwedCents, pin }  l'accord d'un responsable pour la dépasser :
 *             le code est comparé par verifyStaffPin (functions/auth/_lib.js), jamais ici,
 *             et seul un rôle qui ouvre le tableau de bord accorde. L'accord est journalisé.
 *   'promise' { id, amountCents, dueDate, note }  « paiera le … », une ligne d'échéancier. */
import { entitledMerchant, verifyStaffPin, employeeRoleOpensDashboard, json } from '../../auth/_lib.js';
import { addPromise, limitCheck, logEvent, tillLimits, validTarget } from '../_credit-accounts.js';

const fail = () => json({ error: 'credit-unavailable' }, 503);
const noStore = { 'Cache-Control': 'no-store' };
const amount = (v) => (Number.isSafeInteger(v) && v >= 0 && v <= 20000000 ? v : null);

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const asked = String(new URL(request.url).searchParams.get('merchant') || '').slice(0, 64);
  const merchant = asked && await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant || merchant !== asked) return json({ error: 'forbidden-merchant' }, 403);
  try { return json({ ok: true, limits: await tillLimits(env, merchant) }, 200, noStore); } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'bad-json' }, 400);
  const asked = String(body.merchant || '').slice(0, 64);
  const merchant = asked && await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant || merchant !== asked) return json({ error: 'forbidden-merchant' }, 403);
  const source = String(body.source || ''), key = String(body.customer || '');
  if (!validTarget(source, key)) return json({ error: 'bad-customer' }, 400);
  const action = String(body.action || '');
  try {
    if (action === 'check' || action === 'approve') {
      const add = amount(body.addCents);
      if (add == null || add < 1) return json({ error: 'bad-amount' }, 400);
      const decision = await limitCheck(env, merchant, source, key, add, amount(body.localOwedCents) || 0);
      if (action === 'check' || !decision.over) return json({ ok: true, ...decision, approved: false }, 200, noStore);
      const verified = await verifyStaffPin(request, env, merchant, String(body.pin || ''), { requireTill: true });
      if (!verified.ok) return verified.response || json({ error: verified.error || 'bad-pin' }, verified.status || 401);
      if (!employeeRoleOpensDashboard(verified.staff && verified.staff.role)) return json({ error: 'not-manager' }, 403);
      const name = String(verified.staff.name || '').slice(0, 100);
      await logEvent(env, merchant, { source, key, kind: 'limit-override', amountCents: add, actor: name,
        detail: JSON.stringify({ afterCents: decision.afterCents, limitCents: decision.limitCents }) }, Date.now());
      return json({ ok: true, ...decision, approved: true, approvedBy: { name, role: String(verified.staff.role || '').slice(0, 40) } }, 200, noStore);
    }
    if (action === 'promise') {
      const out = await addPromise(env, merchant, source, key, body, 'till');
      return out.error ? json({ error: out.error }, out.status || 409) : json(out, 200, noStore);
    }
    return json({ error: 'bad-action' }, 400);
  } catch (e) { return fail(e); }
}
