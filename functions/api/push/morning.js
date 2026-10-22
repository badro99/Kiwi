// Kiwi — « Le point du matin » : une notification par commerçant, à l'ouverture,
// avec le total de la journée commerciale d'hier.
//
// POST /api/push/morning, appelé UNIQUEMENT par le Worker planifié
// workers/morning-push/ (cron 05:30 heure de Casablanca). Protégé par un secret
// partagé (MORNING_PUSH_SECRET, en-tête X-Kiwi-Morning-Secret), comparé en temps
// constant. Sans secret côté serveur → 503, secret faux → 401.
//
// Qui reçoit : les appareils iOS ayant eu la bascule « Le point du matin » du
// tableau de bord (jeton enregistré avec le rôle 'dashboard'). Par défaut, aucun.
//
// Quelle journée : la DERNIÈRE journée commerciale close, bornée comme partout
// ailleurs (functions/api/_business-day.js : coupure à 5 h par défaut, fuseau et
// coupure du magasin quand ils sont connus). Mêmes ventes que le Z : les ventes
// annulées (void_ts) sont hors livres, les remboursements s'y soustraient.
//
// Idempotent, appareil par appareil (table push_morning_sent, créée à la
// première utilisation car la base de production retarde sur schema.sql) :
// - chaque jeton est réservé AVANT l'envoi par une ligne (merchant,
//   « jour#empreinte du jeton ») dont sent_ts est NÉGATIF : un bail. Un bail
//   abandonné (processus mort entre la réservation et l'envoi) expire au bout
//   de LEASE_MS et l'appel suivant reprend l'appareil ;
// - l'envoi réussi, ou refusé pour de bon (jeton mort), rend la ligne
//   définitive (sent_ts positif) : cet appareil ne reçoit plus rien ce jour-là ;
// - une panne passagère supprime la ligne : l'appel suivant réessaie CET
//   appareil seulement, jamais ceux déjà servis ;
// - quand tous les appareils du magasin sont définitifs, la ligne (merchant,
//   day) est posée et les lignes par appareil retirées : un second appel du
//   même jour ne renvoie rien.
//
// Fail-soft : sans APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY rien n'est
// envoyé et rien n'échoue. Les jetons et les montants ne sont jamais journalisés.

import { json } from '../../auth/_lib.js';
import { addBusinessDays, businessBoundary, businessDate, merchantCutoff, merchantZone } from '../_business-day.js';
import { apnsConfigured, sendApnsToTokens } from './_dispatch.js';

const SECRET_HEADER = 'x-kiwi-morning-secret';

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text))));
}

/* Comparaison en temps constant : on compare deux empreintes de même longueur,
   donc ni le contenu ni la longueur du secret ne se devinent au chronomètre. */
export async function secretMatches(expected, given) {
  const a = await digest(expected), b = await digest(given);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function money(cents, lang) {
  const whole = Math.trunc(Math.abs(cents) / 100), frac = Math.abs(cents) % 100;
  const sign = cents < 0 ? '-' : '';
  const dec = lang === 'fr' || lang === 'ar' ? ',' : '.';
  const grouped = lang === 'en' ? String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : group(whole);
  return sign + grouped + (frac ? dec + String(frac).padStart(2, '0') : '');
}

/* Le texte, dans la langue de l'appareil (FR par défaut). Pas de tiret cadratin. */
export function morningMessage(lang, cents, count) {
  const l = lang === 'en' || lang === 'ar' ? lang : 'fr';
  const amount = money(cents, l);
  if (l === 'en') return { title: 'Morning briefing', body: `Yesterday: ${amount} MAD · ${count} ${count === 1 ? 'sale' : 'sales'}` };
  if (l === 'ar') return { title: 'ملخص الصباح', body: `أمس: ${amount} درهم · ${count} عملية بيع` };
  return { title: 'Le point du matin', body: `Hier : ${amount} MAD · ${count} ${count > 1 ? 'ventes' : 'vente'}` };
}

async function ensureSentTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_morning_sent (
    merchant TEXT NOT NULL,
    day      TEXT NOT NULL,
    sent_ts  INTEGER NOT NULL,
    PRIMARY KEY (merchant, day)
  )`).run();
}

/* Empreinte du jeton (SHA-256, 24 caractères hexadécimaux) : le jeton
   lui-même n'est jamais écrit dans la table des marqueurs. */
async function fingerprint(token) {
  const bytes = await digest(token);
  let hex = '';
  for (let i = 0; i < 12; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/* Réserve un appareil pour la journée. Vrai si cet appel doit envoyer : ligne
   neuve, ou bail d'un appel mort expiré et repris (comparaison-échange sur
   l'ancien sent_ts, donc un seul preneur). Une ligne définitive (sent_ts > 0)
   ou un bail encore vivant : faux. */
const LEASE_MS = 5 * 60 * 1000;
async function claimToken(env, merchant, day, key, now) {
  // Une seule instruction : rien n'est réservé si la journée a été close entre
  // temps par un appel concurrent (qui retire ensuite les lignes par appareil).
  const res = await env.DB.prepare(`INSERT OR IGNORE INTO push_morning_sent (merchant, day, sent_ts)
      SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM push_morning_sent WHERE merchant = ? AND day = ?)`)
    .bind(merchant, key, -now, merchant, day).run();
  if (Number(res && res.meta && res.meta.changes || 0) > 0) return true;
  const row = await env.DB.prepare('SELECT sent_ts FROM push_morning_sent WHERE merchant = ? AND day = ?').bind(merchant, key).first();
  const ts = Number(row && row.sent_ts);
  if (!row || !(ts < 0) || now + ts < LEASE_MS) return false;
  const took = await env.DB.prepare('UPDATE push_morning_sent SET sent_ts = ? WHERE merchant = ? AND day = ? AND sent_ts = ?')
    .bind(-now, merchant, key, ts).run();
  return Number(took && took.meta && took.meta.changes || 0) > 0;
}

async function dashboardTokens(env) {
  const base = "FROM push_tokens WHERE role = 'dashboard' AND platform = 'ios'";
  try {
    return (await env.DB.prepare(`SELECT merchant, token, lang ${base}`).all()).results || [];
  } catch (err) {
    // Colonne `lang` pas encore ajoutée : tout le monde reçoit le français.
    if (!/no such column/i.test(String(err && err.message))) throw err;
    return (await env.DB.prepare(`SELECT merchant, token ${base}`).all()).results || [];
  }
}

/* Total net et nombre de ventes de la journée commerciale `day` : les mêmes
   lignes que la réconciliation du Z (functions/api/z-reconciliation.js). */
async function yesterdayTotals(env, merchant, now) {
  const [zone, cutoff] = [await merchantZone(env, merchant), await merchantCutoff(env, merchant)];
  const today = businessDate(now, cutoff, zone);
  const day = addBusinessDays(today, -1);
  const from = businessBoundary(day, cutoff, zone), to = businessBoundary(today, cutoff, zone);
  const row = await env.DB.prepare(`SELECT
      COALESCE(SUM(COALESCE(amount_cents, amount * 100)), 0) AS cents,
      COALESCE(SUM(CASE WHEN COALESCE(amount_cents, amount * 100) >= 0 THEN 1 ELSE 0 END), 0) AS n
    FROM sales WHERE merchant = ? AND ts >= ? AND ts < ? AND void_ts IS NULL`)
    .bind(merchant, from, to).first();
  return { day, cents: Math.round(Number(row && row.cents) || 0), count: Number(row && row.n) || 0 };
}

export async function runMorningPush(env, now = Date.now()) {
  const out = { ok: true, merchants: 0, sent: 0, removed: 0, skipped: {} };
  const skip = (why) => { out.skipped[why] = (out.skipped[why] || 0) + 1; };
  if (!env || !env.DB) return { ok: false, merchants: 0, sent: 0, skipped: { 'db-unavailable': 1 } };
  if (!apnsConfigured(env)) return { ok: true, merchants: 0, sent: 0, skipped: { 'gateway-unconfigured': 1 } };

  let rows;
  try { rows = await dashboardTokens(env); } catch (_) { return { ok: true, merchants: 0, sent: 0, skipped: { 'table-unavailable': 1 } }; }
  const byMerchant = new Map();
  for (const r of rows) {
    if (!byMerchant.has(r.merchant)) byMerchant.set(r.merchant, []);
    byMerchant.get(r.merchant).push({ token: r.token, lang: r.lang || '' });
  }
  if (!byMerchant.size) return { ok: true, merchants: 0, sent: 0, skipped: { 'no-opted-in-devices': 1 } };

  try { await ensureSentTable(env); } catch (_) { return { ok: true, merchants: 0, sent: 0, skipped: { 'marker-unavailable': 1 } }; }

  for (const [merchant, tokens] of byMerchant) {
    out.merchants++;
    let totals;
    try { totals = await yesterdayTotals(env, merchant, now); } catch (_) { skip('sales-unavailable'); continue; }
    if (!totals.count && !totals.cents) { skip('no-sales'); continue; }
    if (totals.cents <= 0) { skip('no-positive-total'); continue; }
    let done;
    try {
      done = await env.DB.prepare('SELECT 1 AS x FROM push_morning_sent WHERE merchant = ? AND day = ?').bind(merchant, totals.day).first();
    } catch (_) { skip('marker-unavailable'); continue; }
    if (done) { skip('already-sent'); continue; }
    const keyed = [];
    for (const t of tokens) keyed.push({ ...t, key: totals.day + '#' + await fingerprint(t.token) });
    const mine = [];
    try {
      for (const t of keyed) if (await claimToken(env, merchant, totals.day, t.key, now)) mine.push(t);
    } catch (_) { skip('marker-unavailable'); continue; }
    let failed = 0;
    if (mine.length) {
      const result = await sendApnsToTokens(env, merchant, mine,
        (t) => ({ ...morningMessage(t.lang, totals.cents, totals.count), data: { kiwi: { kind: 'morning', day: totals.day } } }));
      out.sent += result.sent;
      out.removed += result.removed;
      failed = result.failed;
      for (const t of mine) {
        // Réussi ou mort : définitif. Panne passagère : la ligne est rendue
        // pour qu'un nouvel appel du même jour réessaie cet appareil.
        const final = result.byToken.get(t.token) !== 'failed';
        try {
          if (final) await env.DB.prepare('UPDATE push_morning_sent SET sent_ts = ? WHERE merchant = ? AND day = ?').bind(now, merchant, t.key).run();
          else await env.DB.prepare('DELETE FROM push_morning_sent WHERE merchant = ? AND day = ?').bind(merchant, t.key).run();
        } catch (_) { /* le bail expirera de lui-même */ }
      }
    }
    // Tous les appareils définitifs : la journée est close pour ce magasin.
    let closed = false;
    try {
      const keys = keyed.map((t) => t.key);
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM push_morning_sent WHERE merchant = ? AND sent_ts > 0 AND day IN (${keys.map(() => '?').join(',')})`)
        .bind(merchant, ...keys).first();
      if (Number(row && row.n) === keys.length) {
        await env.DB.prepare('INSERT OR IGNORE INTO push_morning_sent (merchant, day, sent_ts) VALUES (?, ?, ?)').bind(merchant, totals.day, now).run();
        closed = true;
        await env.DB.prepare('DELETE FROM push_morning_sent WHERE merchant = ? AND day >= ? AND day < ?').bind(merchant, totals.day + '#', totals.day + '$').run();
      }
    } catch (_) { /* les lignes par appareil suffisent à ne rien renvoyer */ }
    if (failed) skip('delivery-failed');
    else if (!mine.length) skip(closed ? 'already-sent' : 'in-flight');
  }
  return out;
}

export async function onRequestGet() {
  return json({ error: 'method-not-allowed' }, 405);
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.MORNING_PUSH_SECRET) return json({ error: 'not-configured' }, 503);
  const given = request.headers.get(SECRET_HEADER) || '';
  if (!(await secretMatches(env.MORNING_PUSH_SECRET, given))) return json({ error: 'unauthorized' }, 401);
  const result = await runMorningPush(env, Date.now());
  return json(result, result.ok ? 200 : 503);
}
