// POST /api/invoice — Création ou réouverture de facture à partir d'une vente D1.
// GET  /api/invoice — Liste des factures de vente d'un établissement.
//
// Règles architecturales (non négociables) :
// 1. Une vente = une seule facture, numérotée séquentiellement par établissement (F-AAAA-0001).
// 2. Idempotence D1 absolue : PRIMARY KEY (merchant, sale_id). Un second appel renvoie
//    le snapshot figé d'origine.
// 3. Authentification tenantFor (session gérant, caisse appairée, console opérateur).
// 4. Bornage et validation stricts (ICE 15 chiffres, nom <= 80 car.), zéro log de données métier.

import { tenantFor } from './_private.js';
import { json } from '../auth/_lib.js';

export function validateCustomer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 80);
  const iceRaw = String(raw.ice || '').trim();
  const ifNum = String(raw.if || raw.ifNum || '').trim().slice(0, 30);

  if (iceRaw && !/^\d{15}$/.test(iceRaw)) {
    throw new Error('invalid-ice');
  }

  if (!name && !iceRaw && !ifNum) return null;
  return {
    name: name || '',
    ice: iceRaw || '',
    if: ifNum || '',
  };
}

export function formatInvoiceNumber(year, seq) {
  const y = Number(year) || new Date().getFullYear();
  const s = Math.max(1, Number(seq) || 1);
  return `F-${y}-${String(s).padStart(4, '0')}`;
}

export async function ensureInvoiceSchema(db) {
  try {
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS sale_invoices (' +
      'merchant TEXT NOT NULL, seq INTEGER NOT NULL, number TEXT NOT NULL, ' +
      'sale_id TEXT NOT NULL, customer TEXT, snapshot TEXT NOT NULL, created_ts INTEGER NOT NULL, ' +
      'PRIMARY KEY (merchant, sale_id), UNIQUE (merchant, seq))'
    ).run();
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_sale_invoices_merchant_seq ON sale_invoices (merchant, seq)'
    ).run();
  } catch (_) {}
}

export async function getOrCreateSaleInvoice(env, merchant, saleId, customerData, clientSnapshot) {
  if (!env || !env.DB) throw new Error('no-db');
  await ensureInvoiceSchema(env.DB);

  // 1. Vérifier si la facture existe déjà pour cette vente
  const existing = await env.DB.prepare(
    'SELECT merchant, seq, number, sale_id, customer, snapshot, created_ts FROM sale_invoices WHERE merchant = ? AND sale_id = ?'
  ).bind(merchant, saleId).first();

  if (existing) {
    let parsedSnap = null;
    try { parsedSnap = JSON.parse(existing.snapshot); } catch (_) {}
    let parsedCust = null;
    try { parsedCust = existing.customer ? JSON.parse(existing.customer) : null; } catch (_) {}
    return {
      existing: true,
      seq: Number(existing.seq),
      number: existing.number,
      saleId: existing.sale_id,
      customer: parsedCust,
      snapshot: parsedSnap,
      createdTs: Number(existing.created_ts),
    };
  }

  /* Le filet ne vérifiait QUE l'existence — littéralement `SELECT 1`. Tout ce
   * qui s'imprime sur la facture venait ensuite du client sans jamais être
   * confronté à la vente : montants, lignes, TVA, et l'horodatage qui décide de
   * l'année du numéro officiel. On pouvait donc stocker une facture antidatée
   * dans un exercice clos, d'un montant choisi, contre une vente déjà annulée.
   * On lit maintenant la vente pour de bon. */
  const saleRow = await env.DB.prepare(
    'SELECT ts, void_ts, amount, amount_cents FROM sales WHERE merchant = ? AND id = ?'
  ).bind(merchant, saleId).first();

  if (!saleRow) {
    const err = new Error('unknown-sale');
    err.status = 404;
    throw err;
  }

  // Une vente annulée ne donne pas lieu à une facture : c'est un avoir.
  if (saleRow.void_ts) {
    const err = new Error('sale-voided');
    err.status = 409;
    throw err;
  }

  // 2. Création d'une nouvelle facture avec retry sur collision séquentielle
  const customer = validateCustomer(customerData);
  const now = Date.now();

  const snap = clientSnapshot && typeof clientSnapshot === 'object' ? { ...clientSnapshot } : {};

  /* L'exercice d'une facture est celui de la VENTE, jamais celui que le client
   * annonce : `seq` étant global au commerçant et non annuel, un issuedTs choisi
   * laissait sortir F-2024-0087 après F-2026-0086 sans violer la moindre
   * contrainte. On borne l'horodatage entre la vente et maintenant. */
  const saleTs = Number(saleRow.ts) || now;
  const askedTs = Number(snap.issuedTs);
  const issuedTs = Number.isFinite(askedTs)
    ? Math.min(Math.max(askedTs, saleTs), now)
    : now;
  const year = new Date(saleTs).getFullYear();

  /* Le total imprimé doit être celui encaissé. `totals.ttc` est en dirhams
   * (assets/invoice.js le construit depuis amountCents/100), la colonne en
   * centimes fait foi. On tolère le centime d'arrondi et on REFUSE au-delà
   * plutôt que de réécrire le champ : corriger le seul TTC laisserait un
   * document dont HT + TVA ne retombent plus dessus. Les lignes d'avant la
   * migration n'ont qu'un montant en dirhams entiers : rien à confronter. */
  if (saleRow.amount_cents != null) {
    const saleCents = Number(saleRow.amount_cents);
    const askedTtc = snap.totals && Number(snap.totals.ttc);
    if (Number.isFinite(saleCents) && Number.isFinite(askedTtc)
        && Math.abs(Math.round(askedTtc * 100) - saleCents) > 1) {
      const err = new Error('total-mismatch');
      err.status = 409;
      throw err;
    }
  }

  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    const maxRow = await env.DB.prepare(
      'SELECT COALESCE(MAX(seq), 0) AS max_seq FROM sale_invoices WHERE merchant = ?'
    ).bind(merchant).first();

    const nextSeq = (Number(maxRow?.max_seq) || 0) + 1;
    const number = formatInvoiceNumber(year, nextSeq);

    snap.number = number;
    snap.issuedTs = issuedTs;
    if (customer) snap.customer = customer;

    const snapStr = JSON.stringify(snap);
    const custStr = customer ? JSON.stringify(customer) : null;

    try {
      await env.DB.prepare(
        'INSERT INTO sale_invoices (merchant, seq, number, sale_id, customer, snapshot, created_ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(merchant, nextSeq, number, saleId, custStr, snapStr, now).run();

      return {
        existing: false,
        seq: nextSeq,
        number: number,
        saleId: saleId,
        customer: customer,
        snapshot: snap,
        createdTs: now,
      };
    } catch (err) {
      const msg = String(err?.message || err || '');
      // En cas de collision concurrentielle sur (merchant, sale_id)
      if (msg.includes('UNIQUE constraint failed: sale_invoices.merchant, sale_invoices.sale_id') ||
          msg.includes('PRIMARY KEY')) {
        const row = await env.DB.prepare(
          'SELECT merchant, seq, number, sale_id, customer, snapshot, created_ts FROM sale_invoices WHERE merchant = ? AND sale_id = ?'
        ).bind(merchant, saleId).first();
        if (row) {
          let s = null, c = null;
          try { s = JSON.parse(row.snapshot); } catch (_) {}
          try { c = row.customer ? JSON.parse(row.customer) : null; } catch (_) {}
          return {
            existing: true,
            seq: Number(row.seq),
            number: row.number,
            saleId: row.sale_id,
            customer: c,
            snapshot: s,
            createdTs: Number(row.created_ts),
          };
        }
      }
      // Si collision sur seq (deux appareils en même temps), la boucle while réessaye avec le nouveau MAX(seq)
      if (!msg.includes('UNIQUE constraint failed: sale_invoices.merchant, sale_invoices.seq') &&
          !msg.includes('sale_invoices.seq')) {
        throw err;
      }
    }
  }

  throw new Error('concurrency-retry-exhausted');
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const asked = String((body && body.merchant) || '').slice(0, 64).trim();
  if (!asked) return json({ error: 'no-merchant' }, 400);

  const merchant = await tenantFor(request, env, asked, { strict: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  const saleId = String((body && (body.saleId || body.sale_id)) || '').slice(0, 120).trim();
  if (!saleId) return json({ error: 'missing-sale-id' }, 400);

  let customerData = body.customer || null;
  try {
    customerData = validateCustomer(customerData);
  } catch (err) {
    if (err?.message === 'invalid-ice') {
      return json({ error: 'invalid-ice', detail: 'ICE doit comporter exactement 15 chiffres.' }, 400);
    }
    return json({ error: 'invalid-customer' }, 400);
  }

  const clientSnapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : null;

  try {
    const result = await getOrCreateSaleInvoice(env, merchant, saleId, customerData, clientSnapshot);
    return json({ ok: true, invoice: result });
  } catch (e) {
    if (e?.message === 'unknown-sale' || e?.status === 404) {
      return json({ error: 'unknown-sale', detail: 'Vente introuvable dans le grand livre D1.' }, 404);
    }
    return json({ error: 'invoice-creation-failed', detail: String(e?.message || e) }, 500);
  }
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);

  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64).trim();
  if (!asked) return json({ error: 'no-merchant' }, 400);

  const merchant = await tenantFor(request, env, asked, { strict: false });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  await ensureInvoiceSchema(env.DB);

  const saleId = url.searchParams.get('saleId') || url.searchParams.get('sale_id');
  if (saleId) {
    const row = await env.DB.prepare(
      'SELECT merchant, seq, number, sale_id, customer, snapshot, created_ts FROM sale_invoices WHERE merchant = ? AND sale_id = ?'
    ).bind(merchant, String(saleId).slice(0, 120)).first();

    if (!row) return json({ ok: true, invoice: null });
    let s = null, c = null;
    try { s = JSON.parse(row.snapshot); } catch (_) {}
    try { c = row.customer ? JSON.parse(row.customer) : null; } catch (_) {}
    return json({
      ok: true,
      invoice: {
        seq: Number(row.seq),
        number: row.number,
        saleId: row.sale_id,
        customer: c,
        snapshot: s,
        createdTs: Number(row.created_ts),
      }
    });
  }

  // Liste des factures pour ce merchant
  try {
    const { results } = await env.DB.prepare(
      'SELECT merchant, seq, number, sale_id, customer, snapshot, created_ts FROM sale_invoices WHERE merchant = ? ORDER BY seq DESC LIMIT 200'
    ).bind(merchant).all();

    const list = (results || []).map((row) => {
      let s = null, c = null;
      try { s = JSON.parse(row.snapshot); } catch (_) {}
      try { c = row.customer ? JSON.parse(row.customer) : null; } catch (_) {}
      return {
        seq: Number(row.seq),
        number: row.number,
        saleId: row.sale_id,
        customer: c,
        snapshot: s,
        createdTs: Number(row.created_ts),
      };
    });

    return json({ ok: true, invoices: list });
  } catch (e) {
    return json({ error: 'query-failed', detail: String(e?.message || e) }, 500);
  }
}
