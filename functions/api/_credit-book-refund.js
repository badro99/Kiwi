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

export async function refundCreditBook(request, env, merchant, body) {
  const session = await activeAccountSession(request, env);
  const owner = session && await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?').bind(merchant).first();
  if (!session || owner?.account_id !== session.aid) return json({error:'owner-required'},403);
  const id = String(body.id || ''), clientId = String(body.clientId || ''), amount = Number(body.amountCents);
  if (!/^[A-Za-z0-9_:.-]{6,64}$/.test(id) || !clientId || !Number.isSafeInteger(amount) || amount < 1 || amount > 20000000 || body.method !== 'transfer') return json({error:'bad-credit-refund'},400);
  for (let attempt=0; attempt<5; attempt++) {
    const row = await env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'verticalops'").bind(merchant).first();
    let doc; try { doc = JSON.parse(row?.data); } catch (_) { return json({error:'credit-book-unavailable'},503); }
    const book = creditBook(doc), customer = book.find(c => c.id === clientId);
    const prior = book.flatMap(c => (c.hist || []).map(h => ({c,h}))).find(x => x.h.refundId === id);
    if (prior) return prior.c.id === clientId && cents(prior.h) === amount
      ? json({ok:true,already:true,id,rev:row.rev}) : json({error:'refund-id-conflict'},409);
    if (!customer) return json({error:'client-not-found'},404);
    const hist = customer.hist || [], balance = hist.reduce((n,h) => n + (h.type === 'debt' ? 1 : -1)*cents(h),0);
    if (!Number.isSafeInteger(balance) || amount > -balance) return json({error:'refund-exceeds-advance',availableCents:Math.max(0,-balance)},409);
    const now = Date.now(), saleId = 'crb-' + id;
    hist.push({id:saleId,type:'debt',kind:'advance-refund',refundId:id,amt:amount/100,label:'Remboursement avance',at:new Date(now).toISOString(),method:'transfer'});
    customer.hist = hist;
    const text = JSON.stringify(doc), rev = Number(row.rev)+1;
    try {
      const result = await env.DB.batch([
        env.DB.prepare("UPDATE store_docs SET data=?, rev=?, updated_ts=? WHERE merchant=? AND feature='verticalops' AND rev=?").bind(text,rev,now,merchant,row.rev),
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
