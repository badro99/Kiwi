// GET /api/ai/intake-archive — coffre privé des pièces déposées au guichet.
//
// Deux lectures, même serrure :
//   ?merchant=<slug>                          → métadonnées paginées (JSON)
//   ?merchant=<slug>&docId=<sha256>           → octets PDF (inline / download)
//
// Autorisation (plus forte que tenantFor seul, calquée sur l'upload média
// owner-session-only de functions/api/media/index.js) :
//   1. session propriétaire valide (readSession → aid), sinon 401 ;
//   2. tenantFor strict sur le marchand demandé ;
//   3. la ligne D1 doit appartenir à ce marchand (jamais de clé R2 cliente).
// Les octets ne partent que si has_object = 1 et que la clé stockée égale
// la clé dérivée côté serveur. Pas de clé R2 cliente, jamais.
// Jamais d'URL R2 publique, jamais de posting_hash / empreinte / contenu
// dans les métadonnées, jamais de log du contenu. Pas de suppression :
// rétention jusqu'à la clôture du compte.

import { json, readSession, readCookie, SESS_COOKIE } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { ensureIntakeSchema } from './intake.js';

const SHA256_RE = /^[0-9a-f]{64}$/;
const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;

const missing = () => json({ error: 'missing-object' }, 404);
const nopeMedia = () => json({ error: 'storage-unavailable' }, 503);

function r2KeyFor(merchant, docId) {
  return 'intake/' + merchant + '/' + docId + '.pdf';
}

function parseCursor(raw) {
  const s = String(raw || '');
  if (!s) return null;
  const i = s.indexOf(':');
  if (i <= 0) return null;
  const ts = Number(s.slice(0, i));
  const id = s.slice(i + 1).toLowerCase();
  if (!Number.isFinite(ts) || ts < 0 || !SHA256_RE.test(id)) return null;
  return { ts: Math.floor(ts), id };
}

function toEntry(row) {
  return {
    docId: String(row.doc_id || ''),
    docType: String(row.doc_type || ''),
    status: String(row.status || 'received'),
    mime: String(row.mime || ''),
    size: Number(row.size || 0),
    hasObject: Number(row.has_object || 0) === 1,
    createdTs: Number(row.created_ts || 0),
    updatedTs: Number(row.updated_ts || 0),
  };
}

async function authorize(request, env, asked) {
  // 1. session propriétaire ; 2. tenant strict. Tient sans AUTH_SECRET ?
  // Non : sans secret il n'y a pas de session à vérifier, on refuse plutôt
  // que d'ouvrir des factures sur une garde inerte.
  if (!env || !env.DB || !env.AUTH_SECRET) return { error: 'not-configured', status: 503 };
  let sess = null;
  try { sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET); } catch (_) { sess = null; }
  if (!sess || !sess.aid) return { error: 'unauthorized', status: 401 };
  const merchant = await tenantFor(request, env, asked, { strict: true });
  if (!merchant) return { error: 'unauthorized', status: 401 };
  return { merchant };
}

export async function onRequestPost() {
  return json({ error: 'method-not-allowed' }, 405);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const auth = await authorize(request, env, url.searchParams.get('merchant'));
  if (auth.error) {
    if (auth.status === 503) return nopeMedia();
    return json({ error: auth.error }, auth.status);
  }
  const merchant = auth.merchant;
  if (!env.MEDIA) return nopeMedia();

  const docId = String(url.searchParams.get('docId') || '').toLowerCase().trim();

  /* ── Octets PDF ─────────────────────────────────────────────────── */
  if (docId) {
    if (!SHA256_RE.test(docId)) return json({ error: 'bad-doc' }, 400);
    let row = null;
    try {
      await ensureIntakeSchema(env.DB);
      row = await env.DB.prepare(
        'SELECT * FROM intake_docs WHERE merchant = ? AND doc_id = ?'
      ).bind(merchant, docId).first();
    } catch (_) { return json({ error: 'db' }, 503); }
    if (!row || Number(row.has_object || 0) !== 1) return missing();
    // Clé dérivée côté serveur uniquement ; la ligne doit la confirmer.
    const key = r2KeyFor(merchant, docId);
    if (String(row.r2_key || '') !== key) return missing();
    let object = null;
    try { object = await env.MEDIA.get(key); } catch (_) { object = null; }
    if (!object) return missing();
    const headers = new Headers();
    try { object.writeHttpMetadata(headers); } catch (_) {}
    headers.set('Content-Type', 'application/pdf');
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    const fname = 'document-' + docId.slice(0, 12) + '.pdf';
    const download = url.searchParams.get('download') === '1';
    headers.set('Content-Disposition', (download ? 'attachment' : 'inline') + '; filename="' + fname + '"');
    return new Response(object.body, { headers });
  }

  /* ── Liste paginée (curseur déterministe created_ts:doc_id) ──────── */
  let limit = Math.floor(Number(url.searchParams.get('limit')) || PAGE_DEFAULT);
  if (!Number.isFinite(limit)) limit = PAGE_DEFAULT;
  limit = Math.min(PAGE_MAX, Math.max(1, limit));
  const cursor = parseCursor(url.searchParams.get('cursor'));
  if (url.searchParams.get('cursor') && !cursor) return json({ error: 'bad-cursor' }, 400);
  let rows = [];
  try {
    await ensureIntakeSchema(env.DB);
    if (cursor) {
      rows = await env.DB.prepare(
        'SELECT doc_id, doc_type, status, mime, size, has_object, created_ts, updated_ts ' +
        'FROM intake_docs WHERE merchant = ? AND (created_ts < ? OR (created_ts = ? AND doc_id < ?)) ' +
        'ORDER BY created_ts DESC, doc_id DESC LIMIT ?'
      ).bind(merchant, cursor.ts, cursor.ts, cursor.id, limit + 1).all().then((r) => (r && r.results) || []);
    } else {
      rows = await env.DB.prepare(
        'SELECT doc_id, doc_type, status, mime, size, has_object, created_ts, updated_ts ' +
        'FROM intake_docs WHERE merchant = ? ORDER BY created_ts DESC, doc_id DESC LIMIT ?'
      ).bind(merchant, limit + 1).all().then((r) => (r && r.results) || []);
    }
  } catch (_) { return json({ error: 'db' }, 503); }
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return json({
    ok: true,
    docs: page.map(toEntry),
    nextCursor: rows.length > limit && last ? last.created_ts + ':' + last.doc_id : null,
  });
}
