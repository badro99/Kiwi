// POST /api/pin/verify — verify a candidate staff PIN server-side.
// Body JSON: { merchant, pin }  → this store's roster (till, owner, operator)
//            { pin }            → account-wide, session-derived (the dashboard lock)
//
// The second shape exists because the dashboard spans every établissement on the
// account while codes are filed per boutique. It used to be answered by shipping
// the codes to the browser (GET /api/config?accountPins=owners) and comparing them
// there; the comparison now happens here, so no four-digit code ever leaves D1.
// Both shapes are rate-limited and answer with an identity, never with a code.
import {
  verifyStaffPin, verifyAccountPin, employeeRoleOpensDashboard,
  managerRefundProof, managerStockProof, tillActorProof, employeeRoleOpensTill,
  faceAccessTier, faceMarkState, json,
} from '../../auth/_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = String(body && body.merchant || '').trim();
  const pin = String(body && body.pin || '').trim();

  if (!pin) return json({ error: 'missing-fields' }, 400);

  // No merchant named ⇒ ask the signed-in account's whole estate. Not a widening:
  // verifyAccountPin derives the store list from the session's own registry and
  // refuses outright without a session.
  const verified = merchant
    ? await verifyStaffPin(request, env, merchant, pin, { requireTill: true })
    : await verifyAccountPin(request, env, pin);

  if (!verified.ok) {
    if (verified.response) return verified.response;
    /* `configured: false` : le compte n'a encore AUCUN code, la porte du dashboard
       peut le laisser rejoindre son installation. Jamais rapporté dans l'autre
       sens, ni pour la forme « boutique » (le comptoir n'en a que faire). */
    return json({ error: verified.error, ...(verified.configured === false ? { configured: false } : {}) }, verified.status);
  }

  let approval = '';
  const action = body && body.action;
  if (merchant && action && action.kind === 'refund' && employeeRoleOpensDashboard(verified.staff.role)) {
    approval = await managerRefundProof(env.AUTH_SECRET, {
      merchant, staffId: verified.staff.id, staffName: verified.staff.name, staffRole: verified.staff.role,
      refundId: action.refundId, originalSaleId: action.originalSaleId, amountCents: action.amountCents,
      refundMethod: action.refundMethod,
    });
  }

  /* Un mouvement de stock discrétionnaire déclaré au comptoir : la capacité est
   * liée aux identifiants exacts des mouvements, donc elle n'autorise pas une
   * autre sortie que celle qu'on vient de montrer au responsable. */
  if (!approval && merchant && action && action.kind === 'inventory'
      && employeeRoleOpensDashboard(verified.staff.role)) {
    approval = await managerStockProof(env.AUTH_SECRET, {
      merchant, staffId: verified.staff.id, staffName: verified.staff.name,
      staffRole: verified.staff.role, movementIds: action.movementIds,
    });
  }

  /* The dashboard lock (no merchant): a code just proven at owner or manager tier
   * earns the Face ID mark for THAT tier, so the native app can enrol Face ID on
   * this proof and nothing else. /api/pin/face only confirms it. No code in it. */
  let faceMark = '';
  if (!merchant) {
    const tier = faceAccessTier(verified.staff.role);
    if (tier) {
      try { const st = await faceMarkState(request, env, tier); if (st.status === 'ok') faceMark = st.mark; } catch (_) {}
    }
  }

  return json({
    ok: true,
    staff: verified.staff,
    ...(faceMark ? { faceMark } : {}),
    ...(merchant && employeeRoleOpensTill(verified.staff.role) ? { actorProof: await tillActorProof(env.AUTH_SECRET, merchant, verified.staff) } : {}),
    ...(approval ? { approval } : {}),
    ...(verified.merchant ? { merchant: verified.merchant } : {}),
  });
}
