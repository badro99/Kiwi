/* ── GARDER LES IMPRIMANTES ÉVEILLÉES, CÔTÉ SERVEUR (Browse, 25 nov. 2026) ──────
 * Les imprimantes de Browse s'endorment entre deux bons : le pont reçoit
 * EHOSTUNREACH, et les bons cuisine ont attendu 2 à 3 min, un a expiré. La caisse
 * les teste déjà (assets/printer-health.js), mais seulement quand son écran est
 * allumé, et les imprimantes s'endorment justement pendant les creux, écran
 * éteint. Le patron ne veut pas économiser les requêtes pour ce commerce.
 *
 * Donc, à chaque tour du pont qui ne ramène aucun ticket, le serveur peut lui
 * confier UN « probe » (ESC @, rien ne sort ; voir jobs.js) vers l'imprimante la
 * moins récemment touchée, si personne ne l'a touchée depuis `every`. Un ticket,
 * un probe de caisse, un réveil : tout compte comme « touchée ». Une imprimante
 * qui ne répond pas retient le pont environ 16 s (deux connexions de 8 s), et les
 * tickets attendent derrière : après un échec on attend 2 min, puis 5, puis 10,
 * sans jamais l'oublier (quelqu'un peut la rallumer). Rien ne change pour un
 * commerce absent de KEEP_AWAKE. */
import { randomHex } from './_relay.js';

export const KEEP_AWAKE = { browse: 60000 };
const BACKOFF_MS = [2 * 60000, 5 * 60000, 10 * 60000];
const HISTORY_MS = 26 * 60 * 60 * 1000;
const PROBE_B64 = 'G0A=';
const PROBE_TTL_MS = 60000;

export function keepsAwake(merchant) { return !!KEEP_AWAKE[merchant]; }

/** @returns {Promise<null|{id:string,kind:string,target:{ip:string,port:number},dataB64:string}>} */
export async function keepAwakeProbe(env, merchant, bridgeId, t) {
  const every = KEEP_AWAKE[merchant];
  if (!every) return null;
  const rs = await env.DB.prepare(
    `SELECT target, status, COALESCE(done_ts, claimed_ts, created_ts) AS at
       FROM print_jobs WHERE merchant = ? AND created_ts > ?
      ORDER BY created_ts DESC LIMIT 400`
  ).bind(merchant, t - HISTORY_MS).all();
  const printers = new Map();
  for (const row of rs.results || []) {
    let target = null;
    try { target = JSON.parse(row.target); } catch (_) { target = null; }
    if (!target || !target.ip || target.osPrinter) continue;
    if (target._pin && target._pin !== bridgeId) continue;
    const port = Number(target.port) || 9100;
    const key = target.ip + ':' + port;
    let p = printers.get(key);
    if (!p) printers.set(key, p = { target: { ip: String(target.ip), port }, at: 0, busy: false, fails: 0, streak: true });
    p.at = Math.max(p.at, Number(row.at) || 0);
    if (row.status === 'queued' || row.status === 'claimed') p.busy = true;
    /* Échecs consécutifs les plus récents : on s'arrête au premier succès. */
    if (p.streak) {
      if (row.status === 'failed' || row.status === 'expired') p.fails++;
      else if (row.status === 'done') p.streak = false;
    }
  }
  let pick = null;
  for (const p of printers.values()) {
    if (p.busy) continue;
    const wait = p.fails ? BACKOFF_MS[Math.min(p.fails, BACKOFF_MS.length) - 1] : every;
    if (t - p.at < wait) continue;
    if (!pick || p.at < pick.at) pick = p;
  }
  if (!pick) return null;
  const id = 'pj_' + randomHex(8);
  await env.DB.prepare(
    `INSERT INTO print_jobs (id, merchant, bridge_id, kind, target, data_b64, status, created_ts, expires_ts, claimed_ts)
     VALUES (?, ?, ?, 'probe', ?, ?, 'claimed', ?, ?, ?)`
  ).bind(id, merchant, bridgeId, JSON.stringify(pick.target), PROBE_B64, t, t + PROBE_TTL_MS, t).run();
  return { id, kind: 'probe', target: pick.target, dataB64: PROBE_B64 };
}
