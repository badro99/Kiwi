#!/usr/bin/env node
// Operator-run, isolated simulator fixture only. Never launches/stops an app,
// changes identity, injects UI events, pairs hardware or contacts an API.
// Usage: node tools/native-long-list-storage-fixture.mjs inspect|seed|restore
//   --sim <approved UUID> --db <explicit localstorage.sqlite3>
//   [--backup <private directory printed by seed>]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {longListData,ROW_COUNT} from './till-long-scroll-fixture.mjs';

const BUNDLE='com.kiwios.pro.qa.tickets0147.b';
const SIMS=['13A85612-BDD7-4BF0-98F2-736D76D44C57','D53BB4E4-F195-41EF-8DE2-9F74BAEADC62'];
const KEYS=['kiwi:bqDay','kiwi:retailBalances:']; // Empty merchant, no identity switch.
const IDENTITY=['kiwiPaired','kiwiPairedVenue','kiwiLiveMerchant','kiwiLive','kiwiPairings',
 'kiwiAccountKey','kiwiEmployeeMerchant'];
const args=process.argv.slice(2),mode=args.shift();
const opts={};
while(args.length){const flag=args.shift(),value=args.shift();assert.ok(['--sim','--db','--backup'].includes(flag)&&value&&!opts[flag],'Invalid arguments');opts[flag]=value;}
assert.ok(['inspect','seed','restore'].includes(mode),'Choose inspect, seed or restore');
assert.ok(SIMS.includes(opts['--sim']),'Only the two approved QA simulators are allowed');
assert.ok(opts['--db']&&path.isAbsolute(opts['--db']),'An explicit absolute database path is required');
assert.ok(mode==='restore'?!!opts['--backup']:!opts['--backup'],'Backup is required only for restore');
const hex=value=>Buffer.from(value,'utf8').toString('hex').toUpperCase();
const keySQL=key=>`CAST(X'${hex(key)}' AS TEXT)`;
const keySet=KEYS.map(keySQL).join(',');
const identitySet=IDENTITY.map(keySQL).join(',');
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
function simctl(args){try{return execFileSync('xcrun',['simctl',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{throw new Error('Simulator ownership check failed');}}
const container=fs.realpathSync(simctl(['get_app_container',opts['--sim'],BUNDLE,'data']));
const db=fs.realpathSync(opts['--db']);
const prefix=path.join(container,'Library/WebKit',BUNDLE,'WebsiteData/Default')+path.sep;
assert.ok(db.startsWith(prefix)&&db.endsWith('/LocalStorage/localstorage.sqlite3'),'Database must belong to the exact QA data container');
// This origin file describes both top and client origins. Refuse hosted data.
const origin=fs.readFileSync(path.join(path.dirname(db),'..','origin'));
assert.equal((origin.toString('latin1').match(/capacitor/g)||[]).length,2,'Both origins must use Capacitor');
assert.equal((origin.toString('latin1').match(/localhost/g)||[]).length,2,'Both origins must use localhost');
function sql(statement,readonly=true){
 try{return JSON.parse(execFileSync('sqlite3',[...(readonly?['-readonly']:[]),'-batch','-bail','-json',db],{
  input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:4*1024*1024,
 })||'[]');}catch{throw new Error('SQLite operation failed; database contents withheld');}
}
const schema=sql("SELECT sql FROM sqlite_master WHERE type='table' AND name='ItemTable';");
assert.equal(schema.length,1,'Expected WebKit ItemTable');
assert.ok(/key TEXT.*value BLOB/.test(schema[0].sql),'Expected text keys and BLOB values');
function rows(){return sql(`SELECT key,hex(value) AS valueHex FROM ItemTable WHERE key IN (${keySet}) ORDER BY key;`);}
function noIdentity(){assert.equal(sql(`SELECT count(*) AS count FROM ItemTable WHERE key IN (${identitySet}) AND length(value)>0;`)[0].count,0,'Refusing nonempty pairing/account/live identity');}
function stopped(){
 const list=simctl(['spawn',opts['--sim'],'launchctl','list']);
 assert.ok(!list.split('\n').some(line=>line.includes('UIKitApplication:'+BUNDLE)), 'Stop the exact QA app before storage preparation');
 const opened=spawnSync('lsof',['-t',...[db,db+'-wal',db+'-shm'].filter(fs.existsSync)],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.ok(!opened.error&&[0,1].includes(opened.status),'Database ownership check failed');
 assert.equal(opened.stdout.trim(),'','WebKit still owns database files; wait after app termination');
}
function validateRows(records){
 assert.ok(Array.isArray(records)&&records.length<=2,'Invalid exact-key backup');
 assert.ok(new Set(records.map(row=>row.key)).size===records.length,'Duplicate backup key');
 for(const row of records)assert.ok(KEYS.includes(row.key)&&typeof row.valueHex==='string'&&/^(?:[0-9A-F]{2})*$/.test(row.valueHex),'Invalid backup key or BLOB');
}
function stateCondition(records){
 const conditions=[`(SELECT count(*) FROM ItemTable WHERE key IN (${keySet}))=${records.length}`];
 for(const row of records)conditions.push(`EXISTS(SELECT 1 FROM ItemTable WHERE key=${keySQL(row.key)} AND hex(value)='${row.valueHex}')`);
 return conditions.join(' AND ');
}
function replace(expected,replacement){
 validateRows(expected);validateRows(replacement);stopped();noIdentity();
 // Verify expected rows and identity inside the same write transaction. A stale
 // restore fails its CHECK and rolls back instead of overwriting edited data.
 const script=`BEGIN IMMEDIATE;
 CREATE TEMP TABLE fixture_guard(ok INTEGER CHECK(ok=1));
 INSERT INTO fixture_guard SELECT CASE WHEN (${stateCondition(expected)}) AND
  (SELECT count(*) FROM ItemTable WHERE key IN (${identitySet}) AND length(value)>0)=0 THEN 1 ELSE 0 END;
 DELETE FROM ItemTable WHERE key IN (${keySet});
 ${replacement.map(row=>`INSERT INTO ItemTable(key,value) VALUES(${keySQL(row.key)},X'${row.valueHex}');`).join('\n')}
 COMMIT;`;
 sql(script,false);
 assert.equal(hash(rows()),hash(replacement),'Exact-key post-write verification failed');
}
try{
 noIdentity();
 if(mode==='inspect'){
  console.log(JSON.stringify({mode,bundle:BUNDLE,sim:opts['--sim'],origin:'capacitor://localhost',
   keys:rows().map(row=>({key:row.key,bytes:row.valueHex.length/2})),identity:'empty',rowCount:ROW_COUNT}));
 }else if(mode==='seed'){
  stopped();const before=rows(),data=longListData();
  // Vendus reads plain arrays even in demo; do not set kiwiLiveMerchant or
  // stamp synthetic-till-long-scroll onto native app identity.
  const seeded=KEYS.map((key,index)=>({key,valueHex:Buffer.from(JSON.stringify(index?data.balances:data.sales.s),'utf16le').toString('hex').toUpperCase()})).sort((a,b)=>a.key.localeCompare(b.key));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kiwi-native-long-lists-'));fs.chmodSync(dir,0o700);
  fs.writeFileSync(path.join(dir,'exact-key-backup.json'),JSON.stringify({version:1,db,sim:opts['--sim'],bundle:BUNDLE,before,seeded,seedHash:hash(seeded)}),{mode:0o600,flag:'wx'});
  replace(before,seeded);
  console.log(JSON.stringify({mode,keys:KEYS,rowsPerList:ROW_COUNT,backup:dir,identity:'unchanged'}));
 }else{
  stopped();const dir=fs.realpathSync(opts['--backup']);
  assert.ok(path.isAbsolute(opts['--backup'])&&path.dirname(dir)===fs.realpathSync(os.tmpdir())&&path.basename(dir).startsWith('kiwi-native-long-lists-'),'Use the private fixture backup directory');
  const file=path.join(dir,'exact-key-backup.json'),stat=fs.statSync(file);
  assert.equal(stat.uid,process.getuid(),'Backup must belong to this user');assert.equal(stat.mode&0o077,0,'Backup must remain private');
  const backup=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.ok(backup.version===1&&backup.db===db&&backup.sim===opts['--sim']&&backup.bundle===BUNDLE,'Backup belongs to another database/device');
  validateRows(backup.before);validateRows(backup.seeded);
  assert.equal(hash(backup.seeded),backup.seedHash,'Fixture backup is inconsistent');
  assert.equal(hash(rows()),backup.seedHash,'Fixture keys changed after seeding; refusing stale restore');
  replace(backup.seeded,backup.before);
  console.log(JSON.stringify({mode,keys:KEYS,restored:true,identity:'unchanged',backupRetained:true}));
 }
}catch(error){console.error(error.message);process.exitCode=1;}
