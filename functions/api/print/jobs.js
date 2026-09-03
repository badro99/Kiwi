/* ═══════════════════════════════════════════════════════════════════════════
 * /api/print/jobs — la FILE d'impression du relais cloud.
 * ---------------------------------------------------------------------------
 *   POST ?merchant=  (caisse / propriétaire)  { target:{ip,port}|{osPrinter}, dataB64, kind, bridgeId? }
 *        → 200 { ok, id, expires_ts }
 *        → 409 { ok:false, error:'relay-offline' }   aucun pont vu depuis 45 s — la caisse
 *                                                    retombe sur son aperçu, comme un pont local absent
 *   GET  ?merchant=&id=   (caisse)            → { ok, job:{id,status,error,bytes,done_ts} }
 *
 *   GET            (pont, Bearer)             → { ok, jobs:[{id,kind,target,dataB64}], poll }
 *                                                réclame jusqu'à 5 tickets d'un coup (atomique :
 *                                                deux ponts d'un même commerce n'impriment jamais
 *                                                le même ticket) et rafraîchit last_seen
 *   POST           (pont, Bearer)             { action:'ack', id, ok, bytes?, error? } → { ok }
 *
 * Un ticket vit 10 minutes : un pont éteint pendant une heure ne recrache pas
 * quarante reçus au réveil — il les marque périmés, et la caisse l'a déjà dit
 * au comptoir à l'instant de la vente.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { tenantFor } from '../_private.js';
import {
  BRIDGE_ONLINE_MS, JOB_TTL_MS, MAX_DATA_B64, CLAIM_BATCH, randomHex,
  bridgeFromRequest, dbDown, relayJson, isMissingTable, safeJsonParse, now,
} from './_relay.js';

const KINDS = ['receipt', 'kitchen', 'label', 'test', 'drawer', 'report', 'other'];
const RETRY_DELAY_MS = 10000;

function cleanTarget(t) {
  if (!t || typeof t !== 'object') return null;
  if (t.osPrinter) {
    const n = String(t.osPrinter).replace(/[\x00-\x1f]/g, '').trim().slice(0, 120);
    return n ? { osPrinter: n } : null;
  }
  const ip = String(t.ip || '').trim().slice(0, 253);
  const okIp = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip)
    ? ip.split('.').every((o) => Number(o) <= 255)
    : /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)+$/i.test(ip);
  if (!okIp) return null;
  const port = Number(t.port) || 9100;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { ip, port };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return relayJson({ error: 'not-configured' }, 503, request);
  const t = now();

  /* ── le pont vient chercher du travail ───────────────────────────────────── */
  if (/^Bearer\s/i.test(request.headers.get('Authorization') || '')) {
    const bridge = await bridgeFromRequest(request, env);
    if (bridge === undefined) return dbDown(request);
    if (!bridge) return relayJson({ ok: false, error: 'unauthorized' }, 401, request);
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE print_bridges SET last_seen_ts = ? WHERE id = ?').bind(t, bridge.id),
        env.DB.prepare(`UPDATE print_jobs SET status = 'expired', done_ts = ? WHERE merchant = ? AND status = 'queued' AND expires_ts <= ?`)
          .bind(t, bridge.merchant, t),
      ]);
      const rs = await env.DB.prepare(
        `UPDATE print_jobs SET status = 'claimed', claimed_ts = ?, bridge_id = ?
          WHERE id IN (SELECT id FROM print_jobs
                        WHERE merchant = ? AND status = 'queued' AND expires_ts > ?
                          AND (bridge_id IS NULL OR bridge_id = ?)
                          AND (claimed_ts IS NULL OR claimed_ts <= ?)
                        ORDER BY created_ts LIMIT ${CLAIM_BATCH})
          RETURNING id, kind, target, data_b64`
      ).bind(t, bridge.id, bridge.merchant, t, bridge.id, t).all();
      const jobs = (rs.results || []).map((j) => ({
        id: j.id, kind: j.kind || 'other', target: safeJsonParse(j.target, {}), dataB64: j.data_b64,
      }));
      return relayJson({ ok: true, merchant: bridge.merchant, jobs, poll: jobs.length ? 250 : 1000 }, 200, request);
    } catch (e) {
      if (isMissingTable(e)) return relayJson({ ok: false, error: 'relay-not-provisioned' }, 503, request);
      return relayJson({ ok: false, error: 'read-failed' }, 500, request);
    }
  }

  /* ── la caisse suit un ticket qu'elle a déposé ──────────────────────────── */
  const url = new URL(request.url);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant') || '');
  if (!merchant) return relayJson({ error: 'unauthorized' }, 401, request);
  const id = String(url.searchParams.get('id') || '').slice(0, 40);
  if (!id) return relayJson({ ok: false, error: 'id-required' }, 400, request);
  try {
    const j = await env.DB.prepare(
      'SELECT id, status, error, bytes, done_ts, claimed_ts FROM print_jobs WHERE id = ? AND merchant = ?'
    ).bind(id, merchant).first();
    if (!j) return relayJson({ ok: false, error: 'not-found' }, 404, request);
    return relayJson({ ok: true, job: j }, 200, request);
  } catch (e) {
    if (isMissingTable(e)) return relayJson({ ok: false, error: 'relay-not-provisioned' }, 503, request);
    return relayJson({ ok: false, error: 'read-failed' }, 500, request);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return relayJson({ error: 'not-configured' }, 503, request);
  const t = now();
  let body = {};
  try { body = (await request.json()) || {}; } catch (_) { body = {}; }

  /* ── le pont acquitte ───────────────────────────────────────────────────── */
  if (/^Bearer\s/i.test(request.headers.get('Authorization') || '')) {
    const bridge = await bridgeFromRequest(request, env);
    if (bridge === undefined) return dbDown(request);
    if (!bridge) return relayJson({ ok: false, error: 'unauthorized' }, 401, request);
    if (String(body.action || '') !== 'ack') return relayJson({ ok: false, error: 'unknown-action' }, 400, request);
    const id = String(body.id || '').slice(0, 40);
    if (!id) return relayJson({ ok: false, error: 'id-required' }, 400, request);
    const ok = !!body.ok;
    const bytes = Number(body.bytes) || 0;
    const error = ok ? null : String(body.error || 'print-failed').replace(/[\x00-\x1f]/g, ' ').slice(0, 300);
    try {
      /* Once a caisse has deposited a job, the durable relay owns retries.
       * A failed printer write is re-queued with the same id after the same
       * 10-second backoff the browser queue historically used. This lets the
       * browser release independent station tickets immediately without
       * weakening delivery or losing retries on navigation/reload. Keep the
       * claimant bridge id: it both preserves an explicitly targeted bridge
       * and lets that same bridge reclaim an untargeted job safely. */
      const r = ok
        ? await env.DB.prepare(
          `UPDATE print_jobs SET status = 'done', done_ts = ?, bytes = ?, error = NULL
            WHERE id = ? AND merchant = ? AND bridge_id = ? AND status = 'claimed'`
        ).bind(t, bytes, id, bridge.merchant, bridge.id).run()
        : await env.DB.prepare(
          `UPDATE print_jobs
              SET status = CASE WHEN expires_ts <= ? THEN 'failed' ELSE 'queued' END,
                  done_ts = CASE WHEN expires_ts <= ? THEN ? ELSE NULL END,
                  claimed_ts = CASE WHEN expires_ts <= ? THEN claimed_ts ELSE ? END,
                  bytes = 0, error = ?
            WHERE id = ? AND merchant = ? AND bridge_id = ? AND status = 'claimed'`
        ).bind(t, t, t, t, t + RETRY_DELAY_MS, error, id, bridge.merchant, bridge.id).run();
      return relayJson({ ok: true, updated: !!(r && r.meta && r.meta.changes) }, 200, request);
    } catch (e) {
      if (isMissingTable(e)) return relayJson({ ok: false, error: 'relay-not-provisioned' }, 503, request);
      return relayJson({ ok: false, error: 'write-failed' }, 500, request);
    }
  }

  /* ── la caisse dépose un ticket ─────────────────────────────────────────── */
  const url = new URL(request.url);
  const asked = String(body.merchant || url.searchParams.get('merchant') || '');
  const merchant = await tenantFor(request, env, asked, { strict: true });
  if (!merchant) return relayJson({ error: 'unauthorized' }, 401, request);

  const target = cleanTarget(body.target);
  if (!target) return relayJson({ ok: false, error: 'target-required' }, 400, request);
  const dataB64 = String(body.dataB64 || '');
  if (!dataB64) return relayJson({ ok: false, error: 'data-required' }, 400, request);
  if (dataB64.length > MAX_DATA_B64) return relayJson({ ok: false, error: 'too-large' }, 413, request);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataB64)) return relayJson({ ok: false, error: 'bad-base64' }, 400, request);
  const kind = KINDS.indexOf(String(body.kind || '')) !== -1 ? String(body.kind) : 'other';
  const bridgeId = /^pb_[0-9a-f]{16}$/.test(String(body.bridgeId || '')) ? String(body.bridgeId) : null;

  try {
    // Quelqu'un doit venir chercher le ticket : sans pont en ligne, dire non tout
    // de suite vaut mieux qu'un reçu qui « part » et ne sort jamais.
    const seen = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM print_bridges
        WHERE merchant = ? AND revoked_ts IS NULL AND last_seen_ts > ?` + (bridgeId ? ' AND id = ?' : '')
    ).bind(...(bridgeId ? [merchant, t - BRIDGE_ONLINE_MS, bridgeId] : [merchant, t - BRIDGE_ONLINE_MS])).first();
    if (!seen || !Number(seen.n)) return relayJson({ ok: false, error: 'relay-offline' }, 409, request);

    const id = 'pj_' + randomHex(8);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO print_jobs (id, merchant, bridge_id, kind, target, data_b64, status, created_ts, expires_ts)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`
      ).bind(id, merchant, bridgeId, kind, JSON.stringify(target), dataB64, t, t + JOB_TTL_MS),
      // Ménage opportuniste : les tickets de plus de 24 h ne servent plus à personne.
      env.DB.prepare('DELETE FROM print_jobs WHERE merchant = ? AND created_ts < ?').bind(merchant, t - 86400000),
    ]);
    return relayJson({ ok: true, id, expires_ts: t + JOB_TTL_MS }, 200, request);
  } catch (e) {
    if (isMissingTable(e)) return relayJson({ ok: false, error: 'relay-not-provisioned' }, 503, request);
    return relayJson({ ok: false, error: 'write-failed' }, 500, request);
  }
}
