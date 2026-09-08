import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet } from '../functions/api/order/activity.js';
import { onRequestPost } from '../functions/api/order/queue.js';
import { onRequestPost as verifyPin } from '../functions/api/pin/verify.js';
import { readTillActorProof } from '../functions/auth/_lib.js';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(read('schema.sql'));
const env = { AUTH_SECRET: 'activity-memory-only-fixture', DB: { prepare(sql) {
  let args = [];
  return { bind(...v) { assert.ok(v.length <= 100); args = v; return this; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: db.prepare(sql).run(...args).changes } }; } };
  },
  async batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
} };
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const merchant = 'activity-fixture', now = Date.now(), from = now - 86400000, to = now + 86400000;
db.prepare(`INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES ('account','memory@example.test',?,'x','x',?)`).run(merchant, now);
db.prepare(`INSERT INTO merchant_config(merchant,features,plan,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?,?)`)
  .run(merchant, '{}', 'pro', 'restaurant', 'account', 'Activity Fixture', 'active', now);
const owner = `${SESS_COOKIE}=${await makeSession('account', env.AUTH_SECRET)}`;
const till = `${TILL_COOKIE}=${await tillToken(env.AUTH_SECRET, merchant)}`;
const get = (params = {}, cookie = owner, environment = env) => onRequestGet({ env: environment, request: new Request(
  'https://kiwi.test/api/order/activity?' + new URLSearchParams({ merchant, from, to, ...params }), { headers: { Cookie: cookie } }) });
assert.equal((await get({}, '')).status, 403);
assert.equal((await get({ merchant: 'another-merchant' })).status, 403);
assert.equal((await get({}, till)).status, 403);
check('owner-only history rejects unauthenticated, till and foreign merchant reads', () => {});
assert.equal((await get({ from: 'NaN' })).status, 400);
assert.equal((await get({ to: from + 40 * 86400000 })).status, 400);
check('date windows are finite and bounded', () => {});

const session = 'tsx-abcdefghijklmnopqrstuv';
db.prepare(`INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts) VALUES (?,?,'table','8','open',?,?)`).run(session, merchant, now, now);
db.prepare(`INSERT INTO orders(id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id) VALUES ('order19',?,19,'table','8',101,?,'accepted',?,?,?)`).run(merchant, JSON.stringify([{ name: 'Pappardelle', qty: 1, total: 86 }, { name: 'Fanta Citron', qty: 1, total: 15 }]), now, now, session);
const close = async why => {
  const deferred = [];
  const response = await onRequestPost({ env, waitUntil: p => deferred.push(p), request: new Request('https://kiwi.test/api/order/queue', {
    method: 'POST', headers: { Cookie: till, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, closeSession: session, closedBy: why }) }) });
  await Promise.all(deferred);
  assert.equal(response.status, 200);
};
await close('caisse');
await close('caisse');
check('actual manual reset and retry close the visit without inventing payment or receipts', () => {
  assert.equal(db.prepare('SELECT paid_ts FROM orders WHERE id=?').get('order19').paid_ts, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sales').get().n, 0);
});
let data = await (await get()).json();
check('legacy closure history preserves order19,101MAD and unknown actor with zero cash movement', () => {
  assert.equal(data.events.length, 1);
  assert.equal(data.events[0].amountCents, 0);
  assert.equal(data.events[0].orderAmountCents, 10100);
  assert.equal(data.events[0].orders[0].number, 19);
  assert.equal(data.events[0].actor, '');
});
await close('settle');
check('explicit settlement retains existing payment semantics', () => {
  assert.ok(db.prepare('SELECT paid_ts FROM orders WHERE id=?').get('order19').paid_ts);
});
db.prepare(`INSERT INTO staff_pins(id,merchant,pin,name,role,created_ts) VALUES ('pin-sara',?,'4826','Sara','Caisse',?)`).run(merchant, now);
const proofResponse = await verifyPin({ env, request: new Request('https://kiwi.test/api/pin/verify', {
  method: 'POST', headers: { Cookie: till, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, pin: '4826' }) }) });
assert.equal(proofResponse.status, 200);
const { actorProof } = await proofResponse.json();
assert.ok(actorProof);
assert.equal((await readTillActorProof(actorProof, env.AUTH_SECRET, merchant)).name, 'Sara');
assert.equal(await readTillActorProof(actorProof, env.AUTH_SECRET, 'foreign'), null);
assert.equal(await readTillActorProof(actorProof + 'a', env.AUTH_SECRET, merchant), null);
db.prepare(`UPDATE table_sessions SET status='open', closed_ts=NULL WHERE id=?`).run(session);
const attributedClose = await onRequestPost({ env, request: new Request('https://kiwi.test/api/order/queue', {
  method: 'POST', headers: { Cookie: till, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, closeSession: session, closedBy: 'caisse', actorProof, actor: 'Forged name' }) }) });
assert.equal(attributedClose.status, 200);
await close('caisse');
check('actual PIN verifier signs Sara; atomic closure ignores forged names and preserves the first actor on retry', () => {
  const row = db.prepare('SELECT closed_actor_id,closed_actor_name FROM table_sessions WHERE id=?').get(session);
  assert.equal(row.closed_actor_id, 'pin-sara'); assert.equal(row.closed_actor_name, 'Sara');
});
db.prepare(`INSERT INTO sales(id,merchant,amount,amount_cents,method,ref,ts,lines) VALUES ('original',?,50,5025,'cash','Ticket 4',?,?)`).run(merchant, now, '[{"n":"Coffee","q":1,"t":50.25}]');
for (let i = 0; i < 103; i++) db.prepare(`INSERT INTO sale_audit(merchant,sale_id,action,amount_cents,ts,actor,method) VALUES (?,'original','void',5025,?,'Hafid','cash')`).run(merchant, now);
db.prepare(`INSERT INTO sale_audit(merchant,sale_id,action,amount_cents,ts,note,ref,reason,method) VALUES (?,'original','refund',1225,?,'refund1','R-1','customer-return','cash')`).run(merchant, now);
db.prepare(`INSERT INTO sale_audit(merchant,sale_id,action,amount_cents,ts) VALUES ('another-merchant','original','void',99999,?)`).run(now);
const events = [];
let next;
do {
  data = await (await get(next || {})).json();
  events.push(...data.events); next = data.next;
} while (next);
check('keyset pagination preserves all equal-timestamp events without duplicates or cross-tenant rows', () => {
  assert.equal(events.length, 105);
  assert.equal(new Set(events.map(e => e.eventId)).size, 105);
  assert.ok(events.every(e => e.amountCents !== 99999));
});
check('refund audit links the counter-entry to the original receipt with exact cents', () => {
  const r = events.find(e => e.kind === 'refund');
  assert.equal(r.refundId, 'refund1'); assert.equal(r.originalRef, 'Ticket 4'); assert.equal(r.amountCents, 1225);
});
db.prepare(`INSERT INTO orders(id,merchant,number,mode,total,lines,status,created_ts,updated_ts) VALUES ('ord-cancel-fixture',?,20,'takeout',15,'[]','pending',?,?)`).run(merchant, now, now);
const reject = proof => onRequestPost({ env, request: new Request('https://kiwi.test/api/order/queue', {
  method: 'POST', headers: { Cookie: till, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, id: 'ord-cancel-fixture', status: 'rejected', actorProof: proof, actor: 'Spoof' }) }) });
assert.equal((await reject(actorProof + 'x')).status, 403);
assert.equal(db.prepare("SELECT status FROM orders WHERE id='ord-cancel-fixture'").get().status, 'pending');
assert.equal((await reject(actorProof)).status, 200);
assert.equal((await reject(actorProof)).status, 200);
db.prepare("UPDATE staff_pins SET name='Renamed person' WHERE id='pin-sara'").run();
check('PIN-backed order cancellation rejects forged proof and keeps its historical actor and timestamp on retry', () => {
  const r = db.prepare("SELECT cancel_actor_id,cancel_actor_name,cancel_ts,paid_ts FROM orders WHERE id='ord-cancel-fixture'").get();
  assert.equal(r.cancel_actor_id, 'pin-sara'); assert.equal(r.cancel_actor_name, 'Sara'); assert.ok(r.cancel_ts); assert.equal(r.paid_ts,null);
});
db.exec('ALTER TABLE sale_audit RENAME TO hidden_audit');
assert.equal((await get()).status, 503);
check('unavailable history returns failure, never a misleading empty list', () => {});
db.close();

// Actual renderer and async history loader, with a deterministic server boundary.
const source = read('assets/pages-pro.js');
const fragment = source.slice(source.indexOf('  function ensureRtxStyles()'), source.indexOf('  function renderStarter(nav, meta)'));
const nodes = new Map();
let html = '', title = '', tenant = merchant, fail = false, sales = [{ id: 'sale1', amount: 50.25, ts: now, method: 'cash', lines: [] }];
let refunds = [{ id: 'refund1', amount: 12.25, ts: now, method: 'cash' }];
const fixtureEvents = events.filter(e => e.kind !== 'void').concat(events.find(e => e.kind === 'void'));
const document = { hidden: false, getElementById: id => nodes.get(id), createElement: () => ({}),
  head: { appendChild: n => nodes.set(n.id, n) }, querySelector: () => ({}) };
const ctx = vm.createContext({ console, document, Date, URLSearchParams, AbortController, setTimeout, clearTimeout,
  T: o => o.fr, escS: s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), STARTERS: { transactions: {} },
  window: { KiwiLive: { merchant: () => tenant }, KiwiSales: { list: () => sales }, KiwiRefunds: { list: () => refunds },
    Kiwi: { appPage: (_page, data) => { html = data.body; title = data.title; } } },
  fetch: async url => {
    if (fail) return { ok: false };
    const q = new URL(url, 'https://kiwi.test').searchParams;
    return { ok: true, json: async () => ({ merchant: q.get('merchant'), from: +q.get('from'), to: +q.get('to'), events: tenant === merchant ? fixtureEvents : [], next: null }) };
  },
});
vm.runInContext(fragment, ctx);
const render = () => vm.runInContext("renderRealTransactions('transactions', {})", ctx);
const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };
render(); await drain();
check('actual view distinguishes net38MAD, one refund and informational cancellation value', () => {
  assert.equal(title, 'Ventes & activité'); assert.ok(html.includes('38 <small>MAD'));
  assert.equal((html.match(/Détails du remboursement/g) || []).length, 1);
  assert.ok(html.includes('Ticket 4')); assert.ok(html.includes('101 MAD'));
  assert.ok(html.includes('Identité non enregistrée')); assert.ok(html.includes('Sans mouvement d’argent'));
});
const visualFixture = html;
vm.runInContext("salesKindByMerchant[auditMerchant()]='cancel'", ctx); render();
check('cancellation-only filter leaves cash summary intact and hides financial rows', () => {
  assert.ok(html.includes('38 <small>MAD')); assert.ok(!html.includes('Détails du remboursement'));
  assert.ok(html.includes('Table fermée / remise à zéro'));
});
vm.runInContext("salesMethodsByMerchant[auditMerchant()]=['card']", ctx); render();
check('method filter excludes unrecorded payment methods and recomputes summary', () => {
  assert.ok(html.includes('0 <small>MAD')); assert.ok(!html.includes('Table fermée / remise à zéro'));
});
tenant = 'empty-merchant'; sales = []; refunds = []; render(); await drain();
check('merchant switch clears old history and supports empty real accounts', () => {
  assert.ok(!html.includes('101 MAD')); assert.ok(html.includes('Aucune activité'));
});
fail = true; vm.runInContext('loadCancelAudit(true)', ctx); await drain();
check('failed refresh explicitly warns about incomplete activity', () => assert.ok(html.includes('Journal indisponible')));
console.log(`Dashboard activity: ${checks} behavioral checks passed.`);
if (process.env.KIWI_ACTIVITY_VISUAL === '1') {
  const { createRequire } = await import('node:module');
  const require = createRequire(new URL('../app/package.json', import.meta.url));
  const browser = await require('puppeteer-core').launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true); page.on('request', r => r.abort());
    await page.setContent(`<html lang="fr"><head><style>:root{--atlas:#087454;--ink:#15251e;--surface:white;--inverse-surface:#063f31;--inverse-ink:white;--danger:#b44338;--sans:Arial,sans-serif;--mono:monospace;--n-100:#eef1ee;--n-200:#dbe3df;--n-500:#69766f}*{box-sizing:border-box}body{margin:0;background:#f6f8f7;color:var(--ink);font-family:var(--sans)}main{max-width:1080px;margin:32px auto;padding:28px;background:white;border-radius:20px}h1{font-size:36px;margin:0 0 20px}button{font:inherit}@media(max-width:600px){main{margin:0;padding:16px}h1{font-size:28px}}</style><style>${nodes.get('rtx-style')?.textContent || [...nodes.values()].map(n=>n.textContent).join('')}</style></head><body><main><h1>Ventes & activité</h1>${visualFixture}</main></body></html>`);
    for (const [name, width, rtl] of [['desktop',1200,false],['mobile',390,false],['rtl',390,true]]) {
      await page.setViewport({width,height:900});
      await page.evaluate(rtl => { document.documentElement.dir = rtl ? 'rtl' : 'ltr'; },rtl);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false, name+' has no horizontal overflow');
      await page.screenshot({path:`/tmp/kiwi-activity-${name}.png`,fullPage:true});
    }
    await page.click('details summary');
    assert.ok(await page.$eval('details',el=>el.open),'details opens by click');
  } finally { await browser.close(); }
}
