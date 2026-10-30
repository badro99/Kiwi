// GET  /api/receivables?merchant=<slug>  — livraisons pas encore (entièrement) payées.
// POST /api/receivables  — le transporteur a payé, tout ou partie.
//   { merchant, saleId, method, amount?, id?, collectedBy? }
//   { merchant, saleId, action: "writeoff" } requires this merchant owner session.
//
// Une vente partie en livraison est enregistrée à 0 MAD (sale.js ·
// settlementKind 'receivable') : aucun dirham n'est entré ce jour-là. Le total
// du ticket vit dans sale_receipts, la part à recevoir dans payment_parts. Le
// tableau de bord ne gardait que les ventes à montant positif : une livraison
// n'y apparaissait nulle part, ni dans les créances, ni le jour où le
// transporteur payait. Rien ne permettait de dire « reçue ».
//
// Chaque encaissement écrit UNE vente ordinaire du montant reçu : le chiffre
// d'affaires entre le jour où l'argent arrive, par le flux habituel
// (/api/feed). delivery_collections relie chaque encaissement à sa livraison ;
// la somme ne dépasse jamais ce qui était dû, même si deux appareils encaissent
// au même instant (une seule instruction SQLite décide). Le panier de la vente
// d'origine accompagne le PREMIER encaissement d'une livraison à 0 MAD : les
// articles comptent une fois.
//
// Qui peut dire quoi :
//   · le propriétaire ou un opérateur : virement, chèque (l'argent arrive sur
//     le compte du commerce) ;
//   · une caisse appairée : en plus, les espèces, parce qu'elles entrent dans
//     SON tiroir. Les écrire depuis le tableau de bord fausserait la caisse
//     attendue du Z. `collectedBy` est l'identité {id, name} que
//     verifyStaffPin a rendue à la caisse, jamais un code.
//
// Idempotence : `id` (fourni par l'appareil, un par encaissement) est l'id de
// la vente écrite. Sans `id`, le premier encaissement d'une livraison prend
// 'dlv-<saleId>'. Rejouer le même `id` rend la même vente, 200, même corps :
// une reprise hors ligne ne compte jamais deux fois.
import { entitledMerchant, isTillFor, activeAccountSession } from '../auth/_lib.js';
import { readDeliveryCards } from './_delivery-card.js';
import { heldStockSales, isStockHeld, takeHeldStock } from './_delivery-stock.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const OWNER_METHODS = new Set(['transfer', 'cheque']);
const TILL_METHODS = new Set(['cash', 'transfer', 'cheque']);
const OPEN_LIMIT = 500;
const ID_RE = /^[A-Za-z0-9_:.-]{6,128}$/;

export async function ensureCollectionSchema(db) {
  // Schema owned by migrations 0001–0010.
}

/* Ce que la vente devait en livraison : ses parts « delivery » quand le ticket
 * les détaille (un acompte en espèces + le reste en livraison), sinon le ticket
 * entier moins ce qui est entré ce jour-là. */
export function owedCents(row) {
  let parts = null;
  try { parts = JSON.parse(row && row.payment_parts || 'null'); } catch (_) { parts = null; }
  if (Array.isArray(parts) && parts.length) {
    return parts.reduce((n, p) => n + (p && p.method === 'delivery' && Number.isSafeInteger(Number(p.amountCents)) ? Number(p.amountCents) : 0), 0);
  }
  if (String(row && row.method || '') !== 'delivery') return 0;
  const gross = Number(row && row.gross_ticket_cents);
  const paid = row && row.amount_cents != null ? Number(row.amount_cents) : Math.round(Number(row && row.amount || 0) * 100);
  return Number.isSafeInteger(gross) && gross > paid ? gross - paid : 0;
}
export const dueCents = owedCents;

async function readDeliveries(db, merchant, saleId, withLines) {
  const sql = (withParts, withReceipts) => `SELECT s.id, s.amount, s.amount_cents, s.method, s.label, s.ref, s.ts,${withLines ? ' s.lines,' : ''}
      EXISTS (SELECT 1 FROM sale_audit a WHERE a.merchant = s.merchant AND a.sale_id = s.id AND a.action = 'delivery-writeoff') AS delivery_written_off,
      EXISTS (SELECT 1 FROM sale_audit a WHERE a.merchant = s.merchant AND a.sale_id = s.id AND a.action = 'refund') AS delivery_returned
      ${withParts ? ', s.payment_parts' : ''}${withReceipts ? ', r.gross_ticket_cents' : ''}
    FROM sales s ${withReceipts ? 'LEFT JOIN sale_receipts r ON r.merchant = s.merchant AND r.sale_id = s.id' : ''}
    WHERE s.merchant = ? AND s.void_ts IS NULL ${saleId ? 'AND s.id = ?' : ''}
      AND (s.method = 'delivery' ${withParts ? `OR (s.method = 'split' AND s.payment_parts LIKE '%"delivery"%')` : ''})
    ORDER BY s.ts DESC LIMIT ${OPEN_LIMIT}`;
  /* Une base pas encore guérie (sans payment_parts ou sans sale_receipts) garde
   * ce qu'elle sait : une livraison sans total connu ne s'invente pas. */
  for (const [parts, receipts] of [[true, true], [false, true], [true, false], [false, false]]) {
    try {
      const st = db.prepare(sql(parts, receipts));
      return (await (saleId ? st.bind(merchant, saleId) : st.bind(merchant)).all()).results || [];
    } catch (_) { /* colonne ou table absente : un cran plus simple */ }
  }
  return [];
}

async function readCollections(db, merchant) {
  const bySale = new Map();
  try {
    await ensureCollectionSchema(db);
    const rs = await db.prepare(`SELECT collection_sale_id, sale_id, method, amount_cents, ts, collected_by_name
      FROM delivery_collections WHERE merchant = ? ORDER BY ts ASC`).bind(merchant).all();
    (rs.results || []).forEach((r) => {
      const k = String(r.sale_id);
      if (!bySale.has(k)) bySale.set(k, []);
      bySale.get(k).push({ id: String(r.collection_sale_id), method: String(r.method), amountCents: Number(r.amount_cents),
        ts: Number(r.ts), by: r.collected_by_name ? String(r.collected_by_name) : '' });
    });
  } catch (_) { /* table absente : rien d'encaissé */ }
  return bySale;
}

/* Retours de livraison (propriétaire, 29 octobre) : le colis revient, en tout
 * ou en partie. Une livraison n'a jamais compté dans le chiffre d'affaires
 * (0 MAD le jour de la vente), donc un retour ne retire RIEN du chiffre : il
 * réduit seulement ce qui reste à recevoir. Chaque retour est une ligne
 * sale_audit 'delivery-return' : amount_cents = la valeur rendue, impact =
 * les lignes du panier rendues {i, q}, note = l'identifiant du retour donné
 * par la caisse (rejouer le même retour ne compte jamais deux fois). */
async function readReturns(db, merchant, saleId) {
  const bySale = new Map();
  try {
    const rs = await db.prepare(`SELECT sale_id, note, amount_cents, impact, actor, ts FROM sale_audit
      WHERE merchant = ? AND action = 'delivery-return' ${saleId ? 'AND sale_id = ?' : ''} ORDER BY ts ASC`)
      .bind(...(saleId ? [merchant, saleId] : [merchant])).all();
    (rs.results || []).forEach((r) => {
      const k = String(r.sale_id);
      let lines = [];
      try { const imp = JSON.parse(r.impact || '{}'); lines = Array.isArray(imp.lines) ? imp.lines : []; } catch (_) { lines = []; }
      if (!bySale.has(k)) bySale.set(k, []);
      bySale.get(k).push({ id: String(r.note || ''), amountCents: Number(r.amount_cents) || 0, lines, ts: Number(r.ts) || 0, by: String(r.actor || '') });
    });
  } catch (_) { /* table absente : aucun retour */ }
  return bySale;
}

function parseLines(row) {
  try { const l = JSON.parse(row && row.lines || '[]'); return Array.isArray(l) ? l : []; } catch (_) { return []; }
}
/* Quantité déjà rendue par ligne du panier. */
function returnedQty(returns) {
  const by = new Map();
  (returns || []).forEach((r) => (r.lines || []).forEach((l) => {
    const i = Number(l && l.i), q = Number(l && l.q);
    if (Number.isSafeInteger(i) && q > 0) by.set(i, (by.get(i) || 0) + q);
  }));
  return by;
}

function view(row, collections, returns, card) {
  const owed = row.delivery_written_off ? 0 : owedCents(row);
  const got = (collections || []).reduce((n, c) => n + c.amountCents, 0);
  const back = (returns || []).reduce((n, r) => n + r.amountCents, 0);
  const last = collections && collections[collections.length - 1];
  const lastBack = returns && returns[returns.length - 1];
  const rq = returnedQty(returns);
  return {
    saleId: String(row.id), ref: String(row.ref || ''), label: String(row.label || ''), ts: Number(row.ts) || 0,
    owedCents: owed, returnedCents: Math.min(back, owed), dueCents: Math.max(0, owed - back - got),
    needsReview: !!row.delivery_returned && !row.delivery_written_off,
    collections: collections || [],
    collected: last ? { method: last.method, amountCents: got, ts: last.ts, auto: /^dlv-auto-/.test(last.id || '') } : null,
    returned: lastBack ? { amountCents: back, ts: lastBack.ts } : null,
    customer: card || null,
    lines: row.lines === undefined ? undefined : parseLines(row).map((l, i) => ({
      i, name: String(l && l.n || ''), qty: Number(l && l.q) || 0, totalCents: Math.round(Number(l && l.t || 0) * 100),
      variant: String(l && l.v || ''), returnedQty: rq.get(i) || 0,
    })),
  };
}

/* Confirmation automatique : une livraison qui n'est pas revenue après
 * CONFIRM_DAYS jours est réputée payée par le transporteur. Le reste dû entre
 * alors dans le chiffre d'affaires par un encaissement ordinaire (virement),
 * daté du jour où le délai tombe (vente + 15 jours), pas du jour où quelqu'un
 * ouvre la page : le chiffre tombe toujours le même jour. Le flux suit le
 * rowid, une vente datée du passé arrive donc quand même au tableau de bord.
 * L'identifiant 'dlv-auto-<vente>' rend l'écriture idempotente : deux lectures
 * simultanées n'encaissent jamais deux fois. */
export const CONFIRM_DAYS = 15;
const DAY_MS = 86400000;
/* Le délai ne s'applique qu'aux livraisons vendues depuis le 14 octobre 2026
 * (minuit, Maroc) : celles dont le quinzième jour tombe après la mise en
 * service. Les plus anciennes, jamais marquées reçues, restent « à recevoir »
 * jusqu'à ce que le propriétaire décide : les confirmer d'un coup réécrirait
 * le chiffre d'affaires de journées déjà closes. */
export const AUTO_FROM_TS = Date.UTC(2026, 9, 13, 23);
const AUTO_BATCH = 25;
async function autoConfirm(env, merchant, rows, bySale, returnsBySale, now) {
  let wrote = 0;
  const from = Number(env && env.DELIVERY_AUTO_FROM_TS) || AUTO_FROM_TS;   // réglable pour les tests
  /* Un colis confié à Ozon Express n'a pas de délai : c'est « Payé » chez
     Ozon qui le confirme (confirmByCarrier, functions/api/ozon/track.js). */
  const carried = new Set();
  try {
    const rs = await env.DB.prepare("SELECT sale_id FROM ozon_parcels WHERE merchant = ? AND status != 'cancelled'").bind(merchant).all();
    (rs.results || []).forEach((r) => carried.add(String(r.sale_id)));
  } catch (_) { /* table absente : aucun colis Ozon */ }
  for (const row of rows) {
    if (wrote >= AUTO_BATCH) break;
    const ts = Number(row.ts) || 0;
    if (!ts || ts < from || now - ts < CONFIRM_DAYS * DAY_MS) continue;
    if (row.delivery_written_off || row.delivery_returned || carried.has(String(row.id))) continue;
    const d = view(row, bySale.get(String(row.id)), returnsBySale.get(String(row.id)));
    if (!(d.dueCents > 0)) continue;
    try {
      await writeCollection(env, merchant, row, {
        collectionId: 'dlv-auto-' + String(row.id), method: 'transfer', amount: d.dueCents,
        owed: d.owedCents - d.returnedCents, byId: 'auto', byName: 'Confirmation automatique · ' + CONFIRM_DAYS + ' jours',
        ts: ts + CONFIRM_DAYS * DAY_MS, returns: returnsBySale.get(String(row.id)),
      });
      wrote += 1;
    } catch (_) { /* une autre lecture l'a écrite au même instant : rien à faire */ }
  }
  return wrote;
}

/* Le transporteur a payé (Ozon Express : « Payé »). Le reste dû entre dans le
 * chiffre d'affaires par le même encaissement plafonné et idempotent que la
 * confirmation automatique : `collectionId` est la clé, une relecture du suivi
 * n'encaisse jamais deux fois. Rend la ligne écrite, ou null quand il n'y a
 * plus rien à recevoir (retour, abandon, déjà réglée). */
export async function confirmByCarrier(env, merchant, saleId, o) {
  const row = (await readDeliveries(env.DB, merchant, String(saleId)))[0];
  if (!row || row.delivery_written_off || row.delivery_returned) return null;
  const bySale = await readCollections(env.DB, merchant);
  const returns = (await readReturns(env.DB, merchant, String(saleId))).get(String(saleId));
  const d = view(row, bySale.get(String(saleId)), returns);
  if (!(d.dueCents > 0)) return null;
  return writeCollection(env, merchant, row, {
    collectionId: o.collectionId, method: 'transfer', amount: d.dueCents, owed: d.owedCents - d.returnedCents,
    byId: o.byId || 'carrier', byName: o.byName || 'Transporteur', ts: o.ts, returns,
  });
}

/* Ce qui reste à recevoir sur une livraison, pour le prix du colis. */
export async function deliveryDue(env, merchant, saleId) {
  const row = (await readDeliveries(env.DB, merchant, String(saleId)))[0];
  if (!row) return null;
  const bySale = await readCollections(env.DB, merchant);
  const returns = (await readReturns(env.DB, merchant, String(saleId))).get(String(saleId));
  const d = view(row, bySale.get(String(saleId)), returns);
  return { dueCents: d.dueCents, label: d.label, ref: d.ref, ts: d.ts };
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = asked && await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const withLines = url.searchParams.get('lines') === '1';
  let rows = await readDeliveries(env.DB, merchant, null, withLines);
  let bySale = await readCollections(env.DB, merchant);
  const returnsBySale = await readReturns(env.DB, merchant);
  if (await autoConfirm(env, merchant, rows, bySale, returnsBySale, Date.now())) bySale = await readCollections(env.DB, merchant);
  const cards = await readDeliveryCards(env.DB, merchant);
  const all = rows.map((row) => view(row, bySale.get(String(row.id)), returnsBySale.get(String(row.id)), cards.get(String(row.id)))).filter((d) => d.owedCents > 0);
  /* Le stock retenu d'une livraison réglée qui n'a pas pu sortir (catalogue en
     écriture au même instant) sort ici, à la lecture suivante. La caisse lit
     `stockHeld` pour ne pas remettre en stock un retour qui n'en était pas sorti. */
  const held = await heldStockSales(env.DB, merchant);
  let caught = 0;
  for (const row of rows) {
    const id = String(row.id);
    if (!held.has(id) || caught >= 10) continue;
    const d = all.find((x) => x.saleId === id);
    if (!row.delivery_written_off && d && d.dueCents > 0) continue;
    caught += 1;
    await takeHeldStock(env, merchant, id);
    held.delete(id);
  }
  all.forEach((d) => { d.stockHeld = held.has(d.saleId); });
  return json({
    confirmDays: CONFIRM_DAYS,
    open: all.filter((d) => d.dueCents > 0),
    collected: all.filter((d) => d.dueCents === 0 && d.collected).sort((a, b) => b.collected.ts - a.collected.ts).slice(0, 50),
    returned: all.filter((d) => d.dueCents === 0 && !d.collected && d.returned).sort((a, b) => b.returned.ts - a.returned.ts).slice(0, 50),
  });
}

async function returnedCentsFor(db, merchant, saleId) {
  try {
    const r = await db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS c FROM sale_audit
      WHERE merchant = ? AND sale_id = ? AND action = 'delivery-return'`).bind(merchant, saleId).first();
    return Number(r && r.c || 0);
  } catch (_) { return 0; }
}

async function remainingFor(db, merchant, saleId) {
  const row = (await readDeliveries(db, merchant, saleId))[0];
  if (!row) return 0;
  const got = await db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM delivery_collections WHERE merchant = ? AND sale_id = ?')
    .bind(merchant, saleId).first();
  const back = await returnedCentsFor(db, merchant, saleId);
  return row.delivery_written_off ? 0 : Math.max(0, owedCents(row) - back - Number(got && got.c || 0));
}

/* Le panier qui accompagne le premier encaissement, sans ce qui est revenu :
 * un article rendu n'est pas un article vendu. */
function keptLines(raw, returns) {
  if (!raw || !(returns && returns.length)) return raw;
  let lines = null;
  try { lines = JSON.parse(raw); } catch (_) { return raw; }
  if (!Array.isArray(lines)) return raw;
  const rq = returnedQty(returns);
  const kept = [];
  lines.forEach((l, i) => {
    const q = Number(l && l.q) || 0;
    const back = Math.min(q, rq.get(i) || 0);
    if (!back) { kept.push(l); return; }
    if (back >= q) return;
    kept.push(Object.assign({}, l, { q: q - back, t: Math.round((Number(l.t) || 0) * (q - back) / q * 100) / 100 }));
  });
  return kept.length ? JSON.stringify(kept) : null;
}

/* Écrit UN encaissement et sa vente. `owed` est ce que la livraison doit
 * encore au total (dû d'origine moins les retours) ; la ligne n'entre que si
 * elle y tient à cet instant. Rend la ligne écrite, ou null. */
async function writeCollection(env, merchant, row, o) {
  const saleId = String(row.id);
  const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM delivery_collections WHERE merchant = ? AND sale_id = ?')
    .bind(merchant, saleId).first();
  /* Le panier voyage seulement avec le premier encaissement d'une livraison à
   * 0 MAD : celle-là n'a jamais atteint le tableau de bord. Un acompte +
   * livraison y est déjà passé avec ses articles. */
  const paidThen = row.amount_cents != null ? Number(row.amount_cents) : Math.round(Number(row.amount || 0) * 100);
  let lines = null;
  if (!(paidThen > 0) && !Number(before && before.n)) {
    try { lines = (await env.DB.prepare('SELECT lines FROM sales WHERE merchant = ? AND id = ?').bind(merchant, saleId).first())?.lines ?? null; } catch (_) { lines = null; }
    lines = keptLines(lines, o.returns);
  }
  const ts = o.ts;
  const label = ('Livraison reçue · ' + (row.label || row.ref || saleId)).slice(0, 120);
  /* Une seule instruction décide de la capacité : la ligne n'entre que si
   * elle tient dans ce qui reste dû À CET INSTANT (retours compris). La vente
   * n'est écrite que si la ligne est entrée. Deux caisses qui encaissent la
   * même livraison au même moment ne dépassent jamais le dû. */
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO delivery_collections
        (merchant, collection_sale_id, sale_id, method, amount_cents, ts, collected_by_id, collected_by_name)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ? <= ? - COALESCE((SELECT SUM(amount_cents) FROM delivery_collections
        WHERE merchant = ? AND sale_id = ?), 0)
        AND EXISTS (SELECT 1 FROM sales s WHERE merchant = ? AND id = ? AND void_ts IS NULL
          AND NOT EXISTS (SELECT 1 FROM sale_audit a WHERE a.merchant = s.merchant AND a.sale_id = s.id AND a.action IN ('refund', 'delivery-writeoff')))
      ON CONFLICT DO NOTHING`)
      .bind(merchant, o.collectionId, saleId, o.method, o.amount, ts, o.byId || null, o.byName || null, o.amount, o.owed, merchant, saleId, merchant, saleId),
    /* INSERT simple, jamais OR IGNORE : sales.id est unique pour TOUS les
     * commerces. Si un autre encaissement (ou une autre vente, d'un autre
     * magasin) porte déjà cet identifiant, l'écriture échoue et tout le lot
     * est annulé. Avec OR IGNORE la ligne d'encaissement resterait, le dû
     * baisserait, et aucune vente ne serait écrite. */
    /* Le panier va au premier encaissement décidé DANS le lot : deux caisses
     * qui encaissent en même temps ont pu toutes deux le lire avant. */
    env.DB.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?,
        CASE WHEN (SELECT COUNT(*) FROM delivery_collections WHERE merchant = ? AND sale_id = ?) = 1
          THEN ? ELSE NULL END, 'delivery' WHERE EXISTS (SELECT 1 FROM delivery_collections
        WHERE merchant = ? AND collection_sale_id = ? AND ts = ?)`)
      .bind(o.collectionId, merchant, Math.round(o.amount / 100), o.amount, o.method, label, row.ref || null, ts, merchant, saleId, lines,
        merchant, o.collectionId, ts),
  ]);
  const written = await env.DB.prepare(`SELECT collection_sale_id, sale_id, method, amount_cents, ts FROM delivery_collections
    WHERE merchant = ? AND collection_sale_id = ?`).bind(merchant, o.collectionId).first();
  /* Payée en entier : le stock retenu sort maintenant (functions/api/_delivery-stock.js). */
  if (written && !(await remainingFor(env.DB, merchant, saleId))) await takeHeldStock(env, merchant, saleId);
  return written;
}

function saleBody(row) {
  return { id: String(row.collection_sale_id), saleId: String(row.sale_id), method: String(row.method),
    amountCents: Number(row.amount_cents), amount: Number(row.amount_cents) / 100, ts: Number(row.ts) };
}

/* POST { merchant, saleId, action: "return", id, all: true | lines: [{i, q}], returnedBy? }
 * Le colis revient. `all` rend tout ce qui n'est pas encore revenu ; `lines`
 * nomme les lignes du panier et leurs quantités. La valeur rendue est calculée
 * ICI, depuis le panier figé de la vente, jamais reçue de l'appareil. Quand
 * plus rien du panier n'est dehors, c'est tout le reste dû qui revient
 * (une remise sur le ticket ne laisse pas quelques dirhams en suspens). */
async function recordReturn(env, merchant, saleId, b) {
  const id = String(b && b.id || '');
  if (!ID_RE.test(id)) return json({ error: 'bad-id' }, 400);
  const by = b && b.returnedBy && typeof b.returnedBy === 'object' ? b.returnedBy : null;
  const byId = by ? String(by.id || '').slice(0, 64) : '';
  const byName = by ? String(by.name || '').slice(0, 80) : '';
  const row = (await readDeliveries(env.DB, merchant, saleId, true))[0];
  if (!row) return json({ error: 'not-a-delivery' }, 404);
  if (row.delivery_written_off) return json({ error: 'written-off' }, 409);
  const returns = (await readReturns(env.DB, merchant, saleId)).get(saleId) || [];
  const prior = returns.find((r) => r.id === id);
  if (prior) return json({ ok: true, already: true, returnedCents: prior.amountCents, lines: prior.lines, dueCents: await remainingFor(env.DB, merchant, saleId) });
  const owed = owedCents(row);
  const back = returns.reduce((n, r) => n + r.amountCents, 0);
  const gotRow = await env.DB.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM delivery_collections WHERE merchant = ? AND sale_id = ?')
    .bind(merchant, saleId).first();
  const due = owed - back - Number(gotRow && gotRow.c || 0);
  if (!(due > 0)) return json({ error: 'nothing-due', dueCents: 0 }, 409);

  const basket = parseLines(row);
  const rq = returnedQty(returns);
  const left = (i) => Math.max(0, (Number(basket[i] && basket[i].q) || 0) - (rq.get(i) || 0));
  const want = new Map();
  if (b.all === true) {
    basket.forEach((_, i) => { if (left(i) > 0) want.set(i, left(i)); });
  } else {
    if (!Array.isArray(b.lines) || !b.lines.length) return json({ error: 'bad-lines' }, 400);
    for (const l of b.lines) {
      const i = Number(l && l.i), q = Number(l && l.q);
      if (!Number.isSafeInteger(i) || i < 0 || i >= basket.length || !Number.isSafeInteger(q) || q < 1) return json({ error: 'bad-lines' }, 400);
      want.set(i, (want.get(i) || 0) + q);
    }
    for (const [i, q] of want) if (q > left(i)) return json({ error: 'exceeds-line', i, left: left(i) }, 409);
  }
  const lines = [...want].sort((x, y) => x[0] - y[0]).map(([i, q]) => ({ i, q }));
  let value = lines.reduce((n, l) => {
    const line = basket[l.i];
    const q = Number(line.q) || 0;
    return n + (q > 0 ? Math.round(Math.round(Number(line.t || 0) * 100) * l.q / q) : 0);
  }, 0);
  const nothingLeft = basket.every((_, i) => left(i) - (want.get(i) || 0) <= 0);
  if (nothingLeft) value = due;
  value = Math.min(value, due);
  if (!(value > 0)) return json({ error: 'bad-lines' }, 400);

  const now = Date.now();
  /* Une seule instruction : le retour n'entre que s'il tient dans ce qui reste
   * dû À CET INSTANT et que son identifiant est neuf. */
  const res = await env.DB.prepare(`INSERT INTO sale_audit
      (merchant, sale_id, action, reason, note, actor, actor_id, amount, amount_cents, method, ref, sale_ts, impact, ts)
    SELECT ?, ?, 'delivery-return', 'courier-return', ?, ?, ?, ?, ?, 'delivery', ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-return' AND note = ?)
      AND ? <= ? - COALESCE((SELECT SUM(amount_cents) FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-return'), 0)
        - COALESCE((SELECT SUM(amount_cents) FROM delivery_collections WHERE merchant = ? AND sale_id = ?), 0)`)
    .bind(merchant, saleId, id, byName, byId, Math.round(value / 100), value, String(row.ref || ''), Number(row.ts) || 0,
      JSON.stringify({ lines }), now, merchant, saleId, id, value, owed, merchant, saleId, merchant, saleId).run();
  if (!(res && res.meta && res.meta.changes)) {
    const again = ((await readReturns(env.DB, merchant, saleId)).get(saleId) || []).find((r) => r.id === id);
    if (again) return json({ ok: true, already: true, returnedCents: again.amountCents, lines: again.lines, dueCents: await remainingFor(env.DB, merchant, saleId) });
    return json({ error: 'nothing-due', dueCents: await remainingFor(env.DB, merchant, saleId) }, 409);
  }
  /* Une livraison retenue n'est jamais sortie du stock : le retour n'y remet
     rien (la caisse lit `stockHeld`). Si le retour solde la livraison, ce qui
     reste chez le client sort maintenant. */
  const stockHeld = await isStockHeld(env.DB, merchant, saleId);
  if (stockHeld && !(due - value > 0)) await takeHeldStock(env, merchant, saleId);
  return json({ ok: true, already: false, returnedCents: value, lines, dueCents: Math.max(0, due - value), stockHeld });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let b = null;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = String(b && b.merchant || '').slice(0, 64);
  if (!asked) return json({ error: 'forbidden-merchant' }, 403);
  let till = false;
  try { till = await isTillFor(request, env, asked); } catch (_) { till = false; }
  const owner = (await entitledMerchant(request, env, asked)) === asked;
  if (!till && !owner) return json({ error: 'forbidden-merchant' }, 403);
  const merchant = asked;

  const saleId = String(b && b.saleId || '').slice(0, 128);
  const method = String(b && b.method || '');
  if (!saleId) return json({ error: 'bad-sale' }, 400);
  if (b.action === 'writeoff') {
    const session = await activeAccountSession(request, env);
    const config = session && await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    if (!session || config?.account_id !== session.aid) return json({ error: 'owner-required' }, 403);
    await ensureCollectionSchema(env.DB);
    const row = (await readDeliveries(env.DB, merchant, saleId))[0];
    if (!row) return json({ error: 'not-a-delivery' }, 404);
    await env.DB.prepare(`INSERT INTO sale_audit
      (merchant, sale_id, action, reason, actor_id, amount, amount_cents, method, sale_ts, impact, ts)
      SELECT ?, ?, 'delivery-writeoff', 'owner-review', ?, 0,
        MAX(0, ? - COALESCE((SELECT SUM(amount_cents) FROM delivery_collections WHERE merchant = ? AND sale_id = ?), 0)),
        'delivery', ?, '{}', ? WHERE NOT EXISTS
        (SELECT 1 FROM sale_audit WHERE merchant = ? AND sale_id = ? AND action = 'delivery-writeoff')`)
      .bind(merchant, saleId, session.aid, owedCents(row), merchant, saleId, row.ts, Date.now(), merchant, saleId).run();
    await takeHeldStock(env, merchant, saleId);   // l'article ne reviendra pas
    return json({ ok: true, dueCents: 0 });
  }
  if (b.action === 'return') return recordReturn(env, merchant, saleId, b);
  const allowed = till ? TILL_METHODS : OWNER_METHODS;
  if (!allowed.has(method)) return json({ error: method === 'cash' ? 'cash-at-till-only' : 'bad-method', allowed: [...allowed] }, 400);
  const clientId = b && b.id != null ? String(b.id) : '';
  if (clientId && !ID_RE.test(clientId)) return json({ error: 'bad-id' }, 400);
  const by = b && b.collectedBy && typeof b.collectedBy === 'object' ? b.collectedBy : null;
  const byId = by ? String(by.id || '').slice(0, 64) : '';
  const byName = by ? String(by.name || '').slice(0, 80) : '';

  await ensureCollectionSchema(env.DB);
  const collectionId = clientId || ('dlv-' + saleId);
  const prior = await env.DB.prepare(`SELECT collection_sale_id, sale_id, method, amount_cents, ts FROM delivery_collections
    WHERE merchant = ? AND collection_sale_id = ?`).bind(merchant, collectionId).first();
  if (prior) {
    if (String(prior.sale_id) !== saleId) return json({ error: 'id-conflict' }, 409);
    return json({ ok: true, already: true, sale: saleBody(prior), dueCents: await remainingFor(env.DB, merchant, saleId) });
  }

  const row = (await readDeliveries(env.DB, merchant, saleId))[0];
  if (!row) return json({ error: 'not-a-delivery' }, 404);
  if (row.delivery_returned && !row.delivery_written_off) return json({ error: 'not-a-delivery', needsReview: true }, 409);
  const owed = row.delivery_written_off ? 0 : Math.max(0, owedCents(row) - await returnedCentsFor(env.DB, merchant, saleId));
  const before = await env.DB.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM delivery_collections WHERE merchant = ? AND sale_id = ?')
    .bind(merchant, saleId).first();
  const remaining = owed - Number(before && before.c || 0);
  if (!(remaining > 0)) return json({ error: 'nothing-due', dueCents: 0 }, 409);
  /* Le montant remis peut être inférieur au dû (le transporteur retient ses
   * frais, le client n'a payé qu'une partie) : le reste reste ouvert. Absent,
   * c'est tout le reste. Jamais au-delà de ce qui est dû. */
  let amount = remaining;
  if (b && b.amountCents != null) amount = Number(b.amountCents);
  else if (b && b.amount != null) amount = Math.round(Number(b.amount) * 100);
  if (!Number.isSafeInteger(amount) || amount < 1) return json({ error: 'bad-amount' }, 400);
  if (amount > remaining) return json({ error: 'exceeds-due', dueCents: remaining }, 409);

  const now = Date.now();
  let written = null;
  try {
    written = await writeCollection(env, merchant, row, { collectionId, method, amount, owed, byId, byName, ts: now,
      returns: (await readReturns(env.DB, merchant, saleId)).get(saleId) });
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error && error.message || error))) return json({ error: 'id-taken' }, 409);
    return json({ error: 'collection-write-failed', detail: String(error && error.message || error) }, 503);
  }

  if (!written) return json({ error: 'exceeds-due', dueCents: Math.max(0, remaining - amount) }, 409);
  if (String(written.sale_id) !== saleId) return json({ error: 'id-conflict' }, 409);
  const after = await env.DB.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM delivery_collections WHERE merchant = ? AND sale_id = ?')
    .bind(merchant, saleId).first();
  return json({ ok: true, already: Number(written.ts) !== now, sale: saleBody(written), dueCents: Math.max(0, owed - Number(after && after.c || 0)) });
}
