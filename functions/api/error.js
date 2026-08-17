/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Client Error Reporter Ingestion Endpoint
 *
 *   POST /api/error
 *
 * Ingests unhandled client exceptions, aggregates identical crashes,
 * ensures robust redaction of any sensitive patterns, and records to D1.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { limitCheck, limitFail } from '../auth/_lib.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const REGEX_PHONE = /(?:\+?212|0)\s*[5-7](?:[\s.-]*\d){8}/g;
const REGEX_PIN = /\b\d{4,6}\b/g;
const REGEX_AUTH = /(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi;
const REGEX_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function sanitize(str, maxLen = 300) {
  if (!str) return '';
  let s = String(str);
  s = s.replace(REGEX_AUTH, '[AUTH_REDACTED]');
  s = s.replace(REGEX_EMAIL, '[EMAIL_REDACTED]');
  s = s.replace(REGEX_PHONE, '[PHONE_REDACTED]');
  s = s.replace(REGEX_PIN, '[PIN_REDACTED]');
  return s.slice(0, maxLen);
}

let tableEnsured = false;
async function ensureTable(db) {
  if (tableEnsured) return;
  try {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS client_errors (
        id TEXT PRIMARY KEY,
        merchant TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL,
        file TEXT NOT NULL DEFAULT '',
        line INTEGER NOT NULL DEFAULT 0,
        col INTEGER NOT NULL DEFAULT 0,
        stack TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 1,
        first_seen_ts INTEGER NOT NULL,
        last_seen_ts INTEGER NOT NULL
      )`
    ).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_client_errors_seen ON client_errors (merchant, last_seen_ts)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_client_errors_sig ON client_errors (merchant, file, line, message)').run();
    tableEnsured = true;
  } catch (_) {}
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: 'no-db' }, 200);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok: false, error: 'bad-json' }, 200);
  }

  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'empty-body' }, 200);
  }

  const rawMessage = body.message || body.reason || body.error || '';
  if (!rawMessage || typeof rawMessage !== 'string') {
    return json({ ok: false, error: 'no-message' }, 200);
  }

  const message = sanitize(rawMessage, 300);
  const merchant = String(body.merchant || '').trim().slice(0, 64);
  const identity = merchant || request.headers.get('CF-Connecting-IP') || 'anon';

  // Server-side rate limit check keyed per merchant/till/IP
  const blocked = await limitCheck(request, env, 'err', identity);
  if (blocked) return blocked;
  await limitFail(request, env, 'err', identity);

  const file = String(body.file || '').trim().slice(0, 120);
  const line = parseInt(body.line, 10) || 0;
  const col = parseInt(body.col, 10) || 0;
  const stack = sanitize(body.stack || '', 1000);
  const url = String(body.url || '').trim().slice(0, 120);
  const version = String(body.version || '').trim().slice(0, 32);
  const userAgent = String(body.userAgent || body.user_agent || '').slice(0, 200);
  const now = Date.now();

  try {
    await ensureTable(env.DB);

    // Look for existing error signature in last 7 days to aggregate
    const existing = await env.DB.prepare(
      'SELECT id, count FROM client_errors WHERE merchant = ? AND file = ? AND line = ? AND message = ? AND last_seen_ts > ? LIMIT 1'
    ).bind(merchant, file, line, message, now - 7 * 86400000).first();

    if (existing && existing.id) {
      await env.DB.prepare(
        'UPDATE client_errors SET count = count + 1, last_seen_ts = ?, version = ?, stack = COALESCE(NULLIF(?, \'\'), stack) WHERE id = ?'
      ).bind(now, version, stack, existing.id).run();
      return json({ ok: true, aggregated: true, id: existing.id });
    }

    const id = 'err_' + crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO client_errors (id, merchant, message, file, line, col, stack, url, version, user_agent, count, first_seen_ts, last_seen_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(id, merchant, message, file, line, col, stack, url, version, userAgent, now, now).run();

    return json({ ok: true, created: true, id });
  } catch (err) {
    return json({ ok: false, error: 'db-write-failed' }, 200);
  }
}
