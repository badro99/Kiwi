/* La console voit et change le code d'un salarié (owner, 24 Nov 2026 :
 * « we should be able to see and change pins for employees »).
 *
 * VOIR. Un code saisi dans la console n'existe qu'en empreinte (staff_pins,
 * HMAC à sens unique depuis le scellement du 4 nov.) : personne ne peut le
 * relire, le serveur non plus. Un code posé par la page Équipe vit aussi,
 * chiffré, dans le document `team`, que les opérateurs nommés lisent déjà
 * (docs/ops/STAFF_CODES.md). revealCodes() rapproche chaque ligne de caisse de
 * son membre par l'empreinte (exacte, jamais par le nom) et rend son code.
 * Jamais celui du propriétaire : ses codes gardent leur propre porte.
 *
 * CHANGER. Une ligne qui appartient à un membre de l'équipe se change DANS le
 * document `team` (sinon le prochain enregistrement de la page Équipe
 * republierait l'ancien code), puis la liste de l'équipe est republiée par
 * publishStaffCredentials, la seule porte qui écrit codes de caisse, accès de
 * l'app employé et révisions d'authentification ensemble. Une ligne saisie en
 * console change seule, dans un UPDATE qui décide lui-même de l'unicité.
 * Mêmes garde-fous que l'ajout (pins.js) : opérateur nommé, limiteur
 * « pin-create » par opérateur et magasin, chaque doublon compté sur
 * « pin-dupe » et laissé au journal. Le journal nomme la personne, jamais un
 * code. */
import Catalog from '../../../assets/permissions-catalog.js';
import { codeDocument, hashStaffCode, pinHashes } from '../../auth/_staff-codes.js';
import { json, limitCheck, limitFail, operatorActor } from '../../auth/_lib.js';
import { publishStaffCredentials } from '../_staff-publication.js';
import { keepHistory } from '../_tenant-guard.js';
import { poke } from '../_live.js';

const VALID_PIN = /^\d{4}$/;
const DUPE_SCOPE = 'pin-dupe';
const CREATE_SCOPE = 'pin-create';
const AUDIT = 'INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)';

const isCode = (v) => VALID_PIN.test(String(v == null ? '' : v).trim());
/* Même règle que la page Équipe (assets/team/member-state.js › memberCode). */
const memberCode = (m) => (m && isCode(m.pinCode) ? String(m.pinCode).trim() : (m && isCode(m.password) ? String(m.password).trim() : ''));
const fullName = (m) => `${m.firstName || ''} ${m.lastName || ''}`.trim() || '·';

async function readTeam(env, merchant) {
  const row = await env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(merchant).first();
  if (!row || !row.data) return null;
  return { rev: Number(row.rev) || 0, doc: await codeDocument(env, merchant, 'team', JSON.parse(row.data)) };
}

/* empreinte stockée → id du membre, calculée une fois par membre. */
async function memberByHash(env, merchant, team) {
  const map = new Map();
  for (const m of (team && Array.isArray(team.members)) ? team.members : []) {
    const code = memberCode(m);
    if (!code || !m.id) continue;
    for (const h of [...await pinHashes(env, merchant, code), code]) if (!map.has(h)) map.set(h, String(m.id));
  }
  return map;
}

export async function revealCodes(env, merchant, rows) {
  let team = null;
  try { team = await readTeam(env, merchant); } catch (_) { team = null; }
  const byHash = await memberByHash(env, merchant, team && team.doc);
  return rows.map((r) => {
    const base = { id: r.id, name: r.name, role: r.role };
    if (Catalog.ownerTitle(r.role)) return { ...base, hidden: 'owner' };
    const mid = byHash.get(String(r.pin || ''));
    const m = mid && team.doc.members.find((x) => String(x.id) === mid);
    const code = m ? memberCode(m) : '';
    return code ? { ...base, code, memberId: mid } : { ...base, hidden: 'console' };
  });
}

async function refuseDuplicate(request, env, merchant, actor) {
  if (!await limitFail(request, env, DUPE_SCOPE, actor.id)) return json({ error: 'rate-limit-unavailable' }, 503);
  try {
    await env.DB.prepare(`${AUDIT} VALUES ('', ?, 'staff-pin-duplicate', '', '', 'change', ?, ?, '{}', ?)`)
      .bind(merchant, actor.label, actor.id, Date.now()).run();
  } catch (_) { /* le refus tient sans sa trace */ }
  return json({ error: 'pin-exists' }, 409);
}

export async function changeCode(request, env) {
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String((body && body.merchant) || '').trim().slice(0, 80);
  const id = String((body && body.id) || '').trim().slice(0, 80);
  const pin = String((body && body.pin) || '').trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!id) return json({ error: 'id-required' }, 400);
  if (!VALID_PIN.test(pin)) return json({ error: 'bad-pin' }, 400);

  let row;
  try { row = await env.DB.prepare('SELECT id, name, role, pin FROM staff_pins WHERE id = ? AND merchant = ?').bind(id, merchant).first(); }
  catch (_) { return json({ error: 'pin-storage-unavailable' }, 503); }
  if (!row) return json({ error: 'pin-unknown' }, 404);
  if (Catalog.ownerTitle(row.role)) return json({ error: 'owner-code' }, 403);

  const actor = await operatorActor(request, env);
  const limited = await limitCheck(request, env, DUPE_SCOPE, actor.id)
    || await limitCheck(request, env, CREATE_SCOPE, actor.id + '@' + merchant);
  if (limited) return limited;
  if (!await limitFail(request, env, CREATE_SCOPE, actor.id + '@' + merchant)) return json({ error: 'rate-limit-unavailable' }, 503);

  const candidates = [...await pinHashes(env, merchant, pin), pin];
  const marks = candidates.map(() => '?').join(',');
  try {
    const taken = await env.DB.prepare(`SELECT COUNT(*) AS n FROM staff_pins WHERE merchant = ? AND id <> ? AND pin IN (${marks})`)
      .bind(merchant, id, ...candidates).first();
    if (Number(taken && taken.n)) return refuseDuplicate(request, env, merchant, actor);
  } catch (_) { return json({ error: 'pin-storage-unavailable' }, 503); }

  let team;
  try { team = await readTeam(env, merchant); }
  catch (_) { return json({ error: 'staff-code-key-unavailable' }, 409); }
  const mid = team ? (await memberByHash(env, merchant, team.doc)).get(String(row.pin || '')) : '';
  const ts = Date.now();
  const journal = (viaTeam) => env.DB.prepare(`${AUDIT} VALUES ('', ?, 'staff-pin-change', ?, ?, '', ?, ?, ?, ?)`)
    .bind(merchant, row.name || '', row.name || '', actor.label, actor.id, JSON.stringify({ id, role: row.role, team: viaTeam }), ts);

  if (mid) {
    const next = structuredClone(team.doc);
    const m = next.members.find((x) => String(x.id) === mid);
    if (next.members.some((x) => x !== m && memberCode(x) === pin)) return refuseDuplicate(request, env, merchant, actor);
    const old = memberCode(m);
    m.pinCode = pin;
    if (isCode(m.password) && String(m.password).trim() === old) m.password = pin;
    let text;
    try { text = JSON.stringify(await codeDocument(env, merchant, 'team', next, true)); }
    catch (_) { return json({ error: 'staff-code-key-unavailable' }, 409); }
    await keepHistory(env, 'store', merchant, 'team');
    let written;
    try {
      written = await env.DB.prepare("UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = 'team' AND rev = ?")
        .bind(text, team.rev + 1, ts, merchant, team.rev).run();
    } catch (_) { return json({ error: 'pin-storage-unavailable' }, 503); }
    if (Number(written && written.meta && written.meta.changes) !== 1) return json({ error: 'stale' }, 409);
    /* La liste que la page Équipe publierait elle-même (member-state.js › publishPins),
       sans ligne propriétaire, comme /api/admin/roster. */
    const pins = next.members.filter((x) => x && memberCode(x)).map((x) => ({
      memberId: x.id || '', code: memberCode(x), name: fullName(x),
      firstName: x.firstName || '', lastName: x.lastName || '',
      email: x.email || '', role: x.function || x.department || 'staff',
      department: x.department || '', venueSlug: x.venueSlug || '',
    })).filter((p) => !Catalog.ownerTitle(p.role));
    /* Les lignes saisies en console n'ont pas de membre : la republication les effacerait. */
    let keepRowIds = [];
    try {
      const byHash = await memberByHash(env, merchant, team.doc);
      const all = (await env.DB.prepare('SELECT id, role, pin FROM staff_pins WHERE merchant = ?').bind(merchant).all()).results || [];
      keepRowIds = all.filter((r) => !Catalog.ownerTitle(r.role) && !byHash.has(String(r.pin || ''))).map((r) => String(r.id));
    } catch (_) { return json({ error: 'pin-storage-unavailable' }, 503); }
    const published = await publishStaffCredentials(env, merchant, { pins, replaceOwner: false }, { keepRowIds });
    if (published instanceof Response) return published;   // le document porte déjà le code : le prochain enregistrement de l'équipe le republie
    try { await journal(true).run(); } catch (_) { /* le code tient sans sa trace */ }
    try { await poke(env, merchant, 'team'); } catch (_) {}
    return json({ ok: true, team: true, pin: { id, name: row.name, role: row.role } });
  }

  const stored = await hashStaffCode(env, merchant, pin);
  let changed = 0;
  try {
    const out = await env.DB.batch([
      env.DB.prepare(`UPDATE staff_pins SET pin = ? WHERE id = ? AND merchant = ?
        AND NOT EXISTS (SELECT 1 FROM staff_pins WHERE merchant = ? AND id <> ? AND pin IN (${marks}))`)
        .bind(stored, id, merchant, merchant, id, ...candidates),
      env.DB.prepare(`${AUDIT} SELECT '', ?, 'staff-pin-change', ?, ?, '', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM staff_pins WHERE id = ? AND pin = ?)`)
        .bind(merchant, row.name || '', row.name || '', actor.label, actor.id, JSON.stringify({ id, role: row.role, team: false }), ts, id, stored),
    ]);
    changed = Number(out && out[0] && out[0].meta && out[0].meta.changes) || 0;
  } catch (_) { return json({ error: 'pin-storage-unavailable' }, 503); }
  if (!changed) return refuseDuplicate(request, env, merchant, actor);
  return json({ ok: true, team: false, pin: { id, name: row.name, role: row.role } });
}
