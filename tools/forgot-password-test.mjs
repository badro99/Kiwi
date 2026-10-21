#!/usr/bin/env node
/* Kiwi · self-serve "Forgot password?" (web gate, /reset page, /auth/forgot).
 *
 * Real handlers over SQLite, no second model of the logic:
 *   - the sign-in gate offers the link in FR, EN and AR;
 *   - /reset.html carries the request form and its copy in all three languages;
 *   - POST /auth/forgot answers byte-for-byte the same for a known and an
 *     unknown address (no account enumeration), with and without a mail sink;
 *   - the emailed token is single-use and expires, through the existing
 *     /auth/reset consumer;
 *   - rate limits count every request, known or not;
 *   - neither a token nor a password reaches the logs or the database in clear.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { onRequestPost as postForgot } from '../functions/auth/forgot.js';
import { onRequestGet as getReset, onRequestPost as postReset } from '../functions/auth/reset.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { hashPassword } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'forgot-password-test-secret-32-chars!';
const out = console.log.bind(console);
const failures = [];
let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (condition) out('  ✓ ' + label);
  else { failures.push(label); out('  ✗ '  + label + (detail ? ` — ${detail}` : '')); }
}

const db = new DatabaseSync(':memory:');
const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
db.exec(schema);
const normalize = (sql) => String(sql).replace(/\s+/g, ' ').trim();
function makeD1() {
  return {
    prepare(sql) {
      const q = normalize(sql);
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async first() { const r = db.prepare(q).get(...args); return r === undefined ? null : r; },
        async all() { return { results: db.prepare(q).all(...args) }; },
        async run() {
          const r = db.prepare(q).run(...args);
          return { success: true, meta: { changes: Number(r.changes) }, changes: Number(r.changes) };
        },
      };
      return stmt;
    },
  };
}

/* Mail sink: records what the webhook would receive. The token never leaves
 * this test's memory; assertions only compare it, they do not print it. */
const realFetch = globalThis.fetch;
let mailStatus = 200;
const mails = [];
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://mail.test/')) {
    mails.push(JSON.parse(init.body));
    return new Response('ok', { status: mailStatus });
  }
  return realFetch(url, init);
};
function lastToken() {
  const m = mails[mails.length - 1];
  const hit = m && /reset\.html\?token=([^\s]+)/.exec(m.text);
  return hit ? decodeURIComponent(hit[1]) : '';
}

/* Anything the code logs is scanned at the end for secrets. */
const logged = [];
const saved = {};
for (const k of ['log', 'info', 'warn', 'error']) { const o = console[k]; console[k] = (...a) => { logged.push(a.map(String).join(' ')); }; saved[k] = o; }

const envMail = { DB: makeD1(), AUTH_SECRET: SECRET, MAIL_WEBHOOK: 'https://mail.test/hook' };
const envNoMail = { DB: makeD1(), AUTH_SECRET: SECRET };
const jobs = [];
const ctx = (env, body, ip = '203.0.113.7', extra = {}) => ({
  env,
  request: new Request('https://kiwi.test/auth/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }),
  waitUntil(p) { jobs.push(p); },
  ...extra,
});
async function ask(env, email, ip) {
  const res = await postForgot(ctx(env, { email }, ip));
  await Promise.all(jobs.splice(0));
  return { status: res.status, body: await res.text() };
}

const OLD_PASSWORD = 'Old-Password-123!';
const { salt, hash } = await hashPassword(OLD_PASSWORD);
const addAccount = (id, email, status = 'active') => db.prepare(
  'INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status) VALUES (?,?,?,?,?,?,?,?)'
).run(id, email, 'Test', 'Boutique Test', salt, hash, Date.now(), status);
addAccount('acc-known', 'known@forgot.test');
addAccount('acc-frozen', 'frozen@forgot.test', 'suspended');
const tokenRows = (id) => db.prepare('SELECT * FROM reset_tokens WHERE account_id = ?').all(id);

/* 1 · the entrance: link in the sign-in gate, three languages ---------------- */
out('\nThe sign-in gate links to the reset flow');
const gate = async (lang) => {
  const res = await middleware({
    request: new Request('https://kiwi.test/dashboard.html?lang=' + lang, { headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' } }),
    env: { DB: makeD1(), AUTH_SECRET: SECRET },
    next: async () => new Response('open'),
  });
  return res.text();
};
const expected = { fr: 'Mot de passe oublié ?', en: 'Forgot your password?', ar: 'نسيت كلمة المرور؟' };
for (const lang of ['fr', 'en', 'ar']) {
  const html = await gate(lang);
  const a = new RegExp('<a class="forgot" id="li-forgot" href="/reset\\.html\\?lang=' + lang + '">([^<]+)</a>').exec(html);
  check(`gate (${lang}) shows the Forgot-password link with the right label`, !!a && a[1] === expected[lang], a ? a[1] : 'missing');
  const pass = html.indexOf('id="li-pass"');
  check(`gate (${lang}) places the link under the password field, inside the login form`,
    pass > 0 && html.indexOf('id="li-forgot"') > pass && html.indexOf('id="li-forgot"') < html.indexOf('id="li-err"'));
}
let passed = false;
await middleware({
  request: new Request('https://kiwi.test/reset.html?lang=en', { headers: { Accept: 'text/html' } }),
  env: { DB: makeD1(), AUTH_SECRET: SECRET }, next: async () => { passed = true; return new Response('page'); },
});
check('/reset.html is reachable without a session', passed);

out('\nThe /reset page carries the request form in FR, EN and AR');
const resetHtml = fs.readFileSync(path.join(ROOT, 'reset.html'), 'utf8');
check('reset.html posts the request to /auth/forgot', resetHtml.includes("'/auth/forgot'"));
check('reset.html opens on the request form when the URL carries no token', /if \(!token\) \{ request\(\); \}/.test(resetHtml));
for (const lang of ['fr', 'en', 'ar']) {
  const block = new RegExp('\\n    ' + lang + ': \\{([\\s\\S]*?)\\n    \\}[,\\n]').exec(resetHtml);
  const body = block ? block[1] : '';
  for (const key of ['reqTitle', 'reqBody', 'send', 'sentTitle', 'sentBody', 'noMailTitle', 'noMailBody', 'noMailCta', 'again', 'badEmail', 'tooMany']) {
    check(`reset.html ${lang}: "${key}" is translated`, new RegExp('\\b' + key + ':').test(body));
  }
}
check('reset.html honours the ?lang= parameter and sets RTL for Arabic',
  resetHtml.includes("get('lang')") && resetHtml.includes("'rtl'"));
check('reset.html copy has no em dash', !/—/.test(resetHtml.slice(resetHtml.indexOf('var COPY'), resetHtml.indexOf('function tr'))));

/* 2 · the endpoint: identical answers, known or not ------------------------- */
out('\nPOST /auth/forgot answers identically for known and unknown addresses');
const known = await ask(envMail, 'Known@Forgot.test', '198.51.100.1');
const unknown = await ask(envMail, 'nobody@forgot.test', '198.51.100.2');
check('known and unknown addresses get the same status and the same bytes', known.status === 200 && known.status === unknown.status && known.body === unknown.body, `${known.body} / ${unknown.body}`);
check('the answer says mail is configured, without saying anything about the account', known.body === '{"ok":true,"mail":true}');
check('exactly one email left, to the known account only', mails.length === 1 && mails[0].to === 'known@forgot.test');
check('no token row exists for an address nobody owns', db.prepare('SELECT COUNT(*) n FROM reset_tokens').get().n === 1);

const frozen = await ask(envMail, 'frozen@forgot.test', '198.51.100.3');
check('a suspended account gets the same answer and no email', frozen.body === known.body && mails.length === 1 && tokenRows('acc-frozen').length === 0);

const again = await ask(envMail, 'known@forgot.test', '198.51.100.4');
check('an immediate second request gets the same answer but no second email or token', again.body === known.body && mails.length === 1 && tokenRows('acc-known').length === 1);

const row = tokenRows('acc-known')[0];
const token = lastToken();
check('the emailed link carries a selector.verifier token', /^[\w-]+\.[\w-]+$/.test(token));
check('the database holds the selector and only a hash of the verifier', row.selector === token.split('.')[0] && row.verifier !== token.split('.')[1] && !JSON.stringify(row).includes(token.split('.')[1]));
check('the token lives one hour and the actor is the client', Math.abs((row.expires_ts - row.created_ts) - 3600000) < 5 && row.actor === 'client');
check('the email says one hour and one use', /une heure/.test(mails[0].text) && /qu’une fois/.test(mails[0].text));

out('\nValidation and input bounds');
const bad = await postForgot(ctx(envMail, { email: 'not-an-email' }, '198.51.100.5'));
check('a malformed address is a 400 and sends nothing', bad.status === 400 && mails.length === 1);
const badJson = await postForgot(ctx(envMail, '{nope', '198.51.100.5'));
check('malformed JSON is a 400', badJson.status === 400);
const huge = await postForgot(ctx(envMail, { email: 'a'.repeat(260) + '@x.test' }, '198.51.100.5'));
check('an oversized address is rejected before D1', huge.status === 400);
const noDb = await postForgot(ctx({ AUTH_SECRET: SECRET }, { email: 'known@forgot.test' }));
check('without D1 the endpoint reports not-configured', noDb.status === 503);

/* 3 · the token: single use, expiry ----------------------------------------- */
out('\nThe emailed token is single-use and expires');
const getToken = async (t) => (await getReset({ env: envMail, request: new Request('https://kiwi.test/auth/reset?token=' + encodeURIComponent(t)) })).json();
check('a fresh token validates', (await getToken(token)).valid === true);
const spend = (t, password) => postReset({
  env: envMail,
  request: new Request('https://kiwi.test/auth/reset', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.99' },
    body: JSON.stringify({ token: t, password }),
  }),
});
const NEW_PASSWORD = 'Brand-New-Pass-4567';
const first = await spend(token, NEW_PASSWORD);
check('the first use sets the password and opens a session', first.status === 200 && /kiwi_sess|=/.test(first.headers.get('set-cookie') || ''));
const second = await spend(token, 'Another-Pass-98765');
check('the same link used a second time is refused', second.status === 400 && (await second.json()).error === 'invalid');
check('a spent token no longer validates', (await getToken(token)).valid === false);

db.prepare('UPDATE reset_tokens SET created_ts = created_ts - 10 * 60 * 1000 WHERE account_id = ?').run('acc-known');
await ask(envMail, 'known@forgot.test', '198.51.100.6');
check('after the cooldown a new request issues a new email', mails.length === 2);
const token2 = lastToken();
check('the new token is different and valid', token2 !== token && (await getToken(token2)).valid === true);
db.prepare('UPDATE reset_tokens SET expires_ts = ? WHERE selector = ?').run(Date.now() - 1000, token2.split('.')[0]);
check('an expired token no longer validates', (await getToken(token2)).valid === false);
const late = await spend(token2, 'Yet-Another-Pass-246810');
check('an expired token cannot set a password', late.status === 400);
check('a forged token is refused', (await getToken(token.split('.')[0] + '.' + 'x'.repeat(32))).valid === false);

/* 4 · honesty without a mail sink, and when delivery fails ------------------- */
out('\nNo mail sink, or a failing one');
const nm1 = await ask(envNoMail, 'known@forgot.test', '198.51.100.20');
const nm2 = await ask(envNoMail, 'nobody@forgot.test', '198.51.100.21');
check('without MAIL_WEBHOOK both addresses get the same honest answer (mail:false)', nm1.body === nm2.body && nm1.body === '{"ok":true,"mail":false}');
const before = db.prepare('SELECT COUNT(*) n FROM reset_tokens').get().n;
check('and no token is manufactured for a link that cannot be sent', before === db.prepare('SELECT COUNT(*) n FROM reset_tokens').get().n);

db.prepare('DELETE FROM reset_tokens').run();
mailStatus = 500;
const failedMail = await ask(envMail, 'known@forgot.test', '198.51.100.22');
check('a refused delivery still answers the neutral message', failedMail.body === known.body);
check('and the unsent token is removed', tokenRows('acc-known').length === 0);
mailStatus = 200;

/* 5 · rate limits ----------------------------------------------------------- */
out('\nRate limits count every request, known or not');
let lastBySource = null;
for (let i = 0; i < 9; i++) lastBySource = await ask(envMail, `probe${i}@forgot.test`, '198.51.100.50');
check('the ninth request from one source is a 429', lastBySource.status === 429, String(lastBySource.status));
let lastKnown = null; let lastUnknown = null;
for (let i = 0; i < 9; i++) lastKnown = await ask(envMail, 'known@forgot.test', `198.51.100.${100 + i}`);
for (let i = 0; i < 9; i++) lastUnknown = await ask(envMail, 'ghost@forgot.test', `198.51.100.${150 + i}`);
check('one target is capped across sources, 429 for a known address', lastKnown.status === 429);
check('and the same 429 for an unknown address (the limiter is not an oracle)', lastUnknown.status === 429 && JSON.parse(lastUnknown.body).error === JSON.parse(lastKnown.body).error);

/* 6 · secrets stay out of logs ---------------------------------------------- */
out('\nSecrets stay out of logs and storage');
const dump = logged.join('\n');
check('no token reached the logs', ![token, token2].some((t) => dump.includes(t) || dump.includes(t.split('.')[1])));
check('no password reached the logs', ![OLD_PASSWORD, NEW_PASSWORD].some((p) => dump.includes(p)));
const audit = JSON.stringify(db.prepare("SELECT * FROM account_audit WHERE account_id = 'acc-known'").all());
check('the audit trail records the request without token or address', !audit.includes(token.split('.')[1]) && !audit.includes('known@forgot.test'));
check('the new password is stored hashed', db.prepare("SELECT hash FROM accounts WHERE id = 'acc-known'").get().hash !== hash);

for (const k of ['log', 'info', 'warn', 'error']) console[k] = saved[k];
globalThis.fetch = realFetch;
if (failures.length) {
  console.log(`\n✗ ${failures.length} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`\n✓ ${checks} forgot-password checks passed`);
