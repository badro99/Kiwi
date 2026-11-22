/* Portefeuille de chèques et d'effets (lettres de change normalisées, LCN).
 * Tables : cheques, cheque_links, cheque_history (schema.sql, migration 0032).
 * Routes : functions/api/cheques/*. Écran : assets/pages-pro/cheques.js.
 * Caisse : assets/pos-boutique/cheque-sheet.js.
 *
 * ── Deux sens ────────────────────────────────────────────────────────────────
 *   received : un client (ou un fournisseur qui rembourse) remet un chèque ou
 *              une LCN au commerçant ;
 *   issued   : le commerçant remet un chèque ou une LCN à un fournisseur.
 *
 * ── Passages permis (TRANSITIONS, la seule source de vérité) ───────────────
 *   reçu      received ─► deposited ─► collected (lecture seule ensuite)
 *                │            │ └──► rejected ─► deposited (représenté)
 *                │            └──► received (remise annulée : le chèque est
 *                │                 revenu de la banque sans être traité)
 *                │                        rejected ─► in_litigation ─► deposited | replaced
 *                │                        rejected ─► replaced
 *                ├──► replaced  (le client a payé autrement avant la remise)
 *                └──► cancelled (seulement avant toute remise : saisie fausse,
 *                                chèque rendu)
 *   émis      issued ─► debited (lecture seule ensuite)
 *               ├──► rejected ─► issued (représenté) | replaced
 *               └──► cancelled (repris avant d'être présenté)
 * Tout autre passage est un 409 qui rend les passages permis depuis le statut
 * réel (`allowed`). collected, debited, replaced et cancelled sont finaux.
 *
 * ── L'argent (convention de functions/api/_ledger.js : in = le commerçant
 *    reçoit, out = il donne ; solde < 0 = le tiers doit au commerçant) ────────
 * Le papier n'est pas l'argent. Un chèque REÇU paie quelque chose que Kiwi a
 * déjà enregistré ailleurs : une vente de caisse (comptée au chiffre
 * d'affaires du jour, moyen « chèque »), un remboursement du carnet. Le
 * recevoir, le remettre à la banque ou le voir encaissé ne change donc RIEN :
 * l'encaissement normal n'écrit aucune ligne, sinon la vente compterait deux
 * fois. L'argent ne bouge vraiment qu'au rejet (debt_open = 1 au premier
 * rejet ; un second rejet du même chèque n'écrit rien).
 * Chèque d'un CLIENT (tiers client, fiche ou simple nom, ou sans tiers) : la
 * dette va au compte de la cliente, dans la note ouverte que lisent le carnet
 * de crédit, la fiche cliente et la caisse, et le flux des ventes reste juste
 * (ligne « Chèque impayé » négative, puis retour du reste) :
 * functions/api/_cheque-debt.js porte ces règles, aucune ligne client n'est
 * écrite au grand livre money_ledger.
 * Chèque reçu d'un FOURNISSEUR (il nous rembourse ; patron seulement) : son
 * grand livre, comme avant :
 *   · rejet (premier) ............ out = montant, kind 'cheque-rejected' ;
 *   · encaissé après un rejet .... in = montant, kind 'repayment', moyen chèque ;
 *   · réglé autrement après rejet  in = montant, kind 'repayment', moyen choisi.
 * Réglé autrement avant remise, contentieux, représentation, annulation : rien.
 * Un chèque ÉMIS est, lui, le paiement du fournisseur : sa création écrit
 *   · out = montant, kind 'payment', moyen chèque (idem 'chqi:<clé>') ;
 *   · rejet (premier) ............ in : nous devons de nouveau, debt_open = 1 ;
 *   · débité après un rejet ...... out, kind 'payment' (la dette se referme) ;
 *   · réglé autrement après rejet  out, kind 'payment', moyen choisi ;
 *   · annulé sans rejet .......... la ligne de paiement de la création est
 *                                  archivée (le paiement n'a pas eu lieu) ;
 *     annulé après un rejet ...... rien : la dette rouverte reste due.
 * Le tiers client d'un chèque est la fiche cliente (son id, comme la caisse
 * et le carnet) ; un nom sans fiche devient « n:<nom normalisé> » et sa dette
 * n'entre au carnet qu'une fois une fiche donnée au chèque.
 *
 * ── Idempotence et concurrence ───────────────────────────────────────────────
 * Création : (merchant, idem_key) unique ; un rejeu rend le même chèque
 * (duplicate: true), une clé réutilisée pour un autre montant est refusée.
 * Passage : la clé du geste (requestId) est unique dans cheque_history. Un
 * passage est UN lot D1 (transaction) dont chaque instruction dépend de la
 * précédente : la ligne d'historique ne s'écrit que si le chèque est encore
 * dans l'état lu (statut ET version) ; la mise à jour et la ligne du grand
 * livre ne s'écrivent que si CETTE ligne d'historique existe. Deux appareils
 * qui bougent le même chèque au même instant : un seul gagne, l'autre reçoit
 * 409 'stale' avec le statut réel. Un double appui (même requestId) : un seul
 * passage, une seule ligne d'argent ; le second reçoit duplicate: true.
 *
 * ── Dates ────────────────────────────────────────────────────────────────────
 * Une échéance est un jour civil du lieu du commerce (une banque marocaine
 * compte en jours civils) : « aujourd'hui » pour l'ancienneté est le jour civil
 * dans le fuseau du commerce (merchantZone, loi des fuseaux : le Maroc est en
 * UTC+0 depuis le 20 septembre 2026), à minuit, comme Inyad. La date de
 * réception par défaut est la journée commerciale de la caisse (coupure de
 * 5 h, merchantCutoff) : un chèque pris à 1 h du matin appartient à la même
 * journée que sa vente. Chèque sans échéance (à vue) : échéance = réception.
 */
import { normalizeEntry, validYmd } from './_ledger.js';
import { businessDate, merchantZone, merchantCutoff } from './_business-day.js';
import { getSupplier } from './_suppliers.js';
import { annotateCheques, clientOf, customerDebtStatements, debtNote, openNoteStatement, owedFor, planCustomerDebt, salesOf } from './_cheque-debt.js';

export const KINDS = ['cheque', 'lcn'];
export const DIRECTIONS = ['received', 'issued'];
export const TRANSITIONS = Object.freeze({
  received: Object.freeze({
    received: ['deposited', 'replaced', 'cancelled'],
    deposited: ['collected', 'rejected', 'received'],
    /* Annuler un chèque rejeté : seulement quand il ne porte plus de dette (ses tickets ont été annulés). */
    rejected: ['deposited', 'in_litigation', 'replaced', 'cancelled'],
    in_litigation: ['deposited', 'replaced', 'cancelled'],
    collected: [], replaced: [], cancelled: [],
  }),
  issued: Object.freeze({
    issued: ['debited', 'rejected', 'cancelled'],
    rejected: ['issued', 'replaced'],
    debited: [], replaced: [], cancelled: [],
  }),
});
/* Encore « en cours » : l'argent n'a pas fini de bouger. */
export const OPEN_STATUSES = ['received', 'deposited', 'rejected', 'in_litigation', 'issued'];
export const FINAL_STATUSES = ['collected', 'debited', 'replaced', 'cancelled'];
const REPLACE_METHODS = ['cash', 'transfer', 'card', 'other', 'till'];

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const KEY = /^[A-Za-z0-9:._@-]{8,100}$/;
const LINK_ID = /^[A-Za-z0-9:._@#-]{1,128}$/;
const CHEQUE_ID = /^chq_[0-9a-f]{18}$/;
const MAX_CENTS = 100000000000;
const DAY = 86400000;
const MAX_LINKS = 30;
const MAX_SLIP = 60;

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const rid = (prefix) => {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return prefix + '_' + Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
};

export function allowedNext(direction, status) {
  const t = TRANSITIONS[direction];
  return (t && t[status]) ? t[status].slice() : [];
}
export function canMove(direction, from, to) { return allowedNext(direction, from).includes(to); }

/* Le tiers qui porte la dette d'un rejet. */
export function normName(v) { return clean(v, 80).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60); }
export function debtParty(c) {
  if (c.party_type && c.party_id) return { type: c.party_type, id: c.party_id };
  return { type: c.direction === 'issued' ? 'supplier' : 'customer', id: 'cheque:' + c.id };
}

/* Montant saisi en dirhams (« 1 250,50 ») ou en centimes. */
export function centsOf(body) {
  if (body && body.amountCents != null) {
    const n = Number(body.amountCents);
    return Number.isSafeInteger(n) ? n : NaN;
  }
  const raw = String(body && body.amount != null ? body.amount : '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return NaN;
  return Math.round(Number(raw) * 100);
}

/* Aujourd'hui : jour civil (échéances) et journée commerciale (réception). */
export async function merchantDays(env, merchant, now = Date.now()) {
  const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);
  return { civil: businessDate(now, 0, zone), business: businessDate(now, cutoff, zone), zone };
}

export function chequeView(row) {
  if (!row) return null;
  return {
    id: String(row.id), kind: String(row.kind), direction: String(row.direction), amountCents: Number(row.amount_cents) || 0,
    number: String(row.number || ''), bank: String(row.bank || ''), drawerName: String(row.drawer_name || ''), drawerBank: String(row.drawer_bank || ''),
    receptionDate: String(row.reception_date || ''), dueDate: row.due_date ? String(row.due_date) : '',
    depositDate: row.deposit_date ? String(row.deposit_date) : '', settleDate: row.settle_date ? String(row.settle_date) : '',
    depositSlip: String(row.deposit_slip || ''), status: String(row.status),
    partyType: String(row.party_type || ''), partyId: String(row.party_id || ''), partyName: String(row.party_name || ''),
    photoRef: String(row.photo_ref || ''), note: String(row.note || ''), source: String(row.source || ''),
    debtOpen: Number(row.debt_open) === 1, version: Number(row.version) || 1,
    createdBy: String(row.created_by || ''), createdAt: Number(row.created_at) || 0, updatedAt: Number(row.updated_at) || 0,
    allowed: allowedNext(String(row.direction), String(row.status)),
  };
}
export const effectiveDue = (c) => c.due_date || c.dueDate || c.reception_date || c.receptionDate || '';

export async function chequesReady(env) {
  if (!env || !env.DB) return false;
  try { await env.DB.prepare('SELECT 1 FROM cheques LIMIT 1').all(); await env.DB.prepare('SELECT 1 FROM cheque_history LIMIT 1').all(); return true; }
  catch (_) { return false; }
}

export async function getCheque(env, merchant, id) {
  if (!CHEQUE_ID.test(String(id || ''))) return null;
  try { return await env.DB.prepare('SELECT * FROM cheques WHERE merchant = ? AND id = ?').bind(merchant, String(id)).first(); }
  catch (_) { return null; }
}

/* ── Saisie ───────────────────────────────────────────────────────────────── */
function cleanLinks(body) {
  const out = [];
  const add = (type, list) => {
    for (const v of Array.isArray(list) ? list : list ? [list] : []) {
      const id = String(v == null ? '' : v).trim();
      if (LINK_ID.test(id) && !out.some((l) => l.type === type && l.id === id)) out.push({ type, id });
    }
  };
  add('sale', body.saleIds != null ? body.saleIds : body.saleId);
  add('ledger', body.ledgerIds);
  return out.length > MAX_LINKS ? null : out;
}

/* Valide une création. Rend { error } ou { row, links }. `today` = jours du commerce. */
export function normalizeCheque(merchant, body, ctx) {
  const b = body || {};
  if (!SLUG.test(String(merchant || ''))) return { error: 'bad-merchant' };
  const idem = String(b.idemKey || '');
  if (!KEY.test(idem)) return { error: 'bad-idem' };
  const kind = KINDS.includes(b.kind) ? b.kind : b.kind == null || b.kind === '' ? 'cheque' : null;
  if (!kind) return { error: 'bad-kind' };
  const direction = DIRECTIONS.includes(b.direction) ? b.direction : b.direction == null || b.direction === '' ? 'received' : null;
  if (!direction) return { error: 'bad-direction' };
  const cents = centsOf(b);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return { error: 'bad-amount' };
  const reception = b.receptionDate ? String(b.receptionDate) : ctx.today.business;
  if (!validYmd(reception) || reception > ctx.today.civil) return { error: 'bad-date' };
  const due = b.dueDate ? String(b.dueDate) : '';
  if (due && (!validYmd(due) || due < '2000-01-01' || due > '2099-12-31')) return { error: 'bad-due-date' };
  let partyType = b.partyType === 'supplier' ? 'supplier' : b.partyType === 'customer' ? 'customer' : '';
  let partyId = clean(b.partyId, 80);
  const partyName = clean(b.partyName, 120);
  const drawerName = clean(b.drawerName, 120);
  if (direction === 'issued') {
    if (partyType !== 'supplier' || !partyId) return { error: 'supplier-required' };
  } else {
    if (partyType === 'supplier' && !partyId) return { error: 'bad-party' };
    if (!partyType && (partyId || partyName)) partyType = 'customer';
    if (partyType === 'customer' && !partyId && partyName) partyId = 'n:' + normName(partyName);
    if (partyId === 'n:') partyId = '';
    if (partyId && (partyId.startsWith('cheque:') || partyId.startsWith('po:'))) return { error: 'bad-party' };
  }
  const links = cleanLinks(b);
  if (!links) return { error: 'too-many-links' };
  return { row: {
    merchant, id: rid('chq'), idem_key: idem, kind, direction, amount_cents: cents,
    number: clean(b.number, 40), bank: clean(b.bank, 80), drawer_name: drawerName || (direction === 'received' ? partyName : ''),
    drawer_bank: clean(b.drawerBank, 80), reception_date: reception, due_date: due || null,
    status: direction === 'issued' ? 'issued' : 'received',
    party_type: partyType, party_id: partyType ? partyId : '', party_name: partyType ? (partyName || drawerName) : '',
    photo_ref: clean(b.photoRef, 200), note: clean(b.note, 280), source: ctx.source || 'dashboard',
    created_by: clean(ctx.actor, 100),
  }, links };
}

const HIST_COLS = '(merchant, id, cheque_id, request_id, action, from_status, to_status, event_date, reason, detail, ledger_entry_id, actor, at)';
const LEDGER_COLS = `(id, merchant, idem_key, entry_date, amount_cents, direction, party_type, party_id, kind, method,
   note, ref, attachment_ref, sale_id, purchase_order_id, expense_id, cheque_id, archived, internal,
   status, deleted_ts, created_by, created_at)`;

/* Une ligne du grand livre écrite seulement si la ligne d'historique `histId`
 * existe (donc si le passage a eu lieu dans ce même lot). */
function ledgerInsertIf(env, merchant, entry, histId, now) {
  const read = normalizeEntry(merchant, entry, now);
  if (read.error) return { error: read.error };
  const r = read.row;
  const statement = env.DB.prepare(`INSERT OR IGNORE INTO money_ledger ${LEDGER_COLS}
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'posted', NULL, ?, ?
     WHERE EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)`)
    .bind(r.id, r.merchant, r.idem_key, r.entry_date, r.amount_cents, r.direction, r.party_type, r.party_id, r.kind, r.method,
      r.note, r.ref, r.attachment_ref, r.sale_id, r.purchase_order_id, r.expense_id, r.cheque_id, r.created_by, r.created_at, merchant, histId);
  return { statement, row: r };
}

/* Création. ctx = { actor, source, today, poId } → { ok, duplicate, cheque } | { ok:false, error, status } */
export async function createCheque(env, merchant, body, ctx) {
  const read = normalizeCheque(merchant, body, ctx);
  if (read.error) return { ok: false, error: read.error, status: 400 };
  const r = read.row, now = Date.now();
  const histId = rid('chh');
  /* Le chèque émis EST le paiement du fournisseur : sa ligne est préparée
     d'abord (son id va dans l'historique), écrite après l'historique. */
  let led = null;
  if (r.direction === 'issued') {
    led = ledgerInsertIf(env, merchant, {
      idemKey: 'chqi:' + r.idem_key, amountCents: r.amount_cents, direction: 'out', partyType: 'supplier', partyId: r.party_id,
      date: r.reception_date, kind: 'payment', method: 'cheque', ref: r.number, chequeId: r.id, purchaseOrderId: ctx.poId || null,
      note: r.note, createdBy: r.created_by,
    }, histId, now);
    if (led.error) return { ok: false, error: led.error, status: 400 };
  }
  const cond = 'WHERE EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)';
  const linkStmt = (type, id, cents) => env.DB.prepare(`INSERT OR IGNORE INTO cheque_links (merchant, cheque_id, link_type, link_id, amount_cents, created_at)
      SELECT ?, ?, ?, ?, ?, ? ${cond}`).bind(merchant, r.id, type, id, cents == null ? null : cents, now, merchant, histId);
  const stmts = [
    env.DB.prepare(`INSERT OR IGNORE INTO cheques (merchant, id, idem_key, kind, direction, amount_cents, number, bank, drawer_name, drawer_bank,
        reception_date, due_date, deposit_date, settle_date, deposit_slip, status, party_type, party_id, party_name, photo_ref, note, source,
        debt_open, version, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '', ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)`)
      .bind(r.merchant, r.id, r.idem_key, r.kind, r.direction, r.amount_cents, r.number, r.bank, r.drawer_name, r.drawer_bank,
        r.reception_date, r.due_date, r.status, r.party_type, r.party_id, r.party_name, r.photo_ref, r.note, r.source, r.created_by, now, now),
    /* L'historique, seulement si CE chèque vient d'être écrit (un rejeu de la clé n'écrit rien). */
    env.DB.prepare(`INSERT OR IGNORE INTO cheque_history ${HIST_COLS}
      SELECT ?, ?, id, ?, 'create', '', status, reception_date, '', '', ?, ?, ? FROM cheques WHERE merchant = ? AND id = ?`)
      .bind(merchant, histId, 'create:' + r.idem_key, led ? led.row.id : null, r.created_by, now, merchant, r.id),
    ...read.links.map((l) => linkStmt(l.type, l.id, null)),
  ];
  if (led) {
    stmts.push(led.statement, linkStmt('ledger', led.row.id, r.amount_cents));
    if (ctx.poId) stmts.push(linkStmt('purchase_order', String(ctx.poId), null));
  }
  try { await env.DB.batch(stmts); }
  catch (_) { return { ok: false, error: 'unmigrated', status: 503 }; }
  const row = await env.DB.prepare('SELECT * FROM cheques WHERE merchant = ? AND idem_key = ?').bind(merchant, r.idem_key).first();
  if (!row) return { ok: false, error: 'unmigrated', status: 503 };
  if (row.id === r.id) return { ok: true, duplicate: false, cheque: chequeView(row) };
  const same = Number(row.amount_cents) === r.amount_cents && row.direction === r.direction && row.kind === r.kind;
  return same ? { ok: true, duplicate: true, cheque: chequeView(row) } : { ok: false, error: 'idempotency-conflict', status: 409, cheque: chequeView(row) };
}

/* ── Passages ─────────────────────────────────────────────────────────────── */
/* Ce que le passage écrit au grand livre et le nouvel état de la dette. */
export function moneyEffect(c, to, opts) {
  const o = opts || {};
  const open = Number(c.debt_open) === 1;
  const received = c.direction === 'received';
  const party = debtParty(c);
  const base = { amountCents: Number(c.amount_cents), partyType: party.type, partyId: party.id, chequeId: c.id, ref: c.number || '' };
  if (received && c.party_type !== 'supplier') {
    if (to === 'rejected') return { debtOpen: 1, entry: null, customer: open ? null : 'bounce' };
    if (to === 'collected' || to === 'replaced') return { debtOpen: 0, entry: null, customer: open ? 'close' : null, method: to === 'collected' ? 'cheque' : (REPLACE_METHODS.includes(o.method) ? o.method : 'other') };
    return { debtOpen: open ? 1 : 0, entry: null };
  }
  if (to === 'rejected') {
    if (open) return { debtOpen: 1, entry: null };
    return { debtOpen: 1, entry: { ...base, direction: received ? 'out' : 'in', kind: 'cheque-rejected', method: 'cheque' } };
  }
  if ((to === 'collected' && received) || (to === 'debited' && !received)) {
    if (!open) return { debtOpen: 0, entry: null };
    return { debtOpen: 0, entry: { ...base, direction: received ? 'in' : 'out', kind: received ? 'repayment' : 'payment', method: 'cheque' } };
  }
  if (to === 'replaced') {
    if (!open) return { debtOpen: 0, entry: null };
    const method = REPLACE_METHODS.includes(o.method) && o.method !== 'till' ? o.method : 'other';
    return { debtOpen: 0, entry: { ...base, direction: received ? 'in' : 'out', kind: received ? 'repayment' : 'payment', method } };
  }
  if (to === 'cancelled' && !received && !open) return { debtOpen: 0, entry: null, archiveIssue: true };
  return { debtOpen: open ? 1 : 0, entry: null };
}

/* Statements d'un passage, tous conditionnés à la ligne d'historique `histId`. */
function moveStatements(env, merchant, c, to, p) {
  const { histId, requestId, date, reason, actor, now, slip, method, debt } = p;
  const eff = moneyEffect(c, to, { method });
  const stmts = [env.DB.prepare(`INSERT OR IGNORE INTO cheque_history ${HIST_COLS}
      SELECT ?, ?, id, ?, 'move', status, ?, ?, ?, ?, NULL, ?, ? FROM cheques
       WHERE merchant = ? AND id = ? AND version = ? AND status = ?`)
    .bind(merchant, histId, requestId, to, date, reason, slip ? 'slip:' + slip : (to === 'replaced' && (eff.entry || eff.customer) ? 'method:' + (eff.entry ? eff.entry.method : eff.method) : ''), actor, now,
      merchant, c.id, Number(c.version), c.status)];
  const sets = ['status = ?', 'version = version + 1', 'debt_open = ?', 'updated_at = ?'];
  const vals = [to, debt && debt.debtOpen === 0 ? 0 : eff.debtOpen, now];
  if (to === 'deposited') { sets.push('deposit_date = ?', 'deposit_slip = ?', 'settle_date = NULL'); vals.push(date, slip || ''); }
  if (to === 'received') { sets.push('deposit_date = NULL', "deposit_slip = ''"); }
  if (['collected', 'debited', 'replaced', 'rejected', 'in_litigation', 'cancelled'].includes(to)) { sets.push('settle_date = ?'); vals.push(date); }
  if (to === 'issued') { sets.push('settle_date = NULL'); }
  stmts.push(env.DB.prepare(`UPDATE cheques SET ${sets.join(', ')}
     WHERE merchant = ? AND id = ? AND version = ? AND EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)`)
    .bind(...vals, merchant, c.id, Number(c.version), merchant, histId));
  let ledgerId = null;
  if (eff.entry) {
    const led = ledgerInsertIf(env, merchant, { ...eff.entry, idemKey: 'chq:' + requestId, date, note: reason, createdBy: actor }, histId, now);
    if (led.error) return { error: led.error };
    ledgerId = led.row.id;
    stmts.push(led.statement);
    stmts.push(env.DB.prepare('UPDATE cheque_history SET ledger_entry_id = ? WHERE merchant = ? AND id = ?').bind(ledgerId, merchant, histId));
  }
  if (debt) stmts.push(...customerDebtStatements(env, merchant, c, debt, { histId, now, requestId }));
  if (eff.archiveIssue) {
    stmts.push(env.DB.prepare(`UPDATE money_ledger SET archived = 1, voided_by = ?
       WHERE merchant = ? AND idem_key = ? AND archived = 0 AND EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)`)
      .bind(actor, merchant, 'chqi:' + c.idem_key, merchant, histId));
  }
  return { stmts, ledgerId, effect: eff };
}

function moveInput(c, to, body, today) {
  const date = body.date ? String(body.date) : today.civil;
  if (!validYmd(date) || date > today.civil) return { error: 'bad-date' };
  if (date < c.reception_date) return { error: 'date-before-reception' };
  if ((to === 'collected' || to === 'rejected') && c.deposit_date && date < c.deposit_date) return { error: 'date-before-deposit' };
  if (to === 'cancelled' && c.direction === 'received' && Number(c.debt_open) === 1) return { error: 'debt-open' };
  return { date };
}

/* Un passage. → { ok, duplicate, cheque, history } | { ok:false, error, status, allowed?, cheque? } */
export async function moveCheque(env, merchant, id, body, ctx) {
  const b = body || {};
  const requestId = String(b.requestId || '');
  if (!KEY.test(requestId)) return { ok: false, error: 'bad-request-id', status: 400 };
  const to = String(b.to || '');
  const c = await getCheque(env, merchant, id);
  if (!c) {
    /* Un rejeu d'un geste déjà appliqué sur un chèque d'un autre commerçant n'existe pas : 404. */
    return { ok: false, error: 'not-found', status: 404 };
  }
  if (ctx.only && c.direction !== ctx.only) return { ok: false, error: 'owner-required', status: 403 };
  /* Le même geste rejoué : la réponse d'origine, sans rien réécrire. */
  const prior = await env.DB.prepare('SELECT * FROM cheque_history WHERE merchant = ? AND request_id = ?').bind(merchant, requestId).first();
  if (prior) {
    if (prior.cheque_id === c.id && prior.to_status === to && prior.action === 'move') return { ok: true, duplicate: true, cheque: chequeView(c), history: historyView(prior) };
    return { ok: false, error: 'idempotency-conflict', status: 409 };
  }
  if (!canMove(c.direction, c.status, to)) return { ok: false, error: 'illegal-transition', status: 409, allowed: allowedNext(c.direction, c.status), cheque: chequeView(c) };
  const input = moveInput(c, to, b, ctx.today);
  if (input.error) return { ok: false, error: input.error, status: input.error === 'debt-open' ? 409 : 400, allowed: allowedNext(c.direction, c.status) };
  const p = { histId: rid('chh'), requestId, date: input.date, reason: clean(b.reason, 280), actor: clean(ctx.actor, 100), now: Date.now(), method: String(b.method || '') };
  const eff = moneyEffect(c, to, { method: p.method });
  /* La cliente a commencé à payer à la caisse : présenter ou encaisser le chèque la ferait payer deux fois. */
  if (c.direction === 'received' && Number(c.debt_open) === 1 && (to === 'deposited' || to === 'collected')) {
    const note = await debtNote(env, merchant, c.id);
    if (note && note.paidCents > 0) return { ok: false, error: 'paid-at-till', status: 409, paidCents: note.paidCents, remainingCents: note.remainingCents, allowed: allowedNext(c.direction, c.status) };
  }
  if (eff.customer) {
    p.debt = await planCustomerDebt(env, merchant, c, eff.customer, eff.method, { onAccount: b.onAccount === true });
    if (p.debt && p.debt.error) return { ok: false, error: p.debt.error, status: 409, remainingCents: p.debt.remaining, allowed: allowedNext(c.direction, c.status) };
  }
  const plan = moveStatements(env, merchant, c, to, p);
  if (plan.error) return { ok: false, error: plan.error, status: 400 };
  try { await env.DB.batch(plan.stmts); }
  catch (_) { return { ok: false, error: 'unmigrated', status: 503 }; }
  return settleMove(env, merchant, c, to, requestId, p.histId);
}

async function settleMove(env, merchant, c, to, requestId, histId) {
  const hist = await env.DB.prepare('SELECT * FROM cheque_history WHERE merchant = ? AND request_id = ?').bind(merchant, requestId).first();
  const now = await getCheque(env, merchant, c.id);
  if (hist && hist.id === histId) return { ok: true, duplicate: false, cheque: chequeView(now), history: historyView(hist) };
  if (hist && hist.cheque_id === c.id && hist.to_status === to) return { ok: true, duplicate: true, cheque: chequeView(now), history: historyView(hist) };
  if (hist) return { ok: false, error: 'idempotency-conflict', status: 409 };
  /* Le chèque a bougé entre la lecture et l'écriture (un autre appareil). */
  return { ok: false, error: 'stale', status: 409, allowed: now ? allowedNext(now.direction, now.status) : [], cheque: chequeView(now) };
}

/* Bordereau de remise : plusieurs chèques en portefeuille passent « remis »
 * d'un seul lot, avec un numéro de bordereau. Chaque chèque garde son propre
 * geste (requestId:id), donc un rejeu du bordereau ne remet rien deux fois. */
export function slipNumber(date, requestId) {
  return 'BR-' + String(date).replace(/-/g, '') + '-' + String(requestId).replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
}
export async function depositSlip(env, merchant, body, ctx) {
  const b = body || {};
  const requestId = String(b.requestId || '');
  if (!KEY.test(requestId)) return { ok: false, error: 'bad-request-id', status: 400 };
  const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map((x) => String(x || '')))] : [];
  if (!ids.length || ids.length > MAX_SLIP || !ids.every((x) => CHEQUE_ID.test(x))) return { ok: false, error: 'bad-ids', status: 400 };
  const date = b.date ? String(b.date) : ctx.today.civil;
  if (!validYmd(date) || date > ctx.today.civil) return { ok: false, error: 'bad-date', status: 400 };
  const bank = clean(b.bank, 80);
  const slip = slipNumber(date, requestId);
  const actor = clean(ctx.actor, 100), now = Date.now();
  const results = [], stmts = [], plans = [];
  for (const id of ids) {
    const c = await getCheque(env, merchant, id);
    if (!c || c.direction !== 'received') { results.push({ id, ok: false, error: 'not-found' }); continue; }
    const req = requestId + ':' + id;
    const prior = await env.DB.prepare('SELECT * FROM cheque_history WHERE merchant = ? AND request_id = ?').bind(merchant, req).first();
    if (prior) { results.push({ id, ok: true, duplicate: true }); continue; }
    if (!canMove(c.direction, c.status, 'deposited')) { results.push({ id, ok: false, error: 'illegal-transition', status: c.status }); continue; }
    if (date < c.reception_date) { results.push({ id, ok: false, error: 'date-before-reception' }); continue; }
    const histId = rid('chh');
    const plan = moveStatements(env, merchant, c, 'deposited', { histId, requestId: req, date, reason: '', actor, now, slip });
    stmts.push(...plan.stmts);
    if (bank) stmts.push(env.DB.prepare(`UPDATE cheques SET bank = ? WHERE merchant = ? AND id = ? AND EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)`)
      .bind(bank, merchant, id, merchant, histId));
    plans.push({ id, req, histId });
  }
  if (stmts.length) {
    try { await env.DB.batch(stmts); }
    catch (_) { return { ok: false, error: 'unmigrated', status: 503 }; }
  }
  for (const p of plans) {
    const h = await env.DB.prepare('SELECT id FROM cheque_history WHERE merchant = ? AND request_id = ?').bind(merchant, p.req).first();
    results.push(h && h.id === p.histId ? { id: p.id, ok: true } : { id: p.id, ok: false, error: 'stale' });
  }
  const slipRows = await listCheques(env, merchant, { slip });
  return { ok: true, slip, date, bank, results, cheques: slipRows.cheques, totalCents: slipRows.cheques.reduce((s, c) => s + c.amountCents, 0) };
}

/* ── Modification (papier seulement) ─────────────────────────────────────── */
export async function editCheque(env, merchant, id, body, ctx) {
  const b = body || {};
  const requestId = String(b.requestId || '');
  if (!KEY.test(requestId)) return { ok: false, error: 'bad-request-id', status: 400 };
  const c = await getCheque(env, merchant, id);
  if (!c) return { ok: false, error: 'not-found', status: 404 };
  if (ctx.only && c.direction !== ctx.only) return { ok: false, error: 'owner-required', status: 403 };
  const prior = await env.DB.prepare('SELECT * FROM cheque_history WHERE merchant = ? AND request_id = ?').bind(merchant, requestId).first();
  if (prior) return prior.cheque_id === c.id && prior.action === 'edit' ? { ok: true, duplicate: true, cheque: chequeView(c) } : { ok: false, error: 'idempotency-conflict', status: 409 };
  if (FINAL_STATUSES.includes(c.status)) return { ok: false, error: 'read-only', status: 409, allowed: [] };
  const patch = {}, changed = [];
  const text = (key, col, n) => { if (b[key] !== undefined) { const v = clean(b[key], n); if (v !== String(c[col] || '')) { patch[col] = v; changed.push(key); } } };
  text('number', 'number', 40); text('bank', 'bank', 80); text('drawerName', 'drawer_name', 120); text('drawerBank', 'drawer_bank', 80);
  text('note', 'note', 280); text('photoRef', 'photo_ref', 200);
  if (b.dueDate !== undefined) {
    const due = b.dueDate ? String(b.dueDate) : '';
    if (due && (!validYmd(due) || due < '2000-01-01' || due > '2099-12-31')) return { ok: false, error: 'bad-due-date', status: 400 };
    if ((due || null) !== (c.due_date || null)) { patch.due_date = due || null; changed.push('dueDate'); }
  }
  if (b.amountCents !== undefined || b.amount !== undefined) {
    const cents = centsOf(b);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) return { ok: false, error: 'bad-amount', status: 400 };
    if (cents !== Number(c.amount_cents)) {
      /* Le montant ne bouge que sur un chèque reçu jamais rejeté : aucune ligne d'argent ne le porte. */
      if (!(c.direction === 'received' && c.status === 'received' && Number(c.debt_open) === 0)) return { ok: false, error: 'amount-locked', status: 409 };
      /* Un chèque qui paie une vente porte le montant de son règlement : il ne bouge pas. */
      if ((await salesOf(env, merchant, c.id)).linked > 0) return { ok: false, error: 'amount-locked', status: 409 };
      patch.amount_cents = cents; changed.push('amount');
    }
  }
  const stmtsAfter = [];
  if (b.partyName !== undefined || b.partyId !== undefined) {
    if (c.direction === 'issued') return { ok: false, error: 'party-locked', status: 409 };
    let name = clean(b.partyName, 120);
    let pid = clean(b.partyId, 80);
    const ptype = b.partyType === 'supplier' ? 'supplier' : (pid || name) ? 'customer' : '';
    if (ptype === 'customer' && !pid && name) pid = 'n:' + normName(name);
    if (pid && (pid.startsWith('cheque:') || pid.startsWith('po:'))) return { ok: false, error: 'bad-party', status: 400 };
    if (ptype && !pid) return { ok: false, error: 'bad-party', status: 400 };
    /* Un fournisseur se rattache comme à la création (index.js) : patron ou
       opérateur seulement (un gérant écrirait au grand livre fournisseurs), une
       fiche vivante de CE commerçant, et le nom vient de la fiche, jamais du corps. */
    if (ctx.only && String(c.party_type || '') === 'supplier') return { ok: false, error: 'supplier-owner-only', status: 403 };
    if (ptype === 'supplier') {
      if (ctx.only) return { ok: false, error: 'supplier-owner-only', status: 403 };
      const sup = await getSupplier(env, merchant, pid);
      if (!sup) return { ok: false, error: 'supplier-not-found', status: 404 };
      if (Number(sup.archived) === 1) return { ok: false, error: 'supplier-archived', status: 409 };
      pid = String(sup.id); name = clean(sup.name, 120);
    }
    /* Une fiche cliente : elle doit exister chez CE commerçant, son nom fait foi. */
    let clientId = '';
    if (ptype === 'customer' && !pid.startsWith('n:')) {
      const cl = await clientOf(env, merchant, pid);
      if (!cl) return { ok: false, error: 'client-not-found', status: 404 };
      clientId = String(cl.id); pid = clientId; name = clean(cl.name, 120) || name;
    }
    if (ptype !== String(c.party_type || '') || pid !== String(c.party_id || '') || name !== String(c.party_name || '')) {
      /* La dette d'un chèque client rejeté suit sa cliente : la note ouverte
         passe à la nouvelle fiche (ou naît), tant que la caisse n'a encaissé
         aucun règlement dessus ; ensuite le tiers est verrouillé. */
      if (c.direction === 'received' && ptype !== 'supplier' && String(c.party_type || '') !== 'supplier' && Number(c.debt_open) === 1) {
        const note = await debtNote(env, merchant, c.id);
        if (note && note.receipts > 0) return { ok: false, error: 'party-locked', status: 409 };
        /* Une note ne naît que pour ce qui est dû : la part des tickets vivants, ou, sans ticket, sur demande explicite. */
        const owed = note || !clientId ? 0 : (await owedFor(env, merchant, c, b.onAccount === true)).owed;
        stmtsAfter.push({ note, clientId, owed });
      }
      /* L'argent déjà écrit pour ce chèque suit son tiers : depuis un tiers
         provisoire (« cheque:<id> »), toutes ses lignes partent vers le client ;
         depuis un vrai tiers, on ne déplace rien (ce serait mélanger ses
         autres lignes) et le tiers reste verrouillé tant qu'une ligne existe. */
      let lines = 0;
      try { const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM money_ledger WHERE merchant = ? AND cheque_id = ? AND archived = 0').bind(merchant, c.id).first(); lines = Number(r && r.n) || 0; }
      catch (_) { lines = 0; }
      const from = debtParty(c);
      if (lines && (pid !== from.id || ptype !== from.type)) {
        if (!from.id.startsWith('cheque:') || ptype !== 'customer') return { ok: false, error: 'party-locked', status: 409 };
        stmtsAfter.push({ relink: { from: from.id, to: pid } });
      }
      patch.party_type = ptype; patch.party_id = ptype ? pid : ''; patch.party_name = ptype ? name : '';
      changed.push('party');
    }
  }
  if (!changed.length) return { ok: true, duplicate: false, unchanged: true, cheque: chequeView(c) };
  const histId = rid('chh'), now = Date.now(), actor = clean(ctx.actor, 100);
  const cols = Object.keys(patch);
  const stmts = [
    env.DB.prepare(`INSERT OR IGNORE INTO cheque_history ${HIST_COLS}
      SELECT ?, ?, id, ?, 'edit', status, status, ?, ?, ?, NULL, ?, ? FROM cheques WHERE merchant = ? AND id = ? AND version = ?`)
      .bind(merchant, histId, requestId, ctx.today.civil, clean(b.reason, 280), changed.join(','), actor, now, merchant, c.id, Number(c.version)),
    env.DB.prepare(`UPDATE cheques SET ${cols.map((k) => k + ' = ?').join(', ')}, version = version + 1, updated_at = ?
       WHERE merchant = ? AND id = ? AND version = ? AND EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)`)
      .bind(...cols.map((k) => patch[k]), now, merchant, c.id, Number(c.version), merchant, histId),
  ];
  for (const s of stmtsAfter) {
    if ('note' in s) {
      if (s.note && s.clientId) stmts.push(env.DB.prepare(`UPDATE retail_balances SET customer_id = ? WHERE merchant = ? AND id = ? AND EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)`)
        .bind(s.clientId, merchant, s.note.id, merchant, histId));
      else if (s.note) stmts.push(env.DB.prepare(`DELETE FROM retail_balances WHERE merchant = ? AND id = ? AND EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)
          AND NOT EXISTS (SELECT 1 FROM retail_balance_receipts r WHERE r.merchant = ? AND r.balance_id = ?)`).bind(merchant, s.note.id, merchant, histId, merchant, s.note.id));
      else if (s.clientId && s.owed > 0) stmts.push(openNoteStatement(env, merchant, { ...c, party_id: s.clientId }, s.clientId, now, histId, s.owed));
    }
    if (s.relink) stmts.push(env.DB.prepare(`UPDATE money_ledger SET party_id = ?
        WHERE merchant = ? AND party_type = 'customer' AND party_id = ? AND cheque_id = ? AND EXISTS (SELECT 1 FROM cheque_history WHERE merchant = ? AND id = ?)`)
      .bind(s.relink.to, merchant, s.relink.from, c.id, merchant, histId));
  }
  try { await env.DB.batch(stmts); }
  catch (_) { return { ok: false, error: 'unmigrated', status: 503 }; }
  const hist = await env.DB.prepare('SELECT * FROM cheque_history WHERE merchant = ? AND request_id = ?').bind(merchant, requestId).first();
  const fresh = await getCheque(env, merchant, c.id);
  if (hist && hist.id === histId) return { ok: true, duplicate: false, cheque: chequeView(fresh), changed };
  return { ok: false, error: 'stale', status: 409, cheque: chequeView(fresh) };
}

/* ── Lecture ──────────────────────────────────────────────────────────────── */
export function historyView(h) {
  return h ? { id: String(h.id), action: String(h.action), from: String(h.from_status || ''), to: String(h.to_status || ''), date: String(h.event_date || ''),
    reason: String(h.reason || ''), detail: String(h.detail || ''), ledgerEntryId: h.ledger_entry_id ? String(h.ledger_entry_id) : '',
    actor: String(h.actor || ''), at: Number(h.at) || 0 } : null;
}

const STATUS_SET = new Set([...Object.keys(TRANSITIONS.received), ...Object.keys(TRANSITIONS.issued)]);
/* filters = { status: 'a,b', direction, party, from, to, slip, q, limit, only } */
export async function listCheques(env, merchant, filters) {
  const f = filters || {};
  const where = ['merchant = ?'], params = [merchant];
  const statuses = String(f.status || '').split(',').map((s) => s.trim()).filter((s) => STATUS_SET.has(s));
  if (statuses.length) { where.push(`status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
  const dir = f.only || (DIRECTIONS.includes(f.direction) ? f.direction : '');
  if (dir) { where.push('direction = ?'); params.push(dir); }
  if (f.party) {
    const [ptype, ...rest] = String(f.party).split('|');
    const pid = rest.join('|');
    if (ptype === 'none') where.push("party_id = ''");
    else if ((ptype === 'customer' || ptype === 'supplier') && pid) { where.push('party_type = ? AND party_id = ?'); params.push(ptype, clean(pid, 80)); }
  }
  /* La date d'un chèque à l'écran : échéance, sinon remise, sinon réception (Inyad). */
  const dateExpr = 'COALESCE(due_date, deposit_date, reception_date)';
  if (f.from && validYmd(f.from)) { where.push(`${dateExpr} >= ?`); params.push(f.from); }
  if (f.to && validYmd(f.to)) { where.push(`${dateExpr} <= ?`); params.push(f.to); }
  if (f.slip) { where.push('deposit_slip = ?'); params.push(clean(f.slip, 40)); }
  if (f.q) {
    const q = '%' + clean(f.q, 60).toLowerCase().replace(/[%_]/g, '') + '%';
    where.push('(LOWER(number) LIKE ? OR LOWER(drawer_name) LIKE ? OR LOWER(party_name) LIKE ? OR LOWER(bank) LIKE ? OR LOWER(drawer_bank) LIKE ?)');
    params.push(q, q, q, q, q);
  }
  const limit = Math.max(1, Math.min(2000, Number(f.limit) || 1000));
  try {
    const rows = await env.DB.prepare(`SELECT * FROM cheques WHERE ${where.join(' AND ')}
      ORDER BY ${dateExpr} ASC, created_at ASC LIMIT ?`).bind(...params, limit + 1).all();
    const list = (rows && rows.results) || [];
    return { ok: true, cheques: list.slice(0, limit).map(chequeView), truncated: list.length > limit };
  } catch (_) { return { ok: false, error: 'unmigrated', cheques: [], truncated: false }; }
}

/* Ancienneté, comme Inyad mais explicite :
 *   · seuls les chèques REÇUS encore en main (status received) comptent ;
 *   · en retard = échéance < aujourd'hui ; jours = aujourd'hui − échéance ;
 *     tranches 1-30, 31-60, 61-90, 90+ ;
 *   · à venir = échéance ≥ aujourd'hui ; tranche = mois civil d'écart
 *     (0 = ce mois-ci), au-delà du sixième mois tout tombe dans le dernier. */
export const OVERDUE_KEYS = ['1-30', '31-60', '61-90', '90+'];
const monthIndex = (ymd) => Number(ymd.slice(0, 4)) * 12 + Number(ymd.slice(5, 7)) - 1;
const monthKey = (idx) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
export function chequeAgeing(rows, today) {
  const ref = Date.parse(today + 'T00:00:00Z');
  const overdue = OVERDUE_KEYS.map((key) => ({ key, count: 0, cents: 0 }));
  const base = monthIndex(today);
  const upcoming = Array.from({ length: 6 }, (_, i) => ({ month: monthKey(base + i), count: 0, cents: 0 }));
  const parties = new Set();
  let overdueCents = 0, overdueCount = 0, oldestDays = 0;
  for (const r of rows || []) {
    const status = String(r.status), dir = String(r.direction);
    if (dir !== 'received' || status !== 'received') continue;
    const due = effectiveDue(r);
    if (!validYmd(due)) continue;
    const cents = Number(r.amount_cents != null ? r.amount_cents : r.amountCents) || 0;
    if (due < today) {
      const days = Math.floor((ref - Date.parse(due + 'T00:00:00Z')) / DAY);
      const i = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
      overdue[i].count++; overdue[i].cents += cents;
      overdueCents += cents; overdueCount++; oldestDays = Math.max(oldestDays, days);
      parties.add(String(r.party_type || r.partyType || '') + '|' + String(r.party_id || r.partyId || r.drawer_name || r.drawerName || ''));
    } else {
      const i = Math.min(monthIndex(due) - base, 5);
      upcoming[i].count++; upcoming[i].cents += cents;
    }
  }
  return { today, overdue, upcoming, overdueCents, overdueCount, oldestDays, overdueParties: parties.size };
}

/* Cartes de synthèse, « à remettre cette semaine » et pastille par client. */
export function chequeSummary(rows, today) {
  const card = () => ({ count: 0, cents: 0 });
  const s = { inHand: card(), deposited: card(), rejected: card(), litigation: card(), issued: card(), debtOpen: card(), thisWeek: { count: 0, cents: 0, lateCount: 0, lateCents: 0 } };
  const weekEnd = new Date(Date.parse(today + 'T00:00:00Z') + 6 * DAY).toISOString().slice(0, 10);
  const byParty = new Map();
  for (const r of rows || []) {
    const c = r.amount_cents != null ? { status: r.status, direction: r.direction, cents: Number(r.amount_cents), due: effectiveDue(r), debt: Number(r.debt_open) === 1, ptype: r.party_type, pid: r.party_id, pname: r.party_name || r.drawer_name }
      : { status: r.status, direction: r.direction, cents: r.amountCents, due: effectiveDue(r), debt: r.debtOpen, ptype: r.partyType, pid: r.partyId, pname: r.partyName || r.drawerName };
    const add = (k) => { s[k].count++; s[k].cents += c.cents; };
    if (c.debt && !['collected', 'replaced', 'debited'].includes(c.status)) add('debtOpen');
    if (c.direction === 'issued') { if (c.status === 'issued') add('issued'); continue; }
    if (c.status === 'received') {
      add('inHand');
      if (c.due && c.due <= weekEnd) { s.thisWeek.count++; s.thisWeek.cents += c.cents; if (c.due < today) { s.thisWeek.lateCount++; s.thisWeek.lateCents += c.cents; } }
      const key = (c.ptype || '') + '|' + (c.pid || ('n:' + normName(c.pname || '')));
      if (!byParty.has(key)) byParty.set(key, { key, partyType: c.ptype || '', partyId: c.pid || '', name: c.pname || '', count: 0, cents: 0, nextDue: '' });
      const p = byParty.get(key);
      p.count++; p.cents += c.cents;
      if (c.due && (!p.nextDue || c.due < p.nextDue)) p.nextDue = c.due;
    }
    else if (c.status === 'deposited') add('deposited');
    else if (c.status === 'rejected') add('rejected');
    else if (c.status === 'in_litigation') add('litigation');
  }
  s.byParty = [...byParty.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name)).slice(0, 200);
  return s;
}

export async function openCheques(env, merchant, only) {
  try {
    const rows = await env.DB.prepare(`SELECT * FROM cheques WHERE merchant = ? AND (status IN ('received', 'deposited', 'rejected', 'in_litigation', 'issued') OR debt_open = 1)${only ? ' AND direction = ?' : ''} LIMIT 5000`)
      .bind(...(only ? [merchant, only] : [merchant])).all();
    return (rows && rows.results) || [];
  } catch (_) { return null; }
}

export async function chequeDetail(env, merchant, id, only) {
  const c = await getCheque(env, merchant, id);
  if (!c || (only && c.direction !== only)) return null;
  const [hist, links, ledger] = await Promise.all([
    env.DB.prepare('SELECT * FROM cheque_history WHERE merchant = ? AND cheque_id = ? ORDER BY at, rowid').bind(merchant, c.id).all(),
    env.DB.prepare('SELECT * FROM cheque_links WHERE merchant = ? AND cheque_id = ? ORDER BY created_at').bind(merchant, c.id).all(),
    env.DB.prepare('SELECT id, entry_date, amount_cents, direction, party_type, party_id, kind, method, archived FROM money_ledger WHERE merchant = ? AND cheque_id = ? ORDER BY created_at, rowid')
      .bind(merchant, c.id).all().catch(() => ({ results: [] })),
  ]);
  const linkRows = (links && links.results) || [];
  const saleIds = linkRows.filter((l) => l.link_type === 'sale').map((l) => String(l.link_id)).slice(0, MAX_LINKS);
  let sales = [];
  if (saleIds.length) {
    try {
      const rs = await env.DB.prepare(`SELECT id, amount_cents, amount, method, ts, ref, label FROM sales WHERE merchant = ? AND id IN (${saleIds.map(() => '?').join(',')})`)
        .bind(merchant, ...saleIds).all();
      sales = ((rs && rs.results) || []).map((s) => ({ id: String(s.id), amountCents: s.amount_cents != null ? Number(s.amount_cents) : Math.round(Number(s.amount || 0) * 100), method: String(s.method || ''), ts: Number(s.ts) || 0, ref: String(s.ref || '') }));
    } catch (_) { sales = []; }
  }
  const [view] = await annotateCheques(env, merchant, [chequeView(c)]);
  const cl = view.clientId ? await clientOf(env, merchant, view.clientId) : null;
  return {
    cheque: view,
    client: cl ? { id: String(cl.id), name: String(cl.name || ''), phone: String(cl.phone || '') } : null,
    history: ((hist && hist.results) || []).map(historyView),
    links: linkRows.map((l) => ({ type: String(l.link_type), id: String(l.link_id), amountCents: l.amount_cents == null ? null : Number(l.amount_cents) })),
    sales,
    ledger: ((ledger && ledger.results) || []).map((l) => ({ id: String(l.id), date: String(l.entry_date), amountCents: Number(l.amount_cents), direction: String(l.direction),
      partyType: String(l.party_type), partyId: String(l.party_id), kind: String(l.kind), method: String(l.method), archived: Number(l.archived) === 1 })),
  };
}
