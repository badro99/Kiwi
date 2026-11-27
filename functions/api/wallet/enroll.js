// POST /api/wallet/enroll — public. The counter stand, the receipt QR and the
// till QR all land on /carte/<shop>, whose page posts here.
//
//   { merchant, name, phone, consent }        counter stand
//   { merchant, name, phone, consent, r }     receipt QR: r = the sale id
//   { merchant, t }                           till QR: single-use token
//
// The rule that keeps a stranger out of someone else's card: a phone already
// in the shop's book gets NO card and NO name or balance here ("ask at the
// till"); only a new phone, or a till token the cashier created in front of
// the customer, hands a card out. A receipt can still credit its own visit to
// a known phone, because the receipt proves the purchase.
// Spec: docs/superpowers/specs/2026-11-27-wallet-loyalty-card-design.md.
import { json } from '../../auth/_lib.js';
import { normalizePhone } from '../_phone.js';
import { spendBudget } from '../_rate-budget.js';
import { applyPurchase, phoneTwins, nextSrvTs } from '../clients.js';
import { loadMerchant } from './_merchant.js';
import { cardView } from './_card.js';
import { offersFor } from './_offers.js';
import { claimSale, useTillToken, randomId } from './_store.js';
import { notifyClientChanged } from './_notify.js';

const WEEK = 7 * 86400_000;
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

async function clientById(env, merchant, id) {
  return env.DB.prepare('SELECT id, name, phone, points, stamps FROM clients WHERE merchant = ? AND id = ? AND deleted = 0').bind(merchant, id).first();
}

async function createClient(env, merchant, { name, phone, consent, now }) {
  const id = 'w' + randomId(15);
  const srv = await nextSrvTs(env, merchant);
  await env.DB.prepare(`INSERT INTO clients (merchant, id, name, phone, consent, source, first_seen, last_seen, updated_ts, srv_ts)
    VALUES (?, ?, ?, ?, ?, 'wallet', ?, ?, ?, ?)`).bind(merchant, id, name, phone, consent ? 1 : 0, now, now, now, srv).run();
  return id;
}

/* The sale behind a receipt QR: this shop's, alive, under a week old, and not
   already credited to anyone (by the till or by an earlier scan). */
async function usableSale(env, merchant, saleId, now) {
  const sale = await env.DB.prepare('SELECT id, ref, amount, amount_cents, method, ts, void_ts, lines FROM sales WHERE id = ? AND merchant = ?').bind(saleId, merchant).first();
  if (!sale || sale.void_ts != null || !(sale.ts > now - WEEK) || sale.ts > now + 3600_000) return { error: 'receipt-unusable' };
  const used = await env.DB.prepare('SELECT 1 AS x FROM client_purchase_events WHERE merchant = ? AND (ref = ? OR (sale_ref <> \'\' AND sale_ref = ?)) LIMIT 1')
    .bind(merchant, sale.id, String(sale.ref || '')).first();
  const claimed = await env.DB.prepare('SELECT 1 AS x FROM wallet_claims WHERE merchant = ? AND sale_id = ?').bind(merchant, sale.id).first();
  return used || claimed ? { already: true } : { sale };
}

async function creditSale(env, merchant, sale, clientId, now) {
  if (!await claimSale(env.DB, merchant, sale.id, clientId, now)) return false;
  const cents = sale.amount_cents != null ? Number(sale.amount_cents) : Number(sale.amount) * 100;
  let items = [];
  try { items = (JSON.parse(sale.lines || '[]') || []).map((l) => ({ name: l.n, qty: l.q, total: l.t })); } catch (_) {}
  const r = await applyPurchase(env, merchant, { clientId, ref: sale.id, saleRef: String(sale.ref || ''), amount: cents / 100, method: sale.method, items });
  return r.ok;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const now = Date.now(), origin = new URL(request.url).origin;
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const budget = await spendBudget(env, 'ip:' + ip, 'wallet-enroll', 20, 3600_000, now);
    if (!budget.ok) return json({ error: 'rate-limited' }, 429, { 'Retry-After': String(budget.retryAfter) });

    const m = await loadMerchant(env.DB, body && body.merchant);
    const probe = m && m.on ? cardView({ fidelity: m.fidelity, client: {} }) : null;
    if (!probe) return json({ error: 'no-card' }, 404);
    const issue = async (clientId, extra = {}) => {
      const c = await clientById(env, m.slug, clientId);
      const view = cardView({ fidelity: m.fidelity, client: c || {} });
      return json({ ok: true, ...extra, offers: await offersFor(env, { merchant: m, clientId, view, baseUrl: origin }) });
    };

    if (body.t) {
      const tok = await useTillToken(env.DB, str(body.t, 64), now);
      if (!tok || tok.merchant !== m.slug) return json({ error: 'token-expired' }, 410);
      return issue(tok.clientId);
    }

    const phone = normalizePhone(body.phone);
    if (!phone) return json({ error: 'bad-phone' }, 400);
    const twin = (await phoneTwins(env, m.slug, phone, ''))[0] || null;

    if (body.r) {
      const u = await usableSale(env, m.slug, str(body.r, 120), now);
      if (u.error) return json({ error: u.error }, 410);
      if (u.already) return json({ ok: true, already: true });
      const clientId = twin ? twin.id : await createClient(env, m.slug, { name: str(body.name, 80), phone, consent: !!body.consent, now });
      const credited = await creditSale(env, m.slug, u.sale, clientId, now);
      if (!credited) return json({ ok: true, already: true });
      if (twin) {
        if (context.waitUntil) context.waitUntil(notifyClientChanged(env, m.slug, clientId, { baseUrl: origin }).catch(() => {}));
        return json({ ok: true, credited: true, exists: true });
      }
      return issue(clientId, { credited: true });
    }

    if (twin) return json({ ok: true, exists: true });
    const name = str(body.name, 80);
    if (!name) return json({ error: 'name-required' }, 400);
    return issue(await createClient(env, m.slug, { name, phone, consent: !!body.consent, now }));
  } catch (error) {
    if (/no such table|no such column/i.test(String(error && error.message))) return json({ error: 'unmigrated' }, 503);
    throw error;
  }
}
