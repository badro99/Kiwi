#!/usr/bin/env node
/* Compte en attente · un geste retenu dit toujours pourquoi, une écriture de
 * fond n'ouvre rien. Conduit dans un vrai navigateur, avec de vrais clics et
 * de vraies frappes, sur assets/entitlements-v2.js tel qu'il est livré.
 *
 * 2026-10-12. Sur un compte en attente, installation finie :
 *   · après « Plus tard », le panneau d'activation se met en veille dix
 *     minutes (voulu) ; pendant ces dix minutes, « Nouveau produit », toute
 *     frappe dans un champ, tout bouton retenu ne faisait RIEN : ni panneau,
 *     ni pastille, ni ligne. Un tableau de bord en panne apparente.
 *   · une écriture de fond (la carte qui se resynchronise au chargement)
 *     passait par le garde réseau, qui ouvrait le grand panneau par-dessus
 *     l'écran de verrouillage, sans que personne ait rien touché.
 *   · la ligne de l'installation était en français sous EN et AR.
 *   · sur l'écran de verrouillage, toucher une case du code ouvrait le
 *     panneau par-dessus le verrou, et « Changer de compte » (« Se
 *     déconnecter… » contient « connecter ») était retenu : impossible de
 *     sortir d'un compte en attente.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';

const root = process.env.KIWI_ROOT || path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required for the entitlement gestures');

const page = (lang, onboarded) => `<!doctype html><html lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/entitlements.css"></head><body style="margin:0;padding:24px;background:#F7F5F0">
<button id="add">Ajouter un produit</button>
<button id="ok">OK</button>
<button id="pay">Encaisser 10 MAD</button>
<input id="field" type="text" name="note" style="display:block;margin-top:12px">
<button id="out" type="button">Se déconnecter</button>
<div data-kiwi-lock id="lock" style="margin-top:12px;padding:12px;border:1px solid #ccc">
  <input type="tel" inputmode="numeric" maxlength="4" class="kiwi-pin-input" data-kiwi-pin-input autocomplete="off" id="pin">
  <a id="switch" class="kiwi-lock-switch" href="/auth/logout" aria-label="Se déconnecter et changer de compte">Changer de compte</a>
</div>
<script>
window.__ran = [];
document.getElementById('out').onclick = () => __ran.push('out');
document.getElementById('switch').onclick = (e) => { e.preventDefault(); __ran.push('switch'); };
document.getElementById('add').onclick = () => __ran.push('add');
document.getElementById('pay').onclick = () => __ran.push('pay');
document.getElementById('ok').onclick = () => { __ran.push('ok'); fetch('/api/thing', {method: 'POST', body: '{}'}).then((r) => __ran.push('ok:' + r.status)); };
window.KiwiConfig = {subscription: {active: false, state: 'pending'}};
window.KiwiIdentity = {ready: Promise.resolve({authenticated: true, onboarded: ${onboarded}})};
</script>
<script src="/assets/entitlements-v2.js"></script>
</body></html>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(page(u.searchParams.get('lang') || 'fr', u.searchParams.get('onboarded') !== '0'));
    return;
  }
  if (u.pathname.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); return; }
  const f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'text/css');
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({executablePath: bin, headless: true, args: ['--no-sandbox']});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function open(query, viewport = {width: 1024, height: 768}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.setViewport(viewport);
  await p.goto(base + query);
  await p.waitForFunction(() => window.KiwiSubscription && window.KiwiSubscription.active() === false);
  await pause(120);
  return {ctx, p, errors};
}
const panelOpen = (p) => p.evaluate(() => { const m = document.querySelector('.kiwi-entitlement-layer'); return !!m && !m.classList.contains('is-off') && !m.hidden; });
const lines = (p) => p.$$eval('.kiwi-held-toast', (els) => els.map((e) => ({text: e.querySelector('span') ? e.querySelector('span').textContent : '', button: e.querySelector('button') ? e.querySelector('button').textContent : ''})));
const ran = (p) => p.evaluate(() => window.__ran.slice());

try {
  /* A · installation finie, français */
  {
    const {ctx, p, errors} = await open('?lang=fr');
    const bg = await p.evaluate(() => fetch('/api/thing', {method: 'POST', body: '{}'}).then((r) => r.status));
    await pause(80);
    check(bg === 402, 'a background write is still refused (402)');
    check(!(await panelOpen(p)) && (await lines(p)).length === 0, 'a background write opens nothing: no panel, no line');

    await p.click('#pin');
    await p.keyboard.type('1234');
    await pause(150);
    check(!(await panelOpen(p)) && (await lines(p)).length === 0, 'touching and typing in the lock screen code opens nothing');
    check(await p.$eval('#pin', (e) => e.value) === '1234', 'and the code actually lands in the box');
    await p.click('#switch');
    await pause(120);
    check((await ran(p)).includes('switch') && !(await panelOpen(p)), '« Changer de compte » on the lock screen is never held');
    await p.click('#out');
    await pause(120);
    check((await ran(p)).includes('out') && !(await panelOpen(p)), 'logging out is never held, wherever it sits');

    await p.click('#add');
    await pause(150);
    check(await panelOpen(p), 'a held gesture opens the activation panel');
    check(!(await ran(p)).includes('add'), 'the held gesture did not run');

    await p.click('.kiwi-entitlement-later');
    await pause(150);
    check(!(await panelOpen(p)), '« Plus tard » closes the panel');

    await p.click('#add');
    await pause(150);
    let l = await lines(p);
    check(!(await panelOpen(p)), 'during the cooldown the panel stays closed');
    check(l.length === 1 && /activation de votre établissement/.test(l[0].text), 'during the cooldown the held gesture says why, in one line');
    check(l[0].button === 'Voir l’activation', 'the line offers a way back to the activation');
    check(!(await ran(p)).includes('add'), 'the gesture is still held');

    for (let i = 0; i < 3; i++) { await p.click('#add'); await pause(40); }
    check((await lines(p)).length === 1, 'repeated gestures refresh one line, never a stack');

    await p.click('.kiwi-held-toast button');
    await pause(150);
    check(await panelOpen(p) && (await lines(p)).length === 0, '« Voir l’activation » reopens the panel on purpose');
    await p.click('.kiwi-entitlement-later');
    await pause(150);

    await p.evaluate(() => document.querySelectorAll('.kiwi-held-toast').forEach((e) => e.remove()));
    await p.click('#ok');
    await pause(250);
    const r1 = await ran(p);
    check(r1.includes('ok') && r1.includes('ok:402'), 'an unguarded button runs, and its write is refused');
    check((await lines(p)).length === 1, 'a write that follows a gesture explains itself');

    await p.evaluate(() => document.querySelectorAll('.kiwi-held-toast').forEach((e) => e.remove()));
    await p.click('#field');
    await p.keyboard.type('abc');
    await pause(120);
    check(await p.$eval('#field', (e) => e.value) === '', 'typing into a field is held');
    check((await lines(p)).length === 1, 'and says why');

    await p.evaluate(() => document.querySelectorAll('.kiwi-held-toast').forEach((e) => e.remove()));
    await pause(1300);
    await p.evaluate(() => fetch('/api/thing', {method: 'POST', body: '{}'}));
    await pause(120);
    check((await lines(p)).length === 0 && !(await panelOpen(p)), 'a background write long after the last gesture stays silent');
    await p.$eval('#pin', (e) => { e.value = ''; });
    await p.focus('#pin');
    await p.keyboard.type('7');
    await p.evaluate(() => fetch('/api/thing', {method: 'POST', body: '{}'}));
    await pause(120);
    check((await lines(p)).length === 0 && !(await panelOpen(p)), 'typing the code on the lock screen is not a gesture: the sync after unlocking stays silent');
    check(errors.length === 0, 'no page error');
    await ctx.close();
  }

  /* B · arabe, sur un téléphone */
  {
    const {ctx, p} = await open('?lang=ar', {width: 375, height: 812, isMobile: true, hasTouch: false});
    await p.evaluate(() => localStorage.setItem('kiwi:entitlement:next-prompt-at:v1', String(Date.now() + 600000)));
    await p.click('#add');
    await pause(150);
    const l = await lines(p);
    check(l.length === 1 && /تفعيل/.test(l[0].text) && l[0].button === 'عرض التفعيل', 'the line reads Arabic under Arabic');
    const box = await p.$eval('.kiwi-held-toast', (e) => { const r = e.getBoundingClientRect(); return {bottom: innerHeight - r.bottom, left: r.left, right: innerWidth - r.right}; });
    check(box.bottom >= 90, 'on a phone the line sits above the bottom bar');
    check(box.left >= 15 && box.right >= 15, 'and keeps its side gutters');
    await ctx.close();
  }

  /* C · en cours d'installation, anglais : seuls les gestes d'argent sont retenus */
  {
    const {ctx, p} = await open('?lang=en&onboarded=0');
    await p.click('#add');
    await pause(100);
    check((await ran(p)).includes('add') && (await lines(p)).length === 0, 'while setting up, adding a product is not held');
    await p.click('#pay');
    await pause(150);
    const l = await lines(p);
    check(!(await ran(p)).includes('pay') && !(await panelOpen(p)), 'while setting up, a money gesture is held without the panel');
    check(l.length === 1 && /Finish setting up first/.test(l[0].text) && l[0].button === '', 'and the line says why, in English');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

/* D · la carte qui se synchronise ne montre pas le code du serveur */
{
  const mc = fs.readFileSync(path.join(root, 'assets/menu-catalog.js'), 'utf8');
  check(/if \(r && r\.status === 402\) return null;/.test(mc), 'a menu sync refused for a pending account stays silent (the gesture was already explained)');
  check(!/desc: \(err && err\.error\)/.test(mc), 'a refused menu sync never prints the server code');
  check((mc.match(/syncSay\('Échec de synchronisation de la carte', 'The menu could not be synced', 'تعذّرت مزامنة القائمة'\)/g) || []).length === 3, 'every menu sync failure reads FR, EN and AR');
}
console.log(`\nentitlement-held-gesture: ${checks} passed, 0 failed`);
