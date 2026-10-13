#!/usr/bin/env node
/* Le vrai pavé du dashboard, dans un vrai Chromium : aucun code en clair dans
 * localStorage, le serveur juge d'abord, et la ligne salée ne rouvre la porte
 * que lorsque le serveur n'a pas pu répondre.
 *
 *   node tools/dashboard-pin-vault-browser-test.mjs
 *
 * Le « serveur » est une interception de /api/pin/verify : il connaît un seul
 * code d'essai (une valeur fabriquée pour cette suite, jamais un code réel) et
 * répond comme functions/api/pin/verify.js (200 {ok, staff} ou 401). Aucun
 * compte, aucune boutique, aucun service réel n'est touché.
 *
 * Ce que la suite tient (CLAUDE.md §6, docs/audits/design-2026-10, M2) :
 *   1 · un `kiwiPins` en clair d'avant est supprimé au chargement, sans être
 *       converti, et aucun code ne reste dans le stockage ;
 *   2 · un code prouvé en ligne ouvre la porte ET écrit une ligne salée, sans
 *       le code ;
 *   3 · hors ligne, ce code ouvre la porte par la ligne salée ; un autre non ;
 *   4 · serveur injoignable (en ligne mais muet) : même repli ;
 *   5 · en ligne, un « non » du serveur est FINAL : la porte reste fermée et la
 *       ligne qui reconnaissait ce code est effacée ;
 *   6 · sans ligne, hors ligne, le patron ne passe pas (compte configuré) ;
 *   7 · à toute étape, localStorage ne contient jamais le code.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const CODE = '7391';     // valeur d'essai de cette suite
const OTHER = '2580';
const ACCOUNT = 'vault-test@example.com';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('dashboard-pin-vault', { browser });
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };

/* Comment le « serveur » répond au prochain /api/pin/verify. */
let verifyMode = 'normal';       // normal | refuse-all | down
let rosterMode = 'full';         // full | empty (le /api/config du compte ne rend personne)
const asked = [];
const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function open(tr, ctx, { legacy = null, onboarded = true } = {}) {
  const page = tr.watch(await ctx.newPage());
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.origin !== base) return req.continue();
    if (u.pathname === '/kiwi-sw.js') return req.respond(json(404, {}));
    if (u.pathname === '/api/pin/verify') {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
      asked.push(Boolean(body.pin));
      if (verifyMode === 'down') return req.abort('failed');
      if (verifyMode === 'normal' && body.pin === CODE) return req.respond(json(200, { ok: true, staff: { id: 'st_owner', name: 'Amira', role: 'owner' }, merchant: 'vault-test' }));
      return req.respond(json(401, { error: 'bad-pin' }));
    }
    if (u.pathname === '/api/config') return req.respond(json(200, { pins: rosterMode === 'empty' ? [] : [{ name: 'Amira', role: 'owner' }] }));
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/')) return req.respond(json(404, {}));
    return req.continue();
  });
  page.on('dialog', async (d) => { await d.dismiss(); });
  await page.evaluateOnNewDocument((account, legacyRows, isOnboarded) => {
    try {
      localStorage.setItem('kiwiAccountKey', account);
      localStorage.setItem('kiwiDemos', '0');           // hosted behaviour: no demo, the lock judges for real
      if (isOnboarded) localStorage.setItem('kiwiOnboarded', '1');
      localStorage.setItem('kiwiLang', 'en');
      if (legacyRows && !sessionStorage.getItem('kiwiTestLegacyDone')) {
        localStorage.setItem('kiwiPins', legacyRows);
        sessionStorage.setItem('kiwiTestLegacyDone', '1');
      }
    } catch (_) {}
  }, ACCOUNT, legacy, onboarded);
  page.setDefaultNavigationTimeout(60000);
  await page.goto(`${base}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-kiwi-pin-input]', { timeout: 30000 });
  await page.waitForFunction(() => !!window.KiwiDashPinVault && window.KiwiConfig && window.KiwiConfig.accountPinsReady !== false, { timeout: 30000 });
  return page;
}

const storageDump = (page) => page.evaluate(() => Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n'));
const vaultCount = (page) => page.evaluate(() => window.KiwiDashPinVault.count());
/* Ouverte = une cellule en succès, ou la porte est partie / cachée / en sortie (un compte jamais installé
   voit l'assistant d'installation prendre la place avant que les cellules ne s'allument). */
const unlocked = (page) => page.evaluate(() => {
  const lock = document.querySelector('[data-kiwi-lock]');
  return !!document.querySelector('[data-kiwi-pin] .kiwi-pin-cell.is-success')
    || !lock || lock.style.display === 'none' || lock.classList.contains('is-unlocking');
});
const wrong = (page) => page.evaluate(() => !!document.querySelector('[data-kiwi-pin].is-wrong'));
const helpText = (page) => page.evaluate(() => (document.querySelector('.kiwi-lock-help') || {}).textContent || '');

async function typeCode(page, code) {
  await page.evaluate(() => { const i = document.querySelector('[data-kiwi-pin-input]'); i.focus(); i.value = ''; });
  await page.keyboard.type(code, { delay: 40 });
}
async function outcome(page, { within = 6000 } = {}) {
  const until = Date.now() + within;
  while (Date.now() < until) {
    if (await unlocked(page)) return 'unlocked';
    if (await wrong(page)) return 'refused';
    await sleep(80);
  }
  return 'none';
}
const noPlaintext = async (page, msg) => {
  const dump = await storageDump(page);
  check(!dump.includes(`"${CODE}"`) && !dump.includes(`"${OTHER}"`) && !/"(code|pin|pinCode|password)"\s*:/.test(dump), msg);
};

try {
  await S.run('migration · le kiwiPins en clair est supprimé, pas converti', async (tr) => {
    verifyMode = 'normal';
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    const legacy = JSON.stringify([{ role: 'owner', code: CODE, name: 'Amira' }, { role: 'staff', code: OTHER, name: 'Sara' }]);
    const page = await open(tr, ctx, { legacy });
    check(await page.evaluate(() => localStorage.getItem('kiwiPins') === null), 'kiwiPins n\'existe plus après le chargement');
    check(await vaultCount(page) === 0, 'rien n\'a été converti en ligne salée (ces codes n\'ont jamais été prouvés)');
    await noPlaintext(page, 'aucun code en clair dans localStorage après la migration');
  });

  await S.run('en ligne · le serveur prouve, la porte s\'ouvre, une ligne salée s\'écrit', async (tr) => {
    verifyMode = 'normal';
    asked.length = 0;
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    const page = await open(tr, ctx);
    tr.step('type the proven code');
    await typeCode(page, CODE);
    check(await outcome(page) === 'unlocked', 'le code que le serveur reconnaît ouvre la porte');
    check(asked.length >= 1, 'le serveur a été interrogé');
    await page.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
    check(await vaultCount(page) === 1, 'une ligne salée a été écrite après la preuve du serveur');
    await noPlaintext(page, 'le stockage ne contient pas le code, ni une clé code / pin / password');
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /dashboard:offline-pins/.test(k)));
    check(keys.length === 1 && keys[0].startsWith('kiwi:'), 'la ligne vit sous kiwi: (la purge de locataire l\'emporte)');

    tr.step('wrong code online writes nothing');
    const ctx2 = await browser.createBrowserContext();
    tr.defer(() => ctx2.close());
    const p2 = await open(tr, ctx2);
    await typeCode(p2, OTHER);
    check(await outcome(p2) === 'refused', 'un code que le serveur refuse ferme la porte');
    check(await vaultCount(p2) === 0, 'et n\'écrit aucune ligne');
  });

  await S.run('hors ligne · la ligne salée ouvre ce code et seulement lui', async (tr) => {
    verifyMode = 'normal';
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    {
      const first = await open(tr, ctx);
      await typeCode(first, CODE);
      assert.equal(await outcome(first), 'unlocked');
      await first.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
      await first.close();
    }
    const page = await open(tr, ctx);
    check(await vaultCount(page) === 1, 'la ligne a survécu au rechargement');
    tr.step('go offline');
    const asksBefore = asked.length;
    await page.emulateNetworkConditions?.(null);
    await page.setOfflineMode(true);
    check(await page.evaluate(() => navigator.onLine === false), 'le navigateur est hors ligne');
    await typeCode(page, OTHER);
    check(await outcome(page) === 'refused', 'hors ligne, un code inconnu est refusé');
    check(/offline/i.test(await helpText(page)), `et la porte dit pourquoi : hors ligne (« ${(await helpText(page)).slice(0, 60)} »)`);
    await page.evaluate(() => { const i = document.querySelector('[data-kiwi-pin-input]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(200);
    await typeCode(page, CODE);
    check(await outcome(page) === 'unlocked', 'hors ligne, le code prouvé ici ouvre la porte par sa ligne salée');
    check(asked.length === asksBefore, 'sans tenter le réseau (appareil hors ligne)');
    await noPlaintext(page, 'toujours aucun code en clair dans localStorage');
  });

  await S.run('serveur muet · en ligne mais injoignable, même repli', async (tr) => {
    verifyMode = 'normal';
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    {
      const first = await open(tr, ctx);
      await typeCode(first, CODE);
      assert.equal(await outcome(first), 'unlocked');
      await first.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
      await first.close();
    }
    verifyMode = 'down';
    const page = await open(tr, ctx);
    await typeCode(page, CODE);
    check(await outcome(page) === 'unlocked', 'le serveur ne répond pas : la ligne salée ouvre le code prouvé');
    const page2 = await open(tr, ctx);
    await typeCode(page2, OTHER);
    check(await outcome(page2) === 'refused', 'et un autre code reste refusé');
    verifyMode = 'normal';
  });

  await S.run('un « non » du serveur est final, et efface la ligne', async (tr) => {
    verifyMode = 'normal';
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    {
      const first = await open(tr, ctx);
      await typeCode(first, CODE);
      assert.equal(await outcome(first), 'unlocked');
      await first.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
      await first.close();
    }
    tr.step('the owner changed the code: the server now refuses everything');
    verifyMode = 'refuse-all';
    const page = await open(tr, ctx);
    check(await vaultCount(page) === 1, 'la ligne est encore là avant la tentative');
    await typeCode(page, CODE);
    check(await outcome(page) === 'refused', 'EN LIGNE, le serveur refuse : la porte reste fermée malgré la ligne salée');
    await page.waitForFunction(() => window.KiwiDashPinVault.count() === 0, { timeout: 5000 });
    check(await vaultCount(page) === 0, 'et la ligne qui reconnaissait ce code est effacée');
    verifyMode = 'normal';
  });

  await S.run('liste du compte vide · un « non » du serveur ferme la porte d\'un compte installé, pas celle d\'un compte neuf', async (tr) => {
    verifyMode = 'refuse-all';
    rosterMode = 'empty';
    {
      const ctx = await browser.createBrowserContext();
      tr.defer(() => ctx.close());
      const page = await open(tr, ctx, { onboarded: true });
      await typeCode(page, OTHER);
      check(await outcome(page) === 'refused', 'compte installé, liste vide, coffre vide : le « non » du serveur est final');
    }
    {
      const ctx = await browser.createBrowserContext();
      tr.defer(() => ctx.close());
      const page = await open(tr, ctx, { onboarded: false });
      await typeCode(page, OTHER);
      check(await outcome(page) === 'unlocked', 'compte jamais installé : la porte laisse passer pour atteindre l\'installation (règle d\'avant, inchangée)');
    }
    rosterMode = 'full';
    verifyMode = 'normal';
  });

  await S.run('sans ligne, hors ligne · le patron ne passe pas', async (tr) => {
    verifyMode = 'normal';
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    const page = await open(tr, ctx);
    await page.setOfflineMode(true);
    await typeCode(page, CODE);
    check(await outcome(page) === 'refused', 'aucune preuve ici : un compte configuré hors ligne ne s\'ouvre pas');
  });
} finally {
  server.close();
  await S.finish();
}
