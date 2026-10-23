#!/usr/bin/env node
/* reset-states-test · every answer of /auth/forgot and /auth/reset lands on its
 * §18.8 state (design 2027, stage 6; revision 8), on the kit's reset page
 * behind kiwiSkin2027:access.
 *
 *   node tools/reset-states-test.mjs
 *
 * Two halves, one truth:
 *   1. The answers are the real handlers' (functions/auth/forgot.js and
 *      reset.js over SQLite, as forgot-password-test runs them), made to give
 *      each answer the table lists: not-configured, bad-json (a malformed body,
 *      posted once to prove the route), invalid, the four weak reasons, the
 *      limiter's 429 and its 503, update-failed with and without retry (a
 *      database that refuses the password write, then the hand-back), and 200.
 *   2. Each recorded answer is served to reset.html in Chromium, and the page
 *      must land on its row: R1 to R7, with the banner, the field error, the
 *      primary's state and the remembered address as §18.8 says.
 * And the flag: off, the shipped flow draws and no kit file loads. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

import { onRequestPost as postForgot } from '../functions/auth/forgot.js';
import { onRequestGet as getReset, onRequestPost as postReset } from '../functions/auth/reset.js';
import { hashPassword } from '../functions/auth/_lib.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* ── 1 · the real answers ─────────────────────────────────────────────────── */
const SECRET = 'reset-states-test-secret-32-chars!!';
const db = new DatabaseSync(':memory:');
const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
db.exec(schema);
const norm = (sql) => String(sql).replace(/\s+/g, ' ').trim();
/* A D1 over SQLite; `fail` names statements that throw, to reach the faults. */
function makeD1(fail = () => false) {
  return {
    prepare(sql) {
      const q = norm(sql);
      let args = [];
      const stmt = {
        bind(...v) { args = v; return stmt; },
        async first() { if (fail(q)) throw new Error('db down'); const r = db.prepare(q).get(...args); return r === undefined ? null : r; },
        async all() { if (fail(q)) throw new Error('db down'); return { results: db.prepare(q).all(...args) }; },
        async run() { if (fail(q)) throw new Error('db down'); const r = db.prepare(q).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      };
      return stmt;
    },
  };
}
const mails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://mail.test/')) { mails.push(JSON.parse(init.body)); return new Response('ok'); }
  return realFetch(url, init);
};
const quiet = console.error; console.error = () => {};
const { salt, hash } = await hashPassword('Old-Password-123!');
/* One account per token: the forgot route sends one mail per address. */
for (const n of [1, 2, 3]) {
  db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status) VALUES (?,?,?,?,?,?,?,?)')
    .run('acc-' + n, (n === 1 ? 'owner' : 'owner' + n) + '@reset.test', 'Test', 'Boutique Atlas ' + n, salt, hash, Date.now(), 'active');
}

const env = { DB: makeD1(), AUTH_SECRET: SECRET, MAIL_WEBHOOK: 'https://mail.test/hook' };
const envNoMail = { DB: makeD1(), AUTH_SECRET: SECRET };
let ip = 10;
const req = (url, body, raw) => new Request('https://kiwi.test' + url, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.' + (ip++) }, body: raw != null ? raw : JSON.stringify(body),
});
const jobs = [];
const answer = async (res) => ({ status: res.status, body: await res.text() });
const forgot = async (e, body, raw) => { const r = await postForgot({ env: e, request: req('/auth/forgot', body, raw), waitUntil: (p) => jobs.push(p) }); await Promise.all(jobs.splice(0)); return answer(r); };
const resetGet = async (e, token) => answer(await getReset({ env: e, request: new Request('https://kiwi.test/auth/reset?token=' + encodeURIComponent(token)) }));
const resetPost = async (e, body, raw, sameIp) => answer(await postReset({ env: e, request: sameIp ? new Request('https://kiwi.test/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': sameIp }, body: JSON.stringify(body) }) : req('/auth/reset', body, raw) }));
const freshToken = async (email) => {
  const before = mails.length;
  await forgot(env, { email });
  assert.equal(mails.length, before + 1, 'a reset mail for ' + email);
  const m = /reset\.html\?token=([^\s]+)/.exec(mails[mails.length - 1].text);
  return decodeURIComponent(m[1]);
};

console.log('reset-states-test');
const A = {};
const tok = await freshToken('owner@reset.test');
A.forgotMail = await forgot(env, { email: 'nobody@reset.test' });
A.forgotNoMail = await forgot(envNoMail, { email: 'owner@reset.test' });
A.forgotBadEmail = await forgot(env, { email: 'nope' });
A.forgotNotConfigured = await forgot({}, { email: 'owner@reset.test' });
A.forgotBadJson = await forgot(env, null, '{');
A.getValid = await resetGet(env, tok);
A.getInvalid = await resetGet(env, 'bogus.token');
A.getNotConfigured = await resetGet({}, tok);
A.postNotConfigured = await resetPost({}, { token: tok, password: 'Brand-New-Pass-42' });
A.postBadJson = await resetPost(env, null, '{');
A.postShort = await resetPost(env, { token: tok, password: 'short' });
A.postLong = await resetPost(env, { token: tok, password: 'x'.repeat(1100) });
A.postCommon = await resetPost(env, { token: tok, password: '1111111111' });
A.postPersonal = await resetPost(env, { token: tok, password: 'owner-Secret-99' });
A.postInvalid = await resetPost(env, { token: 'bogus.token', password: 'Brand-New-Pass-42' });
/* The limiter's 429: invalid guesses from one address until it blocks. */
for (let i = 0; i < 40; i++) {
  const r = await resetPost(env, { token: 'bogus.token', password: 'Brand-New-Pass-42' }, null, '198.51.100.9');
  if (r.status === 429) { A.post429 = r; break; }
}
A.post503Limiter = await resetPost({ DB: makeD1((q) => /pair_attempts/.test(q)), AUTH_SECRET: SECRET }, { token: tok, password: 'Brand-New-Pass-42' });
A.postRetry = await resetPost({ DB: makeD1((q) => /^UPDATE accounts SET salt/.test(q)), AUTH_SECRET: SECRET }, { token: tok, password: 'Brand-New-Pass-42' });
const tok2 = await freshToken('owner2@reset.test');
A.postLost = await resetPost({ DB: makeD1((q) => /^UPDATE accounts SET salt/.test(q) || /SET used_ts = NULL/.test(q)), AUTH_SECRET: SECRET }, { token: tok2, password: 'Brand-New-Pass-42' });
const tok3 = await freshToken('owner3@reset.test');
A.postOk = await resetPost(env, { token: tok3, password: 'Brand-New-Pass-42' });
console.error = quiet;
globalThis.fetch = realFetch;

const J = (a) => JSON.parse(a.body || '{}');
check(A.forgotMail.status === 200 && J(A.forgotMail).mail === true && A.forgotNoMail.status === 200 && J(A.forgotNoMail).mail === false, 'forgot: 200 with mail, and 200 without (no MAIL_WEBHOOK)');
check(A.forgotBadEmail.status === 400 && J(A.forgotBadEmail).error === 'bad-email' && A.forgotNotConfigured.status === 503 && A.forgotBadJson.status === 400 && J(A.forgotBadJson).error === 'bad-json', 'forgot: 400 bad-email, 503 not-configured, 400 bad-json');
check(J(A.getValid).valid === true && J(A.getInvalid).valid === false && A.getNotConfigured.status === 503, 'reset GET: valid, invalid, and 503 when not configured');
check(A.postNotConfigured.status === 503 && J(A.postNotConfigured).error === 'not-configured' && A.postBadJson.status === 400 && J(A.postBadJson).error === 'bad-json', 'reset POST: 503 not-configured and 400 bad-json (the malformed body, posted once), before the token is read');
check(['postShort', 'postLong', 'postCommon', 'postPersonal'].every((k) => A[k].status === 400 && J(A[k]).error === 'weak') &&
  ['short', 'long', 'common', 'personal'].join() === ['postShort', 'postLong', 'postCommon', 'postPersonal'].map((k) => J(A[k]).reason).join(), 'reset POST: 400 weak, for short, long, common and personal');
check(A.postInvalid.status === 400 && J(A.postInvalid).error === 'invalid', 'reset POST: 400 invalid for a dead link');
check(A.post429 && J(A.post429).error === 'too_many_attempts' && J(A.post429).retry_after > 0, `reset POST: 429 from the limiter, with retry_after (${A.post429 && J(A.post429).retry_after} s)`);
check(A.post503Limiter.status === 503 && J(A.post503Limiter).error === 'rate-limit-unavailable', 'reset POST: 503 rate-limit-unavailable when the limiter cannot be read');
check(A.postRetry.status === 500 && J(A.postRetry).retry === true && A.postLost.status === 500 && J(A.postLost).error === 'update-failed' && J(A.postLost).retry === undefined,
  'reset POST: 500 update-failed with retry (the link handed back), and without (the link lost)');
check(A.postOk.status === 200 && J(A.postOk).ok === true, 'reset POST: 200 ok');

/* ── 2 · the page, on each answer ─────────────────────────────────────────── */
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(rq.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STR = {};
for (const b of ['kit', 'onboarding']) {
  const src = fs.readFileSync(path.join(root, 'assets/kit/strings/' + b + '.en.js'), 'utf8');
  /* The bundle registers itself on the global it is given (self). */
  const sandbox = { self: {} };
  vm.runInNewContext(src, sandbox);
  Object.assign(STR, Object.values(sandbox.self.__kiwiStrings || {})[0] || {});
}
const T = (k) => STR[k];

/* One page per case: the routes answer with the recorded answers, in order. */
async function open({ flag = true, token = '', routes = {}, store = null } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], fetched = [], posted = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin === base) fetched.push(u.pathname);
    const key = r.method() + ' ' + u.pathname;
    if (routes[key]) {
      if (r.method() === 'POST') posted.push({ path: u.pathname, body: r.postData() });
      const a = routes[key].length > 1 ? routes[key].shift() : routes[key][0];
      if (a === 'offline') return r.abort('internetdisconnected');
      return r.respond({ status: a.status, contentType: 'application/json', body: a.body });
    }
    return u.origin === base ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((on, st) => {
    if (on) localStorage.setItem('kiwiSkin2027:access', '1');
    if (st) localStorage.setItem('kiwiResetEmail', JSON.stringify(st));
  }, flag, store);
  // coverage: surface=shell-reset locale=en viewport=tablet
  await page.goto(base + '/reset.html?lang=en' + (token ? '&token=' + encodeURIComponent(token) : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#view').firstChild, { timeout: 15000 });
  await sleep(300);
  return { ctx, page, errors, fetched, posted };
}
const read = (page) => page.evaluate(() => {
  const v = document.getElementById('view');
  const field = (k) => { const f = v.querySelector('[data-f="' + k + '"]'); return f ? { error: f.getAttribute('error') || '', helper: f.getAttribute('helper') || '', value: f.value } : null; };
  const btn = v.querySelector('k-button');
  const b = v.querySelector('k-banner');
  return {
    state: v.getAttribute('data-state'), text: v.textContent.replace(/[⁦-⁩]/g, ''),
    banner: b ? (b.getAttribute('message') || '') : '', bannerAction: b ? (b.getAttribute('action-label') || '') : '',
    email: field('email'), p1: field('p1'), p2: field('p2'),
    primary: btn ? { label: btn.getAttribute('label'), disabled: btn.hasAttribute('disabled'), loading: btn.hasAttribute('loading') } : null,
    retry: (v.querySelector('.k-ac__retry') || {}).textContent || '',
    stored: localStorage.getItem('kiwiResetEmail'), href: location.href,
  };
});
const press = (page, sel) => page.evaluate((s) => { document.querySelector(s).shadowRoot.querySelector('button').click(); }, sel);
const type = (page, key, value) => page.evaluate((k, val) => {
  const f = document.querySelector('[data-f="' + k + '"]');
  const i = f.shadowRoot.querySelector('input'); i.value = val; i.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}, key, value);
const Q = (a) => ({ status: a.status, body: a.body });

try {
  /* Flag off: the shipped flow, no kit file. */
  {
    const { ctx, page, fetched } = await open({ flag: false });
    const v = await page.evaluate(() => ({ kit: document.documentElement.hasAttribute('data-skin-2027'), form: !!document.querySelector('#view form #fe') }));
    check(!v.kit && v.form && !fetched.some((p) => p.startsWith('/assets/kit/') && p !== '/assets/kit/haptics.js' /* zone-law carrier, always loaded, draws nothing */), 'flag off: the shipped request form draws, and no kit file loads');
    await ctx.close();
  }

  /* R1 · Request, and its answers. */
  const r1 = async (answers, email = 'owner@reset.test') => {
    const o = await open({ routes: { 'POST /auth/forgot': answers.map((a) => (a === 'offline' ? a : Q(a))) } });
    await type(o.page, 'email', email);
    await press(o.page, '[data-do="send"]');
    await sleep(500);
    return o;
  };
  {
    const o = await open();
    let v = await read(o.page);
    check(v.state === 'request' && v.text.includes(T('ob.forgot.title')) && v.primary.label === T('ob.forgot.send') && v.text.includes(T('ob.forgot.back')), 'R1: the request, its title, its field, its primary and Back');
    await type(o.page, 'email', 'not-an-address');
    await press(o.page, '[data-do="send"]');
    await sleep(200);
    v = await read(o.page);
    check(v.state === 'request' && v.email.error === T('ob.err.email') && o.posted.length === 0, 'R1 · invalid address: the error under E-mail, nothing posted');
    await o.ctx.close();
  }
  {
    const o = await r1([A.forgotMail]);
    const v = await read(o.page);
    const st = JSON.parse(v.stored || '{}');
    check(v.state === 'sent' && v.text.includes(T('ob.forgot.sent_title')) && st.email === 'owner@reset.test' && Date.now() - st.ts < 60000, 'R2 · 200 with mail: link sent, and this device remembers the address');
    await o.ctx.close();
  }
  {
    const o = await r1([A.forgotNoMail]);
    const v = await read(o.page);
    check(v.state === 'no-mail' && v.text.includes(T('ob.forgot.no_mail_title')) && v.primary.label === T('ob.forgot.support'), 'R3 · 200 without mail: contact support');
    await o.ctx.close();
  }
  {
    const o = await r1([A.forgotBadEmail], 'a@b.co');
    const v = await read(o.page);
    check(v.state === 'request' && v.email.error === T('ob.err.email'), 'R1 · 400 bad-email: the error under E-mail');
    await o.ctx.close();
  }
  {
    const o = await r1([{ status: 429, body: JSON.stringify({ error: 'too_many_attempts', retry_after: 300 }) }]);
    const v = await read(o.page);
    check(v.state === 'request' && v.banner === T('ob.forgot.rate') && v.primary.disabled, 'R1 · 429: the rate banner, the primary disabled for retry_after');
    await o.ctx.close();
  }
  for (const [name, a] of [['503 not-configured', A.forgotNotConfigured], ['400 bad-json', A.forgotBadJson]]) {
    const o = await r1([a]);
    const v = await read(o.page);
    check(v.state === 'request' && v.banner === T('ob.forgot.unavailable') && !v.primary.disabled, `R1 · ${name}: the unavailable banner, the primary enabled`);
    await o.ctx.close();
  }
  {
    const o = await r1(['offline']);
    const v = await read(o.page);
    check(v.state === 'request' && v.banner === T('ob.offline') && v.email.value === 'owner@reset.test', 'R1 · offline: the banner, and the field keeps its value');
    await o.ctx.close();
  }

  /* R4 · Checking the link. */
  {
    const o = await open({ token: 'any.token', routes: { 'GET /auth/reset': [Q(A.getNotConfigured), Q(A.getValid)] } });
    let v = await read(o.page);
    check(v.state === 'check-failed' && v.banner === T('ob.reset.check_failed') && v.bannerAction === T('action.try_again'), 'R4 · 503: "Couldn\'t check this link" with Try again');
    await o.page.evaluate(() => document.querySelector('#view k-banner').shadowRoot.querySelector('[data-b="act"]').click());
    await sleep(400);
    v = await read(o.page);
    check(v.state === 'form', 'R4 · Try again repeats the check, and a valid link opens R6');
    await o.ctx.close();
  }
  {
    const o = await open({ token: 'any.token', routes: { 'GET /auth/reset': ['offline'] } });
    const v = await read(o.page);
    check(v.state === 'check-failed' && v.banner === T('ob.offline') && v.bannerAction === T('action.try_again'), 'R4 · offline: the offline banner with Try again');
    await o.ctx.close();
  }
  {
    const o = await open({ token: 'any.token', routes: { 'GET /auth/reset': [Q(A.getInvalid)] } });
    const v = await read(o.page);
    check(v.state === 'dead' && v.text.includes(T('ob.reset.dead_title')) && v.text.includes(T('ob.reset.dead_body')) && !v.text.includes(T('ob.reset.again_hint')), 'R5 · invalid: the dead link; no address here, so no one-tap hint');
    await press(o.page, '[data-do="again"]');
    await sleep(300);
    check((await read(o.page)).state === 'request', 'R5 · Get a new link opens R1 when this device remembers no address');
    await o.ctx.close();
  }
  {
    const o = await open({ token: 'any.token', store: { email: 'owner@reset.test', ts: Date.now() - 60000 }, routes: { 'GET /auth/reset': [Q(A.getInvalid)], 'POST /auth/forgot': [Q(A.forgotMail)] } });
    let v = await read(o.page);
    check(v.text.includes(T('ob.reset.again_hint')), 'R5 · with a remembered address, the hint under Get a new link');
    await press(o.page, '[data-do="again"]');
    await sleep(500);
    v = await read(o.page);
    check(v.state === 'sent' && o.posted.length === 1 && JSON.parse(o.posted[0].body).email === 'owner@reset.test', 'R5 · one tap posts the remembered address and lands on R2');
    await o.ctx.close();
  }
  {
    const o = await open({ token: 'any.token', store: { email: 'owner@reset.test', ts: Date.now() - 2 * 3600000 }, routes: { 'GET /auth/reset': [Q(A.getInvalid)] } });
    const v = await read(o.page);
    check(!v.text.includes(T('ob.reset.again_hint')) && v.stored === null, 'an address past the hour is not used, and is deleted on read');
    await o.ctx.close();
  }

  /* R6 · New password, and each answer of the POST. */
  const r6 = async (answers, p1 = 'Brand-New-Pass-42', p2 = p1, extra = {}) => {
    const o = await open({ token: 'any.token', ...extra, routes: { 'GET /auth/reset': [Q(A.getValid)], 'POST /auth/reset': answers.map((a) => (a === 'offline' ? a : Q(a))) } });
    await type(o.page, 'p1', p1);
    await type(o.page, 'p2', p2);
    await press(o.page, '[data-do="save"]');
    await sleep(500);
    return o;
  };
  {
    const o = await open({ token: 'any.token', routes: { 'GET /auth/reset': [Q(A.getValid)] } });
    const v = await read(o.page);
    check(v.state === 'form' && v.p1.helper === T('ob.pw.rules') && v.text.includes(T('ob.show_password')) && v.primary.label === T('ob.reset.save'), 'R6: the two fields, the rules as helper from the first frame, Show password, Save');
    await o.ctx.close();
  }
  {
    const o = await r6([A.postOk], 'short1', 'short1');
    let v = await read(o.page);
    check(v.state === 'form' && v.p1.error === T('ob.err.pw_short') && o.posted.length === 0, 'R6 · short: the error under the first field, nothing posted');
    await type(o.page, 'p1', 'Brand-New-Pass-42');
    await type(o.page, 'p2', 'Brand-New-Pass-43');
    await press(o.page, '[data-do="save"]');
    await sleep(200);
    v = await read(o.page);
    check(v.p2.error === T('ob.reset.differ') && !v.p1.error && o.posted.length === 0, 'R6 · mismatch: the error under the second field');
    await o.ctx.close();
  }
  for (const [k, key] of [['postShort', 'ob.err.pw_short'], ['postLong', 'ob.err.pw_long'], ['postCommon', 'ob.err.pw_common'], ['postPersonal', 'ob.err.pw_personal']]) {
    const o = await r6([A[k]]);
    const v = await read(o.page);
    check(v.state === 'form' && v.p1.error === T(key), `R6 · 400 weak ${J(A[k]).reason}: ${key} under the first field`);
    await o.ctx.close();
  }
  for (const [name, a] of [['503 not-configured', A.postNotConfigured], ['400 bad-json', A.postBadJson], ['500 update-failed, retry', A.postRetry]]) {
    const o = await r6([a]);
    const v = await read(o.page);
    check(v.state === 'form' && v.banner === T('ob.reset.failed') && !v.primary.disabled && v.p1.value === 'Brand-New-Pass-42', `R6 · ${name}: "${T('ob.reset.failed')}", fields kept, primary enabled`);
    await o.ctx.close();
  }
  {
    const o = await r6([A.post429]);
    const v = await read(o.page);
    const min = Math.ceil(J(A.post429).retry_after / 60);
    check(v.state === 'form' && v.banner === T('ob.reset.rate') && v.primary.disabled && v.retry === T('ob.reset.retry_in').replace('{n}', min), `R6 · 429: the rate banner, "${v.retry}", the primary disabled`);
    await o.ctx.close();
  }
  {
    const o = await r6([{ status: 429, body: JSON.stringify({ error: 'too_many_attempts', retry_after: 1 }) }]);
    await sleep(1400);
    const v = await read(o.page);
    check(!v.primary.disabled && v.retry === '', 'R6 · 429: once retry_after passes, the primary comes back without a reload');
    await o.ctx.close();
  }
  {
    const o = await r6([A.post503Limiter]);
    const v = await read(o.page);
    check(v.state === 'form' && v.banner === T('ob.forgot.unavailable') && !v.primary.disabled, 'R6 · 503 rate-limit-unavailable: the unavailable banner, primary enabled');
    await o.ctx.close();
  }
  {
    const o = await r6(['offline']);
    const v = await read(o.page);
    check(v.state === 'form' && v.banner === T('ob.offline') && v.p1.value === 'Brand-New-Pass-42', 'R6 · offline: the banner, fields kept');
    await o.ctx.close();
  }
  {
    const o = await r6([A.postInvalid]);
    const v = await read(o.page);
    check(v.state === 'dead' && v.text.includes(T('ob.reset.dead_body')), 'R6 · 400 invalid: R5');
    await o.ctx.close();
  }
  {
    const o = await r6([A.postLost]);
    const v = await read(o.page);
    check(v.state === 'used' && v.text.includes(T('ob.reset.used_body')) && !v.text.includes(T('ob.reset.dead_body')), 'R6 · 500 update-failed without retry: R5 with used_body');
    await o.ctx.close();
  }
  {
    const o = await r6([A.postOk], undefined, undefined, { store: { email: 'owner@reset.test', ts: Date.now() } });
    const v = await read(o.page);
    check(v.state === 'done' && v.text.includes(T('ob.reset.done')) && v.stored === null, 'R7 · 200: done, and the remembered address is deleted');
    await o.page.waitForFunction(() => /\/dashboard\.html$/.test(location.pathname), { timeout: 3000 }).catch(() => {});
    check(/\/dashboard\.html$/.test(new URL(o.page.url()).pathname), 'R7 · then the dashboard');
    await o.ctx.close();
  }
  {
    const o = await open({ store: { email: 'owner@reset.test', ts: Date.now() } });
    const v = await read(o.page);
    check(v.email.value === 'owner@reset.test', 'R1 prefills the address this device remembers');
    await o.page.evaluate(() => { const a = document.querySelector('[data-back]'); a.addEventListener('click', (e) => e.preventDefault()); a.click(); });
    check((await read(o.page)).stored === null, 'Back to sign in deletes the remembered address');
    await o.ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ reset-states-test · ${checks} checks`);
