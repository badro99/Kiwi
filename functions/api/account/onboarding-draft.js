// Account-only document in the existing store_docs table. No merchant/till access.
import { activeAccountSession, json } from '../../auth/_lib.js';
const FEATURE = 'onboarding-draft';
export async function onRequest({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'unavailable' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin && !['capacitor://localhost', 'ionic://localhost', 'https://localhost', 'http://localhost'].includes(origin)) return json({ error: 'origin' }, 403);
  const session = await activeAccountSession(request, env);
  if (!session) return json({ error: 'unauthorized' }, 401);
  const key = 'account:' + session.aid;
  try {
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT data FROM store_docs WHERE merchant = ? AND feature = ?').bind(key, FEATURE).first();
      return json({ account: session.aid, draft: row ? JSON.parse(row.data) : null });
    }
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (request.headers.get('X-Kiwi-Draft-Account') !== session.aid) return json({ error: 'account-changed' }, 409);
    const text = await request.text();
    if (text.length > 16384) return json({ error: 'size' }, 413);
    const raw = JSON.parse(text);
    if (raw === null) {
      await env.DB.prepare('DELETE FROM store_docs WHERE merchant = ? AND feature = ?').bind(key, FEATURE).run();
      return json({ ok: true });
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return json({ error: 'format' }, 400);
    const clean = {};
    for (const field of ['step', 'ownerName', 'bizName', 'typeId', 'venueCount', 'city', 'teamSize', 'teamGiven', 'dailyGoal', 'device']) {
      if (['string', 'number', 'boolean'].includes(typeof raw[field])) clean[field] = typeof raw[field] === 'string' ? raw[field].slice(0, 100) : raw[field];
    }
    clean.goals = Array.isArray(raw.goals) ? raw.goals.filter(v => typeof v === 'string').slice(0, 20).map(v => v.slice(0, 40)) : [];
    clean.pins = Array.isArray(raw.pins) ? raw.pins.slice(0, 20).map(p => ({ role: ['owner', 'manager'].includes(p?.role) ? p.role : 'staff', name: String(p?.name || '').slice(0, 20), code: '' })) : [];
    await env.DB.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,1,?) ON CONFLICT(merchant,feature) DO UPDATE SET data=excluded.data,rev=store_docs.rev+1,updated_ts=excluded.updated_ts').bind(key, FEATURE, JSON.stringify(clean), Date.now()).run();
    return json({ ok: true });
  } catch (_) { return json({ error: 'unavailable' }, 503); }
}
