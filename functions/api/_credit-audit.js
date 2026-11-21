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
 * montrer. Toute erreur rend null. */

export const APPROVAL_WINDOW_MS = 2 * 3600000;
const entryCents = (h) => Math.round((Number(h && h.amt) || 0) * 100);
const owedOf = (c) => (Array.isArray(c && c.hist) ? c.hist : [])
  .reduce((n, h) => n + (h && h.type === 'debt' ? entryCents(h) : -entryCents(h)), 0);
const entryId = (h) => String(h.id || [h.type, h.amt, h.at].join('|')).slice(0, 80);

async function limitOf(db, merchant, source, key) {
  const row = await db.prepare('SELECT limit_cents FROM credit_accounts WHERE merchant = ? AND source = ? AND customer_key = ?')
    .bind(merchant, source, key).first();
  return row && row.limit_cents != null ? Number(row.limit_cents) : null;
}

/* Une dette `addCents` vient de laisser le client à `owedAfterCents`. `ref`
 * nomme cette dette, la même à chaque renvoi. Rend 'approved', 'unapproved'
 * ou null (sous le plafond, pas de plafond, base indisponible). */
export async function auditCreditDebt(db, merchant, { source, key, addCents, owedAfterCents, ref, limitCents }, now = Date.now()) {
  try {
    const limit = limitCents !== undefined ? limitCents : await limitOf(db, merchant, source, key);
    if (limit == null || !(owedAfterCents > limit) || !(addCents > 0)) return null;
    const tag = String(ref || '').slice(0, 120);
    const approvals = (await db.prepare(`SELECT id, amount_cents FROM credit_events WHERE merchant = ? AND source = ? AND customer_key = ?
      AND kind = 'limit-override' AND ts >= ? ORDER BY ts ASC LIMIT 20`).bind(merchant, source, key, now - APPROVAL_WINDOW_MS).all()).results || [];
    for (const a of approvals) {
      if (Number(a.amount_cents) < addCents) continue;
      const useId = ('use-' + a.id).slice(0, 160);
      await db.prepare(`INSERT OR IGNORE INTO credit_events (merchant, id, source, customer_key, kind, amount_cents, actor, detail, ts)
        VALUES (?, ?, ?, ?, 'limit-used', ?, '', ?, ?)`).bind(merchant, useId, source, key, addCents, tag, now).run();
      const used = await db.prepare('SELECT detail FROM credit_events WHERE merchant = ? AND id = ?').bind(merchant, useId).first();
      if (used && used.detail === tag) return 'approved';
    }
    await db.prepare(`INSERT OR IGNORE INTO credit_events (merchant, id, source, customer_key, kind, amount_cents, actor, detail, ts)
      VALUES (?, ?, ?, ?, 'limit-unapproved', ?, '', ?, ?)`).bind(merchant, ('unapproved-' + source + '-' + tag).slice(0, 160), source, key,
      addCents, JSON.stringify({ afterCents: owedAfterCents, limitCents: limit, ref: tag }).slice(0, 300), now).run();
    return 'unapproved';
  } catch (_) { return null; }
}

/* L'ardoise vient d'être écrite : chaque client qui y gagne une dette et qui a
 * un plafond est regardé. `before` et `after` sont les carnets avant et après. */
export async function auditCarnetWrite(db, merchant, before, after, now = Date.now()) {
  try {
    const limits = new Map(((await db.prepare(`SELECT customer_key, limit_cents FROM credit_accounts
      WHERE merchant = ? AND source = 'carnet' AND limit_cents IS NOT NULL`).bind(merchant).all()).results || [])
      .map((r) => [String(r.customer_key), Number(r.limit_cents)]));
    if (!limits.size) return [];
    const old = new Map((Array.isArray(before) ? before : []).filter((c) => c && c.id != null)
      .map((c) => [String(c.id), new Set((c.hist || []).map(entryId))]));
    const out = [];
    for (const c of Array.isArray(after) ? after : []) {
      if (!c || c.id == null || !limits.has(String(c.id))) continue;
      const seen = old.get(String(c.id)) || new Set();
      const fresh = (c.hist || []).filter((h) => h && h.type === 'debt' && entryCents(h) > 0 && !seen.has(entryId(h)));
      if (!fresh.length) continue;
      const verdict = await auditCreditDebt(db, merchant, { source: 'carnet', key: String(c.id), limitCents: limits.get(String(c.id)),
        addCents: fresh.reduce((n, h) => n + entryCents(h), 0), owedAfterCents: owedOf(c), ref: String(c.id) + ':' + entryId(fresh[fresh.length - 1]) }, now);
      if (verdict) out.push({ key: String(c.id), verdict });
    }
    return out;
  } catch (_) { return []; }
}

/* Une note « compte client » vient de s'ouvrir (rien encaissé, tout est dû). */
export async function auditRetailOnAccount(db, merchant, customerId, balanceId, totalCents, now = Date.now()) {
  try {
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
