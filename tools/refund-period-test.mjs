import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
// Execute the actual GET with only authentication and HTTP serialization doubled.
const src = fs.readFileSync('functions/api/sale/refund.js', 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE sales(id TEXT, merchant TEXT, ref TEXT, void_ts INTEGER);
 CREATE TABLE sale_audit(note TEXT, ts INTEGER, amount_cents INTEGER, amount REAL, reason TEXT, sale_id TEXT, actor TEXT, merchant TEXT, action TEXT);
 CREATE TABLE store_credit_events(id TEXT, ts INTEGER, amount_cents INTEGER, ref_id TEXT, actor TEXT, merchant TEXT, action TEXT, credit_id TEXT);
 CREATE TABLE store_credits(id TEXT, merchant TEXT, reason TEXT);`);
db.exec("INSERT INTO sales VALUES ('sale','shop','ticket',NULL); INSERT INTO store_credits VALUES ('credit','shop','return');");
for (let i = 0; i < 1200; i++) {
 db.prepare("INSERT INTO sale_audit VALUES (?, ?, 123, 1.23, 'return', 'sale', 'actor', 'shop', 'refund')").run(String(i), i);
 db.prepare("INSERT INTO store_credit_events VALUES (?, ?, 234, 'sale', 'actor', 'shop', 'issue', 'credit')").run(String(i), i);
}
const sqls = [];
const env = { DB: { prepare(sql) { sqls.push(sql); return { bind(...args) { return { all: async () => ({ results: db.prepare(sql).all(...args) }) }; } }; } } };
const ctx = vm.createContext({ URL, entitledMerchant: async () => 'shop', json: (data, status = 200) => ({ data, status }) });
vm.runInContext(src.slice(src.indexOf('export async function onRequestGet')).replace('export ', ''), ctx);
const get = query => ctx.onRequestGet({ request: { url: 'https://local/api/sale/refund?merchant=shop' + query }, env });
let offset = 0, rows = [];
do {
 const r = await get('&since=200&until=800&offset=' + offset);
 assert.equal(r.status, 200); rows.push(...r.data.list); offset = r.data.next;
} while (offset !== null);
assert.equal(rows.length, 1200, 'both branches paginated within window');
assert.equal(new Set(rows.map(r => r.id)).size, 1200, 'stable paging with tied timestamps');
assert.ok(rows.every(r => r.ts >= 200 && r.ts < 800));
assert.equal(rows.filter(r => r.kind === 'avoir').length, 600);
for (const q of ['&since=-1','&until=NaN','&since=','&since=2.5','&since=9007199254740992','&since=800&until=200']) assert.equal((await get(q)).status, 400, q);
assert.equal((await get('&since=1199')).data.list.length, 2);
assert.equal((await get('&until=1')).data.list.length, 2);
assert.equal((await get('')).data.next, 500, 'standalone full history');
assert.ok(sqls[0].includes('a.ts >= ?') && sqls[0].includes('e.ts >= ?'), 'index-friendly branch predicates');
db.close();
console.log('PASS refund period: validated milliseconds, both UNION branches, exclusive upper bound and stable pagination');
