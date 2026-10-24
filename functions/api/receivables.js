// GET  /api/receivables?merchant=<slug>  — livraisons pas encore (entièrement) payées.
// POST /api/receivables  — le transporteur a payé, tout ou partie.
//   { merchant, saleId, method, amount?, id?, collectedBy? }
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
import { entitledMerchant, isTillFor } from '../auth/_lib.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const OWNER_METHODS = new Set(['transfer', 'cheque']);
const TILL_METHODS = new Set(['cash', 'transfer', 'cheque']);
const OPEN_LIMIT = 500;
const ID_RE = /^[A-Za-z0-9_:.-]{6,128}$/;

export async function ensureCollectionSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS delivery_collections (
    merchant TEXT NOT NULL, collection_sale_id TEXT NOT NULL, sale_id TEXT NOT NULL,
    method TEXT NOT NULL, amount_cents INTEGER NOT NULL, ts INTEGER NOT NULL,
    collected_by_id TEXT, collected_by_name TEXT,
    PRIMARY KEY (merchant, collection_sale_id))`).bind().run();
  await db.prepare('CREATE INDEX IF NOT EXISTS delivery_collections_sale ON delivery_collections (merchant, sale_id)').bind().run();
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

async function readDeliveries(db, merchant, saleId) {
  const sql = (withParts, withReceipts) => `SELECT s.id, s.amount, s.amount_cents, s.method, s.label, s.ref, s.ts,
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

function view(row, collections) {
  const owed = row.delivery_written_off ? 0 : owedCents(row);
  const got = (collections || []).reduce((n, c) => n + c.amountCents, 0);
  const last = collections && collections[collections.length - 1];
  return {
    saleId: String(row.id), ref: String(row.ref || ''), label: String(row.label || ''), ts: Number(row.ts) || 0,
    owedCents: owed, dueCents: Math.max(0, owed - got), needsReview: !!row.delivery_returned && !row.delivery_written_off,
    collections: collections || [],
    collected: last ? { method: last.method, amountCents: got, ts: last.ts } : null,
  };
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const merchant = asked && await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const rows = await readDeliveries(env.DB, merchant);
  const bySale = await readCollections(env.DB, merchant);
  const all = rows.map((row) => view(row, bySale.get(String(row.id)))).filter((d) => d.owedCents > 0);
  return json({
    open: all.filter((d) => d.dueCents > 0),
    collected: all.filter((d) => d.dueCents === 0).sort((a, b) => b.collected.ts - a.collected.ts).slice(0, 50),
  });
}

async function remainingFor(db, merchant, saleId) {
  const row = (await readDeliveries(db, merchant, saleId))[0];
  if (!row) return 0;
  const got = await db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM delivery_collections WHERE merchant = ? AND sale_id = ?')
    .bind(merchant, saleId).first();
  return row.delivery_written_off ? 0 : Math.max(0, owedCents(row) - Number(got && got.c || 0));
}

function saleBody(row) {
  return { id: String(row.collection_sale_id), saleId: String(row.sale_id), method: String(row.method),
    amountCents: Number(row.amount_cents), amount: Number(row.amount_cents) / 100, ts: Number(row.ts) };
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
  const owed = row.delivery_written_off ? 0 : owedCents(row);
  const before = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS c FROM delivery_collections WHERE merchant = ? AND sale_id = ?')
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

  /* Le panier voyage seulement avec le premier encaissement d'une livraison à
   * 0 MAD : celle-là n'a jamais atteint le tableau de bord. Un acompte +
   * livraison y est déjà passé avec ses articles. */
  const paidThen = row.amount_cents != null ? Number(row.amount_cents) : Math.round(Number(row.amount || 0) * 100);
  let lines = null;
  if (!(paidThen > 0) && !Number(before && before.n)) {
    try { lines = (await env.DB.prepare('SELECT lines FROM sales WHERE merchant = ? AND id = ?').bind(merchant, saleId).first())?.lines ?? null; } catch (_) { lines = null; }
  }
  const now = Date.now();
  const label = ('Livraison reçue · ' + (row.label || row.ref || saleId)).slice(0, 120);
  try {
    /* Une seule instruction décide de la capacité : la ligne n'entre que si
     * elle tient dans ce qui reste dû À CET INSTANT. La vente n'est écrite que
     * si la ligne est entrée. Deux caisses qui encaissent la même livraison au
     * même moment ne dépassent jamais le dû. */
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO delivery_collections
          (merchant, collection_sale_id, sale_id, method, amount_cents, ts, collected_by_id, collected_by_name)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ? <= ? - COALESCE((SELECT SUM(amount_cents) FROM delivery_collections
          WHERE merchant = ? AND sale_id = ?), 0)
          AND EXISTS (SELECT 1 FROM sales s WHERE merchant = ? AND id = ? AND void_ts IS NULL
            AND NOT EXISTS (SELECT 1 FROM sale_audit a WHERE a.merchant = s.merchant AND a.sale_id = s.id AND a.action IN ('refund', 'delivery-writeoff')))
        ON CONFLICT DO NOTHING`)
        .bind(merchant, collectionId, saleId, method, amount, now, byId || null, byName || null, amount, owed, merchant, saleId, merchant, saleId),
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
        .bind(collectionId, merchant, Math.round(amount / 100), amount, method, label, row.ref || null, now, merchant, saleId, lines,
          merchant, collectionId, now),
    ]);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error && error.message || error))) return json({ error: 'id-taken' }, 409);
    return json({ error: 'collection-write-failed', detail: String(error && error.message || error) }, 503);
  }
  const written = await env.DB.prepare(`SELECT collection_sale_id, sale_id, method, amount_cents, ts FROM delivery_collections
    WHERE merchant = ? AND collection_sale_id = ?`).bind(merchant, collectionId).first();
  if (!written) return json({ error: 'exceeds-due', dueCents: Math.max(0, remaining - amount) }, 409);
  if (String(written.sale_id) !== saleId) return json({ error: 'id-conflict' }, 409);
  const after = await env.DB.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM delivery_collections WHERE merchant = ? AND sale_id = ?')
    .bind(merchant, saleId).first();
  return json({ ok: true, already: Number(written.ts) !== now, sale: saleBody(written), dueCents: Math.max(0, owed - Number(after && after.c || 0)) });
}
