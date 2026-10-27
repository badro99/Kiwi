#!/usr/bin/env node
/* store-credit-restore-expiry-test · value given back to a voucher stays usable.
 *
 * A return on a ticket paid with a store credit puts that part back on the
 * original voucher (functions/api/sale/refund.js). The restore moved the
 * balance but not expires_ts: on a voucher that had expired in the meantime,
 * every redemption (expires_ts >= now) refused it, so the restored value was
 * lost without a word. A restore onto an expired voucher now gives it the
 * validity a new voucher gets (182 days, to the end of the store's business
 * day), and the ledger event says so.
 *
 * And GET /api/store-credits read only the merchant's latest 5000 events, so a
 * voucher whose history was older showed an empty history. It now reads each
 * returned voucher's own events and says when a long history is cut.
 *
 * Real routes on the SQLite D1 fixture; codes are generated test values. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
import { onRequestGet as creditsGet } from '../functions/api/store-credits.js';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = await fixture(ROOT);
const { sql, merchant } = f;
let checks = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const DAY = 86400000;
const now = Date.now();

console.log('store-credit-restore-expiry-test');
try {
  // A ticket paid entirely with a voucher that has since expired.
  f.insert('voucher-sale', 0, { method: 'credit', parts: [{ method: 'credit', amountCents: 5000 }] });
  sql.prepare(`INSERT INTO store_credits(id,merchant,code,customer_id,amount_cents,balance_cents,status,expires_ts,created_ts,updated_ts)
    VALUES('voucher-old',?,'AV-TESTOLD','client-fixture',5000,0,'consumed',?,?,?)`).run(merchant, now - 3 * DAY, now - 200 * DAY, now - 10 * DAY);
  sql.prepare(`INSERT INTO store_credit_events(id,merchant,credit_id,code,action,amount_cents,balance_after_cents,ref_id,ts)
    VALUES('spent-old',?,'voucher-old','AV-TESTOLD','redeem',5000,0,'voucher-sale',?)`).run(merchant, now - 10 * DAY);

  const back = await f.refund('return-old-voucher', 'voucher-sale', 5000);
  assert.equal(back.status, 200, JSON.stringify(back.body));
  const row = sql.prepare("SELECT balance_cents, status, expires_ts FROM store_credits WHERE id='voucher-old'").get();
  ok(Number(row.balance_cents) === 5000 && row.status === 'active', 'the returned value is back on the original voucher');
  ok(Number(row.expires_ts) > now + 180 * DAY, 'an expired voucher gets a new validity with the restored value');
  const event = sql.prepare("SELECT detail FROM store_credit_events WHERE credit_id='voucher-old' AND action='adjust'").get();
  ok(event && /prolong/i.test(event.detail), 'the ledger says the validity was extended');
  const spend = await f.call('credit', { action: 'redeem', code: 'AV-TESTOLD', amountCents: 5000, id: 'spend-restored' });
  ok(spend.status === 200, 'and the customer can spend it: nothing is lost silently');

  // A voucher still valid keeps its own expiry.
  f.insert('voucher-sale-2', 0, { method: 'credit', parts: [{ method: 'credit', amountCents: 3000 }] });
  const keep = now + 20 * DAY;
  sql.prepare(`INSERT INTO store_credits(id,merchant,code,customer_id,amount_cents,balance_cents,status,expires_ts,created_ts,updated_ts)
    VALUES('voucher-live',?,'AV-TESTLIVE','client-fixture',3000,0,'consumed',?,?,?)`).run(merchant, keep, now - 5 * DAY, now - 2 * DAY);
  sql.prepare(`INSERT INTO store_credit_events(id,merchant,credit_id,code,action,amount_cents,balance_after_cents,ref_id,ts)
    VALUES('spent-live',?,'voucher-live','AV-TESTLIVE','redeem',3000,0,'voucher-sale-2',?)`).run(merchant, now - 2 * DAY);
  assert.equal((await f.refund('return-live-voucher', 'voucher-sale-2', 3000)).status, 200);
  ok(Number(sql.prepare("SELECT expires_ts FROM store_credits WHERE id='voucher-live'").get().expires_ts) === keep,
    'a voucher that has not expired keeps its own expiry');

  // 5000 newer events on other vouchers must not hide this voucher's history.
  const insertEvent = sql.prepare(`INSERT INTO store_credit_events(id,merchant,credit_id,code,action,amount_cents,balance_after_cents,ref_id,ts)
    VALUES(?,?,'voucher-busy','AV-TESTBUSY','redeem',1,0,'',?)`);
  sql.exec('BEGIN');
  for (let i = 0; i < 5200; i++) insertEvent.run('busy-' + i, merchant, now + 1000 + i);
  sql.exec('COMMIT');
  const cookie = `${TILL_COOKIE}=${await tillToken(f.env.AUTH_SECRET, merchant)}`;
  const read = async (q) => {
    const res = await creditsGet({ env: f.env, request: new Request(`https://kiwi.test/api/store-credits?merchant=${merchant}&${q}`, { headers: { Cookie: cookie } }) });
    return res.json();
  };
  const old = (await read('code=AV-TESTOLD')).credits[0];
  ok(old && old.events.length >= 3, 'an older voucher still shows its own history behind 5000 newer events');
  ok(old.historyTruncated === false, 'and says its history is complete');
  sql.prepare(`INSERT INTO store_credits(id,merchant,code,customer_id,amount_cents,balance_cents,status,expires_ts,created_ts,updated_ts)
    VALUES('voucher-busy',?,'AV-TESTBUSY','client-fixture',9000,100,'active',?,?,?)`).run(merchant, now + 30 * DAY, now - DAY, now);
  const busy = (await read('code=AV-TESTBUSY')).credits[0];
  ok(busy.historyTruncated === true && busy.events.length > 0 && busy.events[0].ts >= busy.events[busy.events.length - 1].ts,
    'a very long history shows its latest events and says it is cut');
  console.log(`✓ store-credit-restore-expiry-test · ${checks} checks`);
} finally { f.close(); }
