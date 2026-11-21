/* Carnet de crédit du patron · le plafond, vu du serveur.
 *
 * La caisse demande l'accord d'un responsable avant une vente à crédit qui
 * dépasse le plafond (functions/api/credit/till.js, 'approve' : l'accord est
 * journalisé 'limit-override'). Une caisse ancienne, hors ligne ou contournée
 * peut quand même envoyer la dette. Ce fichier la regarde là où elle arrive :
 *   · l'ardoise de l'épicerie, à l'écriture du carnet (_credit-book-store.js) ;
 *   · la note « compte client » de la boutique (_retail-balances.js).
 * Une dette qui laisse le client au-delà de son plafond sans accord récent
 * (deux heures) est journalisée 'limit-unapproved' : le carnet du patron la
 * signale. Un accord couvre une seule vente : la première qui le prend le
 * garde ('limit-used', son identifiant dérive de l'accord), le renvoi de la
 * même vente retrouve le sien.
 *
 * Ne bloque jamais une vente : la dette est déjà là, le rôle d'ici est de la
 * montrer. Toute erreur rend null. Hors du temps de réponse : la vente passe
 * son travail par `defer` (ctx.waitUntil) et n'attend rien. Un commerce sans
 * aucun plafond ne coûte aucune requête : l'isolat se souvient une minute
 * qu'il n'en a pas (setLimit le prévient aussitôt dans le même isolat). */

export const APPROVAL_WINDOW_MS = 2 * 3600000;
export const LIMITS_TTL_MS = 60000;
const limitsSeen = new Map();
/* Le commerce a-t-il au moins un plafond ? false/true connus, null à demander. */
function knownLimits(merchant, now) {
  const c = limitsSeen.get(merchant);
  return c && now - c.at < LIMITS_TTL_MS ? c.has : null;
}
export function noteLimits(merchant, has, now = Date.now()) {
  if (limitsSeen.size > 5000) limitsSeen.clear();
  limitsSeen.set(merchant, { at: now, has: !!has });
}
async function merchantHasLimits(db, merchant, now) {
  const known = knownLimits(merchant, now);
  if (known != null) return known;
  const row = await db.prepare('SELECT 1 AS x FROM credit_accounts WHERE merchant = ? AND limit_cents IS NOT NULL LIMIT 1').bind(merchant).first();
  noteLimits(merchant, !!row, now);
  return !!row;
}
/* Lance `job` après la réponse quand la plateforme le permet (rend null tout
 * de suite), sinon l'attend (banc d'essai, dev). Jamais une requête avant. */
export function deferAudit(defer, job) {
  /* Lancé une seule fois : si waitUntil refuse la promesse, on attend celle
     qui tourne déjà, on n'en relance pas une seconde. */
  const running = Promise.resolve().then(job).catch(() => null);
  if (typeof defer === 'function') {
    try { defer(running); return Promise.resolve(null); } catch (_) { /* repli : attendu */ }
  }
  return running;
}
const entryCents = (h) => Math.round((Number(h && h.amt) || 0) * 100);
const owedOf = (c) => (Array.isArray(c && c.hist) ? c.hist : [])
  .reduce((n, h) => n + (h && h.type === 'debt' ? entryCents(h) : -entryCents(h)), 0);

/* Un identifiant d'événement tiré d'une clé entière : SHA-256 en hexadécimal,
 * raccourci APRÈS le hachage. Deux clés qui partagent un début ne se
 * confondent jamais. */
export async function keyHash(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function limitOf(db, merchant, source, key) {
  const row = await db.prepare('SELECT limit_cents FROM credit_accounts WHERE merchant = ? AND source = ? AND customer_key = ?')
    .bind(merchant, source, key).first();
  return row && row.limit_cents != null ? Number(row.limit_cents) : null;
}

/* Une dette `addCents` vient de laisser le client à `owedAfterCents`. `ref`
 * nomme cette dette entière (la même à chaque renvoi) ; seul son hachage est
 * écrit. Rend 'approved', 'unapproved' ou null (sous le plafond, pas de
 * plafond, base indisponible). */
export async function auditCreditDebt(db, merchant, { source, key, addCents, owedAfterCents, ref, limitCents }, now = Date.now()) {
  try {
    const limit = limitCents !== undefined ? limitCents : await limitOf(db, merchant, source, key);
    if (limit == null || !(owedAfterCents > limit) || !(addCents > 0)) return null;
    const tag = await keyHash(source + '|' + key + '|' + String(ref));
    const approvals = (await db.prepare(`SELECT id, amount_cents FROM credit_events WHERE merchant = ? AND source = ? AND customer_key = ?
      AND kind = 'limit-override' AND ts >= ? ORDER BY ts ASC LIMIT 20`).bind(merchant, source, key, now - APPROVAL_WINDOW_MS).all()).results || [];
    for (const a of approvals) {
      if (Number(a.amount_cents) < addCents) continue;
      const useId = 'use-' + await keyHash(String(a.id));
      await db.prepare(`INSERT OR IGNORE INTO credit_events (merchant, id, source, customer_key, kind, amount_cents, actor, detail, ts)
        VALUES (?, ?, ?, ?, 'limit-used', ?, '', ?, ?)`).bind(merchant, useId, source, key, addCents, tag, now).run();
      const used = await db.prepare('SELECT detail FROM credit_events WHERE merchant = ? AND id = ?').bind(merchant, useId).first();
      if (used && used.detail === tag) return 'approved';
    }
    await db.prepare(`INSERT OR IGNORE INTO credit_events (merchant, id, source, customer_key, kind, amount_cents, actor, detail, ts)
      VALUES (?, ?, ?, ?, 'limit-unapproved', ?, '', ?, ?)`).bind(merchant, 'unapproved-' + tag, source, key,
      addCents, JSON.stringify({ afterCents: owedAfterCents, limitCents: limit, ref: tag }), now).run();
    return 'unapproved';
  } catch (_) { return null; }
}

/* L'ardoise vient d'être écrite. `appended` est EXACTEMENT ce que l'union a
 * ajouté (_credit-book-store.js unionBook : { clientId, key, entry }) : rien
 * n'est redéduit ici. Une écriture refusée pour un client (dette sur une
 * avance) a été retirée du carnet écrit `after` : elle ne compte pas. */
export async function auditCarnetWrite(db, merchant, appended, after, now = Date.now()) {
  try {
    const fresh = (Array.isArray(appended) ? appended : []).filter((a) => a && a.entry && a.entry.type === 'debt' && entryCents(a.entry) > 0);
    if (!fresh.length || knownLimits(merchant, now) === false) return [];
    const limits = new Map(((await db.prepare(`SELECT customer_key, limit_cents FROM credit_accounts
      WHERE merchant = ? AND source = 'carnet' AND limit_cents IS NOT NULL`).bind(merchant).all()).results || [])
      .map((r) => [String(r.customer_key), Number(r.limit_cents)]));
    noteLimits(merchant, limits.size > 0, now);
    if (!limits.size) return [];
    const byId = new Map((Array.isArray(after) ? after : []).filter((c) => c && c.id != null).map((c) => [String(c.id), c]));
    const groups = new Map();
    for (const a of fresh) {
      const c = byId.get(a.clientId);
      if (!c || !limits.has(a.clientId) || !(c.hist || []).includes(a.entry)) continue;
      (groups.get(a.clientId) || groups.set(a.clientId, []).get(a.clientId)).push(a);
    }
    const out = [];
    for (const [clientId, list] of groups) {
      const verdict = await auditCreditDebt(db, merchant, { source: 'carnet', key: clientId, limitCents: limits.get(clientId),
        addCents: list.reduce((n, a) => n + entryCents(a.entry), 0), owedAfterCents: owedOf(byId.get(clientId)),
        ref: list.map((a) => a.key).join('\n') }, now);
      if (verdict) out.push({ key: clientId, verdict });
    }
    return out;
  } catch (_) { return []; }
}
/* Une note « compte client » vient de s'ouvrir (rien encaissé, tout est dû). */
export async function auditRetailOnAccount(db, merchant, customerId, balanceId, totalCents, now = Date.now()) {
  try {
    if (!await merchantHasLimits(db, merchant, now)) return null;
    const limit = await limitOf(db, merchant, 'client', customerId);
    if (limit == null) return null;
    const row = await db.prepare(`SELECT COALESCE(SUM(b.total_cents - COALESCE((SELECT SUM(r.amount_cents) FROM retail_balance_receipts r
        LEFT JOIN sales s ON s.merchant = r.merchant AND s.id = r.sale_id
        WHERE r.merchant = b.merchant AND r.balance_id = b.id AND (r.status = 'pending' OR (s.id IS NOT NULL AND s.void_ts IS NULL))), 0)), 0) AS owed
      FROM retail_balances b WHERE b.merchant = ? AND b.customer_id = ?`).bind(merchant, customerId).first();
    return auditCreditDebt(db, merchant, { source: 'client', key: customerId, limitCents: limit, addCents: totalCents,
      owedAfterCents: Math.max(0, Number(row && row.owed) || 0), ref: balanceId }, now);
  } catch (_) { return null; }
}
