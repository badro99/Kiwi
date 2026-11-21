/* Carnet de crédit du patron · ce qui touche la base.
 *
 * Deux carnets existent déjà et restent la vérité de ce qui est dû :
 *   · source 'carnet' : l'ardoise de l'épicerie, document store_docs
 *     (merchant, 'creditbook') (functions/api/_credit-book-store.js) ;
 *   · source 'client' : les notes ouvertes de la boutique, D1 retail_balances.
 * Ce fichier n'y écrit jamais. Il garde, par client, une ligne credit_accounts :
 * le plafond, la langue des rappels, le dernier rappel, et l'échéancier (JSON,
 * une ligne par client, écrit en compare-and-swap sur `rev` : une seule
 * écriture atomique, deux caisses ne s'écrasent jamais).
 *
 * Pourquoi pas une ligne D1 par échéance : un règlement touche plusieurs lignes
 * d'un coup (la cascade), et D1 n'a pas de transaction interactive. Une seule
 * ligne par client rend chaque cascade atomique et rejouable.
 *
 * Les règlements, d'où qu'ils viennent : `paid_mark_cents` retient le total
 * déjà versé par ce client quand l'échéancier a vu passer son dernier
 * règlement. À chaque lecture, le total versé d'aujourd'hui moins cette marque
 * est le nouveau règlement, versé sur les lignes (_credit-plan.js waterfall),
 * et la marque avance dans la même écriture. Rejouer la lecture ne verse rien
 * une seconde fois : c'est l'idempotence. Un règlement noté hors ligne, sur une
 * autre caisse, à l'écran Acomptes ou à l'ardoise, est vu de la même façon. */
import { readBook, legacyBook } from './_credit-book-store.js';
import { businessDate, merchantCutoff, merchantZone } from './_business-day.js';
import {
  addDays, ageing, cents, checkTotal, cleanRows, CUSTOMER_KEY, LANGS, limitDecision, MAX_CENTS,
  NOTE_MAX, pendingOf, ROW_ID, seedRows, SOURCES, trimRows, unpaidPieces, newestPieces, validDay, viewRows, waterfall,
} from './_credit-plan.js';

const rid = (p) => p + (globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '');
const parse = (text, fallback) => { try { const v = JSON.parse(text); return v == null ? fallback : v; } catch (_) { return fallback; } };
export const missingTable = (e) => /no such table/i.test(String((e && e.message) || e || ''));

export async function merchantToday(env, merchant, now = Date.now()) {
  const [cutoff, zone] = await Promise.all([merchantCutoff(env, merchant), merchantZone(env, merchant)]);
  return { today: businessDate(now, cutoff, zone), dayOf: (ts) => businessDate(ts, cutoff, zone) };
}

/* ── ce qui est dû, lu dans les carnets existants ── */
async function carnetBook(env, merchant) {
  let book = await readBook(env, merchant, null);
  if (!book.exists) {
    const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'verticalops'").bind(merchant).first();
    book = { exists: false, carnet: legacyBook(row ? parse(row.data, null) : null) || [] };
  }
  return book.carnet;
}
const entryCents = (h) => Math.round((Number(h && h.amt) || 0) * 100);
const entryTs = (h) => { const t = Date.parse(h && h.at); return Number.isFinite(t) ? t : 0; };

export async function carnetDebtors(env, merchant, dayOf) {
  const carnet = await carnetBook(env, merchant);
  return carnet.filter((c) => c && c.id != null && CUSTOMER_KEY.test(String(c.id))).map((c) => {
    const hist = Array.isArray(c.hist) ? c.hist : [];
    let debt = 0, paid = 0, lastPayTs = 0;
    const debts = [];
    for (const h of hist) {
      const n = entryCents(h);
      if (h.type === 'debt') { debt += n; if (n > 0) debts.push({ cents: n, day: dayOf(entryTs(h) || Date.now()) }); }
      else { paid += n; lastPayTs = Math.max(lastPayTs, entryTs(h)); }
    }
    return {
      source: 'carnet', key: String(c.id), name: String(c.name || ''), phone: String(c.phone || ''),
      owedCents: Math.max(0, debt - paid), paidTotalCents: paid, lastPayTs,
      pieces: unpaidPieces(debts, paid),
      history: hist.slice(-40).map((h) => ({ kind: h.type === 'debt' ? 'debt' : 'pay', cents: entryCents(h), ts: entryTs(h), label: String(h.label || '').slice(0, 80) })),
    };
  });
}

export async function clientDebtors(env, merchant, dayOf, onlyKey) {
  const rows = await env.DB.prepare(`SELECT b.customer_id, b.ticket_ref, b.total_cents, b.created_ts,
      COALESCE(SUM(CASE WHEN r.status = 'posted' AND s.id IS NOT NULL AND s.void_ts IS NULL THEN r.amount_cents ELSE 0 END),0) AS paid,
      COALESCE(SUM(CASE WHEN r.status = 'pending' THEN r.amount_cents ELSE 0 END),0) AS pend,
      MAX(CASE WHEN r.status = 'posted' AND s.id IS NOT NULL AND s.void_ts IS NULL THEN r.created_ts END) AS last_pay
    FROM retail_balances b
    LEFT JOIN retail_balance_receipts r ON r.merchant = b.merchant AND r.balance_id = b.id
    LEFT JOIN sales s ON s.merchant = r.merchant AND s.id = r.sale_id
    WHERE b.merchant = ? ${onlyKey ? 'AND b.customer_id = ?' : ''}
    GROUP BY b.merchant, b.id ORDER BY b.created_ts`).bind(...(onlyKey ? [merchant, onlyKey] : [merchant])).all();
  const by = new Map();
  for (const r of rows.results || []) {
    const key = String(r.customer_id);
    const d = by.get(key) || { source: 'client', key, name: '', phone: '', owedCents: 0, paidTotalCents: 0, lastPayTs: 0, pieces: [], history: [] };
    const total = Number(r.total_cents) || 0, paid = Number(r.paid) || 0, pend = Number(r.pend) || 0;
    const due = Math.max(0, total - paid - pend);
    d.owedCents += due;
    d.paidTotalCents += paid;
    d.lastPayTs = Math.max(d.lastPayTs, Number(r.last_pay) || 0);
    if (due > 0) d.pieces.push({ cents: due, day: dayOf(Number(r.created_ts) || Date.now()) });
    d.history.push({ kind: 'debt', cents: total, ts: Number(r.created_ts) || 0, label: String(r.ticket_ref || '') });
    if (paid > 0) d.history.push({ kind: 'pay', cents: paid, ts: Number(r.last_pay) || 0, label: String(r.ticket_ref || '') });
    by.set(key, d);
  }
  if (by.size) {
    const keys = [...by.keys()];
    for (let i = 0; i < keys.length; i += 80) {
      const part = keys.slice(i, i + 80);
      const people = await env.DB.prepare(`SELECT id, name, phone FROM clients WHERE merchant = ? AND id IN (${part.map(() => '?').join(',')})`)
        .bind(merchant, ...part).all();
      for (const p of people.results || []) { const d = by.get(String(p.id)); if (d) { d.name = String(p.name || ''); d.phone = String(p.phone || ''); } }
    }
  }
  for (const d of by.values()) d.history.sort((a, b) => a.ts - b.ts);
  return [...by.values()];
}

async function debtorsOf(env, merchant, dayOf) {
  const out = [];
  let carnetError = null;
  try { out.push(...await carnetDebtors(env, merchant, dayOf)); } catch (e) { carnetError = e; }
  try { out.push(...await clientDebtors(env, merchant, dayOf)); } catch (e) { if (!missingTable(e)) throw e; }
  if (carnetError) throw carnetError;
  return out;
}
export async function debtorOf(env, merchant, source, key, dayOf) {
  if (source === 'carnet') return (await carnetDebtors(env, merchant, dayOf)).find((d) => d.key === key) || null;
  return (await clientDebtors(env, merchant, dayOf, key))[0] || null;
}

/* ── la ligne credit_accounts ── */
function accountFrom(row) {
  return {
    source: row.source, key: row.customer_key,
    limitCents: row.limit_cents == null ? null : Number(row.limit_cents),
    lang: LANGS.includes(row.lang) ? row.lang : '',
    paidMarkCents: Number(row.paid_mark_cents) || 0,
    remindedTs: Number(row.reminded_ts) || 0,
    rows: trimRows(parse(row.schedule, [])), rev: Number(row.rev) || 0,
  };
}
export async function readAccounts(env, merchant) {
  const res = await env.DB.prepare('SELECT * FROM credit_accounts WHERE merchant = ?').bind(merchant).all();
  return (res.results || []).map(accountFrom);
}
export async function readAccount(env, merchant, source, key) {
  const row = await env.DB.prepare('SELECT * FROM credit_accounts WHERE merchant = ? AND source = ? AND customer_key = ?')
    .bind(merchant, source, key).first();
  return row ? accountFrom(row) : null;
}
/* Crée la ligne (la marque part du total déjà versé : un règlement d'avant
 * l'échéancier n'y est jamais versé), puis la relit. */
async function ensureAccount(env, merchant, source, key, paidTotalCents, now) {
  await env.DB.prepare(`INSERT INTO credit_accounts (merchant, source, customer_key, paid_mark_cents, schedule, rev, updated_ts)
    VALUES (?, ?, ?, ?, '[]', 0, ?) ON CONFLICT(merchant, source, customer_key) DO NOTHING`)
    .bind(merchant, source, key, Math.max(0, cents(paidTotalCents)), now).run();
  return readAccount(env, merchant, source, key);
}
async function casWrite(env, merchant, acct, next, now) {
  const res = await env.DB.prepare(`UPDATE credit_accounts SET limit_cents = ?, lang = ?, paid_mark_cents = ?, reminded_ts = ?,
      schedule = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND source = ? AND customer_key = ? AND rev = ?`)
    .bind(next.limitCents, next.lang, next.paidMarkCents, next.remindedTs, JSON.stringify(trimRows(next.rows)),
      acct.rev + 1, now, merchant, acct.source, acct.key, acct.rev).run();
  return Number(res && res.meta && res.meta.changes) === 1;
}
export async function logEvent(env, merchant, ev, now) {
  try {
    await env.DB.prepare(`INSERT OR IGNORE INTO credit_events (merchant, id, source, customer_key, kind, amount_cents, actor, detail, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(merchant, ev.id || rid('ev'), ev.source, ev.key, ev.kind,
      Math.max(0, cents(ev.amountCents || 0)), String(ev.actor || '').slice(0, 100), String(ev.detail || '').slice(0, 300), now).run();
  } catch (_) { /* le journal accompagne, il ne bloque jamais */ }
}

/* Verse sur l'échéancier ce que le client a payé depuis la dernière marque. */
export function settle(acct, paidTotalCents, now) {
  const delta = Math.max(0, cents(paidTotalCents)) - acct.paidMarkCents;
  if (delta === 0) return null;
  if (delta < 0) return { next: { ...acct, paidMarkCents: Math.max(0, cents(paidTotalCents)) }, plan: null };
  const plan = waterfall(acct.rows, delta, now);
  return { next: { ...acct, rows: plan.rows, paidMarkCents: acct.paidMarkCents + delta }, plan };
}

/* Applique, une fois, les règlements arrivés depuis la marque. Rend le compte à jour. */
export async function reconcile(env, merchant, acct, debtor, now = Date.now()) {
  let current = acct;
  for (let i = 0; i < 5 && current; i++) {
    const step = settle(current, debtor ? debtor.paidTotalCents : current.paidMarkCents, now);
    if (!step) return current;
    if (await casWrite(env, merchant, current, step.next, now)) {
      if (step.plan && step.plan.appliedCents > 0) {
        await logEvent(env, merchant, { id: `pay-${current.source}-${current.key}-${step.next.paidMarkCents}`, source: current.source,
          key: current.key, kind: 'collected', amountCents: step.plan.appliedCents,
          detail: JSON.stringify({ collected: step.plan.collected, reduced: step.plan.reduced }) }, now);
      }
      return { ...step.next, rev: current.rev + 1 };
    }
    current = await readAccount(env, merchant, current.source, current.key);
  }
  throw Object.assign(new Error('credit-busy'), { code: 'credit-busy' });
}

/* Lit, applique les règlements, écrit en compare-and-swap. `change(acct)` rend
 * le compte suivant, ou { error }. */
async function mutate(env, merchant, source, key, debtor, change, now) {
  let acct = await readAccount(env, merchant, source, key) || await ensureAccount(env, merchant, source, key, debtor ? debtor.paidTotalCents : 0, now);
  for (let i = 0; i < 5; i++) {
    acct = await reconcile(env, merchant, acct, debtor, now);
    const next = change(acct);
    if (!next || next.error) return next || { error: 'no-change' };
    if (await casWrite(env, merchant, acct, next, now)) return { account: { ...next, rev: acct.rev + 1 } };
    acct = await readAccount(env, merchant, source, key);
  }
  return { error: 'credit-busy', status: 409 };
}

export function validTarget(source, key) {
  return SOURCES.includes(source) && CUSTOMER_KEY.test(String(key || ''));
}

/* ── le carnet du patron ── */
function present(debtor, acct, today) {
  const owed = debtor ? debtor.owedCents : 0;
  const view = viewRows(acct ? acct.rows : [], owed);
  const loose = newestPieces(debtor ? debtor.pieces : [], view.unscheduledCents);
  const age = ageing(view.pending, loose, today);
  const dueRows = view.pending.filter((r) => r.dueDate <= today);
  return {
    source: debtor ? debtor.source : acct.source, key: debtor ? debtor.key : acct.key,
    name: debtor ? debtor.name : '', phone: debtor ? debtor.phone : '',
    owedCents: owed, scheduledCents: view.scheduledCents, unscheduledCents: view.unscheduledCents,
    limitCents: acct ? acct.limitCents : null, lang: acct ? acct.lang : '',
    remindedTs: acct ? acct.remindedTs : 0, rev: acct ? acct.rev : 0, hasSchedule: !!(acct && acct.rows.length),
    lastPayTs: debtor ? debtor.lastPayTs : 0,
    daysLate: age.daysLate, buckets: age.buckets, nextDue: age.nextDue,
    dueCents: dueRows.reduce((n, r) => n + r.shownCents, 0),
    dueDate: dueRows.length ? dueRows[0].dueDate : '',
    pending: view.pending.map((r) => ({ id: r.id, amountCents: r.shownCents, originalCents: r.originalCents, dueDate: r.dueDate, note: r.note, origin: r.origin })),
  };
}

export async function creditBook(env, merchant, now = Date.now()) {
  const { today, dayOf } = await merchantToday(env, merchant, now);
  const debtors = await debtorsOf(env, merchant, dayOf);
  let accounts = [];
  try { accounts = await readAccounts(env, merchant); } catch (e) { if (!missingTable(e)) throw e; }
  const accOf = new Map(accounts.map((a) => [a.source + ':' + a.key, a]));
  const customers = [];
  for (const d of debtors) {
    let acct = accOf.get(d.source + ':' + d.key) || null;
    if (acct) { acct = await reconcile(env, merchant, acct, d, now); accOf.delete(d.source + ':' + d.key); }
    if (d.owedCents > 0 || (acct && (acct.limitCents != null || pendingOf(acct.rows).length))) customers.push(present(d, acct, today));
  }
  const summary = { owedCents: 0, debtors: 0, buckets: { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 }, dueToday: 0, dueTodayCents: 0, overLimit: 0 };
  for (const c of customers) {
    summary.owedCents += c.owedCents;
    if (c.owedCents > 0) summary.debtors++;
    for (const b of Object.keys(summary.buckets)) summary.buckets[b] += c.buckets[b];
    if (c.dueCents > 0) { summary.dueToday++; summary.dueTodayCents += c.dueCents; }
    if (c.limitCents != null && c.owedCents > c.limitCents) summary.overLimit++;
  }
  return { today, summary, customers };
}

export async function customerDetail(env, merchant, source, key, now = Date.now()) {
  const { today, dayOf } = await merchantToday(env, merchant, now);
  const debtor = await debtorOf(env, merchant, source, key, dayOf);
  let acct = null;
  try { acct = await readAccount(env, merchant, source, key); } catch (e) { if (!missingTable(e)) throw e; }
  if (!debtor && !acct) return null;
  if (acct) acct = await reconcile(env, merchant, acct, debtor, now);
  let events = [];
  try {
    events = (await env.DB.prepare(`SELECT kind, amount_cents, actor, detail, ts FROM credit_events
      WHERE merchant = ? AND source = ? AND customer_key = ? ORDER BY ts DESC LIMIT 40`).bind(merchant, source, key).all()).results || [];
  } catch (_) { events = []; }
  const card = present(debtor, acct, today);
  return {
    today, customer: card,
    seed: card.hasSchedule || !(card.owedCents > 0) ? [] : seedRows(card.owedCents, addDays(today, 7), now, 'seed').map((r) => ({ amountCents: r.amountCents, dueDate: r.dueDate, note: '' })),
    collected: (acct ? acct.rows : []).filter((r) => r.status === 'collected').map((r) => ({ id: r.id, originalCents: r.originalCents, dueDate: r.dueDate, note: r.note, collectedTs: r.collectedTs })),
    history: debtor ? debtor.history : [],
    events: events.map((e) => ({ kind: e.kind, amountCents: Number(e.amount_cents) || 0, actor: e.actor, ts: Number(e.ts) || 0 })),
  };
}

/* ── écritures du patron ── */
export async function saveSchedule(env, merchant, source, key, body, actor, now = Date.now()) {
  const { today, dayOf } = await merchantToday(env, merchant, now);
  const debtor = await debtorOf(env, merchant, source, key, dayOf);
  if (!debtor) return { error: 'unknown-customer', status: 404 };
  let rows;
  if (body.seed === true) {
    const due = validDay(body.dueDate) ? body.dueDate : addDays(today, 7);
    rows = seedRows(debtor.owedCents, due, now, rid('cs'));
    if (!rows.length) return { error: 'nothing-owed', status: 409 };
  } else {
    const clean = cleanRows(body.rows, { now, origin: 'owner', makeId: () => rid('cs') });
    if (clean.error) return { error: clean.error, status: 400 };
    rows = clean.rows;
  }
  const baseRev = body.baseRev == null ? null : Number(body.baseRev);
  const out = await mutate(env, merchant, source, key, debtor, (acct) => {
    if (baseRev != null && acct.rev !== baseRev && !(baseRev === 0 && !acct.rows.length)) return { error: 'credit-schedule-changed', status: 409 };
    if (body.seed === true && pendingOf(acct.rows).length) return { error: 'schedule-exists', status: 409 };
    /* Une ligne gardée garde ce qu'un règlement en a déjà retiré. */
    const kept = new Map(pendingOf(acct.rows).map((r) => [r.id, r]));
    const nextRows = rows.map((r) => (kept.has(r.id) ? { ...kept.get(r.id), amountCents: r.amountCents, originalCents: Math.max(kept.get(r.id).originalCents, r.amountCents), dueDate: r.dueDate, note: r.note } : r));
    if (checkTotal(nextRows, debtor.owedCents)) return { error: 'schedule-exceeds-balance', status: 409, owedCents: debtor.owedCents };
    return { ...acct, rows: nextRows.concat(acct.rows.filter((r) => r.status === 'collected')) };
  }, now);
  if (out.error) return out;
  await logEvent(env, merchant, { source, key, kind: 'schedule', amountCents: rows.reduce((n, r) => n + r.amountCents, 0), actor }, now);
  return { ok: true, rev: out.account.rev };
}

export async function setLimit(env, merchant, source, key, limitCents, actor, now = Date.now()) {
  if (!(limitCents === null || (Number.isSafeInteger(limitCents) && limitCents >= 0 && limitCents <= MAX_CENTS))) return { error: 'bad-limit', status: 400 };
  const { dayOf } = await merchantToday(env, merchant, now);
  const debtor = await debtorOf(env, merchant, source, key, dayOf);
  if (!debtor && source === 'client') {
    const known = await env.DB.prepare('SELECT id FROM clients WHERE merchant = ? AND id = ? AND deleted = 0').bind(merchant, key).first();
    if (!known) return { error: 'unknown-customer', status: 404 };
  } else if (!debtor) return { error: 'unknown-customer', status: 404 };
  const out = await mutate(env, merchant, source, key, debtor, (acct) => ({ ...acct, limitCents }), now);
  if (out.error) return out;
  await logEvent(env, merchant, { source, key, kind: 'limit', amountCents: limitCents || 0, actor, detail: limitCents === null ? 'none' : '' }, now);
  return { ok: true, rev: out.account.rev };
}

export async function setPrefs(env, merchant, source, key, body, actor, now = Date.now()) {
  const lang = body.lang == null ? null : String(body.lang);
  if (lang != null && lang !== '' && !LANGS.includes(lang)) return { error: 'bad-lang', status: 400 };
  const reminded = body.reminded === true;
  const { dayOf } = await merchantToday(env, merchant, now);
  const debtor = await debtorOf(env, merchant, source, key, dayOf);
  if (!debtor) return { error: 'unknown-customer', status: 404 };
  const out = await mutate(env, merchant, source, key, debtor, (acct) => ({ ...acct,
    lang: lang == null ? acct.lang : lang, remindedTs: reminded ? now : acct.remindedTs }), now);
  if (out.error) return out;
  if (reminded) await logEvent(env, merchant, { source, key, kind: 'reminded', amountCents: debtor.owedCents, actor, detail: out.account.lang || '' }, now);
  return { ok: true, rev: out.account.rev, remindedTs: out.account.remindedTs };
}

/* ── le comptoir ── */
/* La caisse demande avant une vente à crédit. Elle envoie aussi ce qu'elle voit
 * dû (une dette pas encore synchronisée) : le plus grand des deux compte. */
export async function limitCheck(env, merchant, source, key, addCents, localOwedCents, now = Date.now()) {
  const { dayOf } = await merchantToday(env, merchant, now);
  let debtor = null;
  try { debtor = await debtorOf(env, merchant, source, key, dayOf); } catch (_) { debtor = null; }
  let acct = null;
  try { acct = await readAccount(env, merchant, source, key); } catch (e) { if (!missingTable(e)) throw e; }
  const owed = Math.max(debtor ? debtor.owedCents : 0, Math.max(0, cents(localOwedCents || 0)));
  return limitDecision({ owedCents: owed, addCents, limitCents: acct ? acct.limitCents : null });
}

export async function tillLimits(env, merchant) {
  try {
    const res = await env.DB.prepare('SELECT source, customer_key, limit_cents FROM credit_accounts WHERE merchant = ? AND limit_cents IS NOT NULL').bind(merchant).all();
    return Object.fromEntries((res.results || []).map((r) => [r.source + ':' + r.customer_key, Number(r.limit_cents)]));
  } catch (e) { if (missingTable(e)) return {}; throw e; }
}

/* « Paiera le … » : une ligne d'échéancier posée au comptoir avec la vente.
 * Rejouée (l'id vient de la caisse), elle n'est écrite qu'une fois. */
export async function addPromise(env, merchant, source, key, body, actor, now = Date.now()) {
  const id = String(body.id || '');
  const amount = body.amountCents;
  if (!ROW_ID.test(id) || !Number.isSafeInteger(amount) || amount < 1 || amount > MAX_CENTS || !validDay(body.dueDate)) return { error: 'bad-promise', status: 400 };
  const { today, dayOf } = await merchantToday(env, merchant, now);
  if (body.dueDate < today || body.dueDate > addDays(today, 366)) return { error: 'bad-promise-date', status: 400 };
  /* Une lecture ratée n'est pas « client inconnu » : la marque de départ en
     dépend (sinon d'anciens règlements tomberaient sur cette promesse). */
  const debtor = await debtorOf(env, merchant, source, key, dayOf);
  if (source === 'client' && !debtor) {
    const known = await env.DB.prepare('SELECT id FROM clients WHERE merchant = ? AND id = ? AND deleted = 0').bind(merchant, key).first();
    if (!known) return { error: 'unknown-customer', status: 404 };
  }
  let fresh = false;
  const out = await mutate(env, merchant, source, key, debtor, (acct) => {
    if (acct.rows.some((r) => r.id === id)) return { error: 'duplicate', duplicate: true };
    if (pendingOf(acct.rows).length >= 24) return { error: 'schedule-too-long', status: 409 };
    fresh = true;
    return { ...acct, rows: acct.rows.concat([{ id, amountCents: amount, originalCents: amount, dueDate: body.dueDate,
      note: String(body.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NOTE_MAX), status: 'pending', origin: 'till', createdTs: now, collectedTs: 0 }]) };
  }, now);
  if (out.duplicate) return { ok: true, duplicate: true };
  if (out.error) return out;
  if (fresh) await logEvent(env, merchant, { id: 'promise-' + id, source, key, kind: 'promise', amountCents: amount, actor, detail: body.dueDate }, now);
  return { ok: true, rev: out.account.rev, duplicate: !fresh };
}
