import { DateTimeFormat } from '../_zone-law.js';
// Detailed pre-invoices only. No payment, tax approval or accounting posting.
// The draft now says WHY it is not final: which line lacks which tax fact,
// and what the server knows of the payments. It still issues nothing.
import { dateOK, text, problem } from './_commercial.js';
import { VAT_RATES } from '../invoices.js';
export const draftIdOK = v => typeof v === 'string' && /^[A-Za-z0-9:_-]{8,64}$/.test(v);
const cents = v => Number.isSafeInteger(v) && v >= 0 && v <= 10000000000;
export async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function draftSource(stays, accounts = [], roomCharges = [], folios = null) {
  const lines = [], payers = basePayers(accounts), rooms = [];
  for (const b of stays) {
    const h=b.hotel, total=Math.round(Number(h?.total)*100);
    if (!b.id || !h || !dateOK(h.checkIn) || !dateOK(h.checkOut) || !cents(total)) problem('billing-bad-stay');
    addStayPayers(payers, b);
    const payer=payerFor(payers, b);
    rooms.push(roomCard(b));
    if (['cancelled','no_show','requested'].includes(b.status)) continue;
    if (!['confirmed','checked_in','completed'].includes(b.status)) problem('billing-bad-status');
    const nights=(Date.parse(h.checkOut+'T12:00:00Z')-Date.parse(h.checkIn+'T12:00:00Z'))/86400000;
    if (h.dayUse ? nights!==0 : !Number.isInteger(nights)||nights<1||nights>365) problem('billing-bad-dates');
    const q=b.commercial?.quoted?b.commercial.quote:null;
    if (q && (q.taxBasis!=='inclusive' || q.rows?.length!==nights || q.totalCents!==total)) problem('billing-quote-mismatch');
    const count=h.dayUse?1:nights;
    for (let i=0;i<count;i++) {
      const date=new Date(Date.parse(h.checkIn+'T12:00:00Z')+i*86400000).toISOString().slice(0,10);
      const r=q?.rows[i], amount=r?r.amountCents:Math.floor(total/count)+(i<total%count?1:0);
      if (!cents(amount) || (r && r.date!==date)) problem('billing-quote-mismatch');
      lines.push({id:'stay:'+b.id+':'+date,stayId:b.id,date,roomId:b.resourceId,occupants:b.partySize,
        label:h.dayUse?'Day-use · '+h.arrivalTime+'–'+h.departureTime:(r?.label||h.roomTypeName||'Hébergement'),
        board:b.commercial?.board||'room_only',quantity:r?.quantity||1,amountCents:amount,kind:h.dayUse?'day_use':'lodging',payer});
    }
    if (q && q.rows.reduce((s,r)=>s+r.amountCents,0)!==total) problem('billing-quote-mismatch');
  }
  const staysById = new Map(stays.map(b => [b.id, b]));
  const reversed = new Set(roomCharges.filter(c => c?.kind === 'room-charge-reversal' && c.reversalOf).map(c => c.reversalOf));
  for (const c of roomCharges) {
    if (!c || c.kind !== 'room-charge' || reversed.has(c.id)) continue;
    const b = staysById.get(c.stayId), amount = Number(c.amountCents), occurredTs = Number(c.occurredTs);
    if (!b || !c.id || c.roomId !== b.resourceId || !cents(amount) || amount < 1 || !Number.isSafeInteger(occurredTs) || occurredTs < 1) problem('billing-bad-room-charge');
    const payer = payerFor(payers, b);
    const date = new DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(occurredTs));
    lines.push({ id:'charge:'+c.id, stayId:b.id, date, roomId:b.resourceId, occupants:0,
      label:text(c.label, 120)||'Consommation chambre', quantity:1, amountCents:amount, kind:'room_charge', payer });
  }
  if(lines.length>2000) problem('billing-limit');
  return {lines,payers:[...payers.values()],rooms,payments:paymentFacts(stays,folios)};
}
/* What the server itself knows was paid for these stays. Only a dashboard
 * folio explicitly linked by stayId counts (same rule as stayBalance): a room
 * number alone can name a later guest, and the hotel till journals its
 * payments as day sales that carry no stay. Anything the server cannot see
 * is listed as an issue, never guessed as paid or as owed. */
function paymentFacts(stays, folios) {
  if (!Array.isArray(folios)) return {paidCents:0,issues:[{stayId:null,issue:'folios-unavailable'}]};
  let paidCents=0; const issues=[];
  const money=v=>{const n=Math.round(Number(v)*100);return Number.isSafeInteger(n)?n:null;};
  for (const b of stays) {
    if (!['confirmed','checked_in','completed'].includes(b.status)) continue;
    const own=folios.filter(f=>f && f.stayId===b.id);
    if (!own.length) { issues.push({stayId:b.id,issue:'no-linked-folio'}); continue; }
    let outside=0, outsideLines=0, unconfirmed=0, unreadable=false;
    for (const f of own) {
      for (const l of Array.isArray(f.lines)?f.lines:[]) {
        const amount=money(l?.amt);
        if (amount===null) { unreadable=true; continue; }
        if (l.paid===true) paidCents+=amount;
        if (l.src!=='room') { outside+=amount; outsideLines++; }
      }
      // A closed folio's departure balance went through the client's sale
      // queue under an id the server cannot rebuild: real, but unconfirmed.
      const settled=money(f.settlementAmount||0);
      if (settled===null) unreadable=true;
      else if (f.closedAt && settled) unconfirmed+=settled;
    }
    if (unreadable) issues.push({stayId:b.id,issue:'folio-unreadable'});
    if (outsideLines) issues.push({stayId:b.id,issue:'folio-lines-outside-draft',amountCents:outside});
    if (unconfirmed) issues.push({stayId:b.id,issue:'settlement-unconfirmed',amountCents:unconfirmed});
  }
  if (!Number.isSafeInteger(paidCents)) return {paidCents:0,issues:[{stayId:null,issue:'folio-unreadable'}]};
  return {paidCents,issues};
}
/* Tax facts per line. No hotel line carries a VAT rate today (stay prices are
 * accepted TTC without a rate, till room charges and extras neither), and the
 * server has no taxe de séjour rule: the till and the dashboard each hold
 * their own figure. Each line says exactly what is missing. */
function taxIssues(lines) {
  const issues=[];
  for (const l of lines) {
    const missing=[];
    if (!VAT_RATES.includes(l.vatRate)) missing.push('vatRate');
    if (l.kind==='lodging') missing.push('touristTax');
    if (missing.length) issues.push({lineId:l.id,missing});
  }
  return issues;
}
function paymentState(payments, totalCents) {
  const p=payments||{paidCents:0,issues:[{stayId:null,issue:'folios-unavailable'}]};
  if (p.issues.length) return {paymentStatus:'not-reconciled',paidCents:null,owedCents:null,paymentIssues:p.issues};
  if (p.paidCents===totalCents) return {paymentStatus:'reconciled',paidCents:p.paidCents,owedCents:0,paymentIssues:[]};
  if (p.paidCents<totalCents) return {paymentStatus:'partial',paidCents:p.paidCents,owedCents:totalCents-p.paidCents,paymentIssues:[]};
  return {paymentStatus:'not-reconciled',paidCents:p.paidCents,owedCents:null,paymentIssues:[{stayId:null,issue:'paid-exceeds-total',amountCents:p.paidCents-totalCents}]};
}
/* Rooms without money. Same cards as draftSource, but lenient: a stay whose
 * billing material is broken (legacy row, bad status, stale quote) still
 * lists, so the dossier never reads as "no rooms assigned" and the room can
 * be opened and repaired. Never used for amounts. */
export function draftRooms(stays, accounts = []) {
  const payers = basePayers(accounts), rooms = [];
  for (const b of stays || []) {
    if (!b || !b.id) continue;
    addStayPayers(payers, b);
    rooms.push(roomCard(b));
  }
  return {lines:[],payers:[...payers.values()],rooms};
}
function basePayers(accounts) {
  const payers = new Map();
  for (const a of (accounts || []).filter(a=>a && !a.archived)) payers.set('account:'+a.id,{id:'account:'+a.id,name:a.legalName||a.name,kind:a.kind,address:a.address,ice:a.ice,taxId:a.taxId,rc:a.rc});
  return payers;
}
function addStayPayers(payers, b) {
  const guest='guest:'+b.id, account=b.commercial?.billTo;
  if (!payers.has(guest)) payers.set(guest,{id:guest,name:text(b.customer?.name)||'Voyageur',kind:'individual',address:''});
  if (account) payers.set('account:'+account.id,{id:'account:'+account.id,name:account.legalName||account.name,kind:account.kind,address:account.address,ice:account.ice,taxId:account.taxId,rc:account.rc});
}
function payerFor(payers, b) {
  const account=b.commercial?.billTo;
  return account?'account:'+account.id:'guest:'+b.id;
}
function roomCard(b) {
  const h=b.hotel || {};
  return {id:b.id,code:b.code||'',roomId:b.resourceId||'',name:b.customer?.name||'',status:b.status||'',checkIn:h.checkIn||'',checkOut:h.checkOut||'',dayUse:h.dayUse===true,arrivalTime:h.arrivalTime||'',departureTime:h.departureTime||''};
}
export function buildDraft(source, input) {
  if (!Array.isArray(input.extras)||input.extras.length>200||!Array.isArray(input.allocations)||input.allocations.length>2200) problem('invalid-draft');
  const ids=new Set(source.lines.map(l=>l.id)), payers=new Map(source.payers.map(p=>[p.id,p]));
  const extras=input.extras.map(e=>{
    if(!draftIdOK(e.id)||ids.has('extra:'+e.id)||!dateOK(e.date)||!text(e.label)||!Number.isSafeInteger(e.quantity)||e.quantity<1||e.quantity>10000||!cents(e.unitCents)||e.unitCents*e.quantity>10000000000||!payers.has(e.payer)) problem('invalid-extra');
    ids.add('extra:'+e.id);
    return {id:'extra:'+e.id,date:e.date,label:text(e.label),quantity:e.quantity,unitCents:e.unitCents,amountCents:e.unitCents*e.quantity,kind:'extra',payer:e.payer,roomId:'',occupants:0};
  });
  const allocations=new Map();
  for(const a of input.allocations){
    if(!ids.has(a.lineId)||allocations.has(a.lineId)||!Array.isArray(a.parts)||a.parts.length<1||a.parts.length>2) problem('invalid-allocation');
    const seen=new Set();
    const parts=a.parts.map(p=>{
      if(!payers.has(p.payer)||seen.has(p.payer)||!cents(p.amountCents)) problem('invalid-allocation');
      seen.add(p.payer);return {payer:p.payer,amountCents:p.amountCents};
    });
    allocations.set(a.lineId,parts);
  }
  const lines=[...source.lines,...extras].map(l=>{
    const parts=allocations.get(l.id)||[{payer:l.payer,amountCents:l.amountCents}];
    if(parts.reduce((s,p)=>s+p.amountCents,0)!==l.amountCents) problem('allocation-unbalanced');
    return {...l,parts};
  });
  const totalCents=lines.reduce((s,l)=>s+l.amountCents,0);
  if(!cents(totalCents)) problem('billing-limit');
  const totals=new Map();
  for(const l of lines) for(const p of l.parts)totals.set(p.payer,(totals.get(p.payer)||0)+p.amountCents);
  const taxes=taxIssues(lines);
  // Draft-only policy: this route never issues a fiscal invoice or allocates
  // an invoice number. Missing tax facts and unlinked payments stay explicit.
  return {v:1,kind:'preinvoice',issuancePolicy:'draft-only',currency:'MAD',lines,totalCents,
    payers:[...totals].map(([id,amountCents])=>({...payers.get(id),amountCents})),
    note:text(input.note,1000),taxStatus:taxes.length?'unverified':'verified',taxIssues:taxes,
    ...paymentState(source.payments,totalCents),finalizable:false};
}
