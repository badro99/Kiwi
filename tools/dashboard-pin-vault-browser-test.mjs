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
let verifyMode = 'normal';       // normal | refuse-all | refuse-unconfigured | down | expired-html | expired-json | forbidden
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
      /* La session ne vaut plus rien : le serveur n'a jugé AUCUN code. Les deux
         formes réelles : le portier (functions/_middleware.js) répond la page de
         connexion en HTML avant verify.js ; verifyAccountPin répond 'unauthorized'
         quand seul un cookie d'équipe a passé le portier. Plus un 403 sans corps,
         que rien ne qualifie. */
      if (verifyMode === 'expired-html') return req.respond({ status: 401, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Kiwi</title><form action="/auth/login"></form>' });
      if (verifyMode === 'expired-json') return req.respond(json(401, { error: 'unauthorized' }));
      if (verifyMode === 'forbidden') return req.respond({ status: 403, contentType: 'text/plain', body: 'Forbidden' });
      if (verifyMode === 'normal' && body.pin === CODE) return req.respond(json(200, { ok: true, staff: { id: 'st_owner', name: 'Amira', role: 'owner' }, merchant: 'vault-test' }));
      if (verifyMode === 'refuse-unconfigured') return req.respond(json(401, { error: 'bad-pin', configured: false }));
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
  // coverage: surface=dashboard locale=en viewport=desktop
  await page.goto(`${base}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-kiwi-pin-input]', { timeout: 30000 });
  await page.waitForFunction(() => !!window.KiwiDashPinVault && window.KiwiConfig && window.KiwiConfig.accountPinsReady !== false, { timeout: 30000 });
  return page;
}

const storageDump = (page) => page.evaluate(() => Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n'));
const vaultCount = (page) => page.evaluate(() => window.KiwiDashPinVault.count());
const unlocked = (page) => page.evaluate(() => !!document.querySelector('[data-kiwi-pin] .kiwi-pin-cell.is-success'));
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
    // coverage: surface=dashboard locale=en viewport=desktop
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
    // coverage: surface=dashboard locale=en viewport=desktop
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
    // coverage: surface=dashboard locale=en viewport=desktop
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
      // coverage: surface=dashboard locale=en viewport=desktop
      const first = await open(tr, ctx);
      await typeCode(first, CODE);
      assert.equal(await outcome(first), 'unlocked');
      await first.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
      await first.close();
    }
    // coverage: surface=dashboard locale=en viewport=desktop
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
      // coverage: surface=dashboard locale=en viewport=desktop
      const first = await open(tr, ctx);
      await typeCode(first, CODE);
      assert.equal(await outcome(first), 'unlocked');
      await first.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
      await first.close();
    }
    verifyMode = 'down';
    // coverage: surface=dashboard locale=en viewport=desktop
    const page = await open(tr, ctx);
    await typeCode(page, CODE);
    check(await outcome(page) === 'unlocked', 'le serveur ne répond pas : la ligne salée ouvre le code prouvé');
    // coverage: surface=dashboard locale=en viewport=desktop
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
      // coverage: surface=dashboard locale=en viewport=desktop
      const first = await open(tr, ctx);
      await typeCode(first, CODE);
      assert.equal(await outcome(first), 'unlocked');
      await first.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
      await first.close();
    }
    tr.step('the owner changed the code: the server now refuses everything');
    verifyMode = 'refuse-all';
    // coverage: surface=dashboard locale=en viewport=desktop
    const page = await open(tr, ctx);
    check(await vaultCount(page) === 1, 'la ligne est encore là avant la tentative');
    await typeCode(page, CODE);
    check(await outcome(page) === 'refused', 'EN LIGNE, le serveur refuse : la porte reste fermée malgré la ligne salée');
    await page.waitForFunction(() => window.KiwiDashPinVault.count() === 0, { timeout: 5000 });
    check(await vaultCount(page) === 0, 'et la ligne qui reconnaissait ce code est effacée');
    verifyMode = 'normal';
  });

  await S.run('session expirée · le bon code n\'est pas « incorrect » et sa ligne reste', async (tr) => {
    verifyMode = 'normal';
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    {
      // coverage: surface=dashboard locale=en viewport=desktop
      const first = await open(tr, ctx);
      await typeCode(first, CODE);
      assert.equal(await outcome(first), 'unlocked');
      await first.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
      await first.close();
    }
    /* 'account-revoked' n'est pas rejoué ici : assets/auth-guard.js purge le
       navigateur et renvoie vers la connexion dès qu'un /api/* la répond, ce qui
       est voulu pour un compte supprimé. Le pavé la classe quand même « session
       morte » (dashboard-pin-vault-test.mjs) au cas où le garde ne tire pas. */
    for (const mode of ['expired-html', 'expired-json']) {
      tr.step(`the session is dead (${mode}); the owner types the CORRECT code`);
      verifyMode = mode;
      const before = asked.length;
      // coverage: surface=dashboard locale=en viewport=desktop
      const page = await open(tr, ctx);
      check(await vaultCount(page) === 1, `${mode} · la ligne est encore là avant la tentative`);
      await typeCode(page, CODE);
      check(await outcome(page) === 'refused', `${mode} · la porte reste fermée : le code n'a été jugé par personne`);
      check(asked.length > before, `${mode} · le serveur a bien été interrogé (ce n'est pas un hors-ligne)`);
      const help = await helpText(page);
      check(/session has expired/i.test(help) && !/wrong code/i.test(help), `${mode} · elle dit « session expirée », pas « code incorrect » (« ${help.slice(0, 48)} »)`);
      check(await page.evaluate(() => !!document.querySelector('.kiwi-lock-help a[href="/auth/logout"]')), `${mode} · et propose de se reconnecter`);
      await sleep(400);
      check(await vaultCount(page) === 1, `${mode} · la ligne salée n'est PAS effacée`);
      await noPlaintext(page, `${mode} · toujours aucun code en clair`);
      await page.close();
    }
    tr.step('a 403 nobody qualifies is "could not know", not a verdict: the salted row opens the code, a stranger stays out');
    verifyMode = 'forbidden';
    // coverage: surface=dashboard locale=en viewport=desktop
    const open403 = await open(tr, ctx);
    await typeCode(open403, CODE);
    check(await outcome(open403) === 'unlocked', 'un 403 sans corps : ni « non » ni session morte, le repli salé ouvre le code prouvé');
    // coverage: surface=dashboard locale=en viewport=desktop
    const other403 = await open(tr, ctx);
    await typeCode(other403, OTHER);
    check(await outcome(other403) === 'refused', '…et un code que ce navigateur n\'a jamais vu prouver reste refusé');
    check(await vaultCount(other403) === 1, '…sans rien effacer');
    tr.step('the owner signs in again: the same row still opens the door');
    verifyMode = 'normal';
    // coverage: surface=dashboard locale=en viewport=desktop
    const back = await open(tr, ctx);
    check(await vaultCount(back) === 1, 'après reconnexion, la ligne est toujours là');
    await typeCode(back, CODE);
    check(await outcome(back) === 'unlocked', 'et le même code ouvre la porte');
    tr.step('contrast: a real bad-pin from a live session still erases the row');
    verifyMode = 'refuse-all';
    // coverage: surface=dashboard locale=en viewport=desktop
    const bad = await open(tr, ctx);
    await typeCode(bad, CODE);
    check(await outcome(bad) === 'refused', 'un vrai « bad-pin » refuse');
    await bad.waitForFunction(() => window.KiwiDashPinVault.count() === 0, { timeout: 5000 });
    check(await vaultCount(bad) === 0, '…et lui, efface la ligne');
    verifyMode = 'normal';
  });

  await S.run('« non » du serveur · final, sauf quand LE SERVEUR dit que le compte n\'a aucun code', async (tr) => {
    rosterMode = 'empty';
    const tryOnce = async (mode, onboarded) => {
      verifyMode = mode;
      const ctx = await browser.createBrowserContext();
      tr.defer(() => ctx.close());
      // coverage: surface=dashboard locale=en viewport=desktop
      const page = await open(tr, ctx, { onboarded });
      await typeCode(page, OTHER);
      return outcome(page);
    };
    check(await tryOnce('refuse-all', true) === 'refused', 'liste vide, coffre vide, serveur muet sur l\'état du compte : le « non » est final (un champ absent vaut « configuré »)');
    check(await tryOnce('refuse-unconfigured', true) === 'unlocked', 'le serveur dit « ce compte n\'a aucun code » : la porte laisse rejoindre l\'installation, quel que soit l\'état du navigateur');
    rosterMode = 'full';
    verifyMode = 'normal';
  });

  await S.run('hors ligne · cinq refus de suite ferment le repli salé cinq minutes', async (tr) => {
    verifyMode = 'normal';
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    {
      // coverage: surface=dashboard locale=en viewport=desktop
      const first = await open(tr, ctx);
      await typeCode(first, CODE);
      assert.equal(await outcome(first), 'unlocked');
      await first.waitForFunction(() => window.KiwiDashPinVault.count() === 1, { timeout: 5000 });
      await first.close();
    }
    // coverage: surface=dashboard locale=en viewport=desktop
    const page = await open(tr, ctx);
    await page.setOfflineMode(true);
    const wrongCodes = ['1001', '1002', '1003', '1004', '1005'];
    for (const w of wrongCodes) {
      await typeCode(page, w);
      assert.equal(await outcome(page), 'refused');
      await page.evaluate(() => { const i = document.querySelector('[data-kiwi-pin-input]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
      await sleep(150);
    }
    check(await page.evaluate(() => window.KiwiDashPinVault.lockedFor()) > 0, 'cinq refus hors ligne : le coffre se verrouille');
    await typeCode(page, CODE);
    check(await outcome(page) === 'refused', 'pendant la pause, même le bon code est refusé');
    check(/Too many attempts/i.test(await helpText(page)), `et la porte le dit comme le serveur le dirait (« ${(await helpText(page)).slice(0, 50)} »)`);
  });

  await S.run('sans ligne, hors ligne · le patron ne passe pas', async (tr) => {
    verifyMode = 'normal';
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    // coverage: surface=dashboard locale=en viewport=desktop
    const page = await open(tr, ctx);
    await page.setOfflineMode(true);
    await typeCode(page, CODE);
    check(await outcome(page) === 'refused', 'aucune preuve ici : un compte configuré hors ligne ne s\'ouvre pas');
  });
} finally {
  server.close();
  await S.finish();
}
