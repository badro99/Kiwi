// GET /api/commissions?merchant=<slug>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Commissions vendeurs d'une période : pour chaque vendeur, ses tickets, ce qu'il
// a encaissé, ce qui a été remboursé sur ses ventes, et sa commission au taux de
// sa fiche Équipe. Les règles sont dans _commissions.js.
//
// `from` et `to` sont des JOURNÉES D'ACTIVITÉ incluses (la journée de la caisse,
// coupure à 5 h par défaut), pour que la paie et la clôture comptent la même
// vente le même jour.
//
// Accès : l'option « Commissions vendeurs » du commerce (features.sellerCommissions,
// kiwi-admin), puis celui de /api/sales-summary (entitledMerchant), et le palier
// « owner » côté session (_session-tier.js) : ce sont des montants de paie.
// Aucune donnée de code ne sort : de la fiche Équipe on ne lit que le nom, l'id
// et le taux.

import { json, entitledMerchant } from '../auth/_lib.js';
import { legacyBucketFor } from './_sales-scope.js';
import { businessBoundary, businessDate, addBusinessDays, merchantZone, merchantCutoff } from './_business-day.js';
import { commissionsReport } from './_commissions.js';
import { readTeamMembers } from './_seller.js';

export const MAX_SPAN_DAYS = 400;
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = 'CAST(ROUND(COALESCE(amount_cents, amount * 100)) AS INTEGER)';

function validDay(d) {
  if (!DAY_RX.test(d)) return false;
  const t = Date.parse(d + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}

async function featureOn(env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT features FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    return JSON.parse((row && row.features) || '{}').sellerCommissions === true;
  } catch (_) { return false; }
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const fromDay = String(url.searchParams.get('from') || '');
  const toDay = String(url.searchParams.get('to') || '');
  if (!validDay(fromDay) || !validDay(toDay) || toDay < fromDay) return json({ error: 'range' }, 400);
  const span = (Date.parse(toDay + 'T00:00:00Z') - Date.parse(fromDay + 'T00:00:00Z')) / 86400000 + 1;
  if (span > MAX_SPAN_DAYS) return json({ error: 'range-too-long', maxDays: MAX_SPAN_DAYS }, 400);
  if (!env || !env.DB) return json({ merchant: '', sellers: [], unattributed: null, totals: null });

  /* La caisse appairée lit la journée qu'elle clôture, rien d'autre : la journée
     d'activité en cours, ou la veille pour une clôture passée la coupure. Le jour
     est calculé ici, jamais pris à la caisse, pour qu'elle ne remonte pas le
     passé jour par jour. */
  let merchant = await entitledMerchant(request, env, asked);
  if (!merchant && span === 1) {
    const till = await entitledMerchant(request, env, asked, { allowTill: true });
    if (till) {
      const [z, c] = await Promise.all([merchantZone(env, till), merchantCutoff(env, till)]);
      const today = businessDate(Date.now(), c, z);
      if (fromDay === today || fromDay === addBusinessDays(today, -1)) merchant = till;
    }
  }
  if (!merchant) return json({ merchant: '', sellers: [] }, 403);
  /* Une option posée par commerce dans kiwi-admin (« Commissions vendeurs »),
     éteinte tant qu'elle ne vaut pas explicitement true. */
  if (!await featureOn(env, merchant)) return json({ merchant, error: 'feature-off', sellers: [] }, 403);
  const legacy = await legacyBucketFor(request, env, merchant);
  const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);
  const from = businessBoundary(fromDay, cutoff, zone);
  const to = businessBoundary(addBusinessDays(toDay, 1), cutoff, zone);
  const scope = [merchant, legacy || merchant];

  let sales, refunds;
  try {
    [sales, refunds] = await Promise.all([
      env.DB.prepare(
        `SELECT seller_id, seller_name, COUNT(*) AS n, SUM(${MONEY}) AS cents FROM sales
          WHERE merchant IN (?, ?) AND ts >= ? AND ts < ? AND void_ts IS NULL AND ${MONEY} > 0
          GROUP BY seller_id, seller_name`
      ).bind(...scope, from, to).all(),
      /* Le remboursement compte le jour où il est fait, sur le vendeur de la vente d'origine. */
      env.DB.prepare(
        `SELECT s.seller_id, s.seller_name, SUM(COALESCE(a.amount_cents, a.amount * 100)) AS cents
           FROM sale_audit a JOIN sales s ON s.merchant = a.merchant AND s.id = a.sale_id
          WHERE a.merchant IN (?, ?) AND a.action = 'refund' AND a.ts >= ? AND a.ts < ? AND s.void_ts IS NULL
          GROUP BY s.seller_id, s.seller_name`
      ).bind(...scope, from, to).all(),
    ]);
  } catch (_) {
    /* Une base d'avant les colonnes vendeur : il n'y a rien à attribuer. */
    return json({ merchant, from: fromDay, to: toDay, error: 'db', sellers: [] }, 503);
  }
  const members = await readTeamMembers(env, merchant);
  const report = commissionsReport({
    sales: (sales && sales.results) || [],
    refunds: (refunds && refunds.results) || [],
    members,
  });
  return json({ merchant, zone, cutoff, from: fromDay, to: toDay, ...report, generatedAt: Date.now() });
}
