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

sql.prepare('INSERT INTO operators(id,label,salt,hash,created_ts) VALUES(?,?,?,?,?)').run('hotel-op','Fixture Operator','s','h',1);
cookies.operator = `${OP_COOKIE}=${await operatorToken(secret)}; ${OPID_COOKIE}=${await operatorIdToken(secret,'hotel-op')}`;
// Codes are generated synthetic credentials and never enter assertion output.
const managerCode = String(1000 + Math.floor(Math.random() * 8000));
const wrongCode = String(Number(managerCode) + 1);
for (const action of ['status', 'save']) {
  reset();
  sql.prepare('DELETE FROM staff_pins').run();
  sql.prepare('INSERT INTO staff_pins(id,merchant,pin,name,role,created_ts) VALUES(?,?,?,?,?,?)').run('manager-proof',merchant,managerCode,'Fixture Manager','manager',1);
  const a=await create(); ok(await call(stays,{action:'status',id:a.id,status:'checked_in'}));
  const roomDoc=JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);
  roomDoc.folios=[{stayId:a.id,room:1,lines:[]}];doc('rooms',roomDoc);
  const current=JSON.parse(rows()[0].raw_json);
  const command=action==='status'?{action,id:a.id,status:'completed'}:{...payload(),id:a.id,expectedUpdatedAt:current.updatedAt,status:'completed'};
  const before=snapshot();
  assert.equal((await call(stays,command,'till')).status,409,'unpaid is first response');
  const missing=await call(stays,{...command,force:true},'till');assert.equal(missing.status,403,'till needs proof');assert.equal(snapshot(),before);
  const wrong=await call(stays,{...command,force:true,pin:wrongCode},'till');assert.equal(wrong.status,401,'wrong code refused');assert.equal(snapshot(),before);
  const result=await call(stays,{...command,force:true,pin:managerCode},'till');ok(result);
  const approval=result.body.booking.checkout.approvedBy;
  assert.ok(approval && approval.id==='manager-proof' && approval.name==='Fixture Manager' && approval.role==='manager','verified identity recorded');
  for(const text of [JSON.stringify(result.body),snapshot()]) {
    assert.ok(!text.includes(JSON.stringify(managerCode)),'code never stored or returned');assert.ok(!text.includes('"pin"'),'no credential field');
  }
  reset();const owned=await create();ok(await call(stays,{action:'status',id:owned.id,status:'checked_in'}));
  const rooms=JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);rooms.folios=[{stayId:owned.id,lines:[]}];doc('rooms',rooms);
  const ownedCurrent=JSON.parse(rows()[0].raw_json);
  const ownerCommand=action==='status'?{action,id:owned.id,status:'completed',force:true}:{...payload(),id:owned.id,expectedUpdatedAt:ownedCurrent.updatedAt,status:'completed',force:true};
  const owner=await call(stays,ownerCommand);ok(owner);
  assert.ok(owner.body.booking.checkout.approvedBy?.role==='owner','owner session approval recorded');
}
reset();const operated=await create();ok(await call(stays,{action:'status',id:operated.id,status:'checked_in'}));
const opRooms=JSON.parse(sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").get(merchant).data);opRooms.folios=[{stayId:operated.id,lines:[]}];doc('rooms',opRooms);
const operator=await call(stays,{action:'status',id:operated.id,status:'completed',force:true},'operator');ok(operator);
assert.ok(operator.body.booking.checkout.approvedBy?.id==='hotel-op' && operator.body.booking.checkout.approvedBy?.name==='Fixture Operator','named operator approval recorded');
sql.close();
console.log('✓ hotel forced checkout: both writers, first 409, missing/wrong proof, verified manager, owner, credential projection');
