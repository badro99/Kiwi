/* /api/channel/glovo/till — Glovo vu de la caisse et du tableau de bord.
 *
 * GET  ?merchant=  les adresses Glovo du magasin (Marketplace, fermeture) et
 *                  ses commandes Glovo des 12 dernières heures (récupérée par
 *                  le coursier, partie, livrée, heure de retrait annoncée).
 * POST { merchant, action, … }
 *   prep      { orderId, minutes }          +N min avant le retrait (coursier Glovo)
 *   delivered { orderId }                   Marketplace : livrée
 *   close     { storeId, minutes, pin? }    fermer Glovo pour N minutes (≤ 7 j)
 *   reopen    { storeId, pin? }             rouvrir
 *   closing   { storeId }                   relire la fermeture chez Glovo
 *
 * Qui : le patron (ou l'opérateur) depuis le tableau de bord ; la caisse
 * appairée de CE magasin. Fermer ou rouvrir depuis la caisse demande le code
 * d'un responsable, vérifié par le serveur (verifyStaffPin). Le commerçant vient
 * de la session ou de l'appairage, jamais du corps seul. */
import { entitledMerchant, isTillFor, json, verifyStaffPin } from '../../../auth/_lib.js';
import { adjustGlovoPrep, closeGlovoStore, deliveredGlovoOrder, openGlovoOrders, readGlovoClosing, reopenGlovoStore, storesOf } from './_glovo-ops.js';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MANAGER = /^(?:manager|owner|proprietaire|admin|administrateur|direction|gerant|responsable|superviseur)$|-manager$/;
const roleKey = (r) => String(r || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function who(request, env, asked) {
  if (!SLUG.test(asked)) return null;
  if ((await entitledMerchant(request, env, asked)) === asked) return { merchant: asked, till: false };
  try { if (await isTillFor(request, env, asked)) return { merchant: asked, till: true }; } catch (_) {}
  return null;
}

const storeView = (s) => ({
  storeId: String(s.store_id), status: String(s.status || 'active'), marketplace: Number(s.marketplace) === 1,
  prepMinutes: Number(s.prep_minutes) || 15, closingUntil: s.closing_until && Date.parse(s.closing_until) > Date.now() ? String(s.closing_until) : null,
  menu: s.menu_status ? { status: String(s.menu_status), ts: Number(s.menu_ts) || null, detail: s.menu_detail || '' } : null,
  bulk: s.bulk_status ? { status: String(s.bulk_status), ts: Number(s.bulk_ts) || null, detail: s.bulk_detail || '' } : null,
  apiError: s.api_err ? { message: String(s.api_err), ts: Number(s.api_err_ts) || null } : null,
});

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const asked = String(new URL(request.url).searchParams.get('merchant') || '').slice(0, 64);
  const w = await who(request, env, asked);
  if (!w) return json({ error: 'unauthorized' }, 401);
  const { migrated, stores } = await storesOf(env, w.merchant);
  return json({ ok: true, migrated, configured: !!env.GLOVO_TOKEN, stores: stores.map(storeView),
    orders: migrated ? await openGlovoOrders(env, w.merchant) : [] });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = String((b && b.merchant) || '').slice(0, 64);
  const w = await who(request, env, asked);
  if (!w) return json({ error: 'unauthorized' }, 401);
  if (!env.GLOVO_TOKEN) return json({ error: 'not-configured' }, 503);
  const action = String(b.action || '');
  let r;
  if (action === 'prep') r = await adjustGlovoPrep(env, w.merchant, b.orderId, b.minutes);
  else if (action === 'delivered') r = await deliveredGlovoOrder(env, w.merchant, b.orderId);
  else if (action === 'close' || action === 'reopen') {
    if (w.till) {
      const v = await verifyStaffPin(request, env, w.merchant, String(b.pin || ''), { requireTill: true });
      if (!v.ok) return v.response || json({ error: v.error || 'pin-invalid' }, v.status || 403);
      if (!MANAGER.test(roleKey(v.staff && v.staff.role))) return json({ error: 'manager-required' }, 403);
    }
    const minutes = Math.round(Number(b.minutes));
    r = action === 'close'
      ? await closeGlovoStore(env, w.merchant, b.storeId, Number.isFinite(minutes) ? Date.now() + minutes * 60000 : NaN)
      : await reopenGlovoStore(env, w.merchant, b.storeId);
  } else if (action === 'closing') r = await readGlovoClosing(env, w.merchant, b.storeId);
  else return json({ error: 'bad-action' }, 400);
  return r.ok ? json(r) : json({ error: r.error }, r.status || 400);
}
