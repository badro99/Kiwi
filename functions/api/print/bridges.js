/* ═══════════════════════════════════════════════════════════════════════════
 * /api/print/bridges — les PONTS d'impression d'un commerce (relais cloud).
 * ---------------------------------------------------------------------------
 *   GET  ?merchant=         (caisse / propriétaire)  → { ok, bridges:[{id,name,platform,version,last_seen_ts,online}] }
 *   GET                     (pont, Bearer)           → { ok, bridge:{id,merchant,name} }  — auto-vérification
 *   POST {action:'pair-code'} ?merchant=  (caisse / propriétaire) → { ok, code, expires_ts }
 *   POST {action:'redeem', code, name, platform, version}  (pont, sans session)
 *                                                    → { ok, token, bridgeId, merchant, name }
 *   POST {action:'revoke', id} ?merchant=  (caisse / propriétaire) → { ok }
 *
 * L'appairage suit exactement la caisse (/api/pair/*) : un code à 6 chiffres
 * émis côté commerce, à usage unique, 15 minutes, échangé UNE fois contre un
 * jeton que seul le pont détient. Le jeton n'est jamais renvoyé après coup ; un
 * pont qui le perd se ré-appaire. La redemption est limitée par réseau comme
 * /api/pair/redeem, et partage sa table de compteurs (clé préfixée).
 * ═══════════════════════════════════════════════════════════════════════════ */

import { tenantFor } from '../_private.js';
import { clientAddress, sourceKeys } from '../_net-source.js';
import {
  BRIDGE_ONLINE_MS, CODE_TTL_MS, code6, newBridgeToken, sha256Hex, randomHex,
  bridgeFromRequest, dbDown, relayJson, isMissingTable, now,
} from './_relay.js';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 10;
const WIDE_MAX_FAILS = 30;
const BLOCK_MS = 15 * 60 * 1000;

/* Comme /api/pair/redeem : un code de pont est global, un essai les tente tous.
 * On compte par réseau (IPv6 /64, IPv4 exacte) et, plus large, par opérateur
 * de réseaux (IPv6 /48, IPv4 /24). Le compteur large n'est jamais remis à zéro
 * par un appairage réussi, sinon appairer son propre pont le viderait. Un
 * limiteur injoignable refuse l'essai au lieu de le laisser passer. */
function clientKeys(request) {
  const { narrow, wide } = sourceKeys(clientAddress(request));
  return [narrow ? { key: 'print:' + narrow, max: MAX_FAILS } : null,
          wide ? { key: 'printw:' + wide, max: WIDE_MAX_FAILS } : null].filter(Boolean);
}

async function blocked(env, keys, t) {
  for (const { key } of keys) {
    const a = await env.DB.prepare('SELECT blocked_until FROM pair_attempts WHERE ip = ?').bind(key).first();
    if (a && a.blocked_until && a.blocked_until > t) return Math.ceil((a.blocked_until - t) / 1000);
  }
  return 0;
}

/* Une seule instruction SQLite porte l'incrément : lire puis écrire laissait
   deux essais simultanés s'écraser et sous-compter. */
async function noteFail(env, keys, t) {
  try {
    for (const { key, max } of keys) {
      await env.DB.prepare(
        `INSERT INTO pair_attempts (ip, fails, first_ts, blocked_until) VALUES (?, 1, ?, NULL)
         ON CONFLICT(ip) DO UPDATE SET
           fails = CASE WHEN ? - pair_attempts.first_ts > ? THEN 1 ELSE pair_attempts.fails + 1 END,
           first_ts = CASE WHEN ? - pair_attempts.first_ts > ? THEN ? ELSE pair_attempts.first_ts END,
           blocked_until = CASE
             WHEN ? - pair_attempts.first_ts > ? THEN NULL
             WHEN pair_attempts.fails + 1 >= ? THEN ?
             ELSE pair_attempts.blocked_until END`
      ).bind(key, t, t, WINDOW_MS, t, WINDOW_MS, t, t, WINDOW_MS, max, t + BLOCK_MS).run();
    }
    return true;
  } catch (_) { return false; }
}

function cleanName(s, fallback) {
  const v = String(s == null ? '' : s).replace(/[\x00-\x1f]/g, '').trim().slice(0, 60);
  return v || fallback;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return relayJson({ error: 'not-configured' }, 503, request);
  const t = now();

  // Le pont se présente avec son jeton : il veut savoir s'il est encore appairé.
  const self = await bridgeFromRequest(request, env);
  if (self === undefined) return dbDown(request);
  if (self) {
    try { await env.DB.prepare('UPDATE print_bridges SET last_seen_ts = ? WHERE id = ?').bind(t, self.id).run(); } catch (_) {}
    return relayJson({ ok: true, bridge: { id: self.id, merchant: self.merchant, name: self.name || '' } }, 200, request);
  }
  if (/^Bearer\s/i.test(request.headers.get('Authorization') || '')) {
    return relayJson({ ok: false, error: 'unauthorized' }, 401, request);
  }

  const url = new URL(request.url);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant') || '');
  if (!merchant) return relayJson({ error: 'unauthorized' }, 401, request);
  try {
    const rs = await env.DB.prepare(
      `SELECT id, name, platform, version, created_ts, last_seen_ts FROM print_bridges
        WHERE merchant = ? AND revoked_ts IS NULL ORDER BY created_ts`
    ).bind(merchant).all();
    const bridges = (rs.results || []).map((b) => ({
      id: b.id, name: b.name || '', platform: b.platform || '', version: b.version || '',
      created_ts: b.created_ts, last_seen_ts: b.last_seen_ts || 0,
      online: !!(b.last_seen_ts && (t - b.last_seen_ts) < BRIDGE_ONLINE_MS),
    }));
    return relayJson({ ok: true, merchant, bridges, online: bridges.some((b) => b.online) }, 200, request);
  } catch (e) {
    if (isMissingTable(e)) return relayJson({ ok: false, error: 'relay-not-provisioned', bridges: [], online: false }, 503, request);
    return relayJson({ ok: false, error: 'read-failed' }, 500, request);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return relayJson({ error: 'not-configured' }, 503, request);
  let body = {};
  try { body = (await request.json()) || {}; } catch (_) { body = {}; }
  const action = String(body.action || '').trim();
  const t = now();

  /* ── le PONT échange son code contre un jeton (aucune session) ───────────── */
  if (action === 'redeem') {
    const keys = clientKeys(request);
    let wait = 0;
    try { wait = await blocked(env, keys, t); } catch (_) { return relayJson({ ok: false, error: 'rate-limit-unavailable' }, 503, request); }
    if (wait) return relayJson({ ok: false, error: 'too_many_attempts', retry_after: wait }, 429, request);
    const refuse = async () => (await noteFail(env, keys, t))
      ? relayJson({ ok: false, error: 'invalid_or_expired' }, 422, request)
      : relayJson({ ok: false, error: 'rate-limit-unavailable' }, 503, request);
    const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return refuse();
    let row = null;
    try {
      row = await env.DB.prepare(
        `UPDATE print_bridge_codes SET used_ts = ? WHERE code = ? AND used_ts IS NULL AND expires_ts > ? RETURNING merchant`
      ).bind(t, code, t).first();
    } catch (e) {
      if (isMissingTable(e)) return relayJson({ ok: false, error: 'relay-not-provisioned' }, 503, request);
      return relayJson({ ok: false, error: 'invalid_or_expired' }, 422, request);
    }
    if (!row) return refuse();
    // Seul le compteur étroit repart à zéro ; le large garde la mémoire du réseau.
    if (keys[0]) { try { await env.DB.prepare('DELETE FROM pair_attempts WHERE ip = ?').bind(keys[0].key).run(); } catch (_) {} }

    const token = newBridgeToken();
    const id = 'pb_' + randomHex(8);
    const name = cleanName(body.name, 'Pont d’impression');
    const platform = cleanName(body.platform, '');
    const version = cleanName(body.version, '');
    try {
      await env.DB.prepare(
        `INSERT INTO print_bridges (id, merchant, name, platform, version, token_hash, created_ts, last_seen_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, row.merchant, name, platform, version, await sha256Hex(token), t, t).run();
    } catch (_) { return relayJson({ ok: false, error: 'write-failed' }, 500, request); }
    // Le seul moment où le jeton circule en clair. Il n'est pas journalisé.
    return relayJson({ ok: true, token, bridgeId: id, merchant: row.merchant, name }, 200, request);
  }

  /* ── tout le reste est au nom du commerce ───────────────────────────────── */
  const url = new URL(request.url);
  const asked = String(body.merchant || url.searchParams.get('merchant') || '');
  const merchant = await tenantFor(request, env, asked, { strict: true });
  if (!merchant) return relayJson({ error: 'unauthorized' }, 401, request);

  if (action === 'pair-code') {
    try {
      // Un seul code vivant par commerce : le nouveau révoque les précédents.
      await env.DB.prepare('UPDATE print_bridge_codes SET used_ts = ? WHERE merchant = ? AND used_ts IS NULL')
        .bind(t, merchant).run();
      for (let i = 0; i < 8; i++) {
        const code = code6();
        try {
          await env.DB.prepare(
            'INSERT INTO print_bridge_codes (code, merchant, created_ts, expires_ts) VALUES (?, ?, ?, ?)'
          ).bind(code, merchant, t, t + CODE_TTL_MS).run();
          return relayJson({ ok: true, code, expires_ts: t + CODE_TTL_MS }, 200, request);
        } catch (e) { if (isMissingTable(e)) throw e; /* collision → un autre */ }
      }
      return relayJson({ ok: false, error: 'code-generation-failed' }, 500, request);
    } catch (e) {
      if (isMissingTable(e)) return relayJson({ ok: false, error: 'relay-not-provisioned' }, 503, request);
      return relayJson({ ok: false, error: 'write-failed' }, 500, request);
    }
  }

  if (action === 'revoke') {
    const id = String(body.id || '').slice(0, 40);
    if (!id) return relayJson({ ok: false, error: 'id-required' }, 400, request);
    try {
      const r = await env.DB.prepare(
        'UPDATE print_bridges SET revoked_ts = ? WHERE id = ? AND merchant = ? AND revoked_ts IS NULL'
      ).bind(t, id, merchant).run();
      return relayJson({ ok: true, revoked: !!(r && r.meta && r.meta.changes) }, 200, request);
    } catch (e) {
      if (isMissingTable(e)) return relayJson({ ok: false, error: 'relay-not-provisioned' }, 503, request);
      return relayJson({ ok: false, error: 'write-failed' }, 500, request);
    }
  }

  return relayJson({ ok: false, error: 'unknown-action' }, 400, request);
}
