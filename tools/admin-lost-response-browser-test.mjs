#!/usr/bin/env node
/* Console opérateur : la réponse d'une suppression se perd, la suppression a eu lieu.
 *
 *   node tools/admin-lost-response-browser-test.mjs
 *
 * admin-api-owner-test et operator-properties-test gardent l'autorisation, le
 * journal et le transport unique. Ici la vraie console (kiwi-admin.html +
 * assets/admin-api.js) parle à la vraie route DELETE /api/admin/clients sur une
 * base SQLite bâtie depuis schema.sql, avec un vrai code opérateur nommé. On
 * passe la vraie confirmation (recopier l'identifiant), le serveur supprime
 * l'établissement, puis la réponse est coupée (le navigateur voit une erreur
 * réseau, comme une connexion qui tombe au retour).
 *
 * Exigé : la console ne déclare pas un échec franc (« refusé, réessayez ») et ne
 * laisse pas le bouton prêt à relancer la suppression ; elle dit que le résultat
 * est incertain et relit l'état. Après rechargement l'établissement a disparu
 * de la liste et le journal ne compte qu'une seule suppression, même si
 * l'opérateur appuie encore. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { fixture } from './server-money-fixture.mjs';
import { suite } from './browser-trace.mjs';
import { operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
import * as clientsApi from '../functions/api/admin/clients.js';
import * as operatorsApi from '../functions/api/admin/operators.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const f = await fixture(root);
const { sql, env } = f;
const VICTIM = 'server-other-shop';
const cookie = `kiwi_op=${await operatorToken(env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(env.AUTH_SECRET, 'money-operator')}`;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('admin-lost-response', { browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let dropNextDelete = true, dropNextPatch = true;
const patches = [];
const deletes = [];   // [{ status }] : ce que la vraie route a répondu à chaque DELETE
function wire(page) {
  page.on('request', async (r) => {
    const u = r.url();
    if (!u.startsWith(base + '/api/')) return void (u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort());
    const url = new URL(u);
    const handler = ({ '/api/admin/clients': { GET: clientsApi.onRequestGet, DELETE: clientsApi.onRequestDelete, PATCH: clientsApi.onRequestPatch }, '/api/admin/operators': { GET: operatorsApi.onRequestGet } })[url.pathname]?.[r.method()];
    if (!handler) return void r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    const request = new Request(url.toString().replace(base, 'https://kiwi-os.com'), { method: r.method(), headers: { Cookie: cookie, Origin: 'https://kiwi-os.com', 'Content-Type': 'application/json' }, ...(r.method() === 'PATCH' ? { body: r.postData() } : {}) });
    try {
      const res = await handler({ request, env, waitUntil() {} });
      const body = await res.text();
      if (r.method() === 'DELETE') {
        deletes.push({ status: res.status });
        if (dropNextDelete) { dropNextDelete = false; return void r.abort('connectionreset'); }   // le serveur a appliqué, le navigateur ne le saura pas
      }
      if (r.method() === 'PATCH') {
        patches.push({ status: res.status });
        if (dropNextPatch) { dropNextPatch = false; return void r.abort('connectionreset'); }
      }
      r.respond({ status: res.status, contentType: 'application/json', body }).catch(() => {});
    } catch (e) { r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) }).catch(() => {}); }
  });
}
const exists = () => !!sql.prepare('SELECT 1 FROM merchant_config WHERE merchant=?').get(VICTIM);
const audits = () => sql.prepare("SELECT COUNT(*) n FROM account_audit WHERE merchant=? AND action='store-delete'").get(VICTIM).n;

async function openConsole(t, context) {
  const page = t.watch(await context.newPage());
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  wire(page);
  await page.evaluateOnNewDocument(() => { localStorage.setItem('kiwiLang', 'fr'); });
  // coverage: surface=console locale=fr viewport=desktop
  await page.goto(base + '/kiwi-admin.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiOperator && window.KiwiOperator.snapshot().live === true, { timeout: 30000 });
  return page;
}

try {
  await S.run('réponse de suppression perdue : résultat dit incertain, aucune seconde suppression, une seule trace au journal', async (t) => {
    const context = await browser.createBrowserContext(); t.defer(() => context.close());
    let page = await openConsole(t, context);
    check(exists(), `l'établissement ${VICTIM} existe avant la suppression`);
    const known = await page.evaluate((m) => window.KiwiOperator.snapshot().clients.some((c) => c.merchant === m), VICTIM);
    check(known, 'la console le liste, tiré de la vraie route');

    t.step('passer la vraie confirmation de suppression');
    await page.evaluate(() => { const nav = [...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === 'Clients' && x.offsetParent); if (nav) nav.click(); });
    const rowSel = `#cli-body tr:has(code)`;
    await page.waitForFunction((m) => [...document.querySelectorAll('#cli-body tr')].some((tr) => tr.querySelector('code')?.textContent === m && tr.offsetParent), { timeout: 20000 }, VICTIM);
    await page.evaluate((m) => { const tr = [...document.querySelectorAll('#cli-body tr')].find((r) => r.querySelector('code')?.textContent === m); tr.querySelector('summary').click(); }, VICTIM);
    await page.evaluate((m) => { const tr = [...document.querySelectorAll('#cli-body tr')].find((r) => r.querySelector('code')?.textContent === m); [...tr.querySelectorAll('button.danger')].find((b) => b.textContent.trim() === 'Supprimer').click(); }, VICTIM);
    await page.waitForSelector('.md-card input.inp', { visible: true, timeout: 10000 });
    const go = await page.evaluateHandle(() => [...document.querySelectorAll('.md-card button')].find((b) => /Supprimer définitivement/.test(b.textContent)));
    check(await page.evaluate((b) => b.disabled, go), 'sans recopier le slug le bouton reste éteint');
    await page.type('.md-card input.inp', VICTIM);
    check(await page.evaluate((b) => !b.disabled, go), 'une fois le slug recopié le bouton s\'allume');
    await go.click();

    t.step('la réponse est perdue après application');
    await sleep(1500);
    check(deletes.length === 1 && deletes[0].status === 200, 'la vraie route a répondu 200 au premier DELETE (réponse coupée côté navigateur)');
    check(!exists(), 'le serveur a bien supprimé l\'établissement');
    check(audits() === 1, 'une trace au journal');
    const view = await page.evaluate(() => {
      const card = document.querySelector('.md-card');
      const btn = card && [...card.querySelectorAll('button')].find((b) => /Supprimer|Suppression/.test(b.textContent));
      return { open: !!card, text: card ? card.textContent.replace(/\s+/g, ' ') : '', retryReady: !!btn && !btn.disabled && /Supprimer définitivement/.test(btn.textContent), toast: document.body.textContent.replace(/\s+/g, ' ') };
    });
    check(!/refusé/i.test(view.text), `aucun faux « refusé » : ${view.text.slice(0, 160)}`);
    check(!view.retryReady, 'le bouton ne se rallume pas pour relancer une suppression déjà faite');
    check(/incertain|peut-être|pas confirmée|réponse n.a pas|vérif/i.test(view.text + ' ' + view.toast.slice(0, 4000)), 'la console dit que le résultat est incertain');

    t.step('recharger : l\'état réel est lu');
    await page.close();
    page = await openConsole(t, context);
    const still = await page.evaluate((m) => window.KiwiOperator.snapshot().clients.some((c) => c.merchant === m), VICTIM);
    check(!still, 'après rechargement l\'établissement n\'est plus dans la console');
    check(audits() === 1 && deletes.length === 1, 'toujours une seule suppression et une seule trace au journal');
    const errors = page.errors;
    check(errors.length === 0, 'aucune autre erreur de script' + (errors.length ? ' : ' + JSON.stringify(errors) : ''));
  });
  await S.run('r20 console#B0 · suspension : réponse perdue après application, statut relu et dit incertain', async (t) => {
    const context = await browser.createBrowserContext(); t.defer(() => context.close());
    const page = await openConsole(t, context);
    const status = () => sql.prepare("SELECT status FROM accounts WHERE email='money@example.test'").get().status;
    check(status() === 'active', 'le compte est actif avant la suspension');
    await page.evaluate(() => { const nav = [...document.querySelectorAll('a,button')].find((x) => x.textContent.trim() === 'Clients' && x.offsetParent); if (nav) nav.click(); });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Suspendre le compte' && b.offsetParent), { timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Suspendre le compte' && b.offsetParent).click());
    await sleep(1500);
    check(patches.length === 1 && patches[0].status === 200 && status() === 'suspended', 'la vraie route a suspendu (réponse coupée côté navigateur)');
    const view = await page.evaluate(() => ({ toast: (document.getElementById('op-toast') || {}).textContent || '',
      buttons: [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()) }));
    check(!/Échec/.test(view.toast), `aucun faux « Échec » : ${view.toast.slice(0, 120)}`);
    check(/peut-être/.test(view.toast), 'la console dit que le changement a peut-être eu lieu');
    check(view.buttons.includes('Réactiver le compte') && !view.buttons.includes('Suspendre le compte'), 'le statut est relu : la console propose de réactiver, pas de suspendre une seconde fois');
  });
} finally {
  console.log(`\nadmin-lost-response-browser-test: ${checks} checks passed`);
  server.close();
  await S.finish();
}
