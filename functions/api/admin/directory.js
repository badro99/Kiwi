/* /api/admin/directory · la modération de l'annuaire Kiwi, pour l'équipe.
 *   GET   ?view=pending|approved|clients|removed|rejected|requests
 *         → { listings | requests, counts }
 *   PATCH { id, action: approve|reject|remove|restore|edit, fields? } → { ok, listing }
 *   PATCH { requestId, action: done|dismiss|remove } → { ok }
 *
 * Opérateurs seulement (guard). C'est la seule route qui lit les coordonnées de
 * contact d'une fiche (nom, e-mail, téléphone de la personne qui l'a envoyée)
 * et le contact laissé avec un signalement.
 *
 * « remove » retire la fiche en un geste, client ou non, et clôt les demandes
 * ouvertes qui la visent ; sur une demande, il retire la fiche visée. Une fiche
 * client retirée ne se rallume pas depuis le tableau de bord du commerçant
 * (functions/api/directory/listing.js) ; « restore » la rend à son état
 * « éteinte », et le commerçant décide de la rallumer. */
import { json, operatorActor } from '../../auth/_lib.js';
import { guard, clean } from './_workspace.js';
import { normalizePhone } from '../_phone.js';
import { sanitizeListing, baseSlug, uniqueSlug, dedupeKey, missingTable } from '../_directory.js';

const COLS = `id, slug, kind, merchant, status, name, trade, city, address, description, website, show_phone, whatsapp,
  contact_name, contact_email, contact_phone, lang, created_ts, updated_ts, reviewed_ts, reviewed_by`;
const VIEWS = {
  pending: "status = 'pending'",
  approved: "status = 'approved' AND kind = 'public'",
  clients: "kind = 'client' AND status IN ('approved', 'off')",
  removed: "status = 'removed'",
  rejected: "status = 'rejected'",
};

async function counts(DB) {
  const [a, b] = await Promise.all([
    DB.prepare("SELECT status, kind, COUNT(*) AS n FROM directory_listings GROUP BY status, kind").all(),
    DB.prepare("SELECT COUNT(*) AS n FROM directory_requests WHERE status = 'open'").first(),
  ]);
  const out = { pending: 0, approved: 0, clients: 0, removed: 0, rejected: 0, requests: Number(b && b.n) || 0 };
  for (const r of a.results || []) {
    const n = Number(r.n) || 0;
    if (r.kind === 'client' && (r.status === 'approved' || r.status === 'off')) out.clients += n;
    else if (r.status === 'approved') out.approved += n;
    else if (out[r.status] != null) out[r.status] += n;
  }
  return out;
}

export async function onRequestGet(context) {
  const bad = await guard(context);
  if (bad) return bad;
  const view = new URL(context.request.url).searchParams.get('view') || 'pending';
  const DB = context.env.DB;
  try {
    if (view === 'requests') {
      const rows = await DB.prepare(
        `SELECT r.id, r.listing_id, r.kind, r.message, r.contact, r.status, r.created_ts, r.handled_by,
                l.slug, l.name, l.city, l.kind AS listing_kind, l.status AS listing_status
           FROM directory_requests r LEFT JOIN directory_listings l ON l.id = r.listing_id
          WHERE r.status = 'open' ORDER BY r.created_ts DESC LIMIT 300`
      ).all();
      return json({ requests: rows.results || [], counts: await counts(DB) });
    }
    const where = VIEWS[view] || VIEWS.pending;
    const rows = await DB.prepare(`SELECT ${COLS} FROM directory_listings WHERE ${where} ORDER BY updated_ts DESC LIMIT 300`).all();
    return json({ listings: rows.results || [], counts: await counts(DB) });
  } catch (e) {
    return json({ error: missingTable(e) ? 'directory-not-ready' : 'directory-unavailable' }, 503);
  }
}

export async function onRequestPatch(context) {
  const bad = await guard(context, true);
  if (bad) return bad;
  let b;
  try { b = await context.request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const DB = context.env.DB;
  const actor = await operatorActor(context.request, context.env);
  const by = clean(actor && actor.label, 80) || 'equipe';
  const now = Date.now();
  const action = String(b && b.action || '');
  try {
    if (b && b.requestId) {
      const rid = clean(b.requestId, 64);
      const req = await DB.prepare('SELECT id, listing_id FROM directory_requests WHERE id = ?').bind(rid).first();
      if (!req) return json({ error: 'not-found' }, 404);
      if (action === 'remove') await removeListing(DB, req.listing_id, by, now);
      else if (action === 'done' || action === 'dismiss') {
        await DB.prepare('UPDATE directory_requests SET status = ?, handled_by = ?, updated_ts = ? WHERE id = ?')
          .bind(action === 'done' ? 'done' : 'dismissed', by, now, rid).run();
      } else return json({ error: 'invalid' }, 400);
      return json({ ok: true });
    }
    const id = clean(b && b.id, 64);
    const row = await DB.prepare(`SELECT ${COLS} FROM directory_listings WHERE id = ?`).bind(id).first();
    if (!row) return json({ error: 'not-found' }, 404);
    if (action === 'approve' || action === 'reject') {
      if (row.kind !== 'public') return json({ error: 'client-listing' }, 409);
      await DB.prepare('UPDATE directory_listings SET status = ?, reviewed_ts = ?, reviewed_by = ?, updated_ts = ? WHERE id = ?')
        .bind(action === 'approve' ? 'approved' : 'rejected', now, by, now, id).run();
    } else if (action === 'remove') {
      await removeListing(DB, id, by, now);
    } else if (action === 'restore') {
      await DB.prepare('UPDATE directory_listings SET status = ?, reviewed_ts = ?, reviewed_by = ?, updated_ts = ? WHERE id = ?')
        .bind(row.kind === 'client' ? 'off' : 'pending', now, by, now, id).run();
    } else if (action === 'edit') {
      const f = b.fields && typeof b.fields === 'object' ? b.fields : {};
      const merged = {
        name: f.name ?? row.name, trade: f.trade ?? row.trade, city: f.city ?? row.city, address: f.address ?? row.address,
        description: f.description ?? row.description, website: f.website ?? row.website, phone: f.phone ?? row.contact_phone,
        showPhone: f.showPhone ?? Number(row.show_phone) === 1, whatsapp: f.whatsapp ?? Number(row.whatsapp) === 1,
        email: row.contact_email, contactName: row.contact_name, lang: row.lang,
      };
      const v = sanitizeListing(merged, normalizePhone);
      if (!v.ok) return json({ error: 'invalid', field: v.field }, 400);
      const x = v.value;
      const slug = x.name === row.name && x.city === row.city ? row.slug : await uniqueSlug({ DB }, baseSlug(x.name, x.trade, x.city), id);
      await DB.prepare(
        `UPDATE directory_listings SET slug = ?, name = ?, trade = ?, city = ?, address = ?, description = ?, website = ?,
           show_phone = ?, whatsapp = ?, contact_phone = ?, dedupe_key = ?, reviewed_ts = ?, reviewed_by = ?, updated_ts = ? WHERE id = ?`
      ).bind(slug, x.name, x.trade, x.city, x.address, x.description, x.website, x.show_phone, x.whatsapp, x.contact_phone,
        dedupeKey(x.name, x.city), now, by, now, id).run();
    } else return json({ error: 'invalid' }, 400);
    return json({ ok: true, listing: await DB.prepare(`SELECT ${COLS} FROM directory_listings WHERE id = ?`).bind(id).first() });
  } catch (e) {
    return json({ error: missingTable(e) ? 'directory-not-ready' : 'directory-unavailable' }, 503);
  }
}

async function removeListing(DB, id, by, now) {
  await DB.prepare("UPDATE directory_listings SET status = 'removed', reviewed_ts = ?, reviewed_by = ?, updated_ts = ? WHERE id = ?")
    .bind(now, by, now, id).run();
  await DB.prepare("UPDATE directory_requests SET status = 'done', handled_by = ?, updated_ts = ? WHERE listing_id = ? AND status = 'open'")
    .bind(by, now, id).run();
}
