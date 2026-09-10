#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestGet, onRequestPost } from '../functions/api/hotel/commercial.js';
import { onRequestPost as saveStay, onRequestGet as getStays } from '../functions/api/hotel/stays.js';
import { quote, contract, account, dateOK, commercialSnapshot, validateCommercialSync } from '../functions/api/hotel/_commercial.js';
import { onRequestPost as storePost } from '../functions/api/store.js';
import { onRequestPost as publicBooking } from '../functions/api/booking.js';
import { resetTableStateCacheForTests } from '../functions/api/hotel/_stay-events.js';
import { onRequestGet as productionGet } from '../functions/api/hotel/production.js';
import { monthWindow, monthlyProduction } from '../functions/api/hotel/_production.js';
import { onRequestGet as draftGet,onRequestPost as draftPost } from '../functions/api/hotel/billing-draft.js';
import { draftSource,buildDraft } from '../functions/api/hotel/_billing-draft.js';

const agency = { id: 'account-agency', kind: 'agency', name: 'Synthetic agency', legalName: 'Synthetic Agency SARL', paymentDays: 30, ice: 'SYNTHETIC' };
const low = { id: 'contract-low', name: 'Basse saison', accountId: agency.id, roomTypeId: 'standard', from: '2027-01-01', to: '2027-06-30', occupancy: 2, board: 'bb', unit: 'room', amountCents: 50035, taxBasis: 'inclusive' };
const high = { ...low, id: 'contract-high', name: 'Haute saison', from: '2027-07-01', to: '2027-08-31', amountCents: 80045 };
const input = { accountId: agency.id, roomTypeId: 'standard', checkIn: '2027-06-30', checkOut: '2027-07-02', occupancy: 2, board: 'bb' };
function directory() { return { accounts: [account(agency)], contracts: [contract(low), contract(high)] }; }

test('production clips cross-month room-nights, separates accounts and channels, excludes departures', () => {
  const row = { id: 'one', check_in: '2028-02-28', check_out: '2028-03-02', status: 'confirmed', room_id: '', channel: 'booking', raw_json: JSON.stringify({ commercial: { accountId: agency.id, billTo: agency } }) };
  const p = monthlyProduction([row, { ...row, id: 'direct', raw_json: '{}', check_in: '2028-02-29', check_out: '2028-03-01' }, ...['requested','cancelled','no_show'].map(status => ({ ...row, id: status, status }))], monthWindow('2028-02'));
  assert.equal(p.days, 29); assert.equal(p.nights, 3); assert.equal(p.reservations, 2); assert.equal(p.unassigned, 2);
  assert.equal(p.totals[27], 1); assert.equal(p.totals[28], 2);
  assert.equal(p.groups[0].kind, 'agency'); assert.equal(p.groups[1].name, 'Booking.com');
  assert.equal(monthWindow('2027-12').end, '2028-01-01');
  assert.throws(() => monthWindow('9999-12'), /bad-month/);
  assert.throws(() => monthWindow('2027-13'), /bad-month/);
  assert.throws(() => monthlyProduction([row, row], monthWindow('2028-02')), /production-data-invalid/);
  assert.throws(() => monthlyProduction([{ ...row, raw_json: 'broken' }], monthWindow('2028-02')), /production-data-invalid/);
  assert.throws(() => monthlyProduction([{ ...row, check_out: '2028-02-30' }], monthWindow('2028-02')), /production-data-invalid/);
});

test('production handler reads full D1 history without exposing guests and refuses missing/corrupt history', async () => {
  const f = await fixture();
  try {
    await f.seed();
    const created = await f.stay({ commercial: { accountId: agency.id, board: 'bb', quoted: true }, acceptQuote: true, quoteRevision: 3 });
    assert.equal(created.status, 200);
    f.sql.prepare("DELETE FROM store_docs WHERE feature='reservations'").run();
    const r = await f.call(productionGet, null, true, 'production?month=2027-07');
    assert.equal(r.status, 200); assert.equal(r.body.nights, 1);
    assert.equal(r.body.groups[0].name, agency.name);
    assert.doesNotMatch(JSON.stringify(r.body), /Synthetic Guest|customer_|owner-test|SYNTHETIC/);
    assert.equal((await f.call(productionGet, null, false, 'production?month=2027-07')).status, 401);
    assert.equal((await f.call(productionGet, null, true, 'production?month=2027-13')).status, 400);
    f.sql.prepare("UPDATE hotel_reservations SET raw_json='broken'").run();
    assert.equal((await f.call(productionGet, null, true, 'production?month=2027-07')).status, 503);
    f.sql.exec('DROP TABLE hotel_reservations');
    assert.equal((await f.call(productionGet, null, true, 'production?month=2027-07')).status, 503);
  } finally { f.sql.close(); }
});

async function fixture() {
  resetTableStateCacheForTests();
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const env = { AUTH_SECRET: 'synthetic-commercial-test-secret-only' }, merchant = 'commercial-test';
  sql.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)').run('owner-test', 'synthetic@example.test', 'Owner', 'Commercial test', 's', 'h', 1);
  sql.prepare('INSERT INTO merchant_config (merchant,features,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?)').run(merchant, '{}', 'hotel', 'owner-test', 'Synthetic hotel', 'active', 1);
  const rooms = { baseRate: 600, roomTypes: [{ id: 'standard', name: 'Standard', rate: 600, maxGuests: 3 }], rooms: [{ id: 'room:101', n: 101, typeId: 'standard', status: 'libre' }], folios: [] };
  sql.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)').run(merchant, 'rooms', JSON.stringify(rooms), 1, 1);
  const cookie = sessionCookie(await makeSession('owner-test', env.AUTH_SECRET)).split(';')[0];
  let race = false, draftRace = null;
  class Statement {
    constructor(query) { this.query = query; this.args = []; }
    bind(...args) { this.args = args; return this; }
    async first() { return sql.prepare(this.query).get(...this.args) || null; }
    async all() { return { results: sql.prepare(this.query).all(...this.args) }; }
    async run() {
      if(draftRace && this.query.startsWith('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) SELECT')){const fn=draftRace;draftRace=null;fn(sql);}
      if (race && this.query.startsWith('UPDATE store_docs SET data=?,rev=rev+1')) {
        race = false;
        sql.prepare("UPDATE store_docs SET rev=rev+1 WHERE merchant=? AND feature='hotel-commercial'").run(merchant);
      }
      return { meta: { changes: Number(sql.prepare(this.query).run(...this.args).changes) } };
    }
  }
  env.DB = { prepare: query => new Statement(query), batch: async statements => {
    sql.exec('BEGIN IMMEDIATE');
    try { const out = []; for (const s of statements) out.push(await (/^\s*SELECT\b/i.test(s.query) ? s.all() : s.run())); sql.exec('COMMIT'); return out; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  } };
  async function call(handler, body, auth = true, url = 'commercial') {
    const target = new URL('https://kiwi.test/api/hotel/' + url); target.searchParams.set('merchant', merchant);
    const response = await handler({ env, request: new Request(target, { method: body ? 'POST' : 'GET', headers: { ...(auth ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify({ merchant, ...body }) } : {}) }) });
    return { status: response.status, body: await response.json() };
  }
  const post = b => call(onRequestPost, b);
  async function seed() { await post({ action: 'account', rev: 0, item: agency }); await post({ action: 'contract', rev: 1, item: low }); await post({ action: 'contract', rev: 2, item: high }); }
  const stay = b => call(saveStay, { action: 'save', clientRef: 'test-stay-reference', roomTypeId: 'standard', resourceId: 'room:101', checkIn: input.checkIn, checkOut: input.checkOut, partySize: 2, channel: 'direct', status: 'confirmed', customer: { name: 'Synthetic Guest' }, ...b });
  return { sql, env, merchant, post, call, seed, stay, race() { race = true; },draftRace(fn){draftRace=fn;} };
}

test('preinvoice source conserves cents, separates same-day stays and keeps cancelled rooms without charges',()=>{
  const b={id:'booking-first',code:'H-TEST',status:'confirmed',partySize:2,resourceId:'room:101',customer:{name:'Guest'},hotel:{checkIn:'2027-07-01',checkOut:'2027-07-04',total:100.01,roomTypeName:'Standard'}};
  const source=draftSource([b,{...b,id:'booking-dayuse',hotel:{...b.hotel,dayUse:true,checkOut:'2027-07-01',arrivalTime:'09:00',departureTime:'14:00',total:12.35}},{...b,id:'booking-cancelled',status:'cancelled'}]);
  assert.deepEqual(source.lines.map(l=>l.amountCents),[3334,3334,3333,1235]);
  assert.equal(source.rooms.length,3);
  const d=buildDraft(source,{extras:[],allocations:[]});
  assert.equal(d.totalCents,11236);assert.equal(d.finalizable,false);assert.equal(d.paymentStatus,'not-reconciled');
  const p=monthlyProduction([{id:b.id,check_in:'2027-07-01',check_out:'2027-07-01',status:'confirmed',raw_json:JSON.stringify({hotel:{dayUse:true}})}],monthWindow('2027-07'));
  assert.equal(p.nights,0);
});
test('generic document sync cannot erase day-use hours, dossier membership or change lodging dates',async()=>{
  const f=await fixture();try{
    const response=await f.stay({dayUse:true,checkOut:input.checkIn,arrivalTime:'09:00',departureTime:'14:00',dayUseAmountCents:35025});
    assert.equal(response.status,200);const b=response.body.booking;
    const doc={bookings:[b]};assert.equal(await validateCommercialSync(f.env,f.merchant,doc,doc),true);
    for(const mutation of [h=>delete h.dossierId,h=>h.dayUse=false,h=>h.arrivalTime='06:00',h=>h.checkIn='2027-01-01',h=>h.nights=1]){
      const next=structuredClone(doc);mutation(next.bookings[0].hotel);
      await assert.rejects(validateCommercialSync(f.env,f.merchant,doc,next),/commercial-stays-use-api/);
    }
  }finally{f.sql.close();}
});
test('preinvoice splits must conserve every cent and refuse unknown payers, invalid dates and duplicate extras',()=>{
  const source={lines:[{id:'stay:test:date',amountCents:101,payer:'guest:test'}],payers:[{id:'guest:test',name:'Guest'},{id:'account:test',name:'Company'}]};
  const allocations=[{lineId:'stay:test:date',parts:[{payer:'guest:test',amountCents:50},{payer:'account:test',amountCents:51}]}];
  assert.deepEqual(buildDraft(source,{extras:[],allocations}).payers.map(p=>p.amountCents),[50,51]);
  const wrong=structuredClone(allocations);wrong[0].parts[0].amountCents=49;
  assert.throws(()=>buildDraft(source,{extras:[],allocations:wrong}),/allocation-unbalanced/);
  const unknown=structuredClone(allocations);unknown[0].parts[0].payer='other-tenant';
  assert.throws(()=>buildDraft(source,{extras:[],allocations:unknown}),/invalid-allocation/);
  const extra={id:'extra-test-001',date:'2027-07-01',label:'Meal',quantity:2,unitCents:1235,payer:'guest:test'};
  assert.equal(buildDraft(source,{extras:[extra],allocations}).totalCents,2571);
  assert.throws(()=>buildDraft(source,{extras:[extra,extra],allocations}),/invalid-extra/);
  assert.throws(()=>buildDraft(source,{extras:[{...extra,date:'2027-02-30'}],allocations}),/invalid-extra/);
  assert.throws(()=>buildDraft(source,{extras:[{...extra,unitCents:12.35}],allocations}),/invalid-extra/);
});
test('private preinvoice saves exact split snapshots, safely retries and blocks final invoices',async()=>{
  const f=await fixture();try{
    await f.seed();const stay=(await f.stay({commercial:{accountId:agency.id,board:'bb',quoted:true},acceptQuote:true,quoteRevision:3})).body.booking;
    const url='billing-draft?dossierId='+stay.id;
    const r=await f.call(draftGet,null,true,url);assert.equal(r.status,200,JSON.stringify(r.body));
    const d=r.body,parts=[{payer:'account:'+agency.id,amountCents:30000},{payer:'guest:'+stay.id,amountCents:20035}];
    const input={extras:[],allocations:[{lineId:d.preview.lines[0].id,parts}],note:'Synthetic only'};
    const command={action:'save-draft',dossierId:stay.id,rev:d.rev,sourceDigest:d.sourceDigest,directoryRev:d.directoryRev,commandId:'draft-command-001',input};
    const first=await f.call(draftPost,command);assert.equal(first.status,200,JSON.stringify(first.body));
    assert.deepEqual(first.body.saved.draft.lines[0].parts,parts);assert.equal(first.body.saved.draft.totalCents,130080);
    assert.equal(first.body.saved.actor.id,'owner-test');
    const replay=await f.call(draftPost,command);assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.rev,1);
    assert.equal((await f.call(draftPost,{...command,input:{...input,note:'changed'}})).status,409);
    assert.equal((await f.call(draftPost,{...command,action:'finalize'})).status,409);
    assert.equal((await f.call(draftGet,null,false,url)).status,401);
    assert.equal((await f.call(draftPost,command,false)).status,401);
    assert.equal((await f.call(draftGet,null,true,'billing-draft?dossierId=foreign-dossier')).status,404);
    f.sql.prepare('UPDATE hotel_reservations SET total=total+1 WHERE id=?').run(stay.id);
    // An inconsistent accepted quote fails closed for money, not a misleading
    // reprice, but the rooms still list (ticket #0003) with a named reason.
    const broken=await f.call(draftGet,null,true,url);
    assert.equal(broken.status,200,JSON.stringify(broken.body));
    assert.equal(broken.body.billingError,'billing-quote-mismatch');
    assert.equal(broken.body.preview,null);
    assert.equal(broken.body.source.rooms.length,1);
    assert.equal(broken.body.source.rooms[0].id,stay.id);
    assert.equal(broken.body.source.lines.length,0);
    assert.equal((await f.call(draftPost,command)).status,409);
  }finally{f.sql.close();}
});
test('dossier reads list rooms despite broken billing material, writes stay closed',async()=>{
  const f=await fixture();try{
    await f.seed();
    // Corrupt saved draft: reads ignore it for render, a fresh save heals it.
    const stay=(await f.stay({})).body.booking, url='billing-draft?dossierId='+stay.id;
    f.sql.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)").run(f.merchant,'hotel-billing-draft:'+stay.id,'{"draft":{"kind":"preinvoice"}}',1,1);
    const unread=await f.call(draftGet,null,true,url);
    assert.equal(unread.status,200,JSON.stringify(unread.body));
    assert.equal(unread.body.savedWarning,'saved-unreadable');
    assert.equal(unread.body.saved,null);
    assert.equal(unread.body.preview.totalCents,unread.body.source.lines.reduce((s,l)=>s+l.amountCents,0));
    const heal={action:'save-draft',dossierId:stay.id,rev:1,sourceDigest:unread.body.sourceDigest,directoryRev:unread.body.directoryRev,commandId:'draft-heal-0001',input:{extras:[],allocations:[]}};
    const healed=await f.call(draftPost,heal);
    assert.equal(healed.status,200,JSON.stringify(healed.body));
    // Legacy row without hotel in raw_json: the columns carry the stay, so
    // billing still builds instead of bricking the dossier.
    const stay2=(await f.stay({clientRef:'legacy-row-reference',checkIn:'2027-07-10',checkOut:'2027-07-11'})).body.booking, url2='billing-draft?dossierId='+stay2.id;
    f.sql.prepare('UPDATE hotel_reservations SET raw_json=? WHERE id=?').run('{"id":"legacy"}',stay2.id);
    const legacy=await f.call(draftGet,null,true,url2);
    assert.equal(legacy.status,200,JSON.stringify(legacy.body));
    assert.equal(legacy.body.source.rooms.length,1);
    assert.equal(legacy.body.source.rooms[0].roomId,'room:101');
    assert.equal(legacy.body.billingError,null);
    assert.ok(legacy.body.preview && legacy.body.preview.lines.length > 0);
    // Same legacy shape plus a corrupted date column: the room still lists,
    // billing names its reason and writes stay closed.
    f.sql.prepare("UPDATE hotel_reservations SET check_in='09.09.2026' WHERE id=?").run(stay2.id);
    const legacyBad=await f.call(draftGet,null,true,url2);
    assert.equal(legacyBad.status,200,JSON.stringify(legacyBad.body));
    assert.equal(legacyBad.body.source.rooms.length,1);
    assert.equal(legacyBad.body.source.rooms[0].roomId,'room:101');
    assert.equal(legacyBad.body.preview,null);
    assert.equal(legacyBad.body.billingError,'billing-bad-stay');
    assert.equal((await f.call(draftPost,{action:'save-draft',dossierId:stay2.id,rev:0,sourceDigest:legacyBad.body.sourceDigest,directoryRev:legacyBad.body.directoryRev,commandId:'draft-legacy-1',input:{extras:[],allocations:[]}})).status,409);
    // Garbage status: room lists with a named reason instead of vanishing.
    const stay3=(await f.stay({clientRef:'bad-status-reference',checkIn:'2027-07-12',checkOut:'2027-07-13'})).body.booking, url3='billing-draft?dossierId='+stay3.id;
    f.sql.prepare('UPDATE hotel_reservations SET status=? WHERE id=?').run('checked_in ',stay3.id);
    const badStatus=await f.call(draftGet,null,true,url3);
    assert.equal(badStatus.status,200,JSON.stringify(badStatus.body));
    assert.equal(badStatus.body.billingError,'billing-bad-status');
    assert.equal(badStatus.body.source.rooms.length,1);
    assert.equal(badStatus.body.preview,null);
  }finally{f.sql.close();}
});
test('preinvoice CAS rejects source, directory and draft races without overwriting the saved version',async()=>{
  for(const kind of ['source','directory','draft']){
    const f=await fixture();try{
      await f.seed();const stay=(await f.stay({})).body.booking;
      const url='billing-draft?dossierId='+stay.id;
      const d=(await f.call(draftGet,null,true,url)).body;
      const command={action:'save-draft',dossierId:stay.id,rev:0,sourceDigest:d.sourceDigest,directoryRev:d.directoryRev,commandId:'draft-race-0001',input:{extras:[],allocations:[]}};
      const saved=await f.call(draftPost,command);assert.equal(saved.status,200);
      const old=f.sql.prepare('SELECT data FROM store_docs WHERE feature=?').get('hotel-billing-draft:'+stay.id).data;
      f.draftRace(sql=>{
        if(kind==='source')sql.prepare('UPDATE hotel_reservations SET updated_ts=updated_ts+1 WHERE id=?').run(stay.id);
        if(kind==='directory')sql.exec("UPDATE store_docs SET rev=rev+1 WHERE feature='hotel-commercial'");
        if(kind==='draft')sql.prepare('UPDATE store_docs SET rev=rev+1 WHERE feature=?').run('hotel-billing-draft:'+stay.id);
      });
      const result=await f.call(draftPost,{...command,rev:1,commandId:'draft-race-0002'});
      assert.equal(result.status,409,kind+': '+JSON.stringify(result.body));
      assert.equal(f.sql.prepare('SELECT data FROM store_docs WHERE feature=?').get('hotel-billing-draft:'+stay.id).data,old);
    }finally{f.sql.close();}
  }
});

test('daily quote crosses seasons in cents with exclusive checkout date', () => {
  const q = quote(directory(), input);
  assert.equal(q.totalCents, 130080);
  assert.deepEqual(q.rows.map(r => [r.date, r.amountCents]), [['2027-06-30', 50035], ['2027-07-01', 80045]]);
});
test('per-person prices, all five meal plans and zero-price contracts are explicit', () => {
  for (const board of ['room_only', 'bb', 'hb_lunch', 'hb_dinner', 'full_board']) {
    const d = directory(); d.contracts = [contract({ ...low, board, unit: 'person', to: high.to })];
    assert.equal(quote(d, { ...input, board }).totalCents, 200140);
    d.contracts[0].amountCents = 0; assert.equal(quote(d, { ...input, board }).totalCents, 0);
  }
});
test('gaps, overlaps, mixed tax basis, invalid dates and unsupported occupancy refuse guessing', () => {
  assert.throws(() => quote(directory(), { ...input, checkIn: '2027-09-01', checkOut: '2027-09-02' }), /rate-gap/);
  const d = directory(); d.contracts.push(contract({ ...high, id: 'duplicate-rate' }));
  assert.throws(() => quote(d, input), /rate-overlap/);
  d.contracts.pop(); d.contracts[1].taxBasis = 'exclusive'; assert.throws(() => quote(d, input), /mixed-tax-basis/);
  for (const date of ['2027-02-29', '2026-13-01', '0000-01-01']) assert.equal(dateOK(date), false);
  assert.equal(dateOK('2028-02-29'), true);
  assert.throws(() => quote(directory(), { ...input, occupancy: 4 }), /invalid-formula/);
  assert.throws(() => contract({ ...low, amountCents: 1.5 }), /invalid-price/);
});
test('authenticated typed accounts round-trip, clear fields, archive and reject stale edits', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call(onRequestGet)).status, 200);
    assert.equal((await f.call(onRequestGet, null, false)).status, 401);
    assert.equal((await f.call(onRequestPost, { action: 'account', rev: 0, item: agency }, false)).status, 401);
    assert.equal((await f.post({ action: 'account', rev: 0, item: agency })).status, 200);
    const result = await f.post({ action: 'account', rev: 1, item: { ...agency, ice: '', archived: true } });
    assert.equal(result.body.accounts[0].ice, ''); assert.equal(result.body.accounts[0].archived, true);
    assert.equal((await f.post({ action: 'account', rev: 1, item: agency })).status, 409);
    for (const [i,kind] of ['individual', 'company'].entries()) assert.equal((await f.post({ action: 'account', rev: 2+i, item: { ...agency, id: 'account-' + kind, kind } })).status, 200);
  } finally { f.sql.close(); }
});
test('tenant isolation, hotel-only access and suspended merchants fail closed', async () => {
  const f = await fixture();
  try {
    const alien = await f.call(onRequestPost, { merchant: 'someone-else', action: 'account', rev: 0, item: agency }); assert.equal(alien.status, 401);
    f.sql.prepare("UPDATE merchant_config SET type='boutique'").run(); assert.equal((await f.call(onRequestGet)).status, 401);
    f.sql.prepare("UPDATE merchant_config SET type='hotel',status='suspended'").run(); assert.equal((await f.call(onRequestGet)).status, 401);
  } finally { f.sql.close(); }
});
test('compare-and-swap prevents a write racing after the read', async () => {
  const f = await fixture();
  try {
    await f.seed(); f.race();
    const r = await f.post({ action: 'account', rev: 3, item: { ...agency, name: 'Losing writer' } });
    assert.equal(r.status, 409); assert.equal((await f.call(onRequestGet)).body.accounts[0].name, agency.name);
  } finally { f.sql.close(); }
});
test('corrupt directory is never replaced and overlapping contracts are refused', async () => {
  const f = await fixture();
  try {
    await f.seed();
    assert.equal((await f.post({ action: 'contract', rev: 3, item: { ...low, id: 'overlapping-contract' } })).body.error, 'rate-overlap');
    f.sql.prepare("UPDATE store_docs SET data='broken' WHERE feature='hotel-commercial'").run();
    assert.equal((await f.post({ action: 'account', rev: 3, item: agency })).status, 503);
    assert.equal(f.sql.prepare("SELECT data FROM store_docs WHERE feature='hotel-commercial'").get().data, 'broken');
  } finally { f.sql.close(); }
});
test('accepted quote and debtor snapshot survive contract edits, D1 pruning and stay status edits', async () => {
  const f = await fixture();
  try {
    await f.seed();
    const commercial = { accountId: agency.id, board: 'bb', quoted: true, booker: 'Synthetic Booker', voucher: 'PO-test' };
    assert.equal((await f.stay({ commercial })).body.error, 'quote-required');
    const created = await f.stay({ commercial, acceptQuote: true, quoteRevision: 3 });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const b = created.body.booking; assert.equal(b.hotel.total, 1300.8);
    await f.post({ action: 'contract', rev: 3, item: { ...low, amountCents: 99000 } });
    await f.post({ action: 'account', rev: 4, item: { ...agency, legalName: 'Changed legal name' } });
    const edited = await f.stay({ id: b.id, status: 'checked_in', commercial });
    assert.equal(edited.status, 200); assert.equal(edited.body.booking.hotel.total, 1300.8);
    assert.equal(edited.body.booking.commercial.billTo.legalName, agency.legalName);
    assert.deepEqual(edited.body.booking.commercial.quote, b.commercial.quote);
    const changed = await f.stay({ id: b.id, status: 'checked_in', checkOut: '2027-07-03', commercial });
    assert.equal(changed.body.error, 'quote-required');
    assert.equal((await f.stay({ id: b.id, status: 'checked_in', checkOut: '2027-07-03', commercial, acceptQuote: true, quoteRevision: 3 })).body.error, 'quote-required');
    const requote = await f.stay({ id: b.id, status: 'checked_in', checkOut: '2027-07-03', commercial, acceptQuote: true, quoteRevision: 5 });
    assert.equal(requote.body.booking.hotel.total, 2590.9);
    await f.stay({ id: b.id, status: 'completed', checkOut: '2027-07-03', commercial });
    const closed = await f.stay({ id: b.id, status: 'completed', checkOut: '2027-07-03', commercial, acceptQuote: true, quoteRevision: 5 });
    assert.equal(closed.body.error, 'closed-commercial');
  } finally { f.sql.close(); }
});
test('HT quote is available for review but cannot silently become a TTC reservation', async () => {
  const f = await fixture();
  try {
    await f.seed(); await f.post({ action: 'contract', rev: 3, item: { ...low, taxBasis: 'exclusive' } });
    const commercial = { accountId: agency.id, board: 'bb', quoted: true };
    const r = await f.stay({ checkOut: '2027-07-01', commercial, acceptQuote: true, quoteRevision: 4 });
    assert.equal(r.body.error, 'tax-configuration-required');
  } finally { f.sql.close(); }
});
test('legacy sync cannot forge, erase or change accepted commercial terms', async () => {
  const f = await fixture();
  try {
    await f.seed();
    const created = await f.stay({ commercial: { accountId: agency.id, board: 'bb', quoted: true }, acceptQuote: true, quoteRevision: 3 });
    const booking = created.body.booking;
    const d = { bookings: [booking] };
    assert.equal(await validateCommercialSync(f.env, f.merchant, d, d), true);
    assert.equal(await validateCommercialSync(f.env, f.merchant, { bookings: [] }, d), true, 'pruned stay resolves its authoritative D1 snapshot');
    for (const mutate of [b => { b.commercial = null; }, b => { b.commercial.quote.totalCents = 1; }, b => { b.hotel.total = 1; }, b => { b.status = 'cancelled'; }]) {
      const next = structuredClone(d); mutate(next.bookings[0]);
      await assert.rejects(validateCommercialSync(f.env, f.merchant, d, next), /commercial-stays-use-api/);
    }
    await assert.rejects(validateCommercialSync(f.env, f.merchant, d, { bookings: [] }), /commercial-stays-use-api/);
    const row = f.sql.prepare("SELECT data,rev FROM store_docs WHERE feature='reservations'").get();
    const next = JSON.parse(row.data); next.bookings = [structuredClone(booking)]; next.bookings[0].commercial.quote.totalCents = 1;
    const refused = await f.call(storePost, { feature: 'reservations', baseRev: row.rev, data: next });
    assert.equal(refused.body.error, 'commercial-stays-use-api');
  } finally { f.sql.close(); }
});
test('browser reservation normalizer preserves the bounded commercial snapshot', () => {
  const ctx = { console, setTimeout() {}, clearTimeout() {}, Date, Math, JSON, document: { addEventListener() {} }, addEventListener() {}, navigator: {}, location: { origin: 'https://kiwi.test' } }; ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(new URL('../assets/reservations.js', import.meta.url), 'utf8'), ctx);
  const commercial = commercialSnapshot({ accountId: agency.id, billTo: account(agency), quoted: true, board: 'bb', occupancy: 2, quote: quote(directory(), input), acceptedAt: 1, voucher: 'test', booker: 'test' });
  const b = { id: 'stay-test', serviceId: 'standard', startAt: 1, endAt: 2, customer: { name: 'Synthetic' }, commercial };
  const result = ctx.KiwiReservations.normalize({ bookings: [b] });
  assert.deepEqual(JSON.parse(JSON.stringify(result.bookings[0].commercial)), commercial);
});
test('account history is filtered server-side, including cancelled records', async () => {
  const f = await fixture();
  try {
    await f.seed(); const created = await f.stay({ commercial: { accountId: agency.id, board: 'bb', quoted: true }, acceptQuote: true, quoteRevision: 3 });
    await f.stay({ id: created.body.booking.id, action: 'cancel' });
    for (const [id,count] of [[agency.id,1], ['different-account',0]]) {
      const res = await f.call(getStays, null, true, 'stays?accountId=' + id + '&includeCancelled=1&unused=');
      assert.equal(res.status, 200); assert.equal(res.body.stays.length, count);
      if (count) assert.equal(res.body.stays[0].status, 'cancelled');
    }
  } finally { f.sql.close(); }
});
test('public booking write preserves existing commercial, guest and room history without exposing them', async () => {
  const f = await fixture();
  try {
    f.sql.exec('DROP TABLE hotel_reservations');
    await f.seed(); const created = await f.stay({
      commercial: { accountId: agency.id, board: 'bb', quoted: true }, acceptQuote: true, quoteRevision: 3,
      guests: [{ id: 'synthetic-guest', name: 'Private synthetic identity', sex: 'F', nationality: 'MA', birthDate: '1990-01-01', residenceCountry: 'MA', minorsUnder18: 1, idDocType: 'passeport', idDocNumber: 'SYNTHETIC-PRIVATE' }],
      roomSegments: [{ roomId: 'room:101', fromDate: input.checkIn, toDate: input.checkOut }],
    });
    const row = f.sql.prepare("SELECT data FROM store_docs WHERE feature='reservations'").get();
    const d = JSON.parse(row.data); d.settings.published = true; d.settings.windowDays = 365; d.settings.minNoticeMinutes = 0;
    f.sql.prepare("UPDATE store_docs SET data=? WHERE feature='reservations'").run(JSON.stringify(d));
    const rooms = JSON.parse(f.sql.prepare("SELECT data FROM store_docs WHERE feature='rooms'").get().data);
    rooms.rooms.push({ id: 'room:102', n: 102, typeId: 'standard', status: 'libre' });
    f.sql.prepare("UPDATE store_docs SET data=? WHERE feature='rooms'").run(JSON.stringify(rooms));
    const res = await f.call(publicBooking, { serviceId: 'standard', ref: 'public-booking-test', checkIn: input.checkIn, checkOut: input.checkOut, partySize: 1, customer: { name: 'Other synthetic guest', email: 'other@example.test' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const saved = JSON.parse(f.sql.prepare("SELECT data FROM store_docs WHERE feature='reservations'").get().data);
    const preserved = saved.bookings.find(b => b.id === created.body.booking.id);
    for (const field of ['commercial', 'guests', 'roomSegments']) assert.deepEqual(preserved[field], created.body.booking[field]);
    assert.deepEqual(preserved.hotel.guestSegments, created.body.booking.hotel.guestSegments);
    assert.deepEqual(preserved.hotel.roomSegments, created.body.booking.hotel.roomSegments);
    assert.equal(JSON.stringify(res.body).includes(agency.legalName), false);
    assert.doesNotMatch(JSON.stringify(res.body), /SYNTHETIC-PRIVATE|Private synthetic identity|1990-01-01/);
  } finally { f.sql.close(); }
});
