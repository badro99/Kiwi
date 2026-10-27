// Refunds are owner-authorized bank payments, never offline debt edits.
import { activeAccountSession, json } from '../auth/_lib.js';

export function creditBook(doc) { return doc?.verticals?.epicerie?.data?.carnet || []; }
const cents = h => Math.round(Number(h.amt) * 100);
export function creditRefundEdit(oldDoc, newDoc) {
  const entries = doc => creditBook(doc).flatMap(c => (c.hist || []).map(h => [c.id + ':' + (h.id || JSON.stringify([h.type,h.amt,h.at,h.label])), h]));
  const old = new Map(entries(oldDoc)), pairs = entries(newDoc), next = new Map(pairs);
  if (next.size !== pairs.length) return true;
  for (const [id, h] of old) {
    const n = next.get(id);
    if (!n || JSON.stringify(n) !== JSON.stringify(h)) return true;
  }
  const balances = new Map(creditBook(oldDoc).map(c => [c.id, (c.hist || []).reduce((n,h) => n + (h.type === 'debt' ? 1 : -1) * cents(h), 0)]));
  for (const [id, h] of next) {
    if (old.has(id)) continue;
    if (!['debt','pay'].includes(h.type) || !Number.isSafeInteger(cents(h)) || cents(h) < 1
      || Math.abs(Number(h.amt) * 100 - cents(h)) > 1e-6) return true;
    // The authenticated refund marker cannot be supplied by document edits.
    if (h.kind === 'advance-refund') return true;
  }
  for (const c of creditBook(newDoc)) {
    let balance = balances.get(c.id) || 0;
    for (const h of c.hist || []) {
      const id = c.id + ':' + (h.id || JSON.stringify([h.type,h.amt,h.at,h.label]));
      if (old.has(id)) continue;
      if (h.type === 'debt' && balance < 0) return true;
      balance += (h.type === 'debt' ? 1 : -1) * cents(h);
    }
  }
  return false;
}

/* A debt may not consume an advance: only the owner's refund pays one back
 * (wave D, creditRefundEdit). That refusal used to answer 409 for the device's
 * whole push, so one customer holding an advance (the double settlement of
 * wave Q) blocked every other customer and every other trade on that till.
 * This names, per customer, the NEW debts the rule refuses, so the caller can
 * keep that customer's stored entries, alert on that customer, and accept the
 * rest. Same walk as creditRefundEdit; a refused debt does not count. */
export function advanceDebtConflicts(oldDoc, newDoc) {
  const key = (c, h) => c.id + ':' + (h.id || JSON.stringify([h.type,h.amt,h.at,h.label]));
  const old = new Set(creditBook(oldDoc).flatMap(c => (c.hist || []).map(h => key(c, h))));
  const balances = new Map(creditBook(oldDoc).map(c => [c.id, (c.hist || []).reduce((n,h) => n + (h.type === 'debt' ? 1 : -1) * cents(h), 0)]));
  const out = [];
  for (const c of creditBook(newDoc)) {
    let balance = balances.get(c.id) || 0;
    const debts = [];
    for (const h of c.hist || []) {
      if (old.has(key(c, h))) continue;
      if (h.type === 'debt' && balance < 0) { debts.push({ key: key(c, h), entryId: String(h.id || ''), debtCents: cents(h), at: String(h.at || '') }); continue; }
      balance += (h.type === 'debt' ? 1 : -1) * cents(h);
    }
    if (debts.length) out.push({ clientId: c.id, debts });
  }
  return out;
}

// The customer keeps its stored entries; one alert per refused debt, and an
// alert whose debt has since been accepted (advance refunded) goes away.
export function keepAdvanceConflicts(stored, merged, conflicts) {
  const byId = new Map(conflicts.map(x => [String(x.clientId), x]));
  const was = new Map((Array.isArray(stored) ? stored : []).map(c => [String(c.id), c]));
  for (const c of merged) {
    const hit = byId.get(String(c.id));
    if (hit) c.hist = JSON.parse(JSON.stringify((was.get(String(c.id)) || {}).hist || []));
    const have = new Set((c.hist || []).map(h => c.id + ':' + (h.id || JSON.stringify([h.type,h.amt,h.at,h.label]))));
    const alerts = (c.creditAlerts || []).filter(a => a && (a.kind !== 'debt-on-advance' || !have.has(a.entryKey)));
    for (const d of hit ? hit.debts : []) {
      if (!alerts.some(a => a.id === 'debt-on-advance:' + d.key))
        alerts.push({ id: 'debt-on-advance:' + d.key, kind: 'debt-on-advance', entryKey: d.key, entryId: d.entryId, debtCents: d.debtCents, at: d.at });
    }
    const kept = alerts.filter(a => a.kind !== 'debt-on-advance').concat(alerts.filter(a => a.kind === 'debt-on-advance').slice(-20));
    if (kept.length) c.creditAlerts = kept; else delete c.creditAlerts;
  }
  return merged;
}

export async function refundCreditBook(request, env, merchant, body) {
  const session = await activeAccountSession(request, env);
  const owner = session && await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?').bind(merchant).first();
  if (!session || owner?.account_id !== session.aid) return json({error:'owner-required'},403);
  const id = String(body.id || ''), clientId = String(body.clientId || ''), amount = Number(body.amountCents);
  if (!/^[A-Za-z0-9_:.-]{6,64}$/.test(id) || !clientId || !Number.isSafeInteger(amount) || amount < 1 || amount > 20000000 || body.method !== 'transfer') return json({error:'bad-credit-refund'},400);
  /* The book lives in its own document (_credit-book-store.js). Until the
     first verticalops write moves it there, a refund reads the legacy copy and
     creates that document itself (INSERT ... DO NOTHING: a racing write makes
     this attempt start over). */
  for (let attempt=0; attempt<5; attempt++) {
    const row = await env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'creditbook'").bind(merchant).first();
    let book;
    if (row) {
      try { book = JSON.parse(row.data).carnet; } catch (_) { book = null; }
    } else {
      const legacy = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'verticalops'").bind(merchant).first();
      try { book = creditBook(JSON.parse(legacy?.data)); } catch (_) { book = null; }
    }
    if (!Array.isArray(book)) return json({error:'credit-book-unavailable'},503);
    const customer = book.find(c => c.id === clientId);
    const prior = book.flatMap(c => (c.hist || []).map(h => ({c,h}))).find(x => x.h.refundId === id);
    if (prior) return prior.c.id === clientId && cents(prior.h) === amount
      ? json({ok:true,already:true,id,rev:Number(row?.rev)||0}) : json({error:'refund-id-conflict'},409);
    if (!customer) return json({error:'client-not-found'},404);
    const hist = customer.hist || [], balance = hist.reduce((n,h) => n + (h.type === 'debt' ? 1 : -1)*cents(h),0);
    if (!Number.isSafeInteger(balance) || amount > -balance) return json({error:'refund-exceeds-advance',availableCents:Math.max(0,-balance)},409);
    const now = Date.now(), saleId = 'crb-' + id;
    hist.push({id:saleId,type:'debt',kind:'advance-refund',refundId:id,amt:amount/100,label:'Remboursement avance',at:new Date(now).toISOString(),method:'transfer'});
    customer.hist = hist;
    const text = JSON.stringify({carnet: book}), rev = row ? Number(row.rev)+1 : 1;
    try {
      const result = await env.DB.batch([
        row
          ? env.DB.prepare("UPDATE store_docs SET data=?, rev=?, updated_ts=? WHERE merchant=? AND feature='creditbook' AND rev=?").bind(text,rev,now,merchant,row.rev)
          : env.DB.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?, 'creditbook', ?, 1, ?) ON CONFLICT(merchant,feature) DO NOTHING").bind(merchant,text,now),
        env.DB.prepare(`INSERT INTO sales (id,merchant,amount,amount_cents,method,label,ts,channel)
          SELECT ?,?, ?,?,'transfer','Remboursement avance',?,'credit-book' WHERE changes()=1`)
          .bind(saleId,merchant,-Math.round(amount/100),-amount,now),
        env.DB.prepare(`INSERT INTO sale_audit (merchant,sale_id,action,reason,note,actor_id,amount,amount_cents,method,sale_ts,impact,ts)
          SELECT ?,?,'credit-book-refund','advance-refund',?,?,?,?,'transfer',?,?,? WHERE changes()=1`)
          .bind(merchant,saleId,id,session.aid,Math.round(amount/100),amount,now,JSON.stringify({clientId,refundId:id}),now),
      ]);
      if (Number(result[0]?.meta?.changes) === 1) return json({ok:true,id,rev,amountCents:amount});
    } catch (_) { return json({error:'credit-refund-write-failed'},409); }
  }
  return json({error:'credit-book-busy'},409);
}

// One durable alert per debt snapshot settled independently by offline tills.
export function creditSettlementAlerts(doc) {
  for (const c of creditBook(doc)) {
    const groups = new Map();
    for (const h of c.hist || []) {
      if (h.type !== 'pay' || !h.offline || !h.settlementOf) continue;
      const g = groups.get(h.settlementOf) || new Map();
      g.set(h.id, h); groups.set(h.settlementOf, g);
    }
    const others = (c.creditAlerts || []).filter(a => a && a.kind !== 'offline-double-settlement');
    c.creditAlerts = others.concat([...groups].filter(([, g]) => g.size > 1).map(([key, g]) => ({
      id: 'offline-double:' + key, kind: 'offline-double-settlement',
      advanceCents: [...g.values()].reduce((n, h) => n + cents(h), 0) - Math.max(...[...g.values()].map(cents))
    })));
  }
  return doc;
}
