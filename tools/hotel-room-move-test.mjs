#!/usr/bin/env node
/* B11 · Dupont (H-D53638C8) was moved 106 → 109 while in house: roomSegments stayed [], so
 * nothing recorded that the guest slept in 106, and 106 went back on sale « propre ».
 * Real /api/hotel/stays handler on schema.sql (node:sqlite): a move closes the old room's
 * segment on the move day with movedAt (the room plan sends it to cleaning) and opens the new
 * room; later saves keep the history; a stay never moved keeps one segment. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE, OP_COOKIE, OPID_COOKIE, operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
import { onRequestPost as stays } from '../functions/api/hotel/stays.js';
const ROOT = path.resolve(import.meta.dirname, '..');
const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(path.join(ROOT,'schema.sql'),'utf8'));
// D1 executes each batch atomically. Do not yield between SQLite statements:
// interleaving two transactions on one connection would model a fixture bug.
let beforeBatch=null;
const DB={
  prepare(q){
    let args=[];
    return{
      query:q,
      bind(...a){args=a;return this;},
      async first(){return sql.prepare(q).get(...args)||null;},
      async all(){return{results:sql.prepare(q).all(...args)};},
      async run(){return this.execute();},
      execute(){
        if(/^\s*SELECT/i.test(q))return{results:sql.prepare(q).all(...args)};
        const r=sql.prepare(q).run(...args);return{success:true,meta:{changes:Number(r.changes)}};
      }
    };
  },
  async batch(ss){
    if(beforeBatch&&ss.some(s=>s.query.startsWith('UPDATE store_docs SET data'))){const fn=beforeBatch;beforeBatch=null;fn();}
    sql.exec('BEGIN IMMEDIATE');
    try{const out=ss.map(s=>s.execute());sql.exec('COMMIT');return out;}
    catch(e){sql.exec('ROLLBACK');throw e;}
  }
};
const merchant='property-hotel',other='other-hotel',secret='local-hotel-properties-secret',env={DB,AUTH_SECRET:secret};
for(const [m,a]of [[merchant,'owner'],[other,'stranger']]){sql.prepare('INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES(?,?,?,?,?,?)').run(a,a+'@example.test',m,'s','h',1);sql.prepare("INSERT INTO merchant_config(merchant,account_id,type,features,status,updated_ts) VALUES(?,?,'hotel','{}','active',1)").run(m,a);}
const cookies={stranger:SESS_COOKIE+'='+await makeSession('stranger',secret),owner:SESS_COOKIE+'='+await makeSession('owner',secret),till:TILL_COOKIE+'='+await tillToken(secret,merchant)};
async function call(handler,b={},role='owner',get=false){const u=new URL('https://kiwi.test/api/hotel/test');if(get)for(const[k,v]of Object.entries({merchant,...b}))u.searchParams.set(k,v);const r=await handler({env,request:new Request(u,{method:get?'GET':'POST',headers:{Cookie:cookies[role]||'','Content-Type':'application/json'},...(get?{}:{body:JSON.stringify({merchant,...b})})})});return{status:r.status,body:await r.json()};}
const ok=r=>assert.equal(r.status,200,'request succeeds'),cents=x=>Math.round(x*100),day=n=>new Date(Date.UTC(2026,10,1+n)).toISOString().slice(0,10);
function doc(feature,data,m=merchant){sql.prepare('INSERT INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,1) ON CONFLICT(merchant,feature) DO UPDATE SET data=excluded.data,rev=1').run(m,feature,JSON.stringify(data));}
function reset(rate=100){for(const t of ['hotel_room_charge_events','hotel_stay_events','hotel_reservations','sales','store_docs'])sql.exec('DELETE FROM '+t);doc('rooms',{baseRate:rate,roomTypes:[{id:'type-basic',name:'Basic',rate,maxGuests:4}],rooms:[1,2].map(n=>({id:'room:'+n,n,typeId:'type-basic',status:'libre'})),folios:[]});doc('reservations',{v:1,settings:{},services:[],resources:[],blocked:[],bookings:[]});doc('hotel-units',{units:[{id:'bar',name:'Bar',kind:'outlet',storeType:'bar',locationId:'bar-stock',active:true},{id:'eco',name:'Economat',kind:'economat',storeType:'economat',locationId:'eco-stock',active:true}]});doc('team',{members:[{id:'cashier',firstName:'Fixture'}]});}
const payload=(i=0,start=0,n=2,room=1)=>({action:'save',clientRef:'property-ref-'+i,roomTypeId:'type-basic',resourceId:'room:'+room,checkIn:day(start),checkOut:day(start+n),partySize:1,customer:{name:'Guest '+i},guests:[{name:'Guest '+i,idDocType:'passeport',idDocNumber:'SYNTHETIC-'+i}]});
function rows(){return sql.prepare('SELECT * FROM hotel_reservations ORDER BY id').all();}
function invariant(){const a=rows().filter(b=>['requested','confirmed','checked_in'].includes(b.status));for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[i].room_id===a[j].room_id)assert.ok(a[i].end_at<=a[j].start_at||a[j].end_at<=a[i].start_at,'overlapping active stays');}
function snapshot(){return JSON.stringify(['store_docs','hotel_reservations','hotel_stay_events'].map(t=>sql.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()));}
async function create(p=payload()){const r=await call(stays,p);ok(r);return r.body.booking;}


const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
reset();
const made = await create({ ...payload(0, 0, 3, 1), checkIn: iso(-1), checkOut: iso(2) });
ok(await call(stays, { action: 'status', id: made.id, status: 'checked_in' }));
const current = JSON.parse(rows()[0].raw_json);
const moved = await call(stays, { ...payload(0, 0, 3, 2), checkIn: iso(-1), checkOut: iso(2), id: made.id, expectedUpdatedAt: current.updatedAt, status: 'checked_in' });
ok(moved);
const segs = moved.body.booking.hotel.roomSegments;
assert.equal(segs.length, 2, 'two rooms in the history');
assert.equal(segs[0].roomId, 'room:1'); assert.equal(segs[0].fromDate, iso(-1)); assert.equal(segs[0].toDate, today);
assert.ok(segs[0].movedAt > 0, 'the room left records when it was left (the plan sends it to cleaning)');
assert.equal(segs[1].roomId, 'room:2'); assert.equal(segs[1].fromDate, today); assert.equal(segs[1].toDate, iso(2));
assert.equal(moved.body.booking.resourceId, 'room:2');
const stored = JSON.parse(rows().find((r) => r.id === made.id).raw_json);
assert.equal(stored.hotel.roomSegments.length, 2, 'the history is stored in D1');
const again = await call(stays, { ...payload(0, 0, 3, 2), checkIn: iso(-1), checkOut: iso(2), id: made.id, expectedUpdatedAt: stored.updatedAt, status: 'checked_in', note: 'oreiller' });
ok(again);
assert.equal(again.body.booking.hotel.roomSegments.length, 2, 'a later save keeps the history');
assert.equal(again.body.booking.hotel.roomSegments[0].movedAt, segs[0].movedAt);
reset();
const plain = await create({ ...payload(1, 0, 3, 1), checkIn: iso(-1), checkOut: iso(2) });
assert.equal(plain.hotel.roomSegments.length, 1, 'a stay never moved keeps one segment');
sql.close();
console.log('✓ hotel-room-move: a move in house keeps the room history (with movedAt on the room left), later saves keep it');
