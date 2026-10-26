#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* pin-announce-browser-test · §10.2 Rules, the message row (stage 3a).
 *
 * The real <k-pin-pad>, wired by KiwiPinFlow, real clicks on its keys:
 *   · every refusal of every use is written once into its stated region:
 *     polite (role=status) when the keys stay enabled, assertive (role=alert)
 *     when they are disabled;
 *   · a repeat of the same refusal, by the code typed again or by Try again,
 *     is written again;
 *   · a digit writes only the progress region, and never a digit;
 *   · with the network cut, three automatic retries with the same answer
 *     write nothing, and an automatic answer whose cause changed is written
 *     once.
 *
 *   node tools/pin-announce-browser-test.mjs */
import assert from 'node:assert/strict';
import { suite } from './browser-trace.mjs';
import { pinHost, mount, type, action, log, clearLog, t, settle } from './pin-host.mjs';

console.log('pin-announce-browser-test');
const h = await pinHost('pin-announce');
const S = suite('pin-announce', { browser: h.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const ok = (status, body) => ({ status, body });
const close = { kind: 'close_till', key: 'act.close_till' };
const cancelLive = { kind: 'cancel_order', key: 'act.cancel_order', args: { order: '#12' }, needsConnection: true };
const handover = { kind: 'shift_change', key: 'act.shift_change', args: { name: 'Sara' }, needsConnection: true };

/* [use, reply, ctx, key, args, region, repeat] · repeat: 'retype' | 'try' | null */
const ROWS = [
  ['dashboard', ok(401, { error: 'bad-pin' }), {}, 'pin.wrong', null, 'pol', 'retype'],
  ['dashboard', ok(401, { error: 'unauthorized' }), {}, 'pin.signed_out', null, 'ass', null],
  ['dashboard', ok(401, null), {}, 'pin.signed_out', null, 'ass', null],
  ['dashboard', ok(429, { retry_after: 240 }), {}, 'pin.paused.self', { minutes: 4 }, 'ass', 'retype'],
  ['dashboard', ok(503, {}), {}, 'pin.unavailable', null, 'pol', 'retype'],
  ['till', ok(401, { error: 'bad-pin' }), {}, 'pin.wrong', null, 'pol', 'retype'],
  ['till', ok(200, { ok: true, staff: { name: 'Youssef Alami', role: 'serveur' } }), {}, 'pin.not_till', { name: 'Youssef' }, 'pol', 'retype'],
  ['till', ok(403, { error: 'forbidden-till' }), { venue: 'Amira Cafe' }, 'pin.unpaired', { venue: 'Amira Cafe' }, 'ass', null],
  ['till', ok(429, { retry_after: 300 }), {}, 'pin.paused.store', { minutes: 5 }, 'ass', null],
  ['till', ok(503, {}), {}, 'pin.unavailable', null, 'pol', 'retype'],
  ['till', 'network', {}, 'pin.offline_unknown', null, 'pol', 'retype'],
  ['approval', ok(401, { error: 'bad-pin' }), { act: close }, 'pin.manager.wrong', null, 'pol', 'retype'],
  ['approval', ok(200, { ok: true, staff: { role: 'serveur' } }), { act: close }, 'pin.till.not_till', null, 'pol', 'retype'],
  ['approval', 'network', { act: close }, 'pin.offline_unknown', null, 'pol', 'retype'],
  ['approval', 'network', { act: cancelLive }, 'pin.till.needs_connection', { act: '@act' }, 'ass', 'try'],
  ['approval', ok(200, { ok: true, staff: { id: 'm1', role: 'manager' } }), { act: handover, incoming: { id: 'c2', name: 'Sara' } }, 'pin.till.not_incoming', { name: 'Sara' }, 'pol', 'retype'],
  ['manager', ok(200, { ok: true, staff: { role: 'caisse' } }), { act: { kind: 'discount', key: 'act.discount.pct', args: { pct: '10 %' } } }, 'pin.manager.not_manager', null, 'pol', 'retype'],
  ['manager', ok(401, { error: 'bad-pin' }), { act: { kind: 'discount', key: 'act.discount.pct' } }, 'pin.manager.wrong', null, 'pol', 'retype'],
  ['manager', ok(403, { error: 'manager-required' }), { act: { kind: 'cancel_sale', key: 'act.cancel_sale' } }, 'pin.manager.not_manager', null, 'pol', 'retype'],
  ['manager', 'network', { act: { kind: 'refund', key: 'act.refund' } }, 'pin.manager.offline', null, 'ass', 'try'],
  ['team', ok(401, { error: 'bad-employee-code' }), {}, 'team.bad', null, 'pol', 'retype'],
  ['team', ok(409, { error: 'employee-access-ambiguous' }), {}, 'team.ambiguous', null, 'pol', 'retype'],
  ['team', ok(403, { error: 'store-suspended' }), {}, 'access.suspended', null, 'ass', null],
  ['team', 'network', {}, 'pin.offline', null, 'ass', 'try'],
  ['clock', ok(403, { error: 'attendance-code-invalid' }), {}, 'clock.invalid', null, 'pol', 'retype'],
  ['clock', ok(401, { error: 'employee-session-required' }), {}, 'team.session_ended', null, 'ass', null],
  ['clock', ok(503, { error: 'attendance-write-failed' }), {}, 'clock.not_recorded', null, 'pol', 'try'],
  ['clock', 'network', {}, 'pin.offline', null, 'ass', 'try'],
  ['pair', ok(422, { error: 'invalid_or_expired' }), {}, 'pair.invalid', null, 'pol', 'retype'],
  ['pair', 'network', {}, 'pair.no_answer', null, 'pol', null],
  ['pair', ok(429, { retry_after: 900 }), {}, 'pair.paused', { minutes: 15 }, 'ass', null],
  ['pair', ok(503, {}), {}, 'pin.unavailable', null, 'pol', 'retype'],
  ['store', ok(422, { error: 'invalid_or_expired' }), {}, 'pair.invalid', null, 'pol', 'retype'],
  ['store', ok(404, {}), {}, 'pin.unavailable', null, 'pol', 'retype'],
];
const LEN = { dashboard: 4, till: 4, approval: 4, manager: 4, team: 4, clock: 6, pair: 6, store: 6 };

await S.run('every refusal, every use, once in its region', async (tr) => {
  const page = tr.watch(await h.open());
  for (const [use, reply, ctx, key, args, region, repeat] of ROWS) {
    const actLabel = ctx.act ? await t(page, ctx.act.key, ctx.act.args) : '';
    const a = args && args.act === '@act' ? { act: actLabel } : args;
    let want = await t(page, key, a || {});
    if (key === 'pin.paused.store' && ctx.pinUnlock) want += ' ' + await t(page, 'pin.paused.owner_hint');
    await mount(page, use, { replies: [reply, reply], ctx });
    const code = '1234567'.slice(0, LEN[use]);
    await type(page, code.slice(0, -1));
    await settle(page, 60);
    const digits = await log(page);
    const prog = await t(page, 'pin.progress', { n: 1, total: LEN[use] });
    check(digits.length === LEN[use] - 1 && digits.every((w) => w.r === 'prog' && !/[1-9]/.test(w.text.replace(/\d+ of \d+|\d+ sur \d+/, ''))) && digits[0].text === prog,
      `${use}: a digit writes only the progress region, never the digit (${JSON.stringify(digits.map((x) => x.r + ':' + x.text))})`);
    await type(page, code.slice(-1));
    await settle(page, 900);
    let w = (await log(page)).filter((x) => x.r !== 'prog');
    const checking = (await log(page)).filter((x) => x.r === 'prog').pop();
    check(checking && checking.text === await t(page, 'pin.checking'), `${use} · ${key}: the progress region says ${checking && checking.text}`);
    check(w.length === 1 && w[0].text === want && w[0].r === region, `${use} · ${key}: written once, ${region === 'pol' ? 'politely' : 'assertively'} (${JSON.stringify(w.map((x) => x.r + ':' + x.text))})`);
    if (repeat) {
      await clearLog(page);
      if (repeat === 'retype') await type(page, code); else await action(page);
      await settle(page, 900);
      w = (await log(page)).filter((x) => x.r !== 'prog');
      check(w.length === 1 && w[0].text === want && w[0].r === region, `${use} · ${key}: the repeat ${repeat === 'try' ? '(Try again)' : '(typed again)'} is written again`);
    }
  }
});

await S.run('automatic retries write nothing; a changed cause writes once', async (tr) => {
  const page = tr.watch(await h.open());
  await mount(page, 'team', { scale: 100, replies: Array(40).fill('network') });
  await type(page, '1234');
  await page.waitForFunction(() => window.__sent.length >= 4, { timeout: 5000 });
  await settle(page, 0);
  let sentN = await page.evaluate(() => window.__sent.length);
  let w = (await log(page)).filter((x) => x.r !== 'prog');
  check(sentN >= 4, `the pad retried by itself (${sentN} requests)`);
  check(w.length === 1 && w[0].text === await t(page, 'pin.offline'), 'three automatic retries with the same answer wrote nothing more');
  await page.evaluate(() => { window.__replies.length = 0; window.__replies.push({ status: 401, body: { error: 'bad-employee-code' } }); });
  const before = await page.evaluate(() => window.__sent.length);
  await page.waitForFunction((n) => window.__sent.length > n, { timeout: 5000 }, before);
  await settle(page, 200);
  w = (await log(page)).filter((x) => x.r !== 'prog');
  check(w.length === 2 && w[1].text === await t(page, 'team.bad') && w[1].r === 'pol', 'the connection is back and the code refused: written once, politely');
});

await S.run('Arabic and French copy, the same regions', async (tr) => {
  for (const lang of forLocales(['fr', 'ar'])) {
    const page = tr.watch(await h.open({ lang }));
    await mount(page, 'till', { replies: [{ status: 401, body: { error: 'bad-pin' } }] });
    await type(page, '1234'); await settle(page, 900);
    const w = (await log(page)).filter((x) => x.r !== 'prog');
    const want = await t(page, 'pin.wrong');
    check(w.length === 1 && w[0].text === want && want !== 'pin.wrong' && w[0].r === 'pol', `${lang}: ${want}`);
  }
});

await h.close();
console.log(`✓ pin-announce-browser-test · ${checks} checks`);
await S.finish();
