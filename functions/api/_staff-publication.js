import { canonicalCode, normalizeMember } from './_rules-staff-credential.js';
// Staff credential publication: the one place a staff code list becomes
// till codes, the private employee-login roster and the auth revisions.
//
// Contract. POST /api/config hands over the owner's submitted list (`pins`)
// for one merchant it has already authorised; this module
//   · reads   staff_pins (to keep the owner's own codes when the list has no
//             owner), the employee-access document (previous auth versions),
//             and the team document's tombstones only (teamRemovedIds), never
//             any other team field;
//   · writes  staff_pins, the employee-access document and the employee auth
//             revisions, all in ONE D1 batch behind the auth sentinel, retried
//             up to three times when another save moved the revisions;
//   · returns the error Response the route sends as is, or { employees?, pins }
//             which the route merges into its JSON reply.
// No code is compared or returned here (see functions/auth/_lib.js and
// tools/config-pin-projection-test.mjs). Moved from functions/api/config.js
// without changing a statement: tools/staff-publication-split-test.mjs.

import { json, teamRemovedIds, employeeRoleOpensTill } from '../auth/_lib.js';
import { authFingerprint, authSentinel, planEmployeeAuth, writeEmployeeAuth, authMoved } from './_employee-auth.js';

const VALID_PIN = /^\d{4}$/;
const MAX_ROSTER = 200;

function accountOwnerRole(value) {
  let role = String(value || '').trim().toLowerCase();
  try { role = role.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  return new Set(['owner', 'proprietaire', 'direction', 'patron']).has(role);
}

export { accountOwnerRole };

/* Deux personnes, un même code : la boucle de publication gardait la première
 * et sautait la seconde sans un mot, puis la route répondait ok. La seconde
 * perdait son code de caisse et son accès à l'app employé. Rend chaque
 * personne qui partage un code avec une AUTRE (memberId, sinon le nom) ; la
 * même personne listée deux fois reste une seule entrée. Le code ne sort pas
 * d'ici : la réponse nomme les personnes, jamais leurs chiffres. */
function sharedCodeHolders(pins) {
  const holders = new Map();
  for (const p of pins) {
    const code = String((p && (p.code || p.pin)) || '').trim();
    if (!VALID_PIN.test(code)) continue;
    const memberId = String(p.memberId || '').trim().slice(0, 96);
    const name = String(p.name || '').trim().slice(0, 60);
    const people = holders.get(code) || new Map();
    if (!people.has(memberId || 'name:' + name)) people.set(memberId || 'name:' + name, { memberId, name });
    holders.set(code, people);
  }
  return [...holders.values()].filter((people) => people.size > 1).flatMap((people) => [...people.values()]);
}

export async function publishStaffCredentials(env, merchant, body) {
  const result = {};
  /* La liste s'arrêtait à vingt, sans un mot : le 21e membre et les suivants
   * perdaient leur code de caisse et leur accès à l'app employé au premier
   * enregistrement, et la route répondait ok. Rien ne limite une équipe à
   * vingt. La borne reste (une liste de mille est une erreur, pas une
   * équipe) mais au-delà on refuse à voix haute, sans rien toucher. */
  if (body.pins.length > MAX_ROSTER) return json({ error: 'too-many-members', max: MAX_ROSTER }, 413);
  const sharedCode = sharedCodeHolders(body.pins);
  if (sharedCode.length) return json({ error: 'duplicate-staff-code', members: sharedCode }, 409);
  const seen = new Set();
  const clean = [];
  for (const p of body.pins) {
    if (!p) continue;
    const code = String(p.code || p.pin || '').trim();
    if (!VALID_PIN.test(code) || seen.has(code)) continue;
    seen.add(code);
    const email = String(p.email || '').trim().toLocaleLowerCase('en').slice(0, 254);
    clean.push({
      code,
      name: String(p.name || '').trim().slice(0, 60),
      role: String(p.role || '').trim().slice(0, 24) || 'staff',
      memberId: String(p.memberId || '').trim().slice(0, 96),
      firstName: String(p.firstName || '').trim().slice(0, 60),
      lastName: String(p.lastName || '').trim().slice(0, 60),
      email: /^\S+@\S+\.\S+$/.test(email) ? email : '',
      department: String(p.department || '').trim().slice(0, 40),
      venueSlug: String(p.venueSlug || '').trim().slice(0, 96),
    });
  }
  // Atomic replace. created_ts is offset per index so the GET's ORDER BY
  // created_ts preserves the submitted order.
  const base = Date.now();
  let tillPins = clean.filter((p) => employeeRoleOpensTill(p.role));
  /* LE PATRON NE FIGURE PAS DANS LE ROSTER D'ÉQUIPE. La page Équipe
   * (assets/team.js › publishPins) republie ses EMPLOYÉS à chaque
   * modification — et un remplacement intégral effaçait alors le code
   * propriétaire posé à l'onboarding ou depuis la console God mode : après
   * chaque rafraîchissement, le patron disparaissait de staff_pins et seule
   * sa caissière restait. Règle : une liste SANS propriétaire ne touche pas
   * aux lignes propriétaire existantes ; une liste AVEC propriétaire (le
   * wizard d'onboarding, la console) les remplace comme avant. */
  const incomingHasOwner = tillPins.some((p) => accountOwnerRole(p.role));
  const keepIds = [];
  if (!incomingHasOwner) {
    try {
      const existing = await env.DB.prepare(
        'SELECT id, role FROM staff_pins WHERE merchant = ?'
      ).bind(merchant).all();
      (existing.results || []).forEach((row) => {
        if (accountOwnerRole(row.role)) keepIds.push(String(row.id));
      });
    } catch (_) {}
  }
  /* Les révisions de connexion s'écrivent dans le lot (_employee-auth.js) ;
   * si une autre sauvegarde les a bougées entre notre lecture et notre lot,
   * le lot échoue entier et on recommence sur l'état neuf. */
  let written = false;
  for (let attempt = 0; attempt < 3 && !written; attempt++) {
    const keepMarks = keepIds.map(() => '?').join(',');
    const stmts = [keepIds.length
      ? env.DB.prepare(
          'DELETE FROM staff_pins WHERE merchant = ? AND id NOT IN (' + keepMarks + ')'
        ).bind(merchant, ...keepIds)
      : env.DB.prepare('DELETE FROM staff_pins WHERE merchant = ?').bind(merchant)];
    tillPins.forEach((p, i) => {
      stmts.push(env.DB.prepare(
        'INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES (?,?,?,?,?,?)'
      ).bind('pin-' + crypto.randomUUID(), merchant, p.code, p.name, p.role, base + i));
    });
    /* Le code conservé du patron gagne : une ligne d'équipe qui porterait les
     * mêmes quatre chiffres créerait un doublon dont le rôle dépendrait de
     * l'ordre de lecture. La comparaison reste ENTIÈREMENT dans SQL — aucun
     * code ne remonte en JavaScript (voir config-pin-projection-test.mjs). */
    if (keepIds.length) {
      stmts.push(env.DB.prepare(
        'DELETE FROM staff_pins WHERE merchant = ? AND id NOT IN (' + keepMarks + ') '
        + 'AND EXISTS (SELECT 1 FROM staff_pins k WHERE k.id IN (' + keepMarks + ') AND k.pin = staff_pins.pin)'
      ).bind(merchant, ...keepIds, ...keepIds));
    }
    // Keep a private, exact employee-login roster beside the cashier PINs.
    // Replacing it in the same D1 batch means a deleted employee loses access
    // immediately and an employee can log in even when the larger Team document
    // is still waiting to sync from the dashboard device.
    let fingerprint;
    try { fingerprint = await authFingerprint(env, merchant); }
    catch (_) { return json({ error: 'employee-access-unavailable' }, 503); }
    let previousAccess = { members: [] };
    try {
      const previousRow = await env.DB.prepare(
        "SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'"
      ).bind(merchant).first();
      if (previousRow && previousRow.data) {
        const parsed = JSON.parse(previousRow.data);
        if (parsed && Array.isArray(parsed.members)) previousAccess = parsed;
      }
    } catch (_) {
      return json({ error: 'employee-access-unavailable' }, 503);
    }
    const previousById = new Map(previousAccess.members.map((member) => [
      String(member && member.id || ''), member,
    ]));
    /* Les pierres tombales du document team font foi : une publication de codes
     * venue d'un appareil resté sur l'ancien roster ne remet pas au miroir
     * d'accès une personne que le propriétaire a retirée. */
    let removedIds = new Set();
    try {
      const teamRow = await env.DB.prepare(
        "SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'"
      ).bind(merchant).first();
      if (teamRow && teamRow.data) removedIds = teamRemovedIds(JSON.parse(teamRow.data));
    } catch (_) { /* pas de document team lisible : rien à retrancher */ }
    const accessMembers = [];
    const planned = new Map();
    for (const p of clean.filter((item) => item.email)) {
      const id = p.memberId || `employee-${p.code}`;
      if (removedIds.has(String(id))) continue;
      const previous = previousById.get(id);
      const previousPin = canonicalCode(previous);
      const previousVersion = Math.max(0, Math.round(Number(previous && previous.authVersion) || 0));
      const seedVersion = previousVersion + (previous && previousPin !== p.code ? 1 : 0);
      if (planned.has(id)) continue;
      const revision = await planEmployeeAuth(env, merchant, id, p.code, seedVersion);
      if (!revision.ok) return json({ error: 'employee-access-unavailable' }, 503);
      planned.set(id, revision);
      accessMembers.push(normalizeMember({
        id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        pinCode: p.code,
        authVersion: revision.version,
        function: p.role,
        department: p.department,
        venueSlug: merchant,
      }));
    }
    const access = { members: accessMembers };
    const accessText = JSON.stringify(access);
    stmts.push(env.DB.prepare(
      `INSERT INTO store_docs (merchant, feature, data, rev, updated_ts)
       VALUES (?, 'employee-access', ?, 1, ?)
       ON CONFLICT(merchant, feature) DO UPDATE SET
         data = excluded.data, rev = store_docs.rev + 1, updated_ts = excluded.updated_ts`
    ).bind(merchant, accessText, base));
    const guard = { sql: "EXISTS (SELECT 1 FROM store_docs WHERE merchant = ? AND feature = 'employee-access' AND updated_ts = ? AND data = ?)", binds: [merchant, base, accessText] };
    planned.forEach((plan) => stmts.push(writeEmployeeAuth(env, merchant, plan, base, guard)));
    try {
      await env.DB.batch([authSentinel(env, merchant, fingerprint), ...stmts]);
      written = true;
      result.employees = access.members.length;
    } catch (error) {
      let moved = authMoved(error);
      if (!moved) { try { moved = (await authFingerprint(env, merchant)) !== fingerprint; } catch (_) {} }
      if (!moved) return json({ error: 'write-failed' }, 500);
    }
  }
  if (!written) return json({ error: 'concurrent-update', retry: true }, 409);
  result.pins = tillPins.length + keepIds.length;
  return result;
}
