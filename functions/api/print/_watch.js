/* ═══════════════════════════════════════════════════════════════════════════
 * Le relais d'impression prévient l'équipe Kiwi AVANT que le commerçant appelle.
 * ---------------------------------------------------------------------------
 * Pasta Corner, 26 nov. 2026 : l'imprimante a cessé de lire ses données à
 * 14 h 39, le pont Android 1.0.5 est resté bloqué douze minutes, tickets et
 * tiroir compris. Le serveur le voyait (tickets réclamés jamais acquittés,
 * ticket réclamé 131 s après son dépôt), mais personne n'était prévenu : on l'a
 * appris par le commerçant.
 *
 * Trois signaux, tous lus là où le serveur passe déjà (aucune tâche planifiée) :
 *   stuck    · un ticket réclamé n'a pas été acquitté dans le bail de 30 s
 *              (le tour du pont le marque « uncertain ») ;
 *   slow     · un ticket réclamé plus de 15 s après son dépôt (le pont était
 *              occupé ou bloqué ailleurs) ;
 *   offline  · une caisse dépose et aucun pont n'est en ligne (relay-offline).
 *
 * Chacun ouvre (ou réveille) UNE tâche opérateur par commerce et par journée de
 * service (coupure à 5 h, comme la caisse) : operator_tasks, signal_key
 * « print:AAAA-MM-JJ ». La console la montre dans sa file. Le courriel
 * d'alerte (SUPPORT_ALERT_EMAIL via MAIL_WEBHOOK, le canal du support) part
 * seulement quand la tâche naît ou se rouvre, jamais à chaque ticket.
 * Rien ici ne doit ralentir ni casser le relais : tout est rattrapé, et
 * l'appelant le lance hors de la réponse (waitUntil).
 * ═══════════════════════════════════════════════════════════════════════════ */

import { sendMail } from '../../auth/_lib.js';
import { alertRecipients } from '../_support-triage.js';

export const SLOW_CLAIM_MS = 15000;
/* Une tâche déjà touchée il y a moins de 5 min n'est pas réécrite : un pont
   bloqué produit un signal par tour, la file n'a besoin que du premier. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;
const DAY_MS = 86400000, CUT_MS = 5 * 3600000;
const ACTOR = 'system:print-watch';

const COPY = {
  stuck: {
    title: 'Impression bloquée',
    priority: 1,
    what: (d) => `${d.count} ticket(s) pris par le pont sans confirmation d'impression en 30 s.`,
  },
  slow: {
    title: 'Impression lente',
    priority: 2,
    what: (d) => `Ticket récupéré par le pont ${Math.round(d.waitMs / 1000)} s après son envoi (attendu : moins de 5 s).`,
  },
  offline: {
    title: 'Pont d’impression hors ligne',
    priority: 1,
    what: () => 'Une caisse a envoyé un ticket et aucun pont d’impression ne répond depuis 45 s.',
  },
};
const ADVICE = 'À faire : appeler le commerce. Vérifier que l’imprimante est allumée, a du papier et répond sur le réseau, puis redémarrer l’app Kiwi Print Bridge sur la tablette (version 1.0.7 ou plus).';

export function serviceDay(t) {
  return new Date(Math.floor((t - CUT_MS) / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

export function incidentDetail(kind, d, t) {
  const copy = COPY[kind];
  const lines = [copy.what(d)];
  if (d.bridge) lines.push('Pont : ' + d.bridge + (d.version ? ' · ' + d.version : '') + '.');
  if (d.target) lines.push('Imprimante : ' + d.target + '.');
  lines.push('Constaté à ' + new Date(t).toISOString().slice(11, 16) + ' UTC.');
  lines.push(ADVICE);
  return lines.join('\n');
}

function uuid() {
  try { return crypto.randomUUID(); } catch (_) { return 'pw-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}

/* Ouvre, réveille ou laisse la tâche du jour. Renvoie 'created' | 'reopened' |
   'touched' | 'quiet' | 'failed'. Ne lève jamais. */
export async function raisePrintIncident(env, merchant, kind, d = {}, t = Date.now()) {
  if (!env || !env.DB || !merchant || !COPY[kind]) return 'failed';
  const copy = COPY[kind];
  const signal = 'print:' + serviceDay(t);
  const title = copy.title + ' · ' + merchant;
  const detail = incidentDetail(kind, d, t).slice(0, 2000);
  try {
    const prior = await env.DB.prepare(
      'SELECT id, status, priority, updated_ts FROM operator_tasks WHERE merchant = ? AND signal_key = ?'
    ).bind(merchant, signal).first();
    let outcome;
    if (!prior) {
      const id = 'pw_' + uuid().replace(/-/g, '').slice(0, 24);
      const mutation = uuid();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO operator_tasks (id, merchant, signal_key, title, detail, priority, source_ts, mutation_id, created_ts, updated_ts, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
        ).bind(id, merchant, signal, title, detail, copy.priority, t, mutation, t, t, ACTOR),
        env.DB.prepare(
          `INSERT INTO operator_task_events (id, task_id, merchant, actor_id, actor, action, detail, ts)
           SELECT ?, id, merchant, ?, ?, 'created', ?, ? FROM operator_tasks WHERE id = ? AND mutation_id = ?`
        ).bind(mutation, ACTOR, 'Veille impression', title, t, id, mutation),
      ]);
      outcome = 'created';
    } else if (t - Number(prior.updated_ts || 0) < TOUCH_EVERY_MS) {
      return 'quiet';
    } else {
      const reopen = prior.status === 'resolved' || prior.status === 'snoozed';
      const mutation = uuid();
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE operator_tasks SET title = ?, detail = ?, priority = MIN(priority, ?), source_ts = ?, updated_ts = ?,
             status = CASE WHEN status IN ('resolved', 'snoozed') THEN 'open' ELSE status END,
             snoozed_until = CASE WHEN status IN ('resolved', 'snoozed') THEN NULL ELSE snoozed_until END,
             version = version + 1, mutation_id = ?
           WHERE id = ?`
        ).bind(title, detail, copy.priority, t, t, mutation, prior.id),
        env.DB.prepare(
          `INSERT INTO operator_task_events (id, task_id, merchant, actor_id, actor, action, detail, ts)
           SELECT ?, id, merchant, ?, ?, ?, ?, ? FROM operator_tasks WHERE id = ? AND mutation_id = ?`
        ).bind(mutation, ACTOR, 'Veille impression', reopen ? 'reopened' : 'signal', kind, t, prior.id, mutation),
      ]);
      outcome = reopen ? 'reopened' : 'touched';
    }
    if (outcome === 'created' || outcome === 'reopened') await mailTeam(env, merchant, title, detail);
    return outcome;
  } catch (_) {
    return 'failed';
  }
}

async function mailTeam(env, merchant, title, detail) {
  const to = alertRecipients(env);
  if (!to.length || !env.MAIL_WEBHOOK) return;
  const text = detail + '\n\nÀ suivre dans la console Kiwi, file des tâches (' + merchant + '). Ce courriel part une fois par incident et par journée.';
  try { await Promise.all(to.map((address) => sendMail(env, { to: address, subject: '[IMPRESSION] ' + title, text }, 6000))); } catch (_) {}
}

/* Le pont annonce sa version dans son User-Agent à chaque tour. La version
   enregistrée à l'appairage restait figée : la console montrait 1.0.5 sur une
   tablette mise à jour. */
/* Android : « kiwi-print-bridge-android/1.0.6 ». Node et Rust : « kiwi-printer-bridge/1.4.4 ». */
const UA_ANDROID = /kiwi-print-bridge-android\/(\d{1,3}\.\d{1,3}\.\d{1,3})\b/i;
const UA_DESKTOP = /kiwi-printer-bridge\/(\d{1,3}\.\d{1,3}\.\d{1,3})\b/i;
export function bridgeVersionFrom(request) {
  const ua = String(request && request.headers && request.headers.get('User-Agent') || '');
  let m = UA_ANDROID.exec(ua);
  if (m) return { platform: 'android', version: m[1] };
  m = UA_DESKTOP.exec(ua);
  return m ? { platform: 'desktop', version: m[1] } : null;
}

/* La dernière version de l'app Android, celle de /downloads/kiwi-print-bridge.apk.
   À relever avec versionName dans bridge/android/app/build.gradle (le test
   android-print-bridge-test tient les deux ensemble). */
export const ANDROID_BRIDGE_LATEST = '1.0.7';
export const ANDROID_BRIDGE_URL = 'https://kiwi-os.com/downloads/kiwi-print-bridge.apk';

export function olderThan(version, latest) {
  const a = String(version || '').split('.').map(Number), b = String(latest).split('.').map(Number);
  if (a.length !== 3 || a.some((n) => !Number.isInteger(n))) return false;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] < b[i]; }
  return false;
}

export function updateOffer(seen) {
  if (!seen || seen.platform !== 'android' || !olderThan(seen.version, ANDROID_BRIDGE_LATEST)) return null;
  return { version: ANDROID_BRIDGE_LATEST, url: ANDROID_BRIDGE_URL };
}

/* Mesures que le pont envoie avec son accusé (ouverture et écriture, en ms) :
   gardées sur la ligne du ticket pour distinguer imprimante lente, réseau
   lent et pont lent. Colonnes de la migration 0039 ; sans elles (prod en
   retard sur schema.sql), l'accusé passe quand même. */
export async function saveTiming(env, merchant, bridgeId, id, timing) {
  if (!timing || typeof timing !== 'object') return;
  const ms = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, 600000) : null; };
  const connect = ms(timing.connectMs), write = ms(timing.writeMs);
  if (connect == null && write == null) return;
  try {
    await env.DB.prepare(
      'UPDATE print_jobs SET connect_ms = ?, write_ms = ?, reused = ? WHERE id = ? AND merchant = ? AND bridge_id = ?'
    ).bind(connect, write, timing.reused ? 1 : 0, id, merchant, bridgeId).run();
  } catch (_) {}
}
