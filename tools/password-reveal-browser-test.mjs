#!/usr/bin/env node
/* password-reveal-browser-test · the eye button on the sign-in and sign-up
 * password fields of the account gate (functions/_middleware.js), in Chromium.
 *
 *   node tools/password-reveal-browser-test.mjs
 *
 * Owner, 30 Oct 2026: show the password while typing it, when logging in and
 * when signing up. What this holds:
 *   · the gate answers in FR, EN and AR with one eye on each password field,
 *     labelled in that language (static, every language);
 *   · in the browser (FR by default, KIWI_LOCALES for more): the eye sits
 *     inside the field at its end (left in Arabic), a 44 px tall target;
 *   · a tap shows the password as text, keeps the caret in the field so
 *     typing goes on, and turns the label to "hide"; a second tap hides it;
 *   · switching tabs and submitting both hide it again, so the browser saves
 *     a password field and nothing stays on screen;
 *   · no page error. */
import { suite } from './browser-trace.mjs';
import { forLocales } from './test-locales.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { onRequest as middleware } from '../functions/_middleware.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = {
  fr: { show: 'Afficher le mot de passe', hide: 'Masquer le mot de passe' },
  en: { show: 'Show password', hide: 'Hide password' },
  ar: { show: 'إظهار كلمة المرور', hide: 'إخفاء كلمة المرور' },
};

const gate = async (lang) => (await middleware({
  request: new Request(`https://kiwi.test/dashboard.html?lang=${lang}`, { headers: { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' } }),
  env: { AUTH_SECRET: 'password-reveal-test-secret-32ch!!' },
  next: async () => new Response('open'),
})).text();

const pages = {};
let staticChecks = 0;
for (const lang of Object.keys(LABELS)) {
  const html = pages[lang] = await gate(lang);
  for (const id of ['li-pass', 'su-pass']) {
    const re = new RegExp(`id="${id}" type="password"[^>]*/><button type="button" class="pw-toggle" aria-controls="${id}" aria-pressed="false" aria-label="${LABELS[lang].show}">`);
    assert.ok(re.test(html), `${lang}: ${id} carries an eye labelled "${LABELS[lang].show}"`);
    staticChecks++;
  }
  assert.ok(html.includes(JSON.stringify(LABELS[lang].hide)), `${lang}: the "hide" label reaches the page script`);
  staticChecks++;
}
console.log(`password-reveal-browser-test\n  ✓ ${staticChecks} static checks: both password fields have an eye in FR, EN and AR`);

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname === '/gate') { rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); rs.end(pages[u.searchParams.get('lang')] || ''); return; }
  if (u.pathname.startsWith('/auth/')) { rs.writeHead(401, { 'Content-Type': 'application/json' }); rs.end('{"error":"bad-creds"}'); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((resolve) => {
  server.once('error', () => { console.error('Browser test server unavailable in this environment'); process.exit(3); });
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const tests = suite('password-reveal', { browser });

const state = (page, id) => page.$eval(`#${id}`, (input) => {
  const btn = input.parentElement.querySelector('.pw-toggle');
  const i = input.getBoundingClientRect(), b = btn.getBoundingClientRect();
  return {
    type: input.type, value: input.value, focused: document.activeElement === input,
    pressed: btn.getAttribute('aria-pressed'), label: btn.getAttribute('aria-label'),
    inside: b.left >= i.left - 1 && b.right <= i.right + 1 && b.top >= i.top - 1 && b.bottom <= i.bottom + 1,
    atEnd: getComputedStyle(input).direction === 'rtl' ? b.left - i.left < 8 : i.right - b.right < 8,
    h: Math.round(b.height), w: Math.round(b.width),
  };
}, id);

for (const lang of forLocales(['fr', 'en', 'ar'])) {
  const L = LABELS[lang];
  await tests.run(`${lang} · the eye shows and hides the password on sign-in and sign-up`, async (t) => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(`${base}/gate?lang=${lang}`, { waitUntil: 'load' });

    t.step('sign-in: type, reveal, keep typing, hide');
    let s = await state(page, 'li-pass');
    assert.equal(s.type, 'password'); assert.equal(s.pressed, 'false'); assert.equal(s.label, L.show);
    assert.ok(s.inside && s.atEnd, `the eye sits inside the field at its end (${JSON.stringify(s)})`);
    assert.ok(s.h >= 44 && s.w >= 44, `a 44 px target, got ${s.w}×${s.h}`);
    await page.type('#li-pass', 'motdepasse');
    await page.tap('#form-login .pw-toggle');
    s = await state(page, 'li-pass');
    assert.equal(s.type, 'text', 'one tap shows the password');
    assert.equal(s.pressed, 'true'); assert.equal(s.label, L.hide);
    assert.ok(s.focused, 'the caret stays in the field');
    await page.keyboard.type('123');
    s = await state(page, 'li-pass');
    assert.equal(s.value, 'motdepasse123', 'typing goes on into the shown field');
    await page.tap('#form-login .pw-toggle');
    s = await state(page, 'li-pass');
    assert.equal(s.type, 'password', 'a second tap hides it'); assert.equal(s.label, L.show);

    t.step('sign-in: submitting hides it again');
    await page.type('#li-email', 'test@example.com');
    await page.tap('#form-login .pw-toggle');
    await page.click('#form-login .go');
    s = await state(page, 'li-pass');
    assert.equal(s.type, 'password', 'submit puts the field back to hidden');
    await page.waitForFunction(() => document.getElementById('li-err').textContent.trim() !== '');

    t.step('switching to sign-up hides it; sign-up has its own eye');
    await page.tap('#form-login .pw-toggle');
    await page.click('#tab-signup');
    s = await state(page, 'li-pass');
    assert.equal(s.type, 'password', 'switching tabs hides the sign-in password');
    s = await state(page, 'su-pass');
    assert.ok(s.inside && s.atEnd && s.h >= 44, `sign-up eye placed (${JSON.stringify(s)})`);
    await page.type('#su-pass', 'unlongmotdepasse');
    await page.tap('#form-signup .pw-toggle');
    s = await state(page, 'su-pass');
    assert.equal(s.type, 'text'); assert.equal(s.value, 'unlongmotdepasse'); assert.ok(s.focused);
    const hint = await page.$eval('#form-signup .hint', (el) => el.textContent);
    assert.ok(hint.trim().length > 0, 'the strength hint still follows the field');
    await page.click('#tab-login');
    s = await state(page, 'su-pass');
    assert.equal(s.type, 'password', 'switching back hides the sign-up password');

    assert.deepEqual(errors, [], 'no page error');
  });
}

server.close();
await tests.finish();
