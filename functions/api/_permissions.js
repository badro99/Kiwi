/* ── LES DROITS DE L'ÉQUIPE, CÔTÉ SERVEUR ────────────────────────────────────
 *
 * Qui peut rembourser, annuler, corriger le stock, sortir des espèces, changer
 * un prix, voir le chiffre d'affaires ou les marges. La liste des droits et les
 * rôles par défaut vivent dans assets/permissions-catalog.js, lue aussi par le
 * tableau de bord et la caisse ; ce fichier décide.
 *
 * Une personne = une ligne `staff_permissions` (rôle + droits ajoutés + droits
 * retirés), clé `staff_key` :
 *   · l'identifiant du membre dans le document `team` (stable d'une
 *     publication à l'autre, contrairement à staff_pins.id qui est refait à
 *     chaque enregistrement de l'équipe) ;
 *   · sinon « name:<nom normalisé> », la même clé que la caisse utilise déjà
 *     (assets/till-inventory-access.js › staffNameKey).
 * Une personne sans ligne a les droits par défaut de son rôle, c'est-à-dire
 * exactement ce que le serveur autorisait avant ce fichier.
 *
 * Ce fichier ne lit JAMAIS un code : du document `team` il ne garde que id,
 * nom et rôle ; de staff_pins il ne sélectionne que nom, rôle et boutique. Les
 * trois vérificateurs de code restent dans functions/auth/_lib.js.
 *
 * Pannes : les tables viennent de la migration 0028, que le minimum de
 * production (functions/_schema-version.js) exige avant tout déploiement ; une
 * lecture qui échoue vaut « indisponible » et la route refuse (503). Jamais de
 * repli silencieux sur les droits par défaut.
 * ───────────────────────────────────────────────────────────────────────── */
import Catalog from '../../assets/permissions-catalog.js';
import { json, readSession, readCookie, SESS_COOKIE, operatorActor, isOperator, teamRemovedIds } from '../auth/_lib.js';

export { Catalog };

const SID_RE = /^[0-9a-f]{32}$/;
function parse(text, fallback) { try { const v = JSON.parse(text); return v == null ? fallback : v; } catch (_) { return fallback; } }

export function nameKey(value) {
  let s = String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
  try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) {}
  return s.slice(0, 80);
}
const memberName = (m) => String((m && (m.name || `${m.firstName || ''} ${m.lastName || ''}`)) || '').trim().slice(0, 80);
const memberRole = (m) => String((m && (m.function || m.role || m.department)) || '').trim().slice(0, 60);

/* Les membres du document `team` : identité seulement. */
export async function teamMembers(env, merchant) {
  const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(merchant).first();
  const doc = parse(row && row.data, {}) || {};
  const removed = teamRemovedIds(doc);
  return (Array.isArray(doc.members) ? doc.members : [])
    .filter((m) => m && typeof m === 'object' && m.id && !m.deleted && !removed.has(String(m.id)))
    .map((m) => ({ key: String(m.id).slice(0, 96), name: memberName(m), role: memberRole(m) }))
    .filter((m) => m.name);
}

/* L'équipe d'une boutique, telle que l'écran des droits la montre : les
 * membres d'Équipe, plus les codes de caisse posés ailleurs (onboarding,
 * console) qui ne correspondent à aucun membre. Jamais de code. */
export async function rosterFor(env, merchant) {
  let members = [];
  try { members = await teamMembers(env, merchant); } catch (_) { members = []; }
  const seen = new Set(members.map((m) => nameKey(m.name)));
  let pins = [];
  try {
    pins = (await env.DB.prepare('SELECT name, role FROM staff_pins WHERE merchant = ? ORDER BY created_ts').bind(merchant).all()).results || [];
  } catch (_) { pins = []; }
  for (const p of pins) {
    const name = String(p.name || '').trim().slice(0, 80);
    const k = nameKey(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    members.push({ key: 'name:' + k, name, role: String(p.role || '').slice(0, 60) });
  }
  return members.map((m) => ({ ...m, defaultPreset: Catalog.presetForRole(m.role) }));
}

/* Une identité prouvée par un code ({ id, name, role } de verifyStaffPin) →
 * la personne de l'équipe. Deux homonymes : celle dont le rôle correspond. */
export async function subjectFor(env, merchant, staff) {
  const name = String((staff && staff.name) || '').trim().slice(0, 80);
  const role = String((staff && staff.role) || '').trim().slice(0, 60);
  const k = nameKey(name);
  let members = [];
  try { members = await teamMembers(env, merchant); } catch (_) { members = []; }
  const same = members.filter((m) => nameKey(m.name) === k);
  const hit = same.find((m) => Catalog.normRole(m.role) === Catalog.normRole(role)) || (same.length === 1 ? same[0] : null);
  if (hit) return { key: hit.key, name: hit.name, role: hit.role || role };
  return { key: 'name:' + k, name, role };
}

/* L'état d'une boutique : surcharges par personne, rôles modifiés, réglages. */
export async function loadState(env, merchant) {
  const state = { rows: new Map(), presets: {}, freeDiscountPct: Catalog.DEFAULT_FREE_DISCOUNT_PCT, legacyImportedTs: 0, configured: false };
  try {
    const [rows, presets, settings] = await Promise.all([
      env.DB.prepare('SELECT staff_key, preset, grants, denies, name, updated_ts, updated_by FROM staff_permissions WHERE merchant = ?').bind(merchant).all(),
      env.DB.prepare('SELECT preset, perms FROM staff_permission_presets WHERE merchant = ?').bind(merchant).all(),
      env.DB.prepare('SELECT free_discount_pct, legacy_imported_ts FROM staff_permission_settings WHERE merchant = ?').bind(merchant).first(),
    ]);
    for (const r of rows.results || []) {
      state.rows.set(String(r.staff_key), { preset: String(r.preset || ''), grants: Catalog.cleanList(parse(r.grants, [])),
        denies: Catalog.cleanList(parse(r.denies, [])), name: String(r.name || ''), updatedTs: Number(r.updated_ts) || 0, updatedBy: String(r.updated_by || '') });
    }
    for (const p of presets.results || []) {
      if (p.preset !== 'owner' && Catalog.PRESET_IDS.includes(p.preset)) state.presets[p.preset] = Catalog.cleanList(parse(p.perms, []));
    }
    /* Configurée = le propriétaire a enregistré l'écran des droits au moins une
       fois. Avant, chaque route garde sa règle d'avant (voir decide()). */
    state.configured = state.rows.size > 0 || Object.keys(state.presets).length > 0 || !!settings;
    if (settings) {
      const pct = Number(settings.free_discount_pct);
      if (Number.isInteger(pct) && pct >= 0 && pct <= 100) state.freeDiscountPct = pct;
      state.legacyImportedTs = Number(settings.legacy_imported_ts) || 0;
    }
  } catch (_) { return { unavailable: true }; }
  return state;
}

/* Les droits effectifs d'une personne dans un état déjà lu. */
export function permsIn(state, subject) {
  const row = state.rows.get(subject.key);
  const preset = (row && Catalog.PRESET_IDS.includes(row.preset)) ? row.preset : Catalog.presetForRole(subject.role);
  /* Un intitulé de propriétaire reste propriétaire : une surcharge ne verrouille
     jamais le patron hors de sa propre boutique. */
  const finalPreset = Catalog.presetForRole(subject.role) === 'owner' ? 'owner' : preset;
  return { preset: finalPreset, perms: Catalog.effective(finalPreset, row && row.grants, row && row.denies, state.presets),
    grants: (row && row.grants) || [], denies: (row && row.denies) || [] };
}

/* { ok, perms, subject } | { unavailable } pour une identité prouvée. */
export async function permissionsFor(env, merchant, staff) {
  if (!env || !env.DB || !merchant || !staff) return { unavailable: true };
  const [state, subject] = await Promise.all([loadState(env, merchant), subjectFor(env, merchant, staff)]);
  if (state.unavailable) return { unavailable: true };
  return { ok: true, subject, state, ...permsIn(state, subject) };
}

export async function staffMay(env, merchant, staff, perm) {
  const got = await permissionsFor(env, merchant, staff);
  if (got.unavailable) return { ok: false, unavailable: true };
  return { ok: got.perms.includes(perm), subject: got.subject, perms: got.perms, freeDiscountPct: got.state.freeDiscountPct };
}

/* LA décision d'une route. Tant que la boutique n'a rien configuré, la règle
 * d'avant (`legacy`, un booléen que la route calcule comme elle l'a toujours
 * fait) tranche : déployer ce fichier ne change rien pour personne. Dès que le
 * propriétaire a enregistré ses droits, ce sont eux qui tranchent.
 *   { ok, unavailable?, subject?, configured } */
export async function decide(env, merchant, staff, perm, legacy) {
  const got = await permissionsFor(env, merchant, staff);
  if (got.unavailable) return { ok: false, unavailable: true };
  if (!got.state.configured) return { ok: !!legacy, subject: got.subject, configured: false, perms: got.perms };
  return { ok: got.perms.includes(perm), subject: got.subject, configured: true, perms: got.perms };
}

/* La réponse qu'une route renvoie quand le droit manque : le libellé dans les
 * trois langues, et la voie de l'accord d'un responsable quand elle existe. */
export function permissionDenied(perm, extra) {
  const p = Catalog.BY_ID[perm] || {};
  return json({ error: 'permission-denied', permission: perm,
    label: { fr: p.fr || perm, en: p.en || perm, ar: p.ar || perm }, approval: 'manager-code', ...(extra || {}) }, 403);
}
export function permissionUnavailable() { return json({ error: 'permissions-unavailable' }, 503); }

/* ── LA SESSION DU TABLEAU DE BORD ───────────────────────────────────────────
 * La session du compte est celle du patron ; un gérant qui déverrouille avec
 * SON code inscrit son palier et son staff_pins.id (session_tiers). On
 * retrouve alors la personne, dans une boutique de CE compte seulement.
 *   null                  → pas de session : l'appelant juge avec ses preuves ;
 *   { owner: true }       → le patron (ou un appareil d'avant le palier) ;
 *   { tier, staff|null }  → un gérant ou une réception ;
 *   { unavailable: true } → base muette. */
export async function sessionPerson(request, env) {
  if (!env || !env.AUTH_SECRET || !env.DB) return null;
  let sess = null;
  try { sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET); } catch (_) { sess = null; }
  if (!sess || !sess.aid || !SID_RE.test(String(sess.sid || ''))) return null;
  let row;
  try {
    row = await env.DB.prepare('SELECT tier, staff_id FROM session_tiers WHERE sid = ? AND account_id = ?').bind(sess.sid, String(sess.aid)).first();
  } catch (_) { return { unavailable: true }; }
  const tier = row && String(row.tier || '');
  if (!row || !tier || tier === 'owner') return { owner: true, aid: sess.aid };
  let staff = null;
  if (row.staff_id) {
    try {
      const pin = await env.DB.prepare(
        `SELECT p.merchant, p.name, p.role FROM staff_pins p JOIN merchant_config c ON c.merchant = p.merchant
          WHERE p.id = ? AND c.account_id = ? LIMIT 1`
      ).bind(String(row.staff_id), String(sess.aid)).first();
      if (pin) staff = { name: String(pin.name || ''), role: String(pin.role || ''), merchant: String(pin.merchant || '') };
    } catch (_) { staff = null; }
  }
  return { tier, staff, aid: sess.aid };
}

/* Le droit d'une session sur une boutique. La décision est TOUJOURS prise sur
 * la boutique de la personne qui a déverrouillé (staff_pins.merchant, lu en
 * base) ; jamais sur un merchant venu de la requête. Une requête qui vise une
 * autre boutique que la sienne est refusée (`mismatch`) : sinon il suffirait de
 * nommer une boutique sans configuration pour retomber sur la règle d'avant.
 * Un palier sans personne retrouvée (Face ID, code republié) garde ses règles
 * de palier, jugées par l'appelant, avec le rôle par défaut de ce palier. */
export async function sessionMay(request, env, merchant, perm, legacy = true) {
  const who = await sessionPerson(request, env);
  if (!who || who.owner) return { ok: true, owner: !!(who && who.owner) };
  if (who.unavailable) return { ok: false, unavailable: true };
  if (!who.staff) {
    if (!merchant) return { ok: !!legacy, tier: who.tier };
    const role = who.tier === 'manager' ? 'manager' : 'service';
    return { ...(await decide(env, merchant, { name: '', role }, perm, legacy)), tier: who.tier };
  }
  const store = who.staff.merchant;
  if (!store || (merchant && merchant !== store)) return { ok: false, mismatch: true, configured: true, staff: who.staff, tier: who.tier };
  const got = await decide(env, store, who.staff, perm, legacy);
  return { ...got, staff: who.staff, tier: who.tier };
}

/* Le garde d'une route du tableau de bord, posé DANS la route, contre le
 * merchant qu'elle utilise vraiment (corps compris). null = continuer. */
export async function sessionGuard(request, env, merchant, perm, legacy = true) {
  const may = await sessionMay(request, env, merchant, perm, legacy);
  if (may.unavailable) return permissionUnavailable();
  return may.ok ? null : permissionDenied(perm);
}

/* ── LES ROUTES ──────────────────────────────────────────────────────────────
 * Ce qu'une route du tableau de bord coûte, pour une session déverrouillée par
 * un code qui n'est pas celui du patron. Lu par tierBlock
 * (functions/auth/_session-tier.js) AVANT le palier minimal : un droit accordé
 * ouvre la route au gérant, un droit retiré la lui ferme. */
const ROUTE_PERMS = [
  ['/api/sales-summary', 'GET', 'reports.revenue'],
  ['/api/foodcost', '*', 'reports.margins'],
  ['/api/commissions', '*', 'team.payroll'],
  ['/api/pay-statements', '*', 'team.payroll'],
  ['/api/catalog', 'POST', 'catalog.edit'],
  ['/api/inventory/counts', 'POST', 'stock.count'],
  ['/api/stock-transfers', 'POST', 'stock.receive'],
  ['/api/suppliers/ranking', 'GET', 'suppliers.edit'],
  ['/api/clients', 'DELETE', 'customers.delete'],
];
export function routePermission(path, method) {
  const m = String(method || 'GET').toUpperCase();
  const hit = ROUTE_PERMS.find(([p, verb]) => p === path && (verb === '*' || verb === m));
  return hit ? hit[2] : '';
}
export { ROUTE_PERMS };

/* Le merchant visé par la requête, pour une route du tableau de bord. */
export function askedMerchant(request) {
  try { return String(new URL(request.url).searchParams.get('merchant') || '').slice(0, 64); } catch (_) { return ''; }
}

/* ── QUI ÉCRIT ───────────────────────────────────────────────────────────────
 * Changer des droits, c'est en donner : seul le patron (palier propriétaire)
 * ou un opérateur Kiwi nommé le peut, quel que soit team.manage — sinon un
 * gérant s'accorderait lui-même les marges et la paie. */
export async function permissionEditor(request, env) {
  try {
    if (await isOperator(request, env)) {
      const op = await operatorActor(request, env);
      return { ok: true, id: 'operator:' + String(op.id || '').slice(0, 80), label: String(op.label || 'opérateur').slice(0, 80) };
    }
  } catch (_) { /* fall through */ }
  const who = await sessionPerson(request, env);
  if (who && who.unavailable) return { ok: false, unavailable: true };
  if (who && who.owner) return { ok: true, id: 'account:' + String(who.aid).slice(0, 80), label: 'propriétaire' };
  return { ok: false };
}

export async function recordAudit(env, merchant, actor, subject, subjectLabel, change) {
  await env.DB.prepare(
    `INSERT INTO staff_permission_audit (merchant, ts, actor, actor_label, subject, subject_label, change)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(merchant, Date.now(), String(actor.id || '').slice(0, 120), String(actor.label || '').slice(0, 80),
    String(subject || '').slice(0, 120), String(subjectLabel || '').slice(0, 80), JSON.stringify(change).slice(0, 4000)).run();
}

/* ── LES FAITS DÉJÀ ACCOMPLIS ────────────────────────────────────────────────
 * Une remise encaissée, des espèces sorties du tiroir : l'argent a déjà bougé.
 * Refuser l'écriture ne le ferait pas revenir, cela retirerait seulement la
 * trace des livres (même règle que la vente, functions/api/_sale-truth.js). La
 * caisse demande donc le code d'un responsable AVANT ; ici, ce qui arrive sans
 * le droit est inscrit, et la ligne apparaît au propriétaire dans le journal
 * des droits (« fait sans le droit »). Une seule ligne par fait : `ref` est
 * l'identifiant de la vente ou du mouvement, rejouer ne double rien.
 * `staff` : { id } (staff_pins.id annoncé par la caisse) ou { name, role }. */
export async function flagUnauthorized(env, merchant, staff, perm, ref, detail) {
  try {
    if (!env || !env.DB || !merchant || !staff || !ref) return false;
    let who = staff;
    if (!who.name && who.id) {
      const pin = await env.DB.prepare('SELECT name, role FROM staff_pins WHERE id = ? AND merchant = ? LIMIT 1')
        .bind(String(who.id).slice(0, 96), merchant).first();
      if (!pin) return false;   // inconnu (code republié, « till ») : rien à juger
      who = { name: String(pin.name || ''), role: String(pin.role || '') };
    }
    const ruling = await decide(env, merchant, who, perm, true);
    if (ruling.unavailable || ruling.ok || !ruling.configured) return false;
    const change = JSON.stringify({ kind: 'unauthorized', permission: perm, ref: String(ref).slice(0, 96), ...(detail || {}) }).slice(0, 4000);
    await env.DB.prepare(
      `INSERT INTO staff_permission_audit (merchant, ts, actor, actor_label, subject, subject_label, change)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM staff_permission_audit WHERE merchant = ? AND subject = ? AND change = ?)`
    ).bind(merchant, Date.now(), 'staff:' + ruling.subject.key, ruling.subject.name, 'staff:' + ruling.subject.key,
      ruling.subject.name, change, merchant, 'staff:' + ruling.subject.key, change).run();
    return true;
  } catch (_) { return false; }
}

/* La remise d'une vente, jugée contre le seuil libre de la boutique. */
export async function flagDiscountPermission(env, merchant, saleId, actorId, grossCents, discountCents) {
  const gross = Number(grossCents) || 0, off = Number(discountCents) || 0;
  if (!(gross > 0 && off > 0) || !actorId) return false;
  const state = await loadState(env, merchant);
  if (state.unavailable || !state.configured) return false;
  const pct = Math.round((off / gross) * 1000) / 10;
  if (pct <= state.freeDiscountPct) return false;
  return flagUnauthorized(env, merchant, { id: actorId }, 'sales.discount', saleId,
    { percent: pct, limit: state.freeDiscountPct, discountCents: off });
}
