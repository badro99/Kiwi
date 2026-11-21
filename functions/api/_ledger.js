/* Grand livre d'argent signé : clients, fournisseurs et livre de caisse dans
 * UNE table (`money_ledger`, schema.sql, migration 0028).
 *
 * ── Convention de signe (à ne pas changer : d'autres modules la lisent) ──────
 * Chaque ligne est vue DU COMMERÇANT.
 *   direction 'in'  = le commerçant a REÇU quelque chose du tiers
 *                     (marchandise livrée, espèces encaissées, avoir reçu) ;
 *   direction 'out' = le commerçant a DONNÉ quelque chose au tiers
 *                     (paiement, marchandise vendue à crédit, retour rendu).
 * Solde d'un tiers = Σ in − Σ out sur les lignes vivantes
 * (archived = 0, deleted_ts IS NULL, internal = 0, status = 'posted').
 * Une ligne `pending` (réception de bon saisie par un employé) attend que le
 * patron l'approuve : elle ne compte nulle part avant (approveLedgerEntry).
 *   solde > 0  → le commerçant DOIT ce montant au tiers ;
 *   solde < 0  → le tiers DOIT ce montant au commerçant.
 * D'où, à l'écran :
 *   fournisseur  : réception d'un bon = in (« nous devons X »), paiement = out ;
 *   client       : vente à crédit = out (solde négatif, « il nous doit X »),
 *                  remboursement du client = in ;
 *   livre de caisse (party_type 'cashbook', party_id 'main' par défaut) :
 *                  in = entrée d'espèces, out = sortie ; solde = net en caisse.
 * Montants : entiers positifs en centimes (comme purchase_orders.total_cents).
 * Dates : `entry_date` = 'YYYY-MM-DD' (journée commerciale du commerçant).
 *
 * ── API stable (appelée par d'autres routes et d'autres agents) ─────────────
 *   postLedgerEntry(env, merchant, entry)
 *     entry = { idemKey*, amountCents*, direction* 'in'|'out',
 *               partyType* 'customer'|'supplier'|'cashbook', partyId (requis
 *               sauf cashbook), date 'YYYY-MM-DD' (défaut : aujourd'hui UTC),
 *               kind (KINDS), method (METHODS), note, attachmentRef,
 *               saleId, purchaseOrderId, expenseId, chequeId,
 *               internal (bool), pending (bool), createdBy }
 *     → { ok:true, duplicate:false|true, entry }  (rejeu de la même clé =
 *       duplicate:true, aucune seconde ligne)
 *     → { ok:false, error } : 'bad-merchant' | 'bad-idem' | 'bad-amount' |
 *       'bad-direction' | 'bad-party' | 'bad-date' | 'idempotency-conflict'
 *       (même clé, autre montant/sens/tiers) | 'no-db' | 'unmigrated'
 *   archiveLedgerEntry(env, merchant, id, { by }) → { ok, entry } | { ok:false, error }
 *   approveLedgerEntry(env, merchant, id, { by }) → { ok, entry } (pending → posted)
 *   pendingEntries(env, merchant, partyType, partyId|null) → [entry] (en attente, non archivées)
 *   archiveLedgerWhere(env, merchant, { expenseId | purchaseOrderId }) → { ok, archived }
 *   partyBalance(env, merchant, partyType, partyId)
 *     → { balanceCents, inCents, outCents, count }
 *   partyBalances(env, merchant, partyType) → Map(partyId → { balanceCents, inCents, outCents, count, lastDate })
 *   partyStatement(env, merchant, partyType, partyId, { from, to, limit })
 *     → { openingCents, closingCents, lines:[{ …, runningCents }], truncated }
 *   ledgerAgeing(env, merchant, partyType, partyId|null, { today })
 *     → { totalCents, buckets:[{ key:'0-30'|'31-60'|'61-90'|'90+', cents }], oldestDays }
 *   ageBuckets(rows, partyType, today) : la même chose, pure (testée seule).
 *   owedView(partyType, balanceCents) → { who:'merchant'|'party'|'none', cents }
 *
 * Idempotence : (merchant, idem_key) est unique. Une requête rejouée (réseau
 * coupé, double clic, commande opérationnelle relancée) retombe sur la ligne
 * déjà écrite. Une clé réutilisée pour AUTRE CHOSE est refusée, jamais
 * silencieusement fusionnée.
 */

export const DIRECTIONS = new Set(['in', 'out']);
export const PARTY_TYPES = new Set(['customer', 'supplier', 'cashbook']);
export const METHODS = ['cash', 'card', 'transfer', 'cheque', 'other'];
export const KINDS = ['purchase', 'payment', 'bill', 'return', 'expense', 'expense-payment', 'sale-credit', 'repayment', 'opening', 'adjustment', 'manual'];
export const LIVE = "archived = 0 AND deleted_ts IS NULL AND internal = 0 AND status = 'posted'";

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IDEM = /^[A-Za-z0-9:._@-]{1,128}$/;
const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_CENTS = 100000000000; // 1 milliard de MAD : au-delà, c'est une erreur de saisie
const DAY = 86400000;

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const link = (v) => { const t = clean(v, 128); return t || null; };

export function todayYmd(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function validYmd(v) {
  if (!YMD.test(String(v || ''))) return false;
  const t = Date.parse(v + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

function randomId() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return 'ml_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* La ligne telle que les écrans et les autres modules la lisent. */
export function entryView(row) {
  if (!row) return null;
  const amount = Number(row.amount_cents) || 0;
  return {
    id: String(row.id), date: String(row.entry_date), amountCents: amount,
    direction: String(row.direction), inCents: row.direction === 'in' ? amount : 0, outCents: row.direction === 'out' ? amount : 0,
    partyType: String(row.party_type), partyId: String(row.party_id || ''),
    kind: String(row.kind || 'manual'), method: String(row.method || 'other'),
    note: String(row.note || ''), attachmentRef: String(row.attachment_ref || ''),
    saleId: row.sale_id || null, purchaseOrderId: row.purchase_order_id || null,
    expenseId: row.expense_id || null, chequeId: row.cheque_id || null,
    archived: Number(row.archived) === 1 || row.deleted_ts != null, internal: Number(row.internal) === 1,
    pending: String(row.status || 'posted') === 'pending',
    createdBy: String(row.created_by || ''), createdAt: Number(row.created_at) || 0,
  };
}

/* Valide et normalise une écriture. Rend { error } ou { row }. Exportée pour
 * que les routes refusent une saisie AVANT de toucher la base. */
export function normalizeEntry(merchant, entry, now = Date.now()) {
  const e = entry || {};
  if (!SLUG.test(String(merchant || ''))) return { error: 'bad-merchant' };
  const idem = String(e.idemKey || '');
  if (!IDEM.test(idem)) return { error: 'bad-idem' };
  const amount = Number(e.amountCents);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_CENTS) return { error: 'bad-amount' };
  const direction = String(e.direction || '');
  if (!DIRECTIONS.has(direction)) return { error: 'bad-direction' };
  const partyType = String(e.partyType || '');
  if (!PARTY_TYPES.has(partyType)) return { error: 'bad-party' };
  const partyId = clean(e.partyId, 80) || (partyType === 'cashbook' ? 'main' : '');
  if (!partyId) return { error: 'bad-party' };
  const date = e.date == null || e.date === '' ? todayYmd(now) : String(e.date);
  if (!validYmd(date)) return { error: 'bad-date' };
  const kind = KINDS.includes(e.kind) ? e.kind : 'manual';
  const method = METHODS.includes(e.method) ? e.method : 'other';
  return { row: {
    id: randomId(), merchant, idem_key: idem, entry_date: date, amount_cents: amount, direction,
    party_type: partyType, party_id: partyId, kind, method,
    note: clean(e.note, 280), attachment_ref: clean(e.attachmentRef, 200),
    sale_id: link(e.saleId), purchase_order_id: link(e.purchaseOrderId),
    expense_id: link(e.expenseId), cheque_id: link(e.chequeId),
    internal: e.internal ? 1 : 0, status: e.pending ? 'pending' : 'posted', created_by: clean(e.createdBy, 100), created_at: now,
  } };
}

export async function postLedgerEntry(env, merchant, entry) {
  if (!env || !env.DB) return { ok: false, error: 'no-db' };
  const read = normalizeEntry(merchant, entry);
  if (read.error) return { ok: false, error: read.error };
  const r = read.row;
  try {
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO money_ledger
        (id, merchant, idem_key, entry_date, amount_cents, direction, party_type, party_id, kind, method,
         note, attachment_ref, sale_id, purchase_order_id, expense_id, cheque_id, archived, internal,
         status, deleted_ts, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, ?, ?)`
    ).bind(r.id, r.merchant, r.idem_key, r.entry_date, r.amount_cents, r.direction, r.party_type, r.party_id,
      r.kind, r.method, r.note, r.attachment_ref, r.sale_id, r.purchase_order_id, r.expense_id, r.cheque_id,
      r.internal, r.status, r.created_by, r.created_at).run();
    if (Number(res && res.meta && res.meta.changes) > 0) return { ok: true, duplicate: false, entry: entryView({ ...r, archived: 0, deleted_ts: null }) };
    const prior = await env.DB.prepare('SELECT * FROM money_ledger WHERE merchant = ? AND idem_key = ?')
      .bind(r.merchant, r.idem_key).first();
    if (!prior) return { ok: false, error: 'unmigrated' };
    const same = Number(prior.amount_cents) === r.amount_cents && prior.direction === r.direction
      && prior.party_type === r.party_type && String(prior.party_id) === r.party_id;
    return same ? { ok: true, duplicate: true, entry: entryView(prior) } : { ok: false, error: 'idempotency-conflict', entry: entryView(prior) };
  } catch (_) {
    return { ok: false, error: 'unmigrated' };
  }
}

/* Une ligne ne se supprime pas : elle s'archive (sortie des soldes, gardée
 * pour l'audit). Archiver deux fois n'est pas une erreur. */
export async function archiveLedgerEntry(env, merchant, id, opts) {
  if (!env || !env.DB) return { ok: false, error: 'no-db' };
  const key = clean(id, 64);
  if (!key) return { ok: false, error: 'bad-id' };
  try {
    const row = await env.DB.prepare('SELECT * FROM money_ledger WHERE merchant = ? AND id = ?').bind(merchant, key).first();
    if (!row) return { ok: false, error: 'not-found' };
    if (Number(row.archived) !== 1) {
      const by = clean(opts && opts.by, 100);
      await env.DB.prepare(
        "UPDATE money_ledger SET archived = 1, note = CASE WHEN ? = '' THEN note ELSE substr(note || ' · annulé par ' || ?, 1, 280) END WHERE merchant = ? AND id = ?"
      ).bind(by, by, merchant, key).run();
      row.archived = 1;
    }
    return { ok: true, entry: entryView(row) };
  } catch (_) { return { ok: false, error: 'unmigrated' }; }
}

/* Le patron approuve une ligne en attente : elle entre dans les soldes. */
export async function approveLedgerEntry(env, merchant, id, opts) {
  if (!env || !env.DB) return { ok: false, error: 'no-db' };
  const key = clean(id, 64);
  try {
    const row = await env.DB.prepare('SELECT * FROM money_ledger WHERE merchant = ? AND id = ?').bind(merchant, key).first();
    if (!row || Number(row.archived) === 1) return { ok: false, error: 'not-found' };
    if (row.status === 'pending') {
      const by = clean(opts && opts.by, 100);
      await env.DB.prepare("UPDATE money_ledger SET status = 'posted', note = CASE WHEN ? = '' THEN note ELSE substr(note || ' · approuvé par ' || ?, 1, 280) END WHERE merchant = ? AND id = ? AND status = 'pending'")
        .bind(by, by, merchant, key).run();
      row.status = 'posted';
    }
    return { ok: true, entry: entryView(row) };
  } catch (_) { return { ok: false, error: 'unmigrated' }; }
}

export async function pendingEntries(env, merchant, partyType, partyId) {
  if (!env || !env.DB || !PARTY_TYPES.has(partyType)) return [];
  const one = partyId != null && partyId !== '';
  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM money_ledger WHERE merchant = ? AND party_type = ?${one ? ' AND party_id = ?' : ''}
          AND status = 'pending' AND archived = 0 AND deleted_ts IS NULL ORDER BY entry_date, created_at LIMIT 500`
    ).bind(...(one ? [merchant, partyType, clean(partyId, 80)] : [merchant, partyType])).all();
    return ((rows && rows.results) || []).map(entryView);
  } catch (_) { return []; }
}

/* Archive toutes les lignes vivantes d'une dépense ou d'un bon : une dépense
 * modifiée ou supprimée retire ce qu'elle avait écrit avant de réécrire. */
export async function archiveLedgerWhere(env, merchant, where) {
  if (!env || !env.DB) return { ok: false, error: 'no-db' };
  const col = where && where.expenseId ? 'expense_id' : where && where.purchaseOrderId ? 'purchase_order_id' : '';
  const val = clean(where && (where.expenseId || where.purchaseOrderId), 128);
  if (!col || !val) return { ok: false, error: 'bad-filter' };
  try {
    const res = await env.DB.prepare(`UPDATE money_ledger SET archived = 1 WHERE merchant = ? AND ${col} = ? AND archived = 0`)
      .bind(merchant, val).run();
    return { ok: true, archived: Number(res && res.meta && res.meta.changes) || 0 };
  } catch (_) { return { ok: false, error: 'unmigrated' }; }
}

export async function partyBalance(env, merchant, partyType, partyId) {
  const out = { balanceCents: 0, inCents: 0, outCents: 0, count: 0 };
  if (!env || !env.DB || !PARTY_TYPES.has(partyType)) return out;
  const pid = clean(partyId, 80) || (partyType === 'cashbook' ? 'main' : '');
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE 0 END), 0) AS in_c,
              COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cents ELSE 0 END), 0) AS out_c,
              COUNT(*) AS n
         FROM money_ledger WHERE merchant = ? AND party_type = ? AND party_id = ? AND ${LIVE}`
    ).bind(merchant, partyType, pid).first();
    out.inCents = Number(row && row.in_c) || 0;
    out.outCents = Number(row && row.out_c) || 0;
    out.count = Number(row && row.n) || 0;
    out.balanceCents = out.inCents - out.outCents;
  } catch (_) { /* table absente : solde nul, l'écran le dit */ }
  return out;
}

export async function partyBalances(env, merchant, partyType) {
  const map = new Map();
  if (!env || !env.DB || !PARTY_TYPES.has(partyType)) return map;
  try {
    const rows = await env.DB.prepare(
      `SELECT party_id,
              COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE 0 END), 0) AS in_c,
              COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_cents ELSE 0 END), 0) AS out_c,
              COUNT(*) AS n, MAX(entry_date) AS last_date
         FROM money_ledger WHERE merchant = ? AND party_type = ? AND ${LIVE}
        GROUP BY party_id`
    ).bind(merchant, partyType).all();
    for (const r of (rows && rows.results) || []) {
      const inC = Number(r.in_c) || 0, outC = Number(r.out_c) || 0;
      map.set(String(r.party_id), { balanceCents: inC - outC, inCents: inC, outCents: outC, count: Number(r.n) || 0, lastDate: String(r.last_date || '') });
    }
  } catch (_) { /* table absente */ }
  return map;
}

/* Le relevé : lignes dans l'ordre (date, saisie), solde courant après chaque
 * ligne. Sans `from`, les `limit` lignes les plus récentes ; le solde
 * d'ouverture est alors exactement ce qui précède la première ligne montrée. */
export async function partyStatement(env, merchant, partyType, partyId, opts) {
  const o = opts || {};
  const out = { openingCents: 0, closingCents: 0, lines: [], truncated: false };
  if (!env || !env.DB || !PARTY_TYPES.has(partyType)) return out;
  const pid = clean(partyId, 80) || (partyType === 'cashbook' ? 'main' : '');
  const limit = Math.max(1, Math.min(2000, Number(o.limit) || 500));
  const where = [`merchant = ?`, `party_type = ?`, `party_id = ?`, LIVE];
  const params = [merchant, partyType, pid];
  if (o.from && validYmd(o.from)) { where.push('entry_date >= ?'); params.push(o.from); }
  if (o.to && validYmd(o.to)) { where.push('entry_date <= ?'); params.push(o.to); }
  try {
    const rows = await env.DB.prepare(
      `SELECT *, rowid AS rid FROM money_ledger WHERE ${where.join(' AND ')}
        ORDER BY entry_date DESC, created_at DESC, rowid DESC LIMIT ?`
    ).bind(...params, limit + 1).all();
    let list = (rows && rows.results) || [];
    out.truncated = list.length > limit;
    if (out.truncated) list = list.slice(0, limit);
    list.reverse();
    if (list.length) {
      const first = list[0];
      const before = await env.DB.prepare(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE -amount_cents END), 0) AS net
           FROM money_ledger WHERE merchant = ? AND party_type = ? AND party_id = ? AND ${LIVE}
            AND (entry_date < ? OR (entry_date = ? AND created_at < ?) OR (entry_date = ? AND created_at = ? AND rowid < ?))`
      ).bind(merchant, partyType, pid, first.entry_date, first.entry_date, first.created_at, first.entry_date, first.created_at, first.rid).first();
      out.openingCents = Number(before && before.net) || 0;
    } else if (o.from && validYmd(o.from)) {
      const before = await env.DB.prepare(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE -amount_cents END), 0) AS net
           FROM money_ledger WHERE merchant = ? AND party_type = ? AND party_id = ? AND ${LIVE} AND entry_date < ?`
      ).bind(merchant, partyType, pid, o.from).first();
      out.openingCents = Number(before && before.net) || 0;
    }
    let running = out.openingCents;
    out.lines = list.map((row) => {
      const v = entryView(row);
      running += v.direction === 'in' ? v.amountCents : -v.amountCents;
      v.runningCents = running;
      return v;
    });
    out.closingCents = running;
  } catch (_) { /* table absente : relevé vide */ }
  return out;
}

/* Ancienneté de ce qui reste dû, premier entré premier soldé : les paiements
 * soldent les dettes les plus anciennes d'abord, et ce qui reste de chaque
 * dette prend l'âge de sa date. Côté fournisseur la dette est `in` (ce que
 * nous avons reçu sans payer) ; côté client elle est `out`. */
export const AGE_KEYS = ['0-30', '31-60', '61-90', '90+'];
export function ageIndex(days) { return days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3; }

export function ageBuckets(rows, partyType, today) {
  const debtDir = partyType === 'customer' ? 'out' : 'in';
  const ref = Date.parse((validYmd(today) ? today : todayYmd()) + 'T00:00:00Z');
  const byParty = new Map();
  for (const r of rows || []) {
    const pid = String(r.party_id != null ? r.party_id : r.partyId || '');
    if (!byParty.has(pid)) byParty.set(pid, []);
    byParty.get(pid).push(r);
  }
  const cents = [0, 0, 0, 0];
  let oldest = 0;
  for (const list of byParty.values()) {
    /* Tri stable : à date et instant égaux, l'ordre de lecture (rowid) tient. */
    list.sort((a, b) => String(a.entry_date || a.date).localeCompare(String(b.entry_date || b.date)) || (Number(a.created_at || a.createdAt) - Number(b.created_at || b.createdAt)));
    const debts = [];
    let credit = 0;
    for (const r of list) {
      const amount = Number(r.amount_cents != null ? r.amount_cents : r.amountCents) || 0;
      const dir = String(r.direction);
      if (dir === debtDir) debts.push({ date: String(r.entry_date || r.date), left: amount });
      else credit += amount;
    }
    for (const d of debts) {
      const used = Math.min(d.left, credit);
      d.left -= used; credit -= used;
      if (d.left <= 0) continue;
      const days = Math.max(0, Math.floor((ref - Date.parse(d.date + 'T00:00:00Z')) / DAY));
      cents[ageIndex(days)] += d.left;
      if (days > oldest) oldest = days;
    }
  }
  return {
    totalCents: cents.reduce((a, b) => a + b, 0),
    buckets: AGE_KEYS.map((key, i) => ({ key, cents: cents[i] })),
    oldestDays: oldest,
  };
}

export async function ledgerAgeing(env, merchant, partyType, partyId, opts) {
  const today = opts && opts.today;
  if (!env || !env.DB || !PARTY_TYPES.has(partyType)) return ageBuckets([], partyType, today);
  try {
    const one = partyId != null && partyId !== '';
    const rows = await env.DB.prepare(
      `SELECT party_id, entry_date, created_at, direction, amount_cents FROM money_ledger
        WHERE merchant = ? AND party_type = ?${one ? ' AND party_id = ?' : ''} AND ${LIVE}
        ORDER BY party_id, entry_date, created_at, rowid LIMIT 20000`
    ).bind(...(one ? [merchant, partyType, clean(partyId, 80)] : [merchant, partyType])).all();
    return ageBuckets((rows && rows.results) || [], partyType, today);
  } catch (_) { return ageBuckets([], partyType, today); }
}

/* Qui doit à qui, pour l'affichage : `merchant` = le commerçant doit, `party`
 * = le tiers doit. Même lecture pour un fournisseur et pour un client. */
export function owedView(partyType, balanceCents) {
  const b = Number(balanceCents) || 0;
  if (!b) return { who: 'none', cents: 0 };
  return b > 0 ? { who: 'merchant', cents: b } : { who: 'party', cents: -b };
}
