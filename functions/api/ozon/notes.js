// /api/ozon/notes — Ozon delivery notes (bons de livraison) and their labels.
//
//   GET  ?merchant=slug → { notes: [{ ref, parcels, createdTs, pdf }] }
//   POST { merchant, trackings? } → { ok, ref, parcels, pdf }
//
// Ozon's four steps (create, add parcels, save, print) run here in one go.
// Without `trackings`, the note takes every parcel not yet on a note and not
// finished. The PDFs live on client.ozoneexpress.ma (Ozon's own site; the
// person printing is signed in there): standard note, A4 labels, 10x10 labels.
import { exactMerchant, json, readAccount, ozonCall, stepError, pick, pdfLinks } from './_lib.js';

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const merchant = await exactMerchant(request, env, new URL(request.url).searchParams.get('merchant'), true);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  let rows = [];
  try {
    rows = (await env.DB.prepare('SELECT ref, parcels, created_ts FROM ozon_delivery_notes WHERE merchant = ? ORDER BY created_ts DESC LIMIT 50')
      .bind(merchant).all()).results || [];
  } catch (_) { rows = []; }
  return json({ notes: rows.map((r) => ({ ref: String(r.ref), parcels: Number(r.parcels) || 0, createdTs: Number(r.created_ts) || 0, pdf: pdfLinks(r.ref) })) });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await exactMerchant(request, env, String(b && b.merchant || ''), true);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const account = await readAccount(env, merchant);
  if (!account) return json({ error: 'not-connected' }, 409);

  const open = ((await env.DB.prepare(`SELECT tracking FROM ozon_parcels WHERE merchant = ? AND bl_ref = ''
      AND tracking NOT LIKE 'pending:%' AND status IN ('pending', 'in_transit') ORDER BY created_ts ASC LIMIT 200`).bind(merchant).all()).results || [])
    .map((r) => String(r.tracking));
  const asked = Array.isArray(b.trackings) ? b.trackings.map((t) => String(t)) : null;
  const codes = asked ? open.filter((t) => asked.includes(t)) : open;
  if (!codes.length) return json({ error: 'no-parcels' }, 409);

  const created = await ozonCall(env, account, 'add-delivery-note', null);
  const ref = created.ok ? pick(created.data, ['REF', 'REFERENCE', 'DN-REF']) : undefined;
  if (!ref) return json({ error: created.ok ? 'ozon-refused' : created.error, message: created.ok ? stepError(created.data) : (created.message || ''), step: 'create' }, 502);

  const add = new FormData();
  add.append('Ref', String(ref));
  codes.forEach((c, i) => add.append(`Codes[${i}]`, c));
  const added = await ozonCall(env, account, 'add-parcel-to-delivery-note', add);
  if (!added.ok || stepError(added.data)) return json({ error: added.ok ? 'ozon-refused' : added.error, message: added.ok ? stepError(added.data) : (added.message || ''), step: 'add', ref: String(ref) }, 502);

  const save = new FormData();
  save.append('Ref', String(ref));
  const saved = await ozonCall(env, account, 'save-delivery-note', save);
  if (!saved.ok || stepError(saved.data)) return json({ error: saved.ok ? 'ozon-refused' : saved.error, message: saved.ok ? stepError(saved.data) : (saved.message || ''), step: 'save', ref: String(ref) }, 502);

  const now = Date.now();
  const marks = codes.map(() => '?').join(',');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ozon_delivery_notes (merchant, ref, parcels, created_ts, created_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
      .bind(merchant, String(ref).slice(0, 64), codes.length, now, 'kiwi'),
    env.DB.prepare(`UPDATE ozon_parcels SET bl_ref = ? WHERE merchant = ? AND tracking IN (${marks})`).bind(String(ref).slice(0, 64), merchant, ...codes),
  ]);
  return json({ ok: true, ref: String(ref), parcels: codes.length, pdf: pdfLinks(ref) });
}
