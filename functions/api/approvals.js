/* /api/approvals · les accords du patron (functions/api/_owner-approvals.js).
 *
 * La caisse appairée DEMANDE et lit la réponse ; le téléphone d'un serveur en
 * service aussi, pour ses annulations de salle (EMPLOYEE_KINDS) et ses seules
 * demandes. Seul le patron (son compte, au palier du propriétaire) décide,
 * règle et inscrit ses téléphones.
 *
 * GET  ?merchant=&settings=1   réglages (caisse ou patron)
 * GET  ?merchant=&id=          état d'une demande ; un accord rend sa preuve à la caisse
 * GET  ?merchant=&list=1       demandes en attente et décidées des dernières 24 h (patron)
 * POST {action:'request'}      la caisse dépose une demande et le téléphone sonne
 * POST {action:'withdraw'}     la caisse retire sa demande
 * POST {action:'decide'}       le patron accepte ou refuse
 * POST {action:'settings'}     le patron règle ce qui demande son accord
 * POST {action:'device'|'device-remove'}  ce téléphone reçoit (ou plus) les demandes
 */
import { activeServiceEmployee, entitledMerchant, isTillFor, json } from '../auth/_lib.js';
import { sessionPerson } from './_permissions.js';
import { sendApnsToTokens } from './push/_dispatch.js';
import {
  APPROVAL_ID_RE, EMPLOYEE_KINDS, MAX_PENDING, MAX_PER_MINUTE, cleanRequest, cleanSettings, ensureApprovalTables, grantFor,
  loadApproval, needsApproval, newApprovalId, publicRow, pushMessage, readSettings, trustedRequest, approvalsEnabled,
} from './_owner-approvals.js';

const TOKEN_RE = /^[0-9a-fA-F]{64,200}$/;
const slugOf = (v) => String(v == null ? '' : v).trim().toLowerCase().slice(0, 64);

/* Le patron, et lui seul : la session du compte qui possède ce magasin, au
   palier du propriétaire (un gérant qui a déverrouillé le tableau de bord avec
   son code n'accepte rien). L'opérateur en vue portée n'est pas le patron. */
export async function ownerFor(request, env, merchant) {
  if (!merchant || !env || !env.DB || !env.AUTH_SECRET) return null;
  let person;
  try { person = await sessionPerson(request, env); } catch (_) { return null; }
  if (!person || !person.owner || !person.aid) return null;
  let row = null;
  try { row = await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?').bind(merchant).first(); } catch (_) { return null; }
  if (row && row.account_id) return String(row.account_id) === String(person.aid) ? person : null;
  try { return (await entitledMerchant(request, env, merchant)) === merchant ? person : null; } catch (_) { return null; }
}

async function tillFor(request, env, merchant) {
  try { return !!merchant && await isTillFor(request, env, merchant); } catch (_) { return false; }
}

/* Un serveur en service : son nom et son identifiant viennent du serveur
   (l'équipe et le pointage), jamais du corps de la requête. */
async function waiterFor(request, env, merchant) {
  let emp = null;
  try { emp = merchant ? await activeServiceEmployee(request, env, merchant) : null; } catch (_) { return null; }
  if (!emp || !emp.member || String(emp.merchant) !== merchant) return null;
  const name = [emp.member.firstName, emp.member.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return { id: 'emp:' + String(emp.member.id || emp.session.staffId).slice(0, 80), name: (name || 'Serveur').slice(0, 60) };
}

async function pushOwner(env, merchant, row) {
  let devices = [];
  try {
    const rs = await env.DB.prepare('SELECT token, lang FROM owner_approval_devices WHERE merchant = ?').bind(merchant).all();
    devices = rs.results || [];
  } catch (_) { return { sent: 0 }; }
  if (!devices.length) return { sent: 0, devices: 0 };
  const result = await sendApnsToTokens(env, merchant, devices, (d) => pushMessage(row, d.lang));
  for (const [token, outcome] of result.byToken) {
    if (outcome === 'removed') {
      try { await env.DB.prepare('DELETE FROM owner_approval_devices WHERE merchant = ? AND token = ?').bind(merchant, token).run(); } catch (_) {}
    }
  }
  return { sent: result.sent, devices: devices.length };
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'db-unavailable' }, 503);
  const url = new URL(request.url);
  const merchant = slugOf(url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!approvalsEnabled(merchant)) return json({ error: 'not-enabled' }, 404);
  const till = await tillFor(request, env, merchant);
  const owner = till ? null : await ownerFor(request, env, merchant);
  const waiter = till || owner ? null : await waiterFor(request, env, merchant);
  if (!till && !owner && !waiter) return json({ error: 'forbidden' }, 403);
  try {
    await ensureApprovalTables(env.DB);
    if (url.searchParams.get('settings')) return json({ ok: true, settings: await readSettings(env, merchant) });
    const id = String(url.searchParams.get('id') || '');
    if (id) {
      if (!APPROVAL_ID_RE.test(id)) return json({ error: 'bad-id' }, 400);
      const row = await loadApproval(env, merchant, id);
      if (!row || (waiter && row.requested_by_id !== waiter.id)) return json({ error: 'not-found' }, 404);
      const out = { ok: true, approval: publicRow(row) };
      if (till && (row.status === 'approved' || row.status === 'granted')) {
        const grant = await grantFor(env, merchant, row);
        if (grant) { out.grant = grant; out.approval.status = 'granted'; }
      }
      return json(out);
    }
    if (!owner) return json({ error: 'owner-only' }, 403);
    const since = Date.now() - 24 * 3600000;
    const rs = await env.DB.prepare(
      'SELECT * FROM owner_approvals WHERE merchant = ? AND created_ts > ? ORDER BY created_ts DESC LIMIT 60'
    ).bind(merchant, since).all();
    const rows = [];
    for (const r of rs.results || []) {
      const fresh = await loadApproval(env, merchant, r.id);
      if (fresh) rows.push(publicRow(fresh));
    }
    let devices = 0;
    try { devices = Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM owner_approval_devices WHERE merchant = ?').bind(merchant).first() || {}).n) || 0; } catch (_) {}
    return json({ ok: true, items: rows, settings: await readSettings(env, merchant), devices });
  } catch (_) {
    return json({ error: 'approvals-unavailable' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'db-unavailable' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'bad-body' }, 400);
  const merchant = slugOf(body.merchant);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!approvalsEnabled(merchant)) return json({ error: 'not-enabled' }, 404);
  const action = String(body.action || '');
  const now = Date.now();
  try {
    await ensureApprovalTables(env.DB);
  } catch (_) { return json({ error: 'approvals-unavailable' }, 503); }

  if (action === 'request' || action === 'withdraw') {
    const till = await tillFor(request, env, merchant);
    const waiter = till ? null : await waiterFor(request, env, merchant);
    if (!till && !waiter) return json({ error: 'till-only' }, 403);
    if (action === 'withdraw') {
      const id = String(body.id || '');
      if (!APPROVAL_ID_RE.test(id)) return json({ error: 'bad-id' }, 400);
      const mine = waiter ? ' AND requested_by_id = ?' : '';
      const args = waiter ? [now, id, merchant, waiter.id] : [now, id, merchant];
      await env.DB.prepare("UPDATE owner_approvals SET status = 'withdrawn', decided_ts = ? WHERE id = ? AND merchant = ? AND status = 'pending'" + mine)
        .bind(...args).run();
      const row = await loadApproval(env, merchant, id);
      if (!row || (waiter && row.requested_by_id !== waiter.id)) return json({ error: 'not-found' }, 404);
      return json({ ok: true, approval: publicRow(row) });
    }
    const asked = cleanRequest(body);
    if (!asked) return json({ error: 'bad-kind' }, 400);
    if (waiter) {
      if (!EMPLOYEE_KINDS.has(asked.kind)) return json({ error: 'till-only' }, 403);
      asked.requestedBy = waiter.name; asked.requestedById = waiter.id; asked.terminal = '';
    }
    const req = await trustedRequest(env, merchant, asked);
    if (req.error) return json({ error: req.error }, req.error === 'bad-ref' ? 400 : req.error === 'already-void' || req.error === 'ambiguous-line' ? 409 : 404);
    const settings = await readSettings(env, merchant);
    if (!needsApproval(settings, req.kind, req.amountCents)) return json({ error: 'approval-off', settings }, 409);
    const load = await env.DB.prepare(
      `SELECT SUM(CASE WHEN status = 'pending' AND created_ts > ? THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN created_ts > ? THEN 1 ELSE 0 END) AS minute
         FROM owner_approvals WHERE merchant = ?`
    ).bind(now - 30 * 60000, now - 60000, merchant).first();
    if (Number(load && load.pending) >= MAX_PENDING || Number(load && load.minute) >= MAX_PER_MINUTE) return json({ error: 'too-many-requests' }, 429);
    const id = newApprovalId();
    await env.DB.prepare(
      `INSERT INTO owner_approvals (id, merchant, kind, ref, label, amount_cents, requested_by, requested_by_id, terminal, status, created_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).bind(id, merchant, req.kind, req.ref, req.label, req.amountCents, req.requestedBy, req.requestedById, req.terminal, now).run();
    const row = await loadApproval(env, merchant, id);
    let pushed = { sent: 0 };
    try { pushed = await pushOwner(env, merchant, row); } catch (_) {}
    return json({ ok: true, approval: publicRow(row), settings, pushed: pushed.sent > 0, devices: pushed.devices || 0 }, 201);
  }

  /* Une caisse appairée ne décide de rien, même si la session du compte y est
     ouverte (revue : le caissier acceptait sa propre demande au comptoir). */
  if (await tillFor(request, env, merchant)) return json({ error: 'owner-on-till' }, 403);
  const owner = await ownerFor(request, env, merchant);
  if (!owner) return json({ error: 'owner-only' }, 403);

  if (action === 'decide') {
    const id = String(body.id || '');
    const verdict = body.verdict === 'approve' ? 'approved' : body.verdict === 'refuse' ? 'refused' : '';
    if (!APPROVAL_ID_RE.test(id) || !verdict) return json({ error: 'bad-decision' }, 400);
    const current = await loadApproval(env, merchant, id);
    if (!current) return json({ error: 'not-found' }, 404);
    if (current.status !== 'pending') return json({ error: 'already-decided', approval: publicRow(current) }, 409);
    const by = String((owner.code && owner.code.name) || 'Propriétaire').slice(0, 60);
    await env.DB.prepare('UPDATE owner_approvals SET status = ?, decided_ts = ?, decided_by = ? WHERE id = ? AND merchant = ? AND status = ?')
      .bind(verdict, now, by, id, merchant, 'pending').run();
    const row = await loadApproval(env, merchant, id);
    if (row.status !== verdict) return json({ error: 'already-decided', approval: publicRow(row) }, 409);
    return json({ ok: true, approval: publicRow(row) });
  }
  if (action === 'settings') {
    const s = cleanSettings(body.settings);
    await env.DB.prepare(
      `INSERT INTO owner_approval_settings (merchant, cash_out, cancel, manager_fallback, min_cents, updated_ts)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(merchant) DO UPDATE SET cash_out = excluded.cash_out, cancel = excluded.cancel,
         manager_fallback = excluded.manager_fallback, min_cents = excluded.min_cents, updated_ts = excluded.updated_ts`
    ).bind(merchant, s.cashOut ? 1 : 0, s.cancel ? 1 : 0, s.managerFallback ? 1 : 0, s.minCents, now).run();
    return json({ ok: true, settings: await readSettings(env, merchant) });
  }
  if (action === 'device' || action === 'device-remove') {
    const token = String(body.token || '');
    if (!TOKEN_RE.test(token)) return json({ error: 'bad-token' }, 400);
    if (action === 'device-remove') {
      await env.DB.prepare('DELETE FROM owner_approval_devices WHERE merchant = ? AND token = ?').bind(merchant, token).run();
      return json({ ok: true });
    }
    const lang = ['fr', 'en', 'ar'].includes(body.lang) ? body.lang : 'fr';
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM owner_approval_devices WHERE merchant = ? AND token <> ?').bind(merchant, token).first();
    if (Number(count && count.n) >= 10) return json({ error: 'too-many-devices' }, 409);
    await env.DB.prepare(
      `INSERT INTO owner_approval_devices (merchant, token, lang, created_ts) VALUES (?, ?, ?, ?)
       ON CONFLICT(merchant, token) DO UPDATE SET lang = excluded.lang`
    ).bind(merchant, token, lang, now).run();
    return json({ ok: true });
  }
  return json({ error: 'bad-action' }, 400);
}
