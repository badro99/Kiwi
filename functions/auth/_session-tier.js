/* ── LE PALIER D'UNE SESSION · qui a déverrouillé ce tableau de bord ──────────
 *
 * La session du compte (kiwi_sess) est celle du patron : elle reste ouverte sur
 * l'appareil du comptoir, et la porte du tableau de bord (un code à 4 chiffres)
 * n'était qu'un écran. Un gérant ou une réceptionniste qui déverrouillait avec
 * SON code recevait une vue réduite, mais le serveur répondait à cet appareil
 * comme au patron : chiffre d'affaires, paie, codes de toute l'équipe, clés.
 *
 * Désormais le code prouvé (POST /api/pin/verify, ou Face ID via /api/pin/face)
 * inscrit côté serveur le PALIER de cette session (son sid) :
 *     owner > manager > reception
 * et les routes du patron le lisent. Le palier vit en base, pas dans un cookie :
 * effacer ses cookies ne rend pas le palier du patron, cela déconnecte.
 *
 * Lecture :
 *   · pas de session            → rien à restreindre (caisse appairée, opérateur,
 *                                 employé : chacun a ses propres règles) ;
 *   · pas de ligne pour ce sid  → 'owner' : un appareil d'avant ce palier, ou un
 *                                 compte sans code, garde exactement son accès ;
 *   · table absente             → 'owner' (base pas encore migrée : on retombe sur
 *                                 le comportement d'avant au lieu de couper tout le
 *                                 monde au déploiement, comme session_revocations) ;
 *   · toute autre erreur        → indisponible : une route du patron refuse.
 *
 * Ce que le palier ne fait PAS : il ne remplace aucune preuve existante (code de
 * responsable d'un remboursement, caisse appairée, opérateur). Ce qu'une caisse
 * appairée lit déjà (TILL_PATHS du middleware) n'est pas restreint ici : le
 * comptoir le lit de toute façon. */
import { readSession, readCookie, SESS_COOKIE, json } from './_lib.js';
import { isMissingTable } from '../api/print/_relay.js';

const RANK = { reception: 1, manager: 2, owner: 3 };
const SID_RE = /^[0-9a-f]{32}$/;

export function tierRank(tier) { return RANK[tier] || 0; }

/* Le palier d'un rôle prouvé. Toute autre valeur n'ouvre rien. */
export function tierForAccess(access) {
  return access === 'owner' || access === 'manager' || access === 'reception' ? access : '';
}

async function sessionOf(request, env) {
  if (!env || !env.AUTH_SECRET) return null;
  try {
    const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    return sess && sess.aid && SID_RE.test(String(sess.sid || '')) ? sess : null;
  } catch (_) { return null; }
}

/* { tier: 'owner'|'manager'|'reception'|null, unavailable? } · null = pas de session. */
export async function sessionTier(request, env) {
  const sess = await sessionOf(request, env);
  if (!sess) return { tier: null };
  try {
    const row = await env.DB.prepare('SELECT tier FROM session_tiers WHERE sid = ? AND account_id = ?')
      .bind(sess.sid, String(sess.aid)).first();
    const tier = row && tierForAccess(String(row.tier || ''));
    return { tier: tier || 'owner' };
  } catch (e) {
    if (isMissingTable(e)) return { tier: 'owner' };
    return { tier: null, unavailable: true };
  }
}

/* Vrai quand la session (s'il y en a une) atteint ce palier. Sans session : vrai,
 * l'appelant juge avec ses propres preuves. Base indisponible : faux. */
export async function sessionTierAtLeast(request, env, need) {
  const st = await sessionTier(request, env);
  if (st.unavailable) return false;
  if (!st.tier) return true;
  return tierRank(st.tier) >= tierRank(need);
}

/* Inscrit le palier que le code vient de prouver sur cet appareil. Au mieux :
 * une base pas migrée ne doit pas empêcher d'ouvrir le tableau de bord. */
export async function recordSessionTier(request, env, access, staffId) {
  const tier = tierForAccess(access);
  const sess = await sessionOf(request, env);
  if (!tier || !sess || !env.DB) return false;
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO session_tiers (sid, account_id, tier, staff_id, updated_ts) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET account_id = excluded.account_id, tier = excluded.tier,
         staff_id = excluded.staff_id, updated_ts = excluded.updated_ts`
    ).bind(sess.sid, String(sess.aid), tier, String(staffId || '').slice(0, 80), now).run();
  } catch (_) { return false; }
  try {
    /* Une session vit 30 jours au plus après son dernier renouvellement. */
    await env.DB.prepare('DELETE FROM session_tiers WHERE updated_ts < ?').bind(now - 90 * 86400 * 1000).run();
  } catch (_) { /* ménage seulement */ }
  return true;
}

/* Face ID garde ou baisse le palier de cette session, jamais il ne le relève : sa
 * marque vaut pour tout le compte et n'est liée à aucun appareil, donc qui en
 * copie une ne doit rien gagner. Remonter (réception → patron) demande un code. */
export async function lowerSessionTier(request, env, access) {
  const tier = tierForAccess(access);
  if (!tier) return false;
  const st = await sessionTier(request, env);
  if (st.unavailable || !st.tier || tierRank(tier) >= tierRank(st.tier)) return false;
  return recordSessionTier(request, env, tier, '');
}

/* ── LES ROUTES DU PATRON ─────────────────────────────────────────────────────
 * Palier minimal par route, pour une requête portée par la session du compte.
 * Calqué sur ce que chaque vue montre (dashboard-shell.css, reception-view.js) :
 *   manager  · le chiffre d'affaires, l'IA, les canaux, l'appairage retiré,
 *              les rapports d'économat, le briefing du matin ;
 *   owner    · les marges, la paie en montants, le mois comptable, les clés
 *              (connecteur, canal, comptable), l'annuaire, l'onboarding, la
 *              suppression du compte, Shopify.
 * Ce qui n'est pas listé garde ses règles d'aujourd'hui. */
const MIN_TIER = new Map([
  ['/api/sales-summary', 'manager'],
  ['/api/invoices', 'manager'],
  ['/api/hotel/performance', 'manager'],
  ['/api/hotel/channels', 'manager'],
  ['/api/inventory/hotel-reports', 'manager'],
  ['/api/pair/revoke', 'manager'],
  ['/api/pair/create', 'manager'],   // une caisse appairée lit les documents de gestion
  ['/api/push/morning', 'manager'],
  ['/api/foodcost', 'owner'],
  ['/api/pay-statements', 'owner'],
  ['/api/month-report', 'owner'],
  ['/api/comptable/access', 'owner'],
  ['/api/agent/keys', 'owner'],
  ['/api/channel/keys', 'owner'],
  ['/api/directory/listing', 'owner'],
  ['/api/account/deletion-request', 'owner'],
  ['/api/account/onboarding-draft', 'owner'],
  ['/api/shopify/connect', 'owner'],
  ['/api/shopify/connect-direct', 'owner'],
]);

/* Le chemin est ramené à une seule forme avant la lecture de la carte : une barre
 * finale, une barre doublée, un caractère encodé ou des majuscules ne doivent pas
 * faire passer une route du patron à côté de son palier. */
export function routeMinTier(rawPath) {
  let path = String(rawPath || '');
  try { path = new URL(decodeURIComponent(path).replace(/\/{2,}/g, '/'), 'https://kiwi.invalid').pathname; } catch (_) {}
  path = path.toLowerCase().replace(/\/+$/, '');
  if (MIN_TIER.has(path)) return MIN_TIER.get(path);
  /* L'IA coûte et lit les livres : gérant au moins. */
  if (path === '/api/ai' || path.indexOf('/api/ai/') === 0) return 'manager';
  return '';
}

/* Appelée par le middleware pour une requête /api que la session du compte vient
 * de faire passer. null = continuer ; sinon la réponse de refus. */
export async function tierBlock(request, env, path) {
  const need = routeMinTier(path);
  if (!need) return null;
  const st = await sessionTier(request, env);
  if (st.unavailable) return json({ error: 'tier-unavailable' }, 503);
  if (!st.tier || tierRank(st.tier) >= tierRank(need)) return null;
  return json({ error: 'tier', need, tier: st.tier }, 403);
}
