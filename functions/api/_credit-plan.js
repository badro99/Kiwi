/* Carnet de crédit du patron · les règles, sans base de données.
 *
 * Un échéancier, par client : des lignes { montant, date, note, statut }.
 * Règles reprises d'Inyad (features-deep.md §2) et tenues ici une fois :
 *   · un échéancier neuf part d'UNE ligne, du montant entier dû ;
 *   · la somme des lignes en attente ne dépasse jamais ce que le client doit,
 *     le reste sans date est montré (« 120 MAD sans date ») ;
 *   · un règlement couvre les lignes en attente par ordre de date : une ligne
 *     couverte passe « encaissée », un reste partiel réduit la suivante ;
 *   · un règlement annulé rouvre les lignes dans l'ordre inverse : la dernière
 *     couverte se rouvre la première.
 * Ce qu'une ligne a reçu n'est jamais accumulé à chaque lecture : c'est une
 * fonction (derive) des lignes écrites et du total versé aujourd'hui. Lire
 * deux fois, lire avec un total en retard, annuler puis payer à nouveau donne
 * toujours la même réponse pour le même total versé.
 * Tout se compte en centimes entiers. Les dates d'échéance sont des jours
 * 'AAAA-MM-JJ' de la journée d'activité du commerce (functions/api/_business-day.js). */

export const MAX_PENDING = 24;
export const KEEP_COLLECTED = 36;
export const MAX_CENTS = 20000000;          // 200 000 MAD, le plafond de retail_balances
export const NOTE_MAX = 120;
export const ROW_ID = /^[A-Za-z0-9_-]{6,64}$/;
export const CUSTOMER_KEY = /^[A-Za-z0-9_.:-]{1,80}$/;
export const SOURCES = ['carnet', 'client'];
export const LANGS = ['fr', 'ar', 'darija'];
export const BUCKETS = ['notDue', 'd1_30', 'd31_60', 'd61_90', 'd90p'];
const DAY = 86400000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const cents = (v) => (Number.isSafeInteger(v) ? v : Math.round(Number(v) || 0));

export function validDay(day) {
  if (typeof day !== 'string' || !ISO_DAY.test(day)) return false;
  const t = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day;
}
export function addDays(day, n) {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}
export function endOfMonth(day) {
  const d = new Date(Date.parse(day + 'T00:00:00Z'));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}
/* Jours de `from` à `to` (positif quand `to` est après). */
export function dayDiff(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY);
}

const byDue = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1
  : (a.createdTs || 0) - (b.createdTs || 0) || String(a.id).localeCompare(String(b.id)));
export const pendingOf = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => r && !r.block && r.status === 'pending').sort(byDue);
export const collectedOf = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => r && !r.block && r.status === 'collected');
export const pendingTotal = (rows) => pendingOf(rows).reduce((n, r) => n + r.amountCents, 0);

/* La première ligne d'un échéancier : tout ce qui est dû, à une date. */
export function seedRows(owedCents, dueDate, now, id) {
  const amount = cents(owedCents);
  if (!(amount > 0) || !validDay(dueDate)) return [];
  return [{ id, amountCents: amount, originalCents: amount, coveredCents: 0, dueDate, note: '', status: 'pending', origin: 'seed', createdTs: now, collectedTs: 0 }];
}

/* Les lignes envoyées par un écran, nettoyées. `{ rows }` ou `{ error }`. */
export function cleanRows(input, { now = Date.now(), origin = 'owner', makeId } = {}) {
  if (!Array.isArray(input)) return { error: 'bad-schedule' };
  if (input.length > MAX_PENDING) return { error: 'schedule-too-long' };
  const seen = new Set();
  const rows = [];
  for (const raw of input) {
    const amount = raw && raw.amountCents;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_CENTS) return { error: 'bad-schedule-amount' };
    if (!validDay(raw.dueDate)) return { error: 'bad-schedule-date' };
    let id = raw.id == null || raw.id === '' ? (makeId ? makeId() : '') : String(raw.id);
    if (!ROW_ID.test(id) || seen.has(id)) return { error: 'bad-schedule-id' };
    seen.add(id);
    rows.push({ id, amountCents: amount, originalCents: amount, coveredCents: 0, dueDate: raw.dueDate,
      note: String(raw.note == null ? '' : raw.note).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NOTE_MAX),
      status: 'pending', origin, createdTs: now, collectedTs: 0 });
  }
  return { rows };
}

/* '' quand les lignes tiennent dans ce que le client doit. */
export function checkTotal(rows, owedCents) {
  return pendingTotal(rows) > Math.max(0, cents(owedCents)) ? 'schedule-exceeds-balance' : '';
}

/* Ce que les règlements couvrent. Les lignes sont rangées comme sur une
 * ligne d'argent, de bas en haut (l'ordre du tableau écrit) : d'abord ce qui
 * est déjà encaissé, puis un éventuel « bloc » (l'argent versé qui ne couvre
 * aucune échéance visible : la part payée d'une ligne réécrite, ou un
 * trop-perçu mis de côté), puis les échéances en attente par date.
 * `poolCents` est l'argent posé sur cette ligne quand le total versé valait
 * `baselineCents`. Aujourd'hui il vaut poolCents + (versé − baselineCents), et
 * il couvre les lignes de bas en haut. C'est une fonction affine du total
 * versé : lire en retard, écrire en retard puis relire à jour, annuler puis
 * repayer, rien ne dépend du chemin, seulement du dernier total. Un règlement
 * annulé retire l'argent par le haut : le bloc mis de côté avant les
 * échéances plus récentes que lui part après elles, et avant les plus
 * anciennes. Rend des copies : `amountCents` est ce qui reste sur la ligne. */
export function derive(rows, { baselineCents = 0, poolCents = 0, paidCents = 0, now = Date.now() } = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === 'object')
    .map((r) => ({ ...r, originalCents: Math.max(0, cents(r.originalCents != null ? r.originalCents : r.amountCents)) }));
  const before = list.reduce((n, r) => n + Math.min(r.originalCents, Math.max(0, cents(r.coveredCents || 0))), 0);
  const pool = cents(poolCents) + Math.max(0, cents(paidCents)) - Math.max(0, cents(baselineCents));
  let left = Math.max(0, pool);
  for (const r of list) {
    r.coveredCents = Math.min(r.originalCents, left);
    left -= r.coveredCents;
    r.amountCents = r.originalCents - r.coveredCents;
    const done = r.amountCents <= 0;
    r.collectedTs = done ? (r.collectedTs || now) : 0;
    r.status = done ? 'collected' : 'pending';
  }
  const covered = list.reduce((n, r) => n + r.coveredCents, 0);
  return { rows: list, poolCents: pool, excessCents: left, appliedCents: Math.max(0, covered - before), reopenedCents: Math.max(0, before - covered) };
}

/* Réécrire l'échéancier (le patron, une promesse du comptoir) : ce qui est
 * déjà encaissé reste en bas, tout l'argent posé qui ne couvre pas une ligne
 * entière (une part d'échéance, un trop-perçu) devient UN bloc juste dessous
 * des nouvelles lignes, et les échéances en attente repartent au-dessus, par
 * date, du montant qui reste à payer. L'argent posé ne change pas : les
 * nouvelles lignes ne sont couvertes que par un règlement à venir, et un
 * remboursement reprend d'abord ce bloc. Au-delà de KEEP_COLLECTED lignes
 * encaissées, les plus anciennes sortent du bas, avec leur argent. */
export function rebase(acct, pendingRows, makeId) {
  const pool = cents(acct.poolCents);
  let collected = collectedOf(acct.rows);
  let block = Math.max(0, pool) - collected.reduce((n, r) => n + r.originalCents, 0);
  let next = pool;
  if (collected.length > KEEP_COLLECTED) {
    const gone = collected.slice(0, collected.length - KEEP_COLLECTED);
    next -= gone.reduce((n, r) => n + r.originalCents, 0);
    collected = collected.slice(-KEEP_COLLECTED);
  }
  const rows = collected.map((r) => ({ ...r }));
  if (block > 0) rows.push({ id: (makeId ? makeId() : 'blk' + Date.now().toString(36)), block: true, originalCents: block, amountCents: 0, dueDate: '', note: '', origin: 'block', status: 'collected', createdTs: 0, collectedTs: 0 });
  const pending = (Array.isArray(pendingRows) ? pendingRows : []).map((r) => ({ ...r, originalCents: r.amountCents, coveredCents: 0, status: 'pending', collectedTs: 0 })).sort(byDue);
  return { ...acct, poolCents: next, rows: rows.concat(pending) };
}

/* Un règlement seul sur des lignes neuves (la cascade) : ce qu'il couvre,
 * ce qui en reste (un trop-perçu ne crée aucune ligne), ce qui a changé. */
export function waterfall(rows, payCents, now = Date.now()) {
  const before = new Map(pendingOf(rows).map((r) => [r.id, r.amountCents]));
  const out = derive(pendingOf(rows).map((r) => ({ ...r, originalCents: r.amountCents, coveredCents: 0 })), { paidCents: payCents, now });
  const collected = [];
  let reduced = null;
  for (const r of out.rows) {
    if (r.status === 'collected') collected.push(r.id);
    else if (r.amountCents < before.get(r.id) && !reduced) reduced = { id: r.id, fromCents: before.get(r.id), toCents: r.amountCents };
  }
  const rest = (Array.isArray(rows) ? rows : []).filter((r) => r && r.status !== 'pending').map((r) => ({ ...r }));
  return { rows: out.rows.concat(rest), appliedCents: out.appliedCents, leftoverCents: out.excessCents, collected, reduced };
}

/* Ce qui s'écrit d'une ligne : rien de ce qui se recalcule. */
export function storedRow(r) {
  const out = { id: r.id, originalCents: r.originalCents, dueDate: r.dueDate || '', note: r.note || '', origin: r.origin || 'owner', createdTs: r.createdTs || 0, collectedTs: r.collectedTs || 0 };
  if (r.block) out.block = true;
  return out;
}

/* Ce que l'écran montre. Une ligne promise au comptoir peut arriver avant la
 * dette qu'elle couvre (la vente se synchronise après) ; une dette peut aussi
 * baisser autrement que par un règlement (un retour). L'écran ne montre jamais
 * plus que ce qui est dû : l'excédent est retiré des lignes les plus tardives,
 * à l'affichage seulement, les lignes gardées restent intactes. */
export function viewRows(rows, owedCents) {
  const pending = pendingOf(rows).map((r) => ({ ...r, shownCents: r.amountCents }));
  let over = Math.max(0, pendingTotal(rows) - Math.max(0, cents(owedCents)));
  const overCents = over;
  for (let i = pending.length - 1; i >= 0 && over > 0; i--) {
    const cut = Math.min(over, pending[i].shownCents);
    pending[i].shownCents -= cut;
    over -= cut;
  }
  const shown = pending.filter((r) => r.shownCents > 0);
  const scheduled = shown.reduce((n, r) => n + r.shownCents, 0);
  return { pending: shown, overCents, scheduledCents: scheduled, unscheduledCents: Math.max(0, cents(owedCents) - scheduled) };
}

/* Les morceaux de dette encore impayés, du plus ancien au plus récent, quand
 * les règlements couvrent les dettes les plus anciennes d'abord. */
export function unpaidPieces(debts, paidCents) {
  const list = (Array.isArray(debts) ? debts : []).filter((d) => d && d.cents > 0 && validDay(d.day))
    .slice().sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  let cover = Math.max(0, cents(paidCents));
  const out = [];
  for (const d of list) {
    if (cover >= d.cents) { cover -= d.cents; continue; }
    out.push({ cents: d.cents - cover, day: d.day });
    cover = 0;
  }
  return out;
}
/* Le reste sans date, pris sur les dettes les plus récentes : un échéancier
 * couvre d'habitude ce qui traîne depuis le plus longtemps. */
export function newestPieces(pieces, amountCents) {
  let need = Math.max(0, cents(amountCents));
  const out = [];
  for (let i = pieces.length - 1; i >= 0 && need > 0; i--) {
    const take = Math.min(need, pieces[i].cents);
    out.unshift({ cents: take, day: pieces[i].day });
    need -= take;
  }
  return out;
}

export function bucketFor(daysLate) {
  if (!(daysLate > 0)) return 'notDue';
  if (daysLate <= 30) return 'd1_30';
  if (daysLate <= 60) return 'd31_60';
  if (daysLate <= 90) return 'd61_90';
  return 'd90p';
}
/* Balance âgée d'un client : chaque ligne datée compte à sa date d'échéance,
 * le reste sans date compte depuis l'achat qu'il couvre, plus le délai que le
 * commerce accorde (`termDays`, 30 jours par défaut, credit_settings). */
export const DEFAULT_TERM_DAYS = 30;
export const looseDue = (piece, termDays) => addDays(piece.day, Math.max(0, Math.min(365, cents(termDays))));
export function ageing(pendingShown, loosePieces, today, termDays = 0) {
  const buckets = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  let daysLate = 0;
  let nextDue = '';
  const add = (amount, day) => {
    if (!(amount > 0) || !validDay(day)) return;
    const late = dayDiff(day, today);
    buckets[bucketFor(late)] += amount;
    if (late > daysLate) daysLate = late;
  };
  for (const r of pendingShown || []) {
    add(r.shownCents != null ? r.shownCents : r.amountCents, r.dueDate);
    if (r.dueDate >= today && (!nextDue || r.dueDate < nextDue)) nextDue = r.dueDate;
  }
  for (const p of loosePieces || []) {
    if (!validDay(p.day)) continue;
    const due = looseDue(p, termDays);
    add(p.cents, due);
    if (due >= today && (!nextDue || due < nextDue)) nextDue = due;
  }
  return { buckets, daysLate, nextDue };
}

/* Le plafond de crédit : une vente à crédit qui le dépasserait demande
 * l'accord d'un responsable. Pas de plafond ⇒ rien à demander. */
export function limitDecision({ owedCents, addCents, limitCents }) {
  const owed = Math.max(0, cents(owedCents));
  const add = Math.max(0, cents(addCents));
  const after = owed + add;
  if (limitCents == null || !Number.isSafeInteger(limitCents) || limitCents < 0) {
    return { limited: false, over: false, afterCents: after, headroomCents: null, limitCents: null };
  }
  return { limited: true, over: after > limitCents, afterCents: after, headroomCents: Math.max(0, limitCents - owed), limitCents };
}
