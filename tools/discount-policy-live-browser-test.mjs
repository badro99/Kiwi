#!/usr/bin/env node
// #93: the owner saves the allowed percentages, and a restaurant till that is
// ALREADY OPEN picks them up without a reload. Both pages talk to the real
// /api/store route over an in-memory SQLite database; no merchant data.
//
// Owner page: cloud-doc.js + venue-store.js + discount-policy.js under an owner
// session, saving through KiwiDiscountPolicy.save (what Paramètres → Enregistrer
// calls). Till page: the same three scripts under a paired-till cookie, plus
// the restaurant remise modal markup, styles and chip code sliced from
// kiwi-caisse.html.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet as storeGet, onRequestPost as storePost } from '../functions/api/store.js';
import { tillToken, TILL_COOKIE, makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter)] })); }
catch { console.log('○ skip: puppeteer-core unavailable (browser assertions not run)'); process.exit(process.env.CI ? 1 : 0); }
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
if (!executablePath) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }
const SHOTS = process.env.KIWI_PROOF_DIR || '';

const MERCHANT = 'fixture-remise', SECRET = 'discount-live-fixture-secret', ACCOUNT = 'acc-fixture-remise';
const raw = new DatabaseSync(':memory:');
raw.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
const now = Date.now();
raw.prepare(`INSERT INTO accounts (id,email,name,business,salt,hash,created_ts,status,session_epoch)
  VALUES (?,?,?,?,?,?,?,'active',0)`).run(ACCOUNT, 'owner@example.test', 'Owner', MERCHANT, '00'.repeat(16), '11'.repeat(32), now);
raw.prepare(`INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts)
  VALUES (?,?,?,?,?,'active',0,?)`).run(MERCHANT, '{}', 'restaurant', ACCOUNT, 'Restaurant fixture', now);
const DB = {
  prepare(sql) { let args = []; const q = { bind(...v) { args = v; return q; },
    first() { return raw.prepare(sql).get(...args) || null; }, all() { return { results: raw.prepare(sql).all(...args) }; },
    run() { const r = raw.prepare(sql).run(...args); return { meta: { changes: r.changes } }; } }; return q; },
  async batch(statements) { raw.exec('BEGIN'); try { const r = statements.map(s => s.run()); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; } },
};
const env = { DB, AUTH_SECRET: SECRET };
const ownerCookie = `kiwi_gate=1; ${SESS_COOKIE}=${await makeSession(ACCOUNT, SECRET, 0)}`;
const tillCookie = `kiwi_gate=1; ${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT, 0)}`;

const till = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const styles = [...till.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m => m[0]).join('\n');
const links = [...till.matchAll(/<link rel="stylesheet" href="([^"]+)"[^>]*>/g)].map(m => `<link rel="stylesheet" href="/${m[1]}">`).join('');
const modalStart = till.indexOf('<div class="modal-veil" id="remise-modal"');
const modalHtml = till.slice(modalStart, till.indexOf('<div class="modal-veil"', modalStart + 10));
const chipStart = till.indexOf('    const remiseModal = $(\'#remise-modal\');');
const chipCode = till.slice(chipStart, till.indexOf('    function remiseCutPreview()', chipStart));
assert.ok(modalStart > 0 && modalHtml.includes('rm-pct-chips'), 'remise modal markup found in kiwi-caisse.html');
assert.ok(chipStart > 0 && chipCode.includes('renderRemiseChips') && chipCode.includes('subscribe'), 'remise chip code found in kiwi-caisse.html');
const openStart = till.indexOf('    function openRemiseModal(id) {');
const refreshOnOpen = till.slice(openStart, openStart + 200).match(/KiwiDiscountPolicy\?\.refresh\?\.\((true)?\)/);

const scripts = '<script src="/assets/cloud-doc.js"></script><script src="/assets/venue-store.js"></script><script src="/assets/discount-policy.js"></script>';
const ownerPage = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <script>window.KiwiEnv={isReal:()=>true};window.KiwiMe={merchant:${JSON.stringify(MERCHANT)},business:'Restaurant fixture'};
  const venue={id:'v-fixture-remise',slug:${JSON.stringify(MERCHANT)},name:'Restaurant fixture',type:'restaurant',custom:true};
  window.KiwiVenue={isCustom:()=>true,getVenue:()=>venue.id,getVenueType:()=>venue.type,getCurrentVenueData:()=>venue,getVenues:()=>[venue],list:()=>[venue]};</script>
  ${scripts}</head><body><p>Propriétaire</p></body></html>`;
const tillPage = `<!doctype html><html lang="fr"><head><meta charset="utf-8">${links}${styles}
  <script>window.KiwiEnv={isReal:()=>true};localStorage.setItem('kiwiLiveMerchant',${JSON.stringify(MERCHANT)});
  window.KiwiCaissePairing={pairedVenue:()=>({merchant:${JSON.stringify(MERCHANT)},name:'Restaurant fixture',type:'restaurant'})};</script>
  ${scripts}</head><body>${modalHtml}
  <script>const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];const toast=m=>{window.lastToast=m};
  ${chipCode}
  window.openRemise=()=>{${refreshOnOpen ? refreshOnOpen[0] + ';' : ''}renderRemiseChips();remiseModal.classList.add('is-open');};
  window.chips=()=>$$('#rm-pct-chips .rm-pct-chip').map(c=>c.textContent.trim());
  document.dispatchEvent(new Event('DOMContentLoaded'));</script></body></html>`;

const MIME = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/owner.html' || url.pathname === '/till.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(url.pathname === '/owner.html' ? ownerPage : tillPage); return;
  }
  if (url.pathname === '/api/store') {
    let body = ''; for await (const chunk of req) body += chunk;
    // Same origin, two devices: the page that made the call decides the credential.
    const cookie = String(req.headers.referer || '').includes('/till.html') ? tillCookie : ownerCookie;
    const request = new Request('https://kiwi-os.com' + url.pathname + url.search, { method: req.method,
      headers: { cookie, 'Content-Type': 'application/json' }, body: req.method === 'POST' ? body : undefined });
    const reply = await (req.method === 'POST' ? storePost : storeGet)({ request, env });
    res.writeHead(reply.status, { 'Content-Type': 'application/json' }); res.end(await reply.text()); return;
  }
  if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
  const file = path.resolve(ROOT, url.pathname.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const errors = [];
  const tillTab = await browser.newPage();
  await tillTab.setViewport({ width: 1180, height: 820 });
  tillTab.on('pageerror', e => errors.push('till: ' + e.message));
  await tillTab.goto(base + '/till.html', { waitUntil: 'networkidle0' });
  await tillTab.evaluate(() => window.openRemise());
  assert.deepEqual(await tillTab.evaluate(() => window.chips()), ['5 %', '10 %', '15 %', '20 %'], 'till starts on the default percentages');
  if (SHOTS) await tillTab.screenshot({ path: path.join(SHOTS, 'discount-live-1-till-before.png') });

  // The owner removes 10, 15 and 20 % while the till stays open on the remise panel.
  const owner = await browser.newPage();
  owner.on('pageerror', e => errors.push('owner: ' + e.message));
  await owner.goto(base + '/owner.html', { waitUntil: 'networkidle0' });
  const saved = await owner.evaluate(() => window.KiwiDiscountPolicy.save([5]));
  assert.equal(saved.ok, true, 'owner save reaches /api/store');
  assert.equal(saved.localOnly, undefined, 'owner save is not local-only');
  const row = raw.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='discountpolicy'").get(MERCHANT);
  assert.deepEqual(JSON.parse(row.data).percentages, [5], 'server holds the owner policy');

  // Reopening the remise panel is enough: no reload of the till.
  await tillTab.evaluate(() => { document.getElementById('remise-modal').classList.remove('is-open'); window.openRemise(); });
  await tillTab.waitForFunction(() => window.chips().join('|') === '5 %', { timeout: 5000 })
    .catch(async () => { throw new Error('open till still offers ' + JSON.stringify(await tillTab.evaluate(() => window.chips())) + ' after the owner saved 5 %'); });
  assert.deepEqual(await tillTab.evaluate(() => window.chips()), ['5 %'], 'open till offers only 5 % without reloading');
  assert.equal(await tillTab.evaluate(() => performance.getEntriesByType('navigation').length), 1, 'till was never reloaded');
  if (SHOTS) await tillTab.screenshot({ path: path.join(SHOTS, 'discount-live-2-till-after.png') });
  assert.deepEqual(errors, [], 'no script errors on either page');
  console.log('✓ discount policy live: owner saves 5 %, an open restaurant till offers only 5 % without reload');
} finally {
  await browser.close();
  server.close();
}
