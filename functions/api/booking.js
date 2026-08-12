// Public Kiwi booking surface. It exposes availability, never another client's details.
import { json, limitCheck, limitFail, limitClear } from '../auth/_lib.js';
import { poke } from './_live.js';

const ACTIVE = new Set(['requested', 'confirmed', 'checked_in']);
const ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const REF = /^[A-Za-z0-9_-]{8,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TZ = 'Africa/Casablanca';
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v, min, max, fallback) => Number.isFinite(+v) ? Math.max(min, Math.min(max, +v)) : fallback;

function blank() {
  return { v: 1, settings: { published: false, confirmation: 'instant', minNoticeMinutes: 60, windowDays: 60, cancellationHours: 12, slotStep: 15, staffingEnabled: false, tablesPerStaff: 4 }, services: [], resources: [], blocked: [], bookings: [] };
}
function safeDoc(raw) {
  let d = raw;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { d = null; } }
  if (!d || typeof d !== 'object') return blank();
  const out = blank(), s = d.settings || {};
  out.settings = { published: !!s.published, confirmation: s.confirmation === 'request' ? 'request' : 'instant', minNoticeMinutes: num(s.minNoticeMinutes, 0, 10080, 60), windowDays: num(s.windowDays, 1, 365, 60), cancellationHours: num(s.cancellationHours, 0, 720, 12), slotStep: [5,10,15,20,30,60].includes(+s.slotStep) ? +s.slotStep : 15, staffingEnabled: !!s.staffingEnabled, tablesPerStaff: num(s.tablesPerStaff, 1, 12, 4), updatedAt: +s.updatedAt || 0 };
  out.services = (Array.isArray(d.services) ? d.services : []).slice(0, 120).map((x) => ({ id: str(x?.id, 64), name: str(x?.name, 100), duration: num(x?.duration, 5, 1440, 30), price: num(x?.price, 0, 1000000, 0), deposit: num(x?.deposit, 0, 1000000, 0), capacity: num(x?.capacity, 1, 999, 1), resourceIds: (Array.isArray(x?.resourceIds) ? x.resourceIds : []).slice(0, 60).map((z) => str(z, 64)).filter(Boolean), active: x?.active !== false, updatedAt: +x?.updatedAt || 0 })).filter((x) => x.id && x.name);
  out.resources = (Array.isArray(d.resources) ? d.resources : []).slice(0, 120).map((x) => ({ id: str(x?.id, 64), name: str(x?.name, 100), kind: ['person','room','table'].includes(x?.kind) ? x.kind : 'person', capacity: num(x?.capacity, 1, 999, 1), active: x?.active !== false, week: x?.week && typeof x.week === 'object' ? x.week : null, updatedAt: +x?.updatedAt || 0 })).filter((x) => x.id && x.name);
  out.blocked = (Array.isArray(d.blocked) ? d.blocked : []).slice(-500).map((x) => ({ id: str(x?.id, 64), resourceId: str(x?.resourceId, 64), startAt: +x?.startAt || 0, endAt: +x?.endAt || 0, reason: str(x?.reason, 120), updatedAt: +x?.updatedAt || 0 })).filter((x) => x.startAt && x.endAt > x.startAt);
  out.bookings = (Array.isArray(d.bookings) ? d.bookings : []).slice(-4000).map((x) => ({ id: str(x?.id, 64), code: str(x?.code, 24), customer: { name: str(x?.customer?.name, 100), phone: str(x?.customer?.phone, 32), email: str(x?.customer?.email, 160) }, serviceId: str(x?.serviceId, 64), resourceId: str(x?.resourceId, 64), startAt: +x?.startAt || 0, endAt: +x?.endAt || 0, partySize: num(x?.partySize, 1, 999, 1), status: ['requested','confirmed','checked_in','completed','cancelled','no_show'].includes(x?.status) ? x.status : 'requested', source: ['public','staff','import'].includes(x?.source) ? x.source : 'staff', note: str(x?.note, 600), manageToken: str(x?.manageToken, 80), publicRef: str(x?.publicRef, 80), createdAt: +x?.createdAt || 0, updatedAt: +x?.updatedAt || 0 })).filter((x) => x.id && x.customer.name && x.serviceId && x.startAt && x.endAt > x.startAt);
  return out;
}
function dateParts(epoch, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23', weekday:'short' }).formatToParts(new Date(epoch));
  const o = {}; parts.forEach((p) => { if (p.type !== 'literal') o[p.type] = p.value; }); return o;
}
function zonedEpoch(date, time, tz = TZ) {
  if (!DATE.test(date) || !HHMM.test(time)) return 0;
  const target = Date.parse(date + 'T' + time + ':00Z'); let guess = target;
  for (let i = 0; i < 3; i++) { const p = dateParts(guess, tz); const seen = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); guess += target - seen; }
  return guess;
}
function dayKey(date) { const d = new Date(date + 'T12:00:00Z'); return ['sun','mon','tue','wed','thu','fri','sat'][d.getUTCDay()]; }
function addDays(date, count) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0,10); }
function timeMin(v) { const m = HHMM.exec(String(v || '')); return m ? +m[1] * 60 + +m[2] : null; }
function publicHours(raw) {
  let h = raw;
  if (typeof h === 'string') { try { h = JSON.parse(h); } catch (_) { h = null; } }
  return h && typeof h === 'object' ? h : { week: {}, exceptions: [] };
}
function periodsFor(date, resource, hours) {
  const source = resource?.week || hours.week || {}, key = dayKey(date);
  let periods = source[key]?.open === false ? [] : (Array.isArray(source[key]?.periods) ? source[key].periods : []);
  const exception = (hours.exceptions || []).filter((x) => x && x.from <= date && x.to >= date).sort((a,b) => String(b.from).localeCompare(String(a.from)))[0];
  if (!resource?.week && exception) periods = exception.kind === 'hours' ? (exception.periods || []) : [];
  return periods.map((p) => ({ from: str(p?.from, 5), to: str(p?.to, 5) })).filter((p) => HHMM.test(p.from) && HHMM.test(p.to));
}
function overlaps(a0, a1, b0, b1) { return a0 < b1 && b0 < a1; }
function free(doc, rid, startAt, endAt) {
  if (doc.bookings.some((b) => ACTIVE.has(b.status) && b.resourceId === rid && overlaps(startAt, endAt, b.startAt, b.endAt))) return false;
  return !doc.blocked.some((b) => (!b.resourceId || b.resourceId === rid) && overlaps(startAt, endAt, b.startAt, b.endAt));
}
function candidates(doc, svc, asked, partySize) {
  const allowed = svc.resourceIds.length ? new Set(svc.resourceIds) : null;
  return doc.resources.filter((r) => r.active && r.capacity >= partySize && (!asked || r.id === asked) && (!allowed || allowed.has(r.id)));
}
/* The largest party this service can actually seat — the public page needs a
 * real number to draw its guest stepper. Reading it off the resources is the
 * only honest source: the seats live on the table, not on the service. */
function maxParty(doc, svc) {
  let top = 0;
  for (const r of candidates(doc, svc, '', 1)) if (r.capacity > top) top = r.capacity;
  return top || 1;
}
function safeTeam(raw) {
  let d = raw; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { d = null; } }
  return { members: Array.isArray(d?.members) ? d.members.slice(0,500) : [], shifts: d?.shifts && typeof d.shifts === 'object' ? d.shifts : {} };
}
function roleText(m) { return str([m?.role,m?.function,m?.department].filter(Boolean).join(' '),180).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function floorMember(m) { return /serveur|server|waiter|service|salle|rang|maitre|barista|barman|accueil|host|manager|proprietaire|owner|staff|equipier/.test(roleText(m)); }
function teamCoverage(team, startAt, endAt) {
  const p = dateParts(startAt,TZ), day = `${p.year}-${p.month}-${p.day}`, days = [addDays(day,-1),day];
  const members = team?.members || [], shifts = team?.shifts || {};
  const configuredToday = members.some((m) => Object.prototype.hasOwnProperty.call(shifts[m?.id] || {},day));
  const active = members.filter(floorMember).filter((m) => days.some((d) => {
    const s=(shifts[m?.id]||{})[d]; if(!s||s.off||!HHMM.test(s.start)||!HHMM.test(s.end))return false;
    const a=zonedEpoch(d,s.start,TZ),from=timeMin(s.start),to=timeMin(s.end),duration=to>from?to-from:1440-from+to,z=a+duration*60000;
    return a<=startAt&&z>=endAt;
  }));
  return { configured:configuredToday||active.length>0, count:active.length };
}
function staffAllows(doc, team, startAt, endAt) {
  if(!doc.settings.staffingEnabled)return true;
  const coverage=teamCoverage(team,startAt,endAt);if(!coverage.configured)return true;
  const concurrent=doc.bookings.filter((b)=>ACTIVE.has(b.status)&&overlaps(startAt,endAt,b.startAt,b.endAt)).length;
  return coverage.count>0&&concurrent<coverage.count*doc.settings.tablesPerStaff;
}
function slotsFor(doc, svc, date, hours, asked, partySize = 1, team = safeTeam(null)) {
  partySize = num(partySize, 1, 999, 1);
  const step = doc.settings.slotStep, now = Date.now(), earliest = now + doc.settings.minNoticeMinutes * 60000;
  const last = now + doc.settings.windowDays * 86400000, out = new Map();
  for (const r of candidates(doc, svc, asked, partySize)) {
    for (const p of periodsFor(date, r, hours)) {
      let a = timeMin(p.from), z = timeMin(p.to); if (a == null || z == null) continue; if (z <= a) z += 1440;
      for (let m = a; m + svc.duration <= z; m += step) {
        const hh = String(Math.floor((m % 1440) / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
        const startAt = zonedEpoch(addDays(date, Math.floor(m / 1440)), hh), endAt = startAt + svc.duration * 60000;
        if (startAt < earliest || startAt > last || !free(doc, r.id, startAt, endAt) || !staffAllows(doc,team,startAt,endAt)) continue;
        const old = out.get(startAt); if (!old) out.set(startAt, { startAt, endAt, resourceIds:[r.id] }); else old.resourceIds.push(r.id);
      }
    }
  }
  return [...out.values()].sort((a,b) => a.startAt - b.startAt).slice(0, 160);
}
async function readRows(env, merchant) {
  const rows = await env.DB.batch([
    env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'reservations'").bind(merchant),
    env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'hours'").bind(merchant),
    env.DB.prepare('SELECT name, type FROM merchant_config WHERE merchant = ?').bind(merchant),
    env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(merchant),
  ]);
  const first = (r) => r?.results?.[0] || null;
  return { reservation: first(rows[0]), hours: publicHours(first(rows[1])?.data), merchant: first(rows[2]), team: safeTeam(first(rows[3])?.data) };
}
function publicConfig(merchant, meta, doc, slots) {
  return { ok:true, merchant, name:str(meta?.name,100), trade:str(meta?.type,60), settings:{ confirmation:doc.settings.confirmation, cancellationHours:doc.settings.cancellationHours, windowDays:doc.settings.windowDays }, services:doc.services.filter((x)=>x.active).map((x)=>({id:x.id,name:x.name,duration:x.duration,price:x.price,deposit:x.deposit,capacity:x.capacity,maxParty:maxParty(doc,x)})), slots:slots || [] };
}
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error:'not-configured' },503);
  const u = new URL(request.url), merchant = str(u.searchParams.get('merchant'),64).toLowerCase();
  if (!ID.test(merchant)) return json({ error:'merchant-required' },400);
  let rows; try { rows = await readRows(env, merchant); } catch (_) { return json({ error:'unavailable' },503); }
  const doc = safeDoc(rows.reservation?.data);
  if (!rows.merchant || !doc.settings.published) return json({ error:'booking-closed' },404);
  const sid = str(u.searchParams.get('service'),64), date = str(u.searchParams.get('date'),10), rid = str(u.searchParams.get('resource'),64), partySize = num(u.searchParams.get('partySize'),1,999,1);
  let slots = [];
  if (sid && DATE.test(date)) { const svc = doc.services.find((x)=>x.id===sid && x.active); if (!svc) return json({ error:'service-not-found' },404); slots = slotsFor(doc,svc,date,rows.hours,rid,partySize,rows.team); }
  return json(publicConfig(merchant, rows.merchant, doc, slots),200,{ 'Cache-Control':'no-store' });
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error:'not-configured' },503);
  const limited = await limitCheck(request,env,'booking'); if (limited) return limited;
  let b; try { b=await request.json(); } catch (_) { await limitFail(request,env,'booking'); return json({error:'bad-json'},400); }
  const merchant=str(b?.merchant,64).toLowerCase(), ref=str(b?.ref,80), sid=str(b?.serviceId,64), asked=str(b?.resourceId,64), startAt=+b?.startAt||0;
  const name=str(b?.customer?.name,100), phone=str(b?.customer?.phone,32), email=str(b?.customer?.email,160), partySize=num(b?.partySize,1,999,1);
  if(!ID.test(merchant)||!REF.test(ref)||!name||(!phone&&!email)||!sid||!startAt){await limitFail(request,env,'booking');return json({error:'invalid'},400);}
  for(let attempt=0;attempt<4;attempt++){
    let rows;try{rows=await readRows(env,merchant);}catch(_){return json({error:'unavailable'},503);}
    const doc=safeDoc(rows.reservation?.data), rev=+rows.reservation?.rev||0;
    if(!rows.merchant||!doc.settings.published)return json({error:'booking-closed'},409);
    const prior=doc.bookings.find((x)=>x.publicRef===ref);if(prior){await limitClear(request,env,'booking');return json({ok:true,id:prior.id,code:prior.code,status:prior.status,startAt:prior.startAt,manageToken:prior.manageToken,replayed:true});}
    const now=Date.now(), contactKey=(phone||email).toLowerCase();
    const recentForContact=doc.bookings.filter((x)=>x.source==='public'&&x.createdAt>now-86400000&&(String(x.customer.phone||'').toLowerCase()===contactKey||String(x.customer.email||'').toLowerCase()===contactKey)).length;
    const activeFuture=doc.bookings.filter((x)=>ACTIVE.has(x.status)&&x.endAt>now).length;
    if(recentForContact>=5||activeFuture>=2000){await limitFail(request,env,'booking');return json({error:'booking-limit'},429);}
    const svc=doc.services.find((x)=>x.id===sid&&x.active);if(!svc)return json({error:'service-not-found'},409);
    const endAt=startAt+svc.duration*60000, date=dateParts(startAt,TZ), ymd=`${date.year}-${date.month}-${date.day}`;
    const validSlot=slotsFor(doc,svc,ymd,rows.hours,asked,partySize,rows.team).find((x)=>x.startAt===startAt);
    if(!validSlot)return json({error:'slot-unavailable'},409);
    const rid=asked&&validSlot.resourceIds.includes(asked)?asked:validSlot.resourceIds[0];
    const code='R-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(), token=crypto.randomUUID().replace(/-/g,'');
    const rec={id:'bk-'+crypto.randomUUID(),code,customer:{name,phone,email},serviceId:sid,resourceId:rid,startAt,endAt,partySize,status:doc.settings.confirmation==='request'?'requested':'confirmed',source:'public',note:str(b?.note,600),manageToken:token,publicRef:ref,createdAt:now,updatedAt:now};
    doc.bookings.push(rec);const text=JSON.stringify(doc),next=rev+1;
    try{
      let result;
      if(rev){result=await env.DB.prepare("UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = 'reservations' AND rev = ?").bind(text,next,now,merchant,rev).run();}
      else{result=await env.DB.prepare("INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'reservations', ?, 1, ?)").bind(merchant,text,now).run();}
      if((result?.meta?.changes||0)>0){await poke(env,merchant,'reservations');await limitClear(request,env,'booking');return json({ok:true,id:rec.id,code,status:rec.status,startAt,manageToken:token});}
    }catch(_){return json({error:'write-failed'},503);}
  }
  return json({error:'slot-unavailable'},409);
}
