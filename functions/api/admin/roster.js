// /api/admin/roster — the Team page publishes its roster from operator view.
//
//   POST {merchant, pins:[{code, name, role, memberId, …}]} → same reply as
//        POST /api/config with pins (names and roles, never a code)
//
// Owner report, 30 Oct 2026. On the dashboard in operator view (God mode on a
// merchant), the Team page saved its document, so the code showed on screen,
// but the till never learned it: the page published through POST /api/config,
// which needs the owner's account session, got 401 and said nothing. The
// operator console could add the same code at once (/api/admin/pins). Two
// doors with two different authorities for one roster.
//
// This route gives the dashboard in operator view the console's authority and
// nothing more: a named operator (the bar /api/admin/pins sets for adding a
// code), a merchant that already exists, the roster only. It never claims,
// creates, renames or retypes a store; those stay the owner's. The roster goes
// through publishStaffCredentials, the one place a code list becomes till codes
// and employee logins, so the rules are the owner's rules, word for word. One
// line goes to the account journal per publish, naming the operator and the
// number of people, never a code.
//
// A roster is also a question about codes, so it gets the console's guards
// (security review, 30 Oct 2026):
//   · every publish counts, per operator and store, against the limiter that
//     counts the console's code creations ('pin-create', 8 a quarter hour);
//   · an owner line is never published from here: owner codes stay with the
//     owner and the console (/api/admin/pins). It is left out, not refused,
//     since the Team page may list the owner among the team;
//   · a code that is already the owner's refuses the whole publish, without
//     saying which line, counted against 'pin-dupe' and journaled without the
//     code. Without this, an operator could publish guesses and read the
//     owner's code from the line that vanished.
// E-mails stay: the publish replaces the employee logins too, so dropping
// them would lock every employee out of the app.

import { isOperator, isSeniorOperator, json, limitCheck, limitFail, operatorActor } from '../../auth/_lib.js';
import { accountOwnerRole, publishStaffCredentials } from '../_staff-publication.js';

const CREATE_SCOPE = 'pin-create';
const DUPE_SCOPE = 'pin-dupe';
const VALID_PIN = /^\d{4}$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);
  if (!(await isSeniorOperator(request, env))) return json({ error: 'operator-code-required' }, 403);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String((body && body.merchant) || '').trim().slice(0, 80);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!Array.isArray(body.pins)) return json({ error: 'pins-required' }, 400);

  let known = null;
  try { known = await env.DB.prepare('SELECT 1 AS ok FROM merchant_config WHERE merchant = ?').bind(merchant).first(); }
  catch (_) { return json({ error: 'config-unavailable' }, 503); }
  if (!known) return json({ error: 'merchant-unknown', merchant }, 404);

  const actor = await operatorActor(request, env);
  const limited = await limitCheck(request, env, DUPE_SCOPE, actor.id)
    || await limitCheck(request, env, CREATE_SCOPE, actor.id + '@' + merchant);
  if (limited) return limited;
  if (!await limitFail(request, env, CREATE_SCOPE, actor.id + '@' + merchant)) return json({ error: 'rate-limit-unavailable' }, 503);

  const pins = body.pins.filter((p) => p && !accountOwnerRole(p.role));
  const ownerSkipped = body.pins.length - pins.length;

  /* Same four digits as a kept owner code? Decided inside SQL: no code comes
     back to JavaScript, only a count. */
  const codes = [...new Set(pins.map((p) => String(p.code || p.pin || '').trim()).filter((c) => VALID_PIN.test(c)))];
  if (codes.length) {
    let ownerIds = [];
    try {
      const rows = await env.DB.prepare('SELECT id, role FROM staff_pins WHERE merchant = ?').bind(merchant).all();
      ownerIds = (rows.results || []).filter((r) => accountOwnerRole(r.role)).map((r) => String(r.id));
    } catch (_) { return json({ error: 'pin-storage-unavailable' }, 503); }
    if (ownerIds.length) {
      let taken = 0;
      try {
        const hit = await env.DB.prepare('SELECT COUNT(*) AS n FROM staff_pins WHERE merchant = ? AND id IN ('
          + ownerIds.map(() => '?').join(',') + ') AND pin IN (' + codes.map(() => '?').join(',') + ')')
          .bind(merchant, ...ownerIds, ...codes).first();
        taken = Number(hit && hit.n) || 0;
      } catch (_) { return json({ error: 'pin-storage-unavailable' }, 503); }
      if (taken) {
        if (!await limitFail(request, env, DUPE_SCOPE, actor.id)) return json({ error: 'rate-limit-unavailable' }, 503);
        try {
          await env.DB.prepare(`INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
            VALUES ('', ?, 'staff-roster-duplicate', '', '', '', ?, ?, ?, ?)`)
            .bind(merchant, actor.label, actor.id, JSON.stringify({ members: pins.length }), Date.now()).run();
        } catch (_) { /* the refusal stands without its journal line */ }
        return json({ error: 'staff-code-taken' }, 409);
      }
    }
  }

  const published = await publishStaffCredentials(env, merchant, { ...body, pins });
  if (published instanceof Response) return published;

  try {
    await env.DB.prepare(`INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
      VALUES ('', ?, 'staff-roster-publish', '', '', '', ?, ?, ?, ?)`)
      .bind(merchant, actor.label, actor.id, JSON.stringify({ members: pins.length, ownerSkipped }), Date.now()).run();
  } catch (_) { /* the roster stands without its journal line */ }

  return json({ ok: true, merchant, ...published, ...(ownerSkipped ? { ownerSkipped } : {}) });
}
