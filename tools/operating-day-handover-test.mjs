#!/usr/bin/env node
/* QA12 · a served takeaway is a PIN-attributed handover, never a table reset. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as queuePost } from '../functions/api/order/queue.js';
import { onRequestGet as activityGet } from '../functions/api/order/activity.js';
import { onRequestPost as verifyPin } from '../functions/api/pin/verify.js';
import { makeSession, SESS_COOKIE, tillToken, TILL_COOKIE, readTillActorProof } from '../functions/auth/_lib.js';

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const merchant = 'qa12-handover', now = Date.now(), from = now - 86400000, to = now + 86400000;
const secret = 'qa12-secret';
const raw = (sql, ...args) => db.prepare(sql).all(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
const env = { AUTH_SECRET: secret, DB: {
  prepare(sql) {
    let args = [];
    const s = {
      sql,
      bind(...values) { args = values.map(v => v === undefined ? null : v); return s; },
      first: async () => db.prepare(sql).get(...args) || null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
    };
    return s;
  },
  async batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      db.exec('COMMIT');
      return out;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  },
} };

let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log(`✓ ${label}`); };
const request = (body, cookie) => new Request('https://kiwi.test/api/order/queue', {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const activity = (cookie) => activityGet({ env, request: new Request(
  `https://kiwi.test/api/order/activity?merchant=${merchant}&from=${from}&to=${to}`,
  { headers: { Cookie: cookie } },
) });

const account = 'qa12-account';
run(`INSERT INTO accounts(id,email,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?)`, account, 'qa12@test', merchant, 's', 'h', now);
run(`INSERT INTO merchant_config(merchant,features,plan,type,account_id,name,status,updated_ts) VALUES (?,?,?,?,?,?,?,?)`,
  merchant, '{}', 'pro', 'restaurant', account, 'QA12', 'active', now);
const owner = `${SESS_COOKIE}=${await makeSession(account, secret)}`;
const till = `${TILL_COOKIE}=${await tillToken(secret, merchant)}`;
run(`INSERT INTO staff_pins(id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)`, 'pin-qa12', merchant, '4826', 'Sara', 'Caisse', now);
const proofResponse = await verifyPin({ env, request: new Request('https://kiwi.test/api/pin/verify', {
  method: 'POST', headers: { Cookie: till, 'Content-Type': 'application/json' },
  body: JSON.stringify({ merchant, pin: '4826' }),
}) });
assert.equal(proofResponse.status, 200);
const proof = (await proofResponse.json()).actorProof;
assert.ok(proof);
const verifiedActor = await readTillActorProof(proof, secret, merchant);
const foreignActor = await readTillActorProof(proof, secret, 'other-merchant');
check('PIN verifier mints a merchant-bound actor proof', () => {
  assert.ok(verifiedActor); assert.equal(verifiedActor.id, 'pin-qa12'); assert.equal(verifiedActor.name, 'Sara');
  assert.equal(foreignActor, null);
});

const session = 'tsx-qa12takeout-session';
const order = 'ord-qa12-handover';
run(`INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts)
     VALUES (?,?,'takeout','', 'open', ?, ?)`, session, merchant, now, now);
run(`INSERT INTO orders(id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id)
     VALUES (?, ?, 12, 'takeout', '', 79, ?, 'ready', ?, ?, ?)`,
  order, merchant, JSON.stringify([{ name: 'Pasta Corner', qty: 1, unitPrice: 79, total: 79 }]), now, now, session);

const forged = await queuePost({ env, request: request({ merchant, id: order, status: 'served', actor: 'Forged cashier' }, till) });
assert.equal(forged.status, 403);
check('served takeaway refuses a client-asserted identity', () => {
  assert.equal(raw('SELECT status FROM orders WHERE id=?', order)[0].status, 'ready');
  assert.equal(raw('SELECT status FROM table_sessions WHERE id=?', session)[0].status, 'open');
});

const handed = await queuePost({ env, request: request({ merchant, id: order, status: 'served', actor: 'Forged cashier', actorProof: proof }, till) });
assert.equal(handed.status, 200, await handed.text());
await new Promise(resolve => setImmediate(resolve));
check('real queue handler records the trusted PIN actor at handover mutation time', () => {
  const s = raw('SELECT status,closed_by,closed_actor_id,closed_actor_name FROM table_sessions WHERE id=?', session)[0];
  assert.equal(s.status, 'closed'); assert.equal(s.closed_by, 'takeout-handover');
  assert.equal(s.closed_actor_id, 'pin-qa12'); assert.equal(s.closed_actor_name, 'Sara');
  assert.equal(raw('SELECT status FROM orders WHERE id=?', order)[0].status, 'served');
});

const replay = await queuePost({ env, request: request({ merchant, id: order, status: 'served', actor: 'Another forged name' }, till) });
assert.equal(replay.status, 200);
assert.equal((await replay.json()).replayed, true);
check('an already-served replay needs no PIN and does not overwrite its actor', () => {
  const s = raw('SELECT closed_actor_id,closed_actor_name FROM table_sessions WHERE id=?', session)[0];
  assert.equal(s.closed_actor_id, 'pin-qa12'); assert.equal(s.closed_actor_name, 'Sara');
});

const invalidSession = 'tsx-qa12-invalid-session';
const invalidOrder = 'ord-qa12-invalid-transition';
run(`INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts)
     VALUES (?,?,'takeout','', 'open', ?, ?)`, invalidSession, merchant, now, now);
run(`INSERT INTO orders(id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id)
     VALUES (?, ?, 13, 'takeout', '', 40, ?, 'pending', ?, ?, ?)`,
  invalidOrder, merchant, JSON.stringify([{ name: 'Soup', qty: 1, unitPrice: 40, total: 40 }]), now, now, invalidSession);
const invalid = await queuePost({ env, request: request({ merchant, id: invalidOrder, status: 'served', actorProof: proof }, till) });
assert.equal(invalid.status, 409);
check('an invalid handover transition cannot close its still-open session', () => {
  assert.equal(raw('SELECT status FROM orders WHERE id=?', invalidOrder)[0].status, 'pending');
  assert.equal(raw('SELECT status FROM table_sessions WHERE id=?', invalidSession)[0].status, 'open');
});

const failedSession = 'tsx-qa12-failed-session';
const failedOrder = 'ord-qa12-failed-write';
run(`INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts)
     VALUES (?,?,'takeout','', 'open', ?, ?)`, failedSession, merchant, now, now);
run(`INSERT INTO orders(id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id)
     VALUES (?, ?, 14, 'takeout', '', 41, ?, 'ready', ?, ?, ?)`,
  failedOrder, merchant, JSON.stringify([{ name: 'Salad', qty: 1, unitPrice: 41, total: 41 }]), now, now, failedSession);
const failingEnv = { ...env, DB: { ...env.DB, async batch(statements) {
  if (statements.some(s => /closed_actor_id/.test(s.sql || ''))) throw new Error('simulated actor-column write failure');
  return env.DB.batch(statements);
} } };
const failed = await queuePost({ env: failingEnv, request: request({ merchant, id: failedOrder, status: 'served', actorProof: proof }, till) });
assert.equal(failed.status, 503);
check('a handover actor-write failure is fail-closed', () => {
  assert.equal(raw('SELECT status FROM orders WHERE id=?', failedOrder)[0].status, 'ready');
  assert.equal(raw('SELECT status FROM table_sessions WHERE id=?', failedSession)[0].status, 'open');
});

const legacySession = 'tsx-qa12-legacy-session';
const legacyOrder = 'ord-qa12-legacy-served';
run(`INSERT INTO table_sessions(id,merchant,mode,table_no,status,opened_ts,seen_ts,closed_ts,closed_by)
     VALUES (?,?,'takeout','', 'closed', ?, ?, ?, 'served')`, legacySession, merchant, now - 5000, now - 5000, now - 4000);
run(`INSERT INTO orders(id,merchant,number,mode,table_no,total,lines,status,created_ts,updated_ts,session_id)
     VALUES (?, ?, 15, 'takeout', '', 22, ?, 'served', ?, ?, ?)`,
  legacyOrder, merchant, JSON.stringify([{ name: 'Tea', qty: 1, unitPrice: 22, total: 22 }]), now - 5000, now - 4000, legacySession);

const ownerActivity = await activity(owner);
assert.equal(ownerActivity.status, 200);
const events = (await ownerActivity.json()).events;
check('legacy activity projection emits a distinct handover with order detail', () => {
  const current = events.find(event => event.sessionId === session);
  const legacy = events.find(event => event.sessionId === legacySession);
  assert.ok(current); assert.equal(current.kind, 'takeout-handover');
  assert.equal(current.actor, 'Sara'); assert.equal(current.actorId, 'pin-qa12');
  assert.equal(current.orders[0].number, 12); assert.equal(current.orderAmountCents, 7900);
  assert.ok(legacy); assert.equal(legacy.kind, 'takeout-handover');
  assert.equal(legacy.actor, ''); assert.equal(legacy.actorId, '');
});

const source = fs.readFileSync(new URL('../assets/pages-pro.js', import.meta.url), 'utf8');
check('localized UI distinguishes handover from table closure and excludes it from closure count', () => {
  assert.match(source, /v\.kind === 'takeout-handover'/);
  assert.match(source, /Commande remise au client/); assert.match(source, /Order handed to customer/); assert.match(source, /سُلِّم الطلب إلى العميل/);
  assert.match(source, /v\.kind !== 'restore' && v\.kind !== 'takeout-handover'/);
  assert.match(source, /\['handover',/);
  assert.match(source, /selectedKind === 'cancel' && v\.kind !== 'takeout-handover'/);
  assert.match(source, /selectedKind === 'handover' && v\.kind === 'takeout-handover'/);
  assert.match(source, /Customer handovers/);
});

const inbox = fs.readFileSync(new URL('../assets/orderpro-inbox.js', import.meta.url), 'utf8');
check('OrderPro inbox requires the existing PIN authorization callback for takeaway handover', () => {
  assert.match(inbox, /status === 'served' && state\.orders\[id\] && state\.orders\[id\]\.mode === 'takeout'/);
  assert.match(inbox, /Remise de la commande au client/);
  assert.match(inbox, /extra\.actorProof/);
});

console.log(`QA12 handover: ${checks} checks passed.`);
db.close();
