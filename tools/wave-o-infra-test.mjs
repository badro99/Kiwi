import planningSourceHelper from './planning-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const mode = process.argv[2];
const run = (name, fn) => !mode || mode === name ? fn() : undefined;
await run('schema', async () => {
 const {schemaCompatibility} = await import('../functions/_schema-version.js');
 assert.equal(typeof schemaCompatibility, 'function');
 let reads=0, release, version=15;
 const db={prepare(sql){assert.match(sql,/d1_migrations/);reads++;return {all:async()=>{if(release) await release;return {results:[{name:String(version).padStart(4,'0')+'_fixture.sql'}]};}};}};
 const results=await Promise.all(Array.from({length:20},()=>schemaCompatibility(db)));
 assert.equal(reads,1); assert.equal(results[0].status,503);
 assert.equal((await results[0].json()).code,'incompatible_schema');
 const {onRequest}=await import('../functions/api/_middleware.js');
 let reached=0;
 assert.equal((await onRequest({env:{DB:db},next:()=>{reached++;}})).status,503);
 assert.equal(reached,0);
 const good={prepare:()=>({all:async()=>({results:[{name:'0016_current.sql'}]})})};
 assert.equal(await schemaCompatibility(good),null);
 assert.equal(await onRequest({env:{DB:good},next:()=> 'route reached'}),'route reached');
 const originalNow=Date.now;
 try { version=16; Date.now=()=>originalNow()+61000; assert.equal(await schemaCompatibility(db),null); assert.equal(reads,2); } finally {Date.now=originalNow;}
 /* A failed read is not proof of an old schema: a D1 blip lets sales through and is read again soon. */
 let brokenReads=0; const broken={prepare(){brokenReads++; throw Error('unavailable');}};
 assert.equal(await schemaCompatibility(broken),null,'a failed read does not refuse requests');
 assert.equal(await schemaCompatibility(broken),null); assert.equal(brokenReads,1,'not re-read on every request');
 try { Date.now=()=>originalNow()+6000; assert.equal(await schemaCompatibility(broken),null); assert.equal(brokenReads,2,'read again after a few seconds'); } finally {Date.now=originalNow;}
});
await run('promos', () => {
 const w={KiwiDayReport:{timezone:()=> 'America/New_York',cutoff:()=>8}};
 vm.runInNewContext(fs.readFileSync('assets/promo-rules.js','utf8'),{window:w,Intl,Date});
 const at=Date.parse('2026-10-26T11:00:00Z');
 assert.equal(w.KiwiPromoRules.businessMoment(at).date,'2026-10-25');
 assert.equal(w.KiwiPromoRules.businessMoment(at).min,420);
 w.KiwiDayReport.cutoff=()=>6;
 assert.equal(w.KiwiPromoRules.businessMoment(at).date,'2026-10-26');
 w.KiwiDayReport.timezone=()=> 'Asia/Tokyo';
 assert.equal(w.KiwiPromoRules.businessMoment(at).min,1200);
});
await run('economat', () => {
 const css=fs.readFileSync('assets/hotel-economat-requests.css','utf8');
 assert.doesNotMatch(css,/\.hx-req-steps li\s*\{[^}]*font-size:(?:9\.5|10\.5)px/);
 assert.match(css,/\.hx-req-steps li span\s*\{[^}]*white-space:normal/);
 assert.match(css,/\.hx-req-steps li span\s*\{[^}]*overflow-wrap:anywhere/);
});
await run('planning', () => {
 const src=fs.readFileSync('assets/team/profile-ui.js','utf8');
 const hints=[...src.matchAll(/plHint: ('[^\n]+'),/g)].map(m=>vm.runInNewContext(m[1]));
 assert.equal(hints.length,3);
 assert.match(planningSourceHelper.planningTestSource(),/esc\(T.precisionHint\)/);
 for(const h of hints) {assert.match(h,/0[.,]01/);assert.match(h,/36/);}
});
await run('pairing', async () => {
 let src=fs.readFileSync('assets/caisse-pairing.js','utf8');
 const begin=src.indexOf('  function offlinePinKey('), end=src.indexOf('  function verifyOfflinePin(');
 const cache=new Map();const w={crypto:{subtle:{importKey:async()=>({}),deriveBits:async()=>new Uint8Array(32).buffer},getRandomValues:a=>a},TextEncoder};
 const ctx={window:w,TextEncoder,Uint8Array,Date,localStorage:{},OFFLINE_PIN_KEY:'fixture:',OFFLINE_PIN_TTL:60000,ls:k=>cache.get(k),set:(k,v)=>cache.set(k,v),activeVenue:()=>({merchant:'fixture'})};
 vm.createContext(ctx);vm.runInContext(src.slice(begin,end)+';this.remember=rememberOfflinePin;this.rows=offlinePinRows;',ctx);
 for(let i=0;i<20;i++) await ctx.remember('fixture',String(i).padStart(4,'0'),{id:'staff-'+i,name:'Staff '+i,role:'cashier'});
 // The cache stays bounded (a stolen device holds at most 12 verifiers); the newest identities stay covered.
 assert.equal(ctx.rows('fixture').length,12);
 assert.equal(ctx.rows('fixture').at(-1).staff.name,'Staff 19');
 assert.ok(!ctx.rows('fixture').some(r=>r.staff.name==='Staff 0'));
});
console.log('✓ wave O infra '+(mode||'all'));

await run('classifier', async () => {
 const ratchet=fs.readFileSync('tools/source-assertion-ratchet-test.mjs','utf8');
 let sourceOnly;
 if(ratchet.includes('const RUNS =')) {
   const old=ratchet.slice(ratchet.indexOf('const RUNS ='),ratchet.indexOf('/* The classifier itself. */'));
   sourceOnly=vm.runInNewContext(old.replace('export const','const')+';sourceOnly');
 } else { sourceOnly=(await import('./source-assertion-classifier.cjs')).sourceOnly; }
 const read="const s=fs.readFileSync('assets/a.js','utf8'); assert.match(s,/x/);";
 for(const prefix of ["// node:vm spawn onRequest\n", "const hint='node:vm createRequire spawn';", "import vm from 'node:vm';", "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);", "function unused(){ return 'spawn'; }", "function unused(){vm.runInNewContext(source);}", "const unused = new Function('return 1');"]) assert.equal(sourceOnly(prefix+read),true,prefix);
});

await run('coverage', async () => {
 const {coverageText}=await import('../assets/offline-pin-coverage.js');
 assert.match(coverageText(['Alice','Bob'],s=>s),/Alice, Bob/);
 assert.match(coverageText([],s=>s),/Aucun employé vérifié/);
 assert.match(coverageText([],s=>'translated:'+s),/translated:/);
});
