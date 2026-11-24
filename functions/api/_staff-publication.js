import Catalog from '../../assets/permissions-catalog.js';
import { codeDocument, hashStaffCode, pinHashes, sealMerchantStaff } from '../auth/_staff-codes.js';
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
  return Catalog.ownerTitle(value);   // les intitulés propriétaire, la liste unique du palier et des droits (assets/permissions-catalog.js)
}

export { accountOwnerRole };

/* LES LIGNES PROPRIÉTAIRE QUI RESTENT (21 nov.). Une ligne d'équipe titrée
 * comme le patron (« Direction ») ne remplace plus TOUTES les lignes
 * propriétaire : elle ne remplace que celle qui porte SON nom. La page Équipe
 * (qui ne contient jamais le patron) ne peut donc plus effacer le code du
 * patron ; le wizard et la console, qui envoient le patron par son nom,
 * remplacent toujours son code. null = base muette (503). */
async function ownerRowsToKeep(env, merchant, tillPins, replaceOwner) {
  const owners = tillPins.filter((p) => accountOwnerRole(p.role));
  const incoming = new Set(owners.map((p) => Catalog.normRole(p.name)));
  /* « Remplacer le propriétaire » (le wizard, sous la session du patron :
     functions/api/config.js ne laisse passer le signal qu'au palier propriétaire) :
     un patron qui change de nom ET de code ne garde pas l'ancien code en vie.
     Sans ligne propriétaire dans la liste, le signal ne fait rien : le compte
     ne se retrouve jamais sans code de patron. */
  const replaceAll = replaceOwner === true && owners.length > 0;
  try {
    const existing = await env.DB.prepare('SELECT id, name, role FROM staff_pins WHERE merchant = ?').bind(merchant).all();
    await sealMerchantStaff(env, merchant);
    return (existing.results || []).filter((row) => accountOwnerRole(row.role) && !replaceAll && !incoming.has(Catalog.normRole(row.name))).map((row) => String(row.id));
  } catch (_) { return null; }
}

/* Les personnes dont la ligne de caisse est scellée morte (code déjà pris) :
   leurs NOMS, jamais un code ni une empreinte. Seuls le patron et un opérateur
   les lisent (config.js › codesToRedo, permissions.js › codeRedo) ; la réponse
   d'un gérant reste identique, qu'il y ait collision ou non. [] si la base se tait. */
export async function codesToRedo(env, merchant) {
  try {
    const rows = await env.DB.prepare("SELECT name FROM staff_pins WHERE merchant = ? AND pin LIKE 'k2$%' AND instr(pin, '$!') > 0 ORDER BY created_ts").bind(merchant).all();
    return [...new Set((rows.results || []).map((r) => String(r.name || '').trim().slice(0, 60)).filter(Boolean))];
  } catch (_) { return []; }
}

/* UNE LIGNE D'ÉQUIPE S'ÉCRIT TOUJOURS (21 nov.). Avant, un code égal à celui
 * d'une ligne gardée (le patron) n'était pas inséré : la personne manquait au
 * roster, et un gérant trouvait le code du patron en dix mille publications.
 * Désormais la ligne est écrite dans tous les cas, sous le même nom et le même
 * intitulé ; si son code est déjà pris, SQL lui donne une empreinte morte (au
 * format scellé, qui ne correspond à aucun code) : vu du gérant, rien ne
 * distingue une collision d'une ligne neuve, et deux personnes ne partagent
 * jamais un code. Aucune comparaison en JavaScript : tout reste dans SQL. */
function insertStaffRow(env, merchant, p, ts) {
  const dead = p.storedCode.slice(0, p.storedCode.lastIndexOf('$') + 1) + '!' + crypto.randomUUID().replace(/-/g, '');   // _staff-codes.js › isDeadStaffCode
  return env.DB.prepare(
    'INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) SELECT ?, ?, '
    + 'CASE WHEN EXISTS (SELECT 1 FROM staff_pins WHERE merchant = ? AND pin IN (' + p.candidates.map(() => '?').join(',') + ')) THEN ? ELSE ? END, ?, ?, ?'
  ).bind(p.keepId || 'pin-' + crypto.randomUUID(), merchant, merchant, ...p.candidates, dead, p.storedCode, p.name, p.role, ts);
}

/* Un code republié tel quel (même nom, même intitulé, même code) garde son
 * identifiant : une session de tableau de bord ouverte par ce code (session_tiers
 * › staff_id) garde ainsi son nom après une publication de la page Équipe. La
 * comparaison reste dans SQL, comme l'insertion ci-dessous : seul un
 * identifiant remonte, jamais un code. Une base muette : un nouvel identifiant,
 * comme avant. */
async function keepUnchangedIds(env, merchant, clean) {
  for (const p of clean) {
    p.keepId = '';
    try {
      const prev = await env.DB.prepare('SELECT id FROM staff_pins WHERE merchant = ? AND name = ? AND role = ? AND pin IN ('
        + p.candidates.map(() => '?').join(',') + ') LIMIT 1').bind(merchant, p.name, p.role, ...p.candidates).first();
      if (prev && prev.id) p.keepId = String(prev.id);
    } catch (_) { p.keepId = ''; }
  }
}

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
      storedCode: '', // sealed below, never the code itself
      candidates: /** @type {string[]} */ ([]),
    });
  }
  // Atomic replace. created_ts is offset per index so the GET's ORDER BY
  // created_ts preserves the submitted order.
  for (const p of clean) {
    p.storedCode = await hashStaffCode(env, merchant, p.code);
    p.candidates = [...await pinHashes(env, merchant, p.code), p.code];
  }
  await keepUnchangedIds(env, merchant, clean);
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
  const keepIds = await ownerRowsToKeep(env, merchant, tillPins, body.replaceOwner);
  if (keepIds === null) return json({ error: 'staff-unavailable' }, 503);
  /* La console qui change UN code (admin/_pin-change.js) garde aussi les lignes saisies en console, que l'équipe ne connaît pas. */
  if (Array.isArray(body.keepRowIds)) for (const id of body.keepRowIds.slice(0, MAX_ROSTER)) if (id && !keepIds.includes(String(id))) keepIds.push(String(id));
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
      stmts.push(insertStaffRow(env, merchant, p, base + i));
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
        const parsed = await codeDocument(env, merchant, 'employee-access', JSON.parse(previousRow.data));
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
      const id = p.memberId || previousAccess.members.find((m) => m.email === p.email)?.id || 'employee-' + crypto.randomUUID();
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
    const accessText = JSON.stringify(await codeDocument(env, merchant, 'employee-access', access, true));
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
