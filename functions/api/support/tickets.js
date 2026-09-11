import { json, readSession, readCookie, SESS_COOKIE, sendMail } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { ensureSupport, cleanText, classify, SUPPORT_WHATSAPP_PHONE } from '../_support.js';

async function diagnostics(env, merchant, client) {
  const out = { captured_ts: Date.now(), client: client || {} };
  const one = async (name, sql, args) => {
    try { const row = await env.DB.prepare(sql).bind(...args).first(); out[name] = row || null; }
    catch (e) { out[name] = { unavailable: true }; }
  };
  await Promise.all([
    one('configuration', `SELECT name,type,plan,status,updated_ts FROM merchant_config WHERE merchant = ?`, [merchant]),
    one('sales', `SELECT COUNT(*) AS total, MAX(ts) AS last_ts FROM sales WHERE merchant = ? AND void_ts IS NULL`, [merchant]),
    one('cloud', `SELECT COUNT(*) AS documents, MAX(updated_ts) AS last_ts FROM store_docs WHERE merchant = ?`, [merchant]),
    one('orders', `SELECT COUNT(*) AS total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, MAX(updated_ts) AS last_ts FROM orders WHERE merchant = ?`, [merchant]),
    one('channels', `SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active, MAX(last_ts) AS last_ts FROM channel_links WHERE merchant = ?`, [merchant]),
  ]);
  return out;
}

function validContact(channel, value) {
  value = cleanText(value, 254);
  if (channel === 'email') return /^\S+@\S+\.\S+$/.test(value);
  return /^(?:\+|00)?[\d\s().-]{8,24}$/.test(value);
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let merchant = cleanText(new URL(request.url).searchParams.get('merchant'), 64);
  merchant = await tenantFor(request, env, merchant);
  if (!merchant) return json({ error: 'forbidden' }, 403);
  await ensureSupport(env);
  const rows = await env.DB.prepare(`SELECT id,reference,status,channel,category,priority,created_ts,updated_ts FROM support_tickets WHERE merchant=? ORDER BY updated_ts DESC LIMIT 20`).bind(merchant).all();
  return json({ tickets: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body; try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  let merchant = cleanText(body && body.merchant, 64);
  merchant = await tenantFor(request, env, merchant, { strict: true });
  if (!merchant) return json({ error: 'forbidden' }, 403);
  await ensureSupport(env);
  const summary = cleanText(body.summary, 5000);
  const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'email';
  const contact = cleanText(body.contact, 254);
  if (summary.length < 12) return json({ error: 'summary-too-short' }, 400);
  if (!validContact(channel, contact)) return json({ error: 'contact-invalid' }, 400);
  const now = Date.now(), id = 'ticket-' + crypto.randomUUID();
  const day = new Date(now).toISOString().slice(2,10).replaceAll('-', '');
  const reference = 'K-' + day + '-' + crypto.randomUUID().slice(0,4).toUpperCase();
  const routed = classify(summary);
  const safeClient = {
    page: cleanText(body.client && body.client.page, 220),
    browser: cleanText(body.client && body.client.browser, 220),
    online: !!(body.client && body.client.online),
    language: cleanText(body.client && body.client.language, 12),
    viewport: cleanText(body.client && body.client.viewport, 40),
    app_version: cleanText(body.client && body.client.app_version, 40),
  };
  const diag = await diagnostics(env, merchant, safeClient);
  let cfg = diag.configuration || {};
  await env.DB.prepare(`INSERT INTO support_tickets
    (id,reference,merchant,store_type,category,priority,status,channel,contact,summary,diagnostics,assignee,created_ts,updated_ts,closed_ts)
    VALUES (?,?,?,?,?,?,'open',?,?,?,?,?, ?,?,NULL)`)
    .bind(id,reference,merchant,cleanText(cfg.type || body.store_type || '',40),routed.category,routed.priority,channel,contact,summary,JSON.stringify(diag),'',now,now).run();
  await env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts) VALUES (?,?,?,?,?,?,?,?)`)
    .bind('msg-' + crypto.randomUUID(),id,'client',channel,'client',summary,'received',now).run();

  let confirmation = { ok: true, channel: 'whatsapp', reason: 'recorded' };
  if (channel === 'email') {
    confirmation = await sendMail(env, {
      to: contact,
      subject: `${reference} · Kiwi Support`,
      text: `Votre demande ${reference} a bien été enregistrée.\n\n${summary}\n\nRépondez à cet e-mail en gardant la référence dans l’objet pour poursuivre l’échange.`,
    });
  } else {
    confirmation.handoff = {
      phone: SUPPORT_WHATSAPP_PHONE,
      text: `${reference} · ${summary}`,
    };
  }
  return json({ ok: true, ticket: { id, reference, category: routed.category, priority: routed.priority, channel }, confirmation });
}
