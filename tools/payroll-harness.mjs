// Entrées contrôlées, déclarations et routes de production.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {declaration} from './js-declarations.cjs';
import {fixture} from './server-money-fixture.mjs';
import {businessDate,DEFAULT_CUTOFF} from '../functions/api/_business-day.js';
import {hoursByDay} from '../functions/api/_worked-hours.js';
import {employeeToken,EMPLOYEE_COOKIE,makeSession,SESS_COOKIE} from '../functions/auth/_lib.js';
import {onRequestPost as employee} from '../functions/api/employee.js';
import {onRequestGet as teamGet} from '../functions/api/team/live.js';
export const ROOT=process.env.KIWI_ROOT||path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
function named(text,name){const m=new RegExp('(?:^|\\n)[ \\t]*(?:async\\s+)?(?:function\\s+'+name+'\\s*\\(|(?:const|let|var)\\s+'+name+'\\s*=)').exec(text);if(!m)throw Error(name);return declaration(text.slice(m.index).trimStart(),name);}
function load(file,names,stubs={}){const c=vm.createContext(stubs);c.window=c;new vm.Script(names.map(n=>named(read(file),n)+'\nglobalThis['+JSON.stringify(n)+']='+n+';').join('\n')).runInContext(c);return c;}
export function clients(){let hours={};const team=load('assets/team.js',['hhmmToMin','normShift','shiftMinutes','shiftHours','shiftIsNextDay','contractWeekHours','hourlyPayFor','periodMonthShare','payCents','payrollFigures'],{HHMM_RE:/^(?:[01]\d|2[0-3]):[0-5]\d$/,getHours:()=>hours,Date,Math,Number});const stubs={businessDate,DEFAULT_CUTOFF,hoursByDay,Map,Math,Number,String,Set};return{team,setHours:v=>hours=v,employee:load('functions/api/employee.js',['dateKey','pointedHours'],stubs),live:load('functions/api/team/live.js',['dateKey','pointedHours'],{...stubs}),charges:load('assets/charges-engine.js',['num','r2','staffFor'])};}
export async function server(){const f=await fixture(ROOT);const cookie=`${EMPLOYEE_COOKIE}=${await employeeToken(f.env.AUTH_SECRET,{merchant:f.merchant,staffId:'staff'})}`,owner=`${SESS_COOKIE}=${await makeSession('money-owner',f.env.AUTH_SECRET)}`;
 function put(feature,data){f.sql.prepare('INSERT OR REPLACE INTO store_docs(merchant,feature,data,rev,updated_ts) VALUES(?,?,?,1,?)').run(f.merchant,feature,JSON.stringify(data),Date.now());}
 function get(feature){return JSON.parse(f.sql.prepare('SELECT data FROM store_docs WHERE merchant=? AND feature=?').get(f.merchant,feature).data);}
 function reset(entries=[],zone='UTC'){f.sql.exec('DELETE FROM store_docs;');f.sql.prepare('UPDATE merchant_config SET timezone=? WHERE merchant=?').run(zone,f.merchant);put('team',{members:[{id:'staff',firstName:'Test',function:'Serveur',authVersion:0}],hours:{},shifts:{}});put('attendance',{entries});put('attendance-code',{code:'123456',createdTs:Date.now(),expiresTs:Date.now()+3600000});}
 async function call(action){const r=await employee({env:f.env,request:new Request('https://kiwi.test/api/employee',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({action,attendanceCode:'123456'})})});return{status:r.status,body:await r.json()};}
 async function live(){const r=await teamGet({env:f.env,request:new Request('https://kiwi.test/api/team/live?merchant='+f.merchant,{headers:{Cookie:owner}})});return{status:r.status,body:await r.json()};}
 async function race(work){const orig=f.DB.prepare;let count=0,timer;const waits=[];f.DB.prepare=function(q){const s=orig.call(this,q);if(!/^UPDATE store_docs SET data/.test(q))return s;let args;const bind=s.bind,run=s.run;s.bind=function(...a){args=a;bind.apply(s,a);return s;};s.run=function(){if(args?.[4]!=='attendance'||count>=2)return run.call(s);count++;return new Promise((resolve,reject)=>{waits.push(()=>{try{resolve(run.call(s));}catch(e){reject(e);}});if(count===2){clearTimeout(timer);waits.forEach(fn=>queueMicrotask(fn));}});};return s;};try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Attendance race barrier not reached')),5000);})]);}finally{clearTimeout(timer);f.DB.prepare=orig;}}
 return{...f,put,get,reset,call,live,race};}
