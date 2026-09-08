// Detailed pre-invoices only. No payment, tax approval or accounting posting.
import { dateOK, text, problem } from './_commercial.js';
export const draftIdOK = v => typeof v === 'string' && /^[A-Za-z0-9:_-]{8,64}$/.test(v);
const cents = v => Number.isSafeInteger(v) && v >= 0 && v <= 10000000000;
export async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function draftSource(stays, accounts = []) {
  const lines = [], payers = new Map(), rooms = [];
  for (const a of accounts.filter(a=>!a.archived)) payers.set('account:'+a.id,{id:'account:'+a.id,name:a.legalName||a.name,kind:a.kind,address:a.address,ice:a.ice,taxId:a.taxId,rc:a.rc});
  for (const b of stays) {
    const h=b.hotel, total=Math.round(Number(h?.total)*100);
    if (!b.id || !h || !dateOK(h.checkIn) || !dateOK(h.checkOut) || !cents(total)) problem('billing-source-invalid');
    const guest='guest:'+b.id, account=b.commercial?.billTo;
    payers.set(guest,{id:guest,name:text(b.customer?.name)||'Voyageur',kind:'individual',address:''});
    if (account) payers.set('account:'+account.id,{id:'account:'+account.id,name:account.legalName||account.name,kind:account.kind,address:account.address,ice:account.ice,taxId:account.taxId,rc:account.rc});
    const payer=account?'account:'+account.id:guest;
    rooms.push({id:b.id,code:b.code,roomId:b.resourceId,name:b.customer?.name,status:b.status,checkIn:h.checkIn,checkOut:h.checkOut,dayUse:h.dayUse===true,arrivalTime:h.arrivalTime,departureTime:h.departureTime});
    if (['cancelled','no_show','requested'].includes(b.status)) continue;
    if (!['confirmed','checked_in','completed'].includes(b.status)) problem('billing-source-invalid');
    const nights=(Date.parse(h.checkOut+'T12:00:00Z')-Date.parse(h.checkIn+'T12:00:00Z'))/86400000;
    if (h.dayUse ? nights!==0 : !Number.isInteger(nights)||nights<1||nights>365) problem('billing-source-invalid');
    const q=b.commercial?.quoted?b.commercial.quote:null;
    if (q && (q.taxBasis!=='inclusive' || q.rows?.length!==nights || q.totalCents!==total)) problem('billing-source-invalid');
    const count=h.dayUse?1:nights;
    for (let i=0;i<count;i++) {
      const date=new Date(Date.parse(h.checkIn+'T12:00:00Z')+i*86400000).toISOString().slice(0,10);
      const r=q?.rows[i], amount=r?r.amountCents:Math.floor(total/count)+(i<total%count?1:0);
      if (!cents(amount) || (r && r.date!==date)) problem('billing-source-invalid');
      lines.push({id:'stay:'+b.id+':'+date,stayId:b.id,date,roomId:b.resourceId,occupants:b.partySize,
        label:h.dayUse?'Day-use · '+h.arrivalTime+'–'+h.departureTime:(r?.label||h.roomTypeName||'Hébergement'),
        board:b.commercial?.board||'room_only',quantity:r?.quantity||1,amountCents:amount,kind:h.dayUse?'day_use':'lodging',payer});
    }
    if (q && q.rows.reduce((s,r)=>s+r.amountCents,0)!==total) problem('billing-source-invalid');
  }
  if(lines.length>2000) problem('billing-limit');
  return {lines,payers:[...payers.values()],rooms};
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
  return {v:1,kind:'preinvoice',currency:'MAD',lines,totalCents,
    payers:[...totals].map(([id,amountCents])=>({...payers.get(id),amountCents})),
    note:text(input.note,1000),taxStatus:'unverified',paymentStatus:'not-reconciled',finalizable:false};
}
