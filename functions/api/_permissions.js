/* ── LES DROITS DE L'ÉQUIPE, CÔTÉ SERVEUR ────────────────────────────────────
 *
 * Qui peut rembourser, annuler, corriger le stock, sortir des espèces, changer
 * un prix, voir le chiffre d'affaires ou les marges. La liste des droits et les
 * rôles par défaut vivent dans assets/permissions-catalog.js, lue aussi par le
 * tableau de bord et la caisse ; ce fichier décide.
 *
 * RIEN NE CHANGE AVANT L'ACTIVATION. Tant que le propriétaire n'a pas activé
 * les droits (staff_permission_settings.activated_ts, posé par l'action
 * `activate` de functions/api/permissions.js après un aperçu personne par
 * personne), chaque route garde sa règle d'avant (`legacy`, voir decide()).
 * Une base sans la migration 0028 est dans le même cas : table absente =
 * droits non activés, jamais un 503 (le minimum de production reste 0027).
 *
 * Une personne = une ligne `staff_permissions` (rôle + droits ajoutés + droits
 * retirés), clé `staff_key` : l'identifiant du membre dans le document `team`
 * (stable d'une publication à l'autre), sinon « name:<nom normalisé> ».
 *
 * LE PROPRIÉTAIRE, C'EST LE COMPTE. Le rôle qui a tout n'appartient qu'à la
 * session du compte au palier propriétaire (et aux opérateurs Kiwi). Un
 * intitulé de poste (« Propriétaire », « Direction ») ne donne ici que le rôle
 * Manager ; et seul le propriétaire peut poser un tel intitulé
 * (teamEditRefusal ci-dessous, functions/api/config.js pour les codes).
 *
 * Ce fichier ne lit JAMAIS un code : du document `team` il ne garde que id,
 * nom et rôle ; de staff_pins il ne sélectionne que nom, rôle et boutique. Les
 * trois vérificateurs de code restent dans functions/auth/_lib.js.
 * ───────────────────────────────────────────────────────────────────────── */
import Catalog from '../../assets/permissions-catalog.js';
import {
  json, readSession, readCookie, SESS_COOKIE, operatorActor, isOperator, teamRemovedIds,
  employeeRoleOpensDashboard, faceAccessTier, readTillActorProof,
} from '../auth/_lib.js';
import { sessionTier } from '../auth/_session-tier.js';
import { isMissingTable } from './print/_relay.js';
import { readTillSellerProof } from './_seller.js';

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
const memberTitles = (m) => [m && m.function, m && m.role, m && m.title, m && m.department].map((v) => String(v || ''));

/* ── LES RÈGLES D'AVANT ──────────────────────────────────────────────────────
 * Ce que chaque route autorisait avant ce fichier, pour un intitulé donné.
 * L'aperçu d'activation compare à ceci, et « garder ses droits d'aujourd'hui »
 * l'écrit tel quel. Les sources :
 *   · approbations serveur (remboursement, stock) : employeeRoleOpensDashboard ;
 *   · annulation et réouverture : MANAGER_ROLES de functions/api/sale/cancel.js
 *     (copie tenue égale par tools/staff-permissions-test.mjs) ;
 *   · gestes que la caisse demandait au pavé responsable (remise, tiroir,
 *     espèces, prix, clôture, retrait envoyé) : la règle du pavé,
 *     assets/caisse-pairing/api.js › authorizeManager ;
 *   · tableau de bord : le palier que ce code ouvre (faceAccessTier) et
 *     MIN_TIER (functions/auth/_session-tier.js) : le gérant n'ouvrait ni les
 *     marges ni les fiches de paie, il voyait le document de paie. */
const CANCEL_MANAGER_ROLES = new Set(['manager', 'owner', 'proprietaire', 'proprietary', 'admin', 'administrateur',
  'direction', 'gerant', 'responsable', 'superviseur', 'manager-owner']);
export function cancelManagerRole(role) {
  const value = String(role || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return CANCEL_MANAGER_ROLES.has(value) || /(?:^|-)manager$/.test(value);
}
const TILL_PAD_RE = /owner|propri|manager|g[eé]rant|responsable|admin/;
const OFFICE = Catalog.ALL.filter((id) => Catalog.BY_ID[id].at === 'office');
export function legacyPerms(role) {
  const r = String(role || '').toLowerCase();
  const out = new Set();
  const dash = employeeRoleOpensDashboard(role);
  if (dash) { out.add('sales.refund'); out.add('stock.adjust'); }
  if (cancelManagerRole(role)) { out.add('sales.cancel'); out.add('sales.reopen'); }
  if (TILL_PAD_RE.test(r)) ['sales.discount', 'sales.drawer', 'money.cash', 'sales.price', 'money.close-day', 'sales.void-sent'].forEach((id) => out.add(id));
  const tier = dash ? faceAccessTier(role) : '';
  if (tier) for (const id of OFFICE) if (tier === 'owner' || (id !== 'reports.margins' && id !== 'team.payroll')) out.add(id);
  if (tier) out.add('sales.cancel');   // le tableau de bord annulait pour toute session déverrouillée
  return {
    perms: Catalog.ALL.filter((id) => out.has(id)),
    /* Ce qui était vrai en partie : la liste le dit, l'écran l'affiche. */
    partial: tier === 'manager' ? ['team.payroll'] : [],
  };
}

/* Les membres du document `team` : identité seulement. */
export async function teamMembers(env, merchant) {
  const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(merchant).first();
  return membersOf(parse(row && row.data, {}) || {});
}
function membersOf(doc) {
  const removed = teamRemovedIds(doc || {});
  return (Array.isArray(doc && doc.members) ? doc.members : [])
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
  return members.map((m) => ({ ...m, defaultPreset: Catalog.presetForRole(m.role), ownerTitle: Catalog.ownerTitle(m.role) }));
}

/* Une identité prouvée par un code ({ id, name, role } de verifyStaffPin) →
 * la personne de l'équipe. Deux homonymes : celle dont le rôle correspond. */
export async function subjectFor(env, merchant, staff) {
  const name = String((staff && staff.name) || '').trim().slice(0, 80);
  const role = String((staff && staff.role) || '').trim().slice(0, 60);
  let members = [];
  try { members = await teamMembers(env, merchant); } catch (_) { members = []; }
  return matchMember(members, name, role) || { key: 'name:' + nameKey(name), name, role };
}
function matchMember(members, name, role) {
  const k = nameKey(name);
  const same = members.filter((m) => nameKey(m.name) === k);
  const hit = same.find((m) => Catalog.normRole(m.role) === Catalog.normRole(role)) || (same.length === 1 ? same[0] : null);
  return hit ? { key: hit.key, name: hit.name, role: hit.role || role } : null;
}

/* L'état d'une boutique. `configured` = droits ACTIVÉS par le propriétaire.
 * Table absente (0028 pas encore appliquée) : non activé, `missing` — la règle
 * d'avant tient. Toute autre panne : { unavailable } et la route refuse (503),
 * comme pour toute autre lecture de la base. */
export async function loadState(env, merchant) {
  const state = { rows: new Map(), presets: {}, freeDiscountPct: Catalog.DEFAULT_FREE_DISCOUNT_PCT, legacyImportedTs: 0,
    configured: false, activatedTs: 0, missing: false };
  try {
    const [rows, presets, settings] = await Promise.all([
      env.DB.prepare('SELECT staff_key, preset, grants, denies, name, updated_ts, updated_by FROM staff_permissions WHERE merchant = ?').bind(merchant).all(),
      env.DB.prepare('SELECT preset, perms FROM staff_permission_presets WHERE merchant = ?').bind(merchant).all(),
      env.DB.prepare('SELECT free_discount_pct, legacy_imported_ts, activated_ts FROM staff_permission_settings WHERE merchant = ?').bind(merchant).first(),
    ]);
    for (const r of rows.results || []) {
      state.rows.set(String(r.staff_key), { preset: String(r.preset || ''), grants: Catalog.cleanList(parse(r.grants, [])),
        denies: Catalog.cleanList(parse(r.denies, [])), name: String(r.name || ''), updatedTs: Number(r.updated_ts) || 0, updatedBy: String(r.updated_by || '') });
    }
    for (const p of presets.results || []) {
      if (Catalog.PRESET_IDS.includes(p.preset)) state.presets[p.preset] = Catalog.cleanList(parse(p.perms, []));
    }
    if (settings) {
      const pct = Number(settings.free_discount_pct);
      if (Number.isInteger(pct) && pct >= 0 && pct <= 100) state.freeDiscountPct = pct;
      state.legacyImportedTs = Number(settings.legacy_imported_ts) || 0;
      state.activatedTs = Number(settings.activated_ts) || 0;
    }
    state.configured = state.activatedTs > 0;
  } catch (e) {
    if (isMissingTable(e)) return { ...state, missing: true };
    return { unavailable: true };
  }
  return state;
}

/* Les droits effectifs d'une personne dans un état déjà lu. Jamais le rôle du
   compte du propriétaire : un membre a au plus ce qu'on lui a donné. */
export function permsIn(state, subject) {
  const row = state.rows.get(subject.key);
  const preset = (row && Catalog.PRESET_IDS.includes(row.preset)) ? row.preset : Catalog.presetForRole(subject.role);
  return { preset, perms: Catalog.effective(preset, row && row.grants, row && row.denies, state.presets),
    grants: (row && row.grants) || [], denies: (row && row.denies) || [] };
}

/* { ok, perms, subject } | { unavailable } pour une identité prouvée. */
export async function permissionsFor(env, merchant, staff) {
  if (!env || !env.DB || !merchant || !staff) return { unavailable: true };
  const [state, subject] = await Promise.all([loadState(env, merchant), subjectFor(env, merchant, staff)]);
  if (state.unavailable) return { unavailable: true };
  return { ok: true, subject, state, ...permsIn(state, subject) };
}

/* LA décision d'une route. Tant que la boutique n'a pas activé ses droits, la
 * règle d'avant (`legacy`, un booléen que la route calcule comme elle l'a
 * toujours fait) tranche : déployer ce fichier ne change rien pour personne.
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
    label: { fr: p.fr || perm, en: p.en || perm, ar: p.ar || perm },
    ...(Catalog.TILL_APPROVED.includes(perm) ? { approval: 'manager-code' } : {}), ...(extra || {}) }, 403);
}
export function permissionUnavailable() { return json({ error: 'permissions-unavailable' }, 503); }

/* ── LA SESSION DU TABLEAU DE BORD ───────────────────────────────────────────
 * La session du compte est celle du patron ; un gérant qui déverrouille avec
 * SON code inscrit son palier et son staff_pins.id (session_tiers). On
 * retrouve alors la personne, dans une boutique de CE compte seulement.
 *   null                  → pas de session : l'appelant juge avec ses preuves ;
 *   { owner: true }       → le compte au palier propriétaire ;
 *   { tier, staff|null }  → un gérant ou une réception ;
 *   { unavailable: true } → base muette. */
export async function sessionPerson(request, env) {
  if (!env || !env.AUTH_SECRET || !env.DB) return null;
  let sess = null;
  try { sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET); } catch (_) { sess = null; }
  if (!sess || !sess.aid || !SID_RE.test(String(sess.sid || ''))) return null;
  /* Le palier se lit comme partout (sessionTier, même repli) ; la personne
     n'est cherchée que pour une session sous le palier du patron. */
  const st = await sessionTier(request, env);
  if (st.unavailable) return { unavailable: true };
  if (!st.tier) return null;
  if (st.tier === 'owner') return { owner: true, aid: sess.aid };
  const tier = st.tier;
  let row;
  try {
    row = await env.DB.prepare('SELECT staff_id FROM session_tiers WHERE sid = ? AND account_id = ?').bind(sess.sid, String(sess.aid)).first();
  } catch (_) { return { unavailable: true }; }
  let staff = null;
  if (row && row.staff_id) {
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
 * (functions/auth/_session-tier.js) AVANT le palier minimal : un droit que le
 * propriétaire a donné ouvre la route, un droit retiré la ferme. Seul le compte
 * du propriétaire donne des droits (permissionEditor), et aucun intitulé de
 * poste n'en apporte : marges et paie ne s'ouvrent à un gérant que si le
 * propriétaire l'a décidé. */
const ROUTE_PERMS = [
  ['/api/sales-summary', 'GET', 'reports.revenue'],
  ['/api/foodcost', '*', 'reports.margins'],
  ['/api/commissions', '*', 'team.payroll'],
  ['/api/pay-statements', '*', 'team.payroll'],
  ['/api/catalog', 'POST', 'catalog.edit'],
  ['/api/inventory/counts', 'POST', 'stock.count'],
  ['/api/stock-transfers', 'POST', 'stock.receive'],
  ['/api/clients', 'POST', 'customers.edit'],
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

/* ── LES DOCUMENTS ───────────────────────────────────────────────────────────
 * Un document de boutique (functions/api/store.js) s'écrit en entier ; ce qui
 * a changé dit le droit qu'il faut. Ne vaut que pour une session de tableau de
 * bord déverrouillée par le code d'une personne : le compte du propriétaire et
 * une caisse appairée (qui n'a pas de personne) gardent leurs règles. */
const DOC_KEY_PERMS = {
  procurement: { orders: 'purchases.create', invoices: 'purchases.pay', suppliers: 'suppliers.edit', receipts: 'stock.receive', returns: 'stock.receive' },
  suppliers: { list: 'suppliers.edit' },
};
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
export async function docWriteGuard(request, env, merchant, feature, before, after, settingsDoc) {
  const needed = new Set();
  const keys = DOC_KEY_PERMS[feature];
  if (keys) for (const [k, perm] of Object.entries(keys)) if (!same(before && before[k], after && after[k])) needed.add(perm);
  if (settingsDoc && !same(before, after)) needed.add('settings.edit');
  if (feature === 'team') {
    const refused = await teamEditRefusal(request, env, merchant, before, after);
    if (refused) return refused;
  }
  for (const perm of needed) {
    const denied = await sessionGuard(request, env, merchant, perm);
    if (denied) return denied;
  }
  return null;
}

/* Le document `team` porte les intitulés de poste et les codes. Une session
 * qui n'est pas celle du propriétaire ne peut ni poser un intitulé de
 * propriétaire (sur qui que ce soit, à la création comme au changement), ni
 * toucher à SA propre fiche : sinon un gérant se renommerait « Propriétaire »,
 * ou se rendrait lui-même ce que le patron lui a retiré. Vaut avant comme après
 * l'activation des droits : c'est une borne, pas un droit. */
export async function teamEditRefusal(request, env, merchant, before, after) {
  const who = await sessionPerson(request, env);
  if (!who || who.owner) return null;
  try { if (await isOperator(request, env)) return null; } catch (_) {}
  if (who.unavailable) return permissionUnavailable();
  const old = new Map((Array.isArray(before && before.members) ? before.members : [])
    .filter((m) => m && m.id).map((m) => [String(m.id), m]));
  for (const m of (Array.isArray(after && after.members) ? after.members : [])) {
    if (!m || typeof m !== 'object' || m.deleted) continue;
    const prev = old.get(String(m.id || ''));
    const titled = memberTitles(m).filter((t) => Catalog.ownerTitle(t));
    if (titled.some((t) => !prev || !memberTitles(prev).includes(t))) {
      return json({ error: 'owner-title-reserved', member: memberName(m),
        message: 'Seul le propriétaire peut donner un intitulé de propriétaire.' }, 403);
    }
  }
  if (who.staff) {
    const self = matchMember(membersOf(before || {}), who.staff.name, who.staff.role);
    if (self) {
      const mine = old.get(self.key);
      const next = (Array.isArray(after && after.members) ? after.members : []).find((m) => m && String(m.id || '') === self.key);
      if (!same(mine, next)) {
        return json({ error: 'own-record-locked', member: self.name,
          message: 'Votre propre fiche se modifie depuis le compte du propriétaire.' }, 403);
      }
    }
  }
  return null;
}

/* ── QUI ÉCRIT LES DROITS ────────────────────────────────────────────────────
 * Changer des droits, c'est en donner : seul le compte du propriétaire (palier
 * propriétaire) ou un opérateur Kiwi nommé le peut, quel que soit team.manage. */
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

/* ── LES FAITS DÉJÀ ACCOMPLIS ────────────────────────────────────────────────
 * Une remise encaissée, des espèces sorties du tiroir, une journée clôturée :
 * l'argent a déjà bougé. Refuser l'écriture ne le ferait pas revenir, cela
 * retirerait seulement la trace des livres (même règle que la vente,
 * functions/api/_sale-truth.js). La caisse demande donc le code d'un
 * responsable AVANT ; ici, ce qui arrive sans le droit est inscrit au journal
 * des droits du propriétaire (« fait sans le droit »).
 *
 * L'AUTEUR EST PROUVÉ, JAMAIS DÉCLARÉ. Le seul auteur reconnu est celui d'une
 * preuve signée par /api/pin/verify pour ce commerce : la preuve d'acteur d'un
 * responsable qui vient de valider (actorProof), ou celle de la personne en
 * poste (sellerProof, valable le temps d'un service). Un identifiant envoyé
 * par la caisse n'est qu'un dire, gardé dans le détail : sans preuve, le fait
 * est inscrit « auteur non prouvé ». `at` est l'heure du fait (une caisse hors
 * ligne le livre plus tard) : la preuve devait être valable à ce moment-là.
 * Une seule ligne par fait : `ref` est l'identifiant de la vente ou du
 * mouvement, rejouer ne double rien. */
export async function provenActor(env, merchant, token, at) {
  if (!env || !env.AUTH_SECRET || typeof token !== 'string' || !token || token.length > 2048) return null;
  const now = Date.now();
  const when = Number.isFinite(at) && at <= now && at > now - 2 * 86400000 ? at : now;
  try {
    const actor = await readTillActorProof(token, env.AUTH_SECRET, merchant, when);
    if (actor && actor.id) return { id: String(actor.id).slice(0, 96), name: String(actor.name || ''), role: String(actor.role || '') };
  } catch (_) {}
  try {
    const seller = await readTillSellerProof(token, env.AUTH_SECRET, merchant, when);
    if (seller && seller.id) return { id: seller.id, name: seller.name, role: '' };
  } catch (_) {}
  return null;
}

export async function flagUnauthorized(env, merchant, proven, perm, ref, detail) {
  try {
    if (!env || !env.DB || !merchant || !ref) return false;
    const state = await loadState(env, merchant);
    if (state.unavailable || !state.configured) return false;
    let subject = null;
    if (proven && proven.id) {
      const pin = await env.DB.prepare('SELECT name, role FROM staff_pins WHERE id = ? AND merchant = ? LIMIT 1')
        .bind(String(proven.id).slice(0, 96), merchant).first();
      if (pin) {
        const who = { name: String(pin.name || proven.name || ''), role: String(pin.role || '') };
        const subj = await subjectFor(env, merchant, who);
        if (permsIn(state, subj).perms.includes(perm)) return false;
        subject = subj;
      }
    }
    const key = subject ? 'staff:' + subject.key : 'staff:unproven';
    const label = subject ? subject.name : 'Auteur non prouvé';
    const change = JSON.stringify({ kind: 'unauthorized', permission: perm, ref: String(ref).slice(0, 96),
      ...(subject ? {} : { unproven: true }), ...(detail || {}) }).slice(0, 4000);
    await env.DB.prepare(
      `INSERT INTO staff_permission_audit (merchant, ts, actor, actor_label, subject, subject_label, change)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM staff_permission_audit WHERE merchant = ? AND subject = ? AND change = ?)`
    ).bind(merchant, Date.now(), key, label, key, label, change, merchant, key, change).run();
    return true;
  } catch (_) { return false; }
}

/* La remise d'une vente, jugée contre le seuil libre de la boutique. */
export async function flagDiscountPermission(env, merchant, saleId, proven, grossCents, discountCents, claimedActor) {
  const gross = Number(grossCents) || 0, off = Number(discountCents) || 0;
  if (!(gross > 0 && off > 0)) return false;
  const state = await loadState(env, merchant);
  if (state.unavailable || !state.configured) return false;
  const pct = Math.round((off / gross) * 1000) / 10;
  if (pct <= state.freeDiscountPct) return false;
  return flagUnauthorized(env, merchant, proven, 'sales.discount', saleId,
    { percent: pct, limit: state.freeDiscountPct, discountCents: off, ...(claimedActor ? { claimed: String(claimedActor).slice(0, 96) } : {}) });
}
