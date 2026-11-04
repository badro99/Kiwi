import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {onRequestGet as rawGet} from '../functions/api/tickets/index.js';
import {asOperator} from './ticket-test-auth.mjs';
const onRequestGet=asOperator(context => rawGet(context)),db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('schema.sql','utf8'));
const queries=[];const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},all(){queries.push(sql);return {results:db.prepare(sql).all(...args)}},first(){return db.prepare(sql).get(...args)},run(){return {meta:db.prepare(sql).run(...args)}}}},batch(statements){return Promise.all(statements.map(s=>s.run()))}};
const insert=db.prepare("INSERT INTO kiwi_tickets(body,status,created_ts,updated_ts,expires_ts) VALUES(?,'done',1,1,1)");
for(let i=0;i<507;i++)insert.run('Ticket '+i);
const follow=db.prepare('INSERT INTO kiwi_ticket_followups(ticket_id,body,created_ts) VALUES(?,?,1)');
for(let i=1;i<=507;i++)follow.run(i,'Follow '+i);
const env={DB},background=[];
async function page(query='') {
  let timer;
  try {
    const res=await Promise.race([onRequestGet({request:new Request('https://kiwi.test/api/tickets'+query),env,waitUntil:p=>background.push(p)}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('GET blocked by cleanup')),200);})]);
    assert.equal(res.status,200);return res.json();
  } finally { clearTimeout(timer); }
}
// Throttled purge may execute in the background; block its SELECT until after
// all foreground reads, proving GET does not await expiry cleanup.
const original=DB.prepare;let sweepRelease;const blocked=new Promise(resolve=>sweepRelease=resolve);
DB.prepare=function(sql){const s=original(sql);if(/SELECT id FROM kiwi_tickets\s+WHERE status/.test(sql)){const all=s.all;s.all=()=>blocked.then(()=>all.call(s));}return s};
const first=await page('?limit=3');assert.equal(first.tickets.length,3);assert.equal(first.nextCursor,'505');
assert.deepEqual(first.tickets.map(t=>t.id),[507,506,505]);assert.equal(first.tickets[0].followups[0].body,'Follow 507');
const second=await page('?limit=3&cursor='+first.nextCursor);assert.deepEqual(second.tickets.map(t=>t.id),[504,503,502]);
assert.equal(db.prepare('SELECT count(*) n FROM kiwi_tickets').get().n,507,'GET does not await/purge expired rows');
const defaults=await page();assert.equal(defaults.tickets.length,500);assert.equal(defaults.nextCursor,'8');
const last=await page('?cursor=8');assert.equal(last.tickets.length,7);assert.equal(last.nextCursor,null);
assert.equal((await page('?limit=9999')).tickets.length,500,'caps requested pages');
sweepRelease();await Promise.all(background);
assert.equal(db.prepare('SELECT count(*) n FROM kiwi_tickets').get().n,417,'throttled sweep purges a bounded 90 rows');
assert.ok(queries.filter(q=>/kiwi_ticket_followups/.test(q)).every(q=>/LIMIT/.test(q)),'child history is page-scoped');
db.close();console.log('✓ real D1: bounded/default/capped pages, stable cursors, scoped followups, background throttled purge');
