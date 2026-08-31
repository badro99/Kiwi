// Public Kiwi booking surface. It exposes availability, never another client's details.
import { json, limitCheck, limitFail, limitClear } from '../auth/_lib.js';
import { storeSubscriptionPending } from './_private.js';
import { poke } from './_live.js';

const ACTIVE = new Set(['requested', 'confirmed', 'checked_in']);
const ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const REF = /^[A-Za-z0-9_-]{8,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TZ = 'Africa/Casablanca';
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const num = (v, min, max, fallback) => Number.isFinite(+v) ? Math.max(min, Math.min(max, +v)) : fallback;
function normalizePhone(value) {
  let s = str(value, 32);
  if (!s) return '';
  if (/[A-Za-z]/.test(s)) return '';
  s = s.replace(/^(\+|00)(\d{1,3})\s*\(0\)/, '$1$2');
  if ((s.match(/\+/g) || []).length > 1 || s.indexOf('+') > 0) return '';
  s = s.replace(/[\s().-]/g, '');
  const explicit = s.startsWith('+') || s.startsWith('00');
  let digits = s.replace(/^\+|^00/, '');
  if (/^212[567]\d{8}$/.test(digits)) digits = '0' + digits.slice(3);
  else if (/^[567]\d{8}$/.test(digits)) digits = '0' + digits;
  if (/^0[567]\d{8}$/.test(digits)) return digits.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
  return explicit && /^[1-9]\d{6,14}$/.test(digits) ? '+' + digits : '';
}
function phoneKey(value) {
  const phone = normalizePhone(value), digits = phone.replace(/\D/g, '');
  return /^0[567]\d{8}$/.test(digits) ? '212' + digits.slice(1) : digits;
}

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
  out.bookings = (Array.isArray(d.bookings) ? d.bookings : []).slice(-4000).map((x) => ({ id: str(x?.id, 64), code: str(x?.code, 24), customer: { name: str(x?.customer?.name, 100), phone: str(x?.customer?.phone, 32), email: str(x?.customer?.email, 160) }, serviceId: str(x?.serviceId, 64), resourceId: str(x?.resourceId, 64), startAt: +x?.startAt || 0, endAt: +x?.endAt || 0, partySize: num(x?.partySize, 1, 999, 1), status: ['requested','confirmed','checked_in','completed','cancelled','no_show'].includes(x?.status) ? x.status : 'requested', source: ['public','staff','import'].includes(x?.source) ? x.source : 'staff', note: str(x?.note, 600), manageToken: str(x?.manageToken, 80), publicRef: str(x?.publicRef, 80), hotel: x?.hotel && typeof x.hotel === 'object' ? { roomTypeName:str(x.hotel.roomTypeName,100), checkIn:str(x.hotel.checkIn,10), checkOut:str(x.hotel.checkOut,10), nights:num(x.hotel.nights,1,365,1), rate:num(x.hotel.rate,0,1000000,0), total:num(x.hotel.total,0,100000000,0), channel:['direct','booking','airbnb','expedia','walkin','other'].includes(x.hotel.channel)?x.hotel.channel:(x.source==='public'?'direct':'other'), externalRef:str(x.hotel.externalRef,80), feedId:str(x.hotel.feedId,64), syncedAt:+x.hotel.syncedAt||0, conflict:!!x.hotel.conflict } : null, createdAt: +x?.createdAt || 0, updatedAt: +x?.updatedAt || 0 })).filter((x) => x.id && x.customer.name && x.serviceId && x.startAt && x.endAt > x.startAt);
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
function safeHotel(raw) {
  let d = raw; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { d = null; } }
  d = d && typeof d === 'object' ? d : {};
  const safePhoto = (x) => { const url=str(typeof x==='string'?x:x?.url,240); return /^\/api\/media\/[a-z0-9][a-z0-9-]{2,63}\/(?:hotel-room\/)?[a-z0-9-]{6,80}\.(?:jpe?g|png|webp|gif|avif)$/i.test(url)?{url,alt:str(x?.alt,120)}:null; };
  const types = (Array.isArray(d.roomTypes) ? d.roomTypes : []).slice(0,200).map((x) => ({
    id:str(x?.id,64), name:str(x?.name,100), rate:x?.rate == null ? null : num(x.rate,0,1000000,null),
    description:str(x?.description,300), maxGuests:num(x?.maxGuests,1,12,2), beds:str(x?.beds,80),
    sizeM2:x?.sizeM2 == null ? null : num(x.sizeM2,1,999,null), view:str(x?.view,80),
    amenities:(Array.isArray(x?.amenities) ? x.amenities : []).slice(0,12).map((v)=>str(v,40)).filter(Boolean),
    photos:(Array.isArray(x?.photos)?x.photos:[]).slice(0,8).map(safePhoto).filter(Boolean),
    public:x?.public !== false,
  })).filter((x)=>x.id&&x.name);
  const typeIds = new Set(types.map((x)=>x.id));
  const rooms = (Array.isArray(d.rooms) ? d.rooms : []).slice(0,1000).map((x)=>({
    id:str(x?.id,64), n:num(x?.n,1,9999,0), typeId:str(x?.typeId,64), status:['libre','sale','hs','occ','depart','arrivee'].includes(x?.status)?x.status:'libre', updatedAt:+x?.updatedAt||0,
  })).filter((x)=>x.id&&x.n&&typeIds.has(x.typeId));
  const folios = (Array.isArray(d.folios) ? d.folios : []).slice(0,1000).map((x)=>({ room:num(x?.room,1,9999,0), nights:num(x?.nights,1,365,1), updatedAt:+x?.updatedAt||0 })).filter((x)=>x.room);
  return { baseRate:d.baseRate == null ? null : num(d.baseRate,0,1000000,null), types, rooms, folios };
}
function hotelTrade(meta) { return /hotel|riad/.test(str(meta?.type,60).toLowerCase()); }
function stayRange(checkIn, checkOut, settings) {
  if (!DATE.test(checkIn) || !DATE.test(checkOut) || checkOut <= checkIn) return null;
  const nights = Math.round((Date.parse(checkOut+'T12:00:00Z')-Date.parse(checkIn+'T12:00:00Z'))/86400000);
  if (nights < 1 || nights > 365) return null;
  const startAt=zonedEpoch(checkIn,'15:00'), endAt=zonedEpoch(checkOut,'11:00'), now=Date.now();
  if (!startAt || !endAt || startAt < now + settings.minNoticeMinutes*60000 || startAt > now + settings.windowDays*86400000) return null;
  return { checkIn, checkOut, nights, startAt, endAt };
}
function currentRoomFree(hotel, room, startAt, endAt) {
  if (room.status === 'hs') return false;
  if (!['occ','depart','arrivee'].includes(room.status)) return true;
  /* Room.updatedAt is the check-in transition. A folio's updatedAt moves every
   * time restaurant, spa or minibar posts a charge, so using it here would
   * silently extend the stay and hide inventory after each room charge. */
  const folio=hotel.folios.find((x)=>x.room===room.n), stamp=room.updatedAt||folio?.updatedAt;
  const p=dateParts(stamp||Date.now(),TZ), day=`${p.year}-${p.month}-${p.day}`;
  const busyStart=zonedEpoch(day,'15:00'), busyEnd=zonedEpoch(addDays(day,folio?.nights||1),'11:00');
  return !overlaps(startAt,endAt,busyStart,busyEnd);
}
function hotelCategories(doc, hotel, stay, guests, onlyType='') {
  guests=num(guests,1,12,1);
  return hotel.types.filter((t)=>t.public&&t.maxGuests>=guests&&(!onlyType||t.id===onlyType)).map((t)=>{
    const rate=t.rate == null ? hotel.baseRate : t.rate;
    const rooms=hotel.rooms.filter((r)=>r.typeId===t.id&&currentRoomFree(hotel,r,stay.startAt,stay.endAt)&&free(doc,r.id,stay.startAt,stay.endAt));
    return { ...t, rate, total:rate == null ? null : Math.round(rate*stay.nights), rooms };
  }).filter((t)=>t.rate != null);
}
function publicHotelCategory(x) { return { id:x.id,name:x.name,description:x.description,maxGuests:x.maxGuests,beds:x.beds,sizeM2:x.sizeM2,view:x.view,amenities:x.amenities,photos:x.photos,rate:x.rate,total:x.total,available:x.rooms.length }; }
async function readRows(env, merchant) {
  const rows = await env.DB.batch([
    env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'reservations'").bind(merchant),
    env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'hours'").bind(merchant),
    env.DB.prepare('SELECT name, type FROM merchant_config WHERE merchant = ?').bind(merchant),
    env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(merchant),
    env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'rooms'").bind(merchant),
  ]);
  const first = (r) => r?.results?.[0] || null;
  return { reservation: first(rows[0]), hours: publicHours(first(rows[1])?.data), merchant: first(rows[2]), team: safeTeam(first(rows[3])?.data), hotel:safeHotel(first(rows[4])?.data) };
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
  if (hotelTrade(rows.merchant)) {
    const checkIn=str(u.searchParams.get('checkIn'),10), checkOut=str(u.searchParams.get('checkOut'),10), guests=num(u.searchParams.get('guests'),1,12,2);
    let stay=null,categories=[];
    if (checkIn||checkOut) { stay=stayRange(checkIn,checkOut,doc.settings); if(!stay)return json({error:'invalid-dates'},400); categories=hotelCategories(doc,rows.hotel,stay,guests).map(publicHotelCategory); }
    else categories=rows.hotel.types.filter((t)=>t.public&&t.maxGuests>=guests).map((t)=>publicHotelCategory({...t,rate:t.rate==null?rows.hotel.baseRate:t.rate,total:null,rooms:[]})).filter((t)=>t.rate!=null);
    return json({ok:true,kind:'hotel',merchant,name:str(rows.merchant.name,100),trade:str(rows.merchant.type,60),settings:{confirmation:doc.settings.confirmation,cancellationHours:doc.settings.cancellationHours,windowDays:doc.settings.windowDays},hotel:{checkIn:stay?.checkIn||'',checkOut:stay?.checkOut||'',nights:stay?.nights||0,guests,categories}},200,{'Cache-Control':'no-store'});
  }
  const sid = str(u.searchParams.get('service'),64), date = str(u.searchParams.get('date'),10), rid = str(u.searchParams.get('resource'),64), partySize = num(u.searchParams.get('partySize'),1,999,1);
  let slots = [];
  if (sid && DATE.test(date)) { const svc = doc.services.find((x)=>x.id===sid && x.active); if (!svc) return json({ error:'service-not-found' },404); slots = slotsFor(doc,svc,date,rows.hours,rid,partySize,rows.team); }
  return json(publicConfig(merchant, rows.merchant, doc, slots),200,{ 'Cache-Control':'no-store' });
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error:'not-configured' },503);
  const limited = await limitCheck(request,env,'booking'); if (limited) return limited;
  let b; try { b=await request.json(); } catch (_) { await limitFail(request,env,'booking'); return json({error:'bad-json'},400); }
  const merchant=str(b?.merchant,64).toLowerCase(), ref=str(b?.ref,80), sid=str(b?.serviceId||b?.roomTypeId,64), asked=str(b?.resourceId,64), startAt=+b?.startAt||0;
  const name=str(b?.customer?.name,100), rawPhone=str(b?.customer?.phone,32), phone=normalizePhone(rawPhone), email=str(b?.customer?.email,160), partySize=num(b?.partySize,1,999,1);
  if(!ID.test(merchant)||!REF.test(ref)||!name||(!rawPhone&&!email)||rawPhone&&!phone||!sid){await limitFail(request,env,'booking');return json({error:'invalid'},400);}
  if(await storeSubscriptionPending(env,merchant))return json({error:'subscription-required'},402);
  for(let attempt=0;attempt<4;attempt++){
    let rows;try{rows=await readRows(env,merchant);}catch(_){return json({error:'unavailable'},503);}
    const doc=safeDoc(rows.reservation?.data), rev=+rows.reservation?.rev||0;
    if(!rows.merchant||!doc.settings.published)return json({error:'booking-closed'},409);
    const prior=doc.bookings.find((x)=>x.publicRef===ref);if(prior){await limitClear(request,env,'booking');return json({ok:true,id:prior.id,code:prior.code,status:prior.status,startAt:prior.startAt,manageToken:prior.manageToken,replayed:true});}
    const now=Date.now(), contactKey=(phoneKey(phone)||email).toLowerCase();
    const recentForContact=doc.bookings.filter((x)=>x.source==='public'&&x.createdAt>now-86400000&&((phone&&phoneKey(x.customer.phone)===contactKey)||String(x.customer.email||'').toLowerCase()===contactKey)).length;
    const activeFuture=doc.bookings.filter((x)=>ACTIVE.has(x.status)&&x.endAt>now).length;
    if(recentForContact>=5||activeFuture>=2000){await limitFail(request,env,'booking');return json({error:'booking-limit'},429);}
    if(hotelTrade(rows.merchant)){
      const stay=stayRange(str(b?.checkIn,10),str(b?.checkOut,10),doc.settings);if(!stay)return json({error:'invalid-dates'},400);
      const categories=hotelCategories(doc,rows.hotel,stay,partySize,sid),category=categories[0];
      if(!category||!category.rooms.length)return json({error:'room-unavailable'},409);
      const room=category.rooms[0],code='H-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),token=crypto.randomUUID().replace(/-/g,'');
      const rec={id:'bk-'+crypto.randomUUID(),code,customer:{name,phone,email},serviceId:category.id,resourceId:room.id,startAt:stay.startAt,endAt:stay.endAt,partySize,status:doc.settings.confirmation==='request'?'requested':'confirmed',source:'public',note:str(b?.note,600),manageToken:token,publicRef:ref,hotel:{roomTypeName:category.name,checkIn:stay.checkIn,checkOut:stay.checkOut,nights:stay.nights,rate:category.rate,total:category.total,channel:'direct',externalRef:''},createdAt:now,updatedAt:now};
      doc.bookings.push(rec);const text=JSON.stringify(doc),next=rev+1;
      try{let result;if(rev){result=await env.DB.prepare("UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = 'reservations' AND rev = ?").bind(text,next,now,merchant,rev).run();}else{result=await env.DB.prepare("INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'reservations', ?, 1, ?)").bind(merchant,text,now).run();}if((result?.meta?.changes||0)>0){await poke(env,merchant,'reservations');await limitClear(request,env,'booking');return json({ok:true,id:rec.id,code,status:rec.status,checkIn:stay.checkIn,checkOut:stay.checkOut,nights:stay.nights,total:category.total,manageToken:token});}}catch(_){return json({error:'write-failed'},503);}
      continue;
    }
    if(!startAt)return json({error:'invalid'},400);
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
