// GET    /api/comptable/access?merchant=<slug>        les accès comptable du magasin
// POST   /api/comptable/access {merchant,label?,email?,days?}  en crée un
// DELETE /api/comptable/access?merchant=<slug>&id=<id>          le révoque
//
// Réservé au PROPRIÉTAIRE (session de compte) ou à un opérateur nommé. Ni une
// caisse appairée, ni le laissez-passer d'équipe, ni un autre compte : ouvrir
// les livres d'un magasin à un tiers est un geste de propriétaire.
//
// Le lien n'est montré qu'à la création. Seule son empreinte SHA-256 reste en
// base ; la liste ne renvoie jamais ni le jeton ni l'empreinte.

import { activeAccountSession, entitledMerchant, namedOperatorId, json } from '../../auth/_lib.js';
import {
  ensureAccountantAccess, newToken, newAccessId, sha256Hex, accessStatus, ACCESS_ID_RE,
  DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS, MAX_ACTIVE_PER_STORE,
} from './_lib.js';

const MERCHANT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}$/;

/* Le magasin demandé, si l'appelant en est propriétaire. Une session de compte
 * (ou un opérateur nommé) est exigée EN PLUS d'entitledMerchant, qui rendrait
 * sinon un locataire de démonstration à n'importe quel navigateur passé par la
 * porte du site. Pas d'allowTill : une caisse n'invite personne. */
async function ownerOf(request, env, asked) {
  const merchant = String(asked || '').slice(0, 64);
  if (!MERCHANT_RE.test(merchant)) return null;
  try {
    const session = await activeAccountSession(request, env);
    const operator = session ? null : await namedOperatorId(request, env);
    if (!session && !operator) return null;
    if ((await entitledMerchant(request, env, merchant)) !== merchant) return null;
    return { merchant, actor: session ? String(session.aid) : 'op:' + operator };
  } catch (_) { return null; }
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function publicOrigin(request) {
  try {
    const u = new URL(request.url);
    if (u.hostname === 'kiwi-os.com' || u.hostname === 'www.kiwi-os.com') return u.origin;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return u.origin;
  } catch (_) {}
  return 'https://kiwi-os.com';
}

export async function onRequest({ request, env }) {
  const method = request.method;
  if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') {
    return json({ error: 'method-not-allowed' }, 405, { Allow: 'GET, POST, DELETE' });
  }
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);

  let body = {};
  if (method === 'POST') {
    try { body = (await request.json()) || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  }
  const owner = await ownerOf(request, env, method === 'POST' ? body.merchant : url.searchParams.get('merchant'));
  if (!owner) return json({ error: 'forbidden-merchant' }, 403);
  if (!(await ensureAccountantAccess(env))) return json({ error: 'unavailable' }, 503);
  const { merchant } = owner;

  try {
    if (method === 'GET') {
      const rows = await env.DB.prepare(
        `SELECT id, label, email, created_ts, last_seen_ts, revoked_ts, expires_ts FROM accountant_access
          WHERE merchant = ? ORDER BY created_ts DESC LIMIT 50`
      ).bind(merchant).all();
      const now = Date.now();
      return json({
        ok: true, merchant,
        accesses: ((rows && rows.results) || []).map((r) => ({
          id: r.id, label: r.label || '', email: r.email || '',
          createdTs: Number(r.created_ts) || 0, lastSeenTs: Number(r.last_seen_ts) || 0,
          revokedTs: Number(r.revoked_ts) || 0, expiresTs: Number(r.expires_ts) || 0,
          status: accessStatus(r, now),
        })),
      });
    }

    if (method === 'DELETE') {
      const id = String(url.searchParams.get('id') || '');
      if (!ACCESS_ID_RE.test(id)) return json({ error: 'bad-id' }, 400);
      const now = Date.now();
      const row = await env.DB.prepare(
        'UPDATE accountant_access SET revoked_ts = COALESCE(revoked_ts, ?) WHERE id = ? AND merchant = ? RETURNING id, revoked_ts'
      ).bind(now, id, merchant).first();
      if (!row) return json({ error: 'not-found' }, 404);
      return json({ ok: true, merchant, id, revokedTs: Number(row.revoked_ts) });
    }

    /* POST · création */
    const label = cleanText(body.label, 80);
    const emailRaw = cleanText(body.email, 254);
    if (emailRaw && !EMAIL_RE.test(emailRaw)) return json({ error: 'bad-email' }, 400);
    let days = Number(body.days);
    if (!Number.isFinite(days) || days <= 0) days = DEFAULT_EXPIRY_DAYS;
    days = Math.min(MAX_EXPIRY_DAYS, Math.floor(days));
    const now = Date.now();
    const live = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM accountant_access WHERE merchant = ? AND revoked_ts IS NULL AND expires_ts > ?'
    ).bind(merchant, now).first();
    if (live && Number(live.n) >= MAX_ACTIVE_PER_STORE) return json({ error: 'too-many-accesses' }, 409);

    const token = newToken();
    const id = newAccessId();
    const expiresTs = now + days * 86400000;
    await env.DB.prepare(
      `INSERT INTO accountant_access (id, merchant, label, email, token_hash, created_ts, created_by, last_seen_ts, revoked_ts, expires_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
    ).bind(id, merchant, label || null, emailRaw || null, await sha256Hex(token), now, owner.actor, expiresTs).run();
    return json({
      ok: true, merchant, id, label, email: emailRaw, createdTs: now, expiresTs,
      /* Montré une seule fois : le jeton ne vit que dans le fragment (#), donc
       * ni dans un journal serveur ni dans un Referer. */
      url: publicOrigin(request) + '/comptable.html#' + token,
    }, 201);
  } catch (_) {
    return json({ error: 'unavailable' }, 503);
  }
}
