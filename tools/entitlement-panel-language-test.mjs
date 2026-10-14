#!/usr/bin/env node
/* Compte en attente · le panneau d'activation et sa pastille parlent la
 * langue de l'écran, et la pastille ne se pose plus sur la barre d'onglets.
 * Conduit dans un vrai navigateur sur assets/entitlements-v2.js et
 * assets/entitlements.css tels qu'ils sont livrés.
 *
 * 2026-10-12. Un commerçant en attente, tableau de bord en anglais ou en
 * arabe, lisait « Prêt à ouvrir · en parler à Kiwi », puis un panneau
 * entièrement français, et « En parler avec Kiwi » ouvrait WhatsApp sur une
 * phrase française qu'il n'avait pas écrite. Construit une fois, le panneau
 * gardait la langue de sa première ouverture. Sur un téléphone, la pastille
 * pleine largeur se posait sur la barre d'onglets du bas : Accueil, Commandes,
 * Vendre, Kiwi AI et Menu ne se touchaient plus. Elle s'affichait aussi sur
 * la porte à code. Et en arabe, la croix et la pastille restaient collées à
 * droite, par-dessus la barre latérale.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';

const root = process.env.KIWI_ROOT || path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required for the activation panel');

const page = (lang) => `<!doctype html><html lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/entitlements.css">
<style>
  body{margin:0;background:#F7F5F0;min-height:2000px}
  .kw-tabbar{display:none}
  @media (max-width:860px){.kw-tabbar{display:block;position:fixed;left:0;right:0;bottom:0;height:84px;background:#e8e4da;z-index:1200}}
  .kcl-chip{position:fixed;left:14px;bottom:88px;width:48px;height:48px;border-radius:50%;background:#ddd;z-index:900}
</style></head><body>
<nav class="kw-tabbar" id="tabbar"></nav><button class="kcl-chip" id="chip" type="button">R</button>
<script>
window.KiwiConfig = {subscription: {active: false, state: 'pending'}};
window.KiwiIdentity = {ready: Promise.resolve({authenticated: true, onboarded: true})};
</script>
<script src="/assets/entitlements-v2.js"></script>
<script src="/assets/pwa-update.js"></script>
</body></html>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(page(u.searchParams.get('lang') || 'fr')); return; }
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

async function open(lang, viewport) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.setViewport(viewport);
  await p.goto(base + '?lang=' + lang);
  await p.waitForSelector('.kiwi-entitlement-pill', {timeout: 5000});
  await pause(80);
  return {ctx, p, errors};
}
const rect = (p, sel) => p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return {l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight}; });
const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const pillText = (p) => p.$eval('.kiwi-entitlement-pill', (e) => e.textContent.trim());
const card = (p) => p.$eval('.kiwi-entitlement-card', (c) => ({
  text: c.innerText,
  h2: c.querySelector('h2').textContent,
  cta: c.querySelector('.kiwi-entitlement-actions a').textContent,
  href: decodeURIComponent(c.querySelector('.kiwi-entitlement-actions a').getAttribute('href')),
  later: c.querySelector('.kiwi-entitlement-later').textContent,
  label: c.parentElement.getAttribute('aria-label'),
}));
const french = /(Tout est|Plus tard|établissement|Votre travail|Quelqu|Aucune urgence|Prêt à ouvrir|En parler)/;

try {
  /* A · anglais, bureau, puis passage à l'arabe sans recharger */
  {
    const {ctx, p, errors} = await open('en', {width: 1280, height: 800});
    const setLang = (l) => p.evaluate((lang) => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; window.dispatchEvent(new CustomEvent('kiwi:langchange', {detail: {lang}})); }, l);
    check(await pillText(p) === 'Ready to open · talk to Kiwi', 'the pill reads English under English');
    await setLang('ar');
    await pause(80);
    check(/^جاهز للافتتاح/.test(await pillText(p)), 'switching to Arabic relabels the pill at once');
    const pr = await rect(p, '.kiwi-entitlement-pill');
    check(pr.l < pr.w / 2, 'and in Arabic it sits on the left, clear of the mirrored sidebar');
    await setLang('en');
    await pause(80);
    check(await pillText(p) === 'Ready to open · talk to Kiwi', 'and back to English');

    await p.click('.kiwi-entitlement-pill');
    await pause(150);
    let c = await card(p);
    check(c.h2 === 'Everything is in place.' && c.cta === 'Talk to Kiwi' && /still looking/.test(c.later), 'the panel reads English');
    check(!french.test(c.text) && c.label === 'Open your business with Kiwi', 'and carries no French, not even in its label');
    check(/text=Hello Kiwi, I would like to activate/.test(c.href), '« Talk to Kiwi » opens WhatsApp on an English message');
    await p.click('.kiwi-entitlement-later');
    await pause(150);

    /* « Plus tard » met la pastille en veille dix minutes (voulu). Le panneau
       déjà construit en anglais est rouvert, après passage à l'arabe, par la
       porte publique que prennent les autres écrans. */
    await setLang('ar');
    await p.evaluate(() => { localStorage.removeItem('kiwi:entitlement:next-prompt-at:v1'); window.KiwiSubscription.open(); });
    await pause(150);
    c = await card(p);
    check(c.h2 === 'كل شيء جاهز.' && !/[A-Za-z]{4,}/.test(c.text.replace(/Kiwi|WhatsApp/g, '')), 'the panel reopens rebuilt in Arabic, not in the language of its first opening');
    check(/text=مرحبًا كيوي/.test(c.href), 'and its WhatsApp message is Arabic');
    const x = await rect(p, '.kiwi-entitlement-x');
    const cr = await rect(p, '.kiwi-entitlement-card');
    check(x.r < cr.l + (cr.r - cr.l) / 2, 'the close cross mirrors to the left under Arabic');
    check(errors.length === 0, 'no page error');
    await ctx.close();
  }

  /* B · français, téléphone, avec la barre d'onglets du tableau de bord */
  {
    const {ctx, p} = await open('fr', {width: 375, height: 812, isMobile: true});
    check(await pillText(p) === 'Prêt à ouvrir · en parler à Kiwi', 'the pill still reads French under French');
    const pill = await rect(p, '.kiwi-entitlement-pill');
    const bar = await rect(p, '#tabbar');
    const chip = await rect(p, '#chip');
    check(pill.b <= bar.t, 'on a phone the pill sits above the tab bar, never on it');
    check(!overlap(pill, chip), 'and clear of the day-report chip');
    check(pill.l >= 14 && pill.w - pill.r >= 14, 'and inside the side gutters');
    const hit = await p.evaluate(() => { const b = document.getElementById('tabbar').getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el && el.id; });
    check(hit === 'tabbar', 'the middle of the tab bar is reachable again');
    const shown = () => p.$eval('.kiwi-entitlement-pill', (e) => getComputedStyle(e).display !== 'none');
    await p.evaluate(() => document.documentElement.classList.add('kiwi-gate-up'));
    check(!(await shown()), 'behind the code screen the pill stands aside, like the tab bar');
    await p.evaluate(() => document.documentElement.classList.remove('kiwi-gate-up'));
    check(await shown(), 'and comes back once the dashboard is open');

    /* « Nouvelle version prête » : la vraie pastille de pwa-update.js. */
    await p.evaluate(() => { sessionStorage.setItem('kiwiSwAutoReloaded', '1'); window.KiwiPWAUpdate.show(); });
    await pause(200);
    const up = await rect(p, '#kiwi-update-ready');
    const pill2 = await rect(p, '.kiwi-entitlement-pill');
    check(up.b <= bar.t, 'the update pill rides above the tab bar instead of covering « Vendre »');
    check(!overlap(up, pill2) && !overlap(up, chip), 'and above the chip and the activation pill: nothing overlaps');
    const hit2 = await p.evaluate(() => { const b = document.getElementById('tabbar').getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el && el.id; });
    check(hit2 === 'tabbar', 'the middle of the tab bar stays reachable with both pills up');

    /* Une feuille ou une fenêtre ouverte recouvre la pastille, jamais l'inverse. */
    await p.evaluate(() => { const v = document.createElement('div'); v.className = 'kiwi-drawer-backdrop'; v.id = 'veil'; v.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(10,15,13,.45)'; document.body.append(v); });
    const under = await p.evaluate(() => { const r = document.querySelector('.kiwi-entitlement-pill').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el && el.id; });
    check(under === 'veil', 'an open sheet or window covers the pill, the pill no longer paints over it');
    await p.evaluate(() => document.getElementById('veil').remove());
    await p.click('.kiwi-entitlement-pill');
    await pause(150);
    const c = await card(p);
    check(/dès aujourd’hui, avec tout/.test(c.text) && !/aujourd.hui · avec/.test(c.text), 'the French copy reads as a sentence, not a list');
    await ctx.close();
  }

  /* C · arabe, téléphone : la puce garde la gauche, la pastille la droite */
  {
    const {ctx, p} = await open('ar', {width: 360, height: 760, isMobile: true});
    const pill = await rect(p, '.kiwi-entitlement-pill');
    const chip = await rect(p, '#chip');
    const bar = await rect(p, '#tabbar');
    check(!overlap(pill, chip) && pill.b <= bar.t, 'under Arabic on a phone the pill clears the chip and the bar');
    const fits = await p.$eval('.kiwi-entitlement-pill span', (s) => s.scrollWidth <= s.clientWidth + 1);
    check(fits, 'and its label fits on one line');
    await ctx.close();
  }

  /* D · petite tablette : la barre d'onglets existe jusqu'à 860 px */
  {
    const {ctx, p} = await open('en', {width: 820, height: 1180});
    const pill = await rect(p, '.kiwi-entitlement-pill');
    const bar = await rect(p, '#tabbar');
    check(pill.b <= bar.t, 'on a small tablet the pill also clears the tab bar');
    await ctx.close();
  }

  /* E · bureau, sans barre d'onglets : la pastille de mise à jour garde le bas */
  {
    const {ctx, p} = await open('fr', {width: 1280, height: 800});
    await p.evaluate(() => { sessionStorage.setItem('kiwiSwAutoReloaded', '1'); window.KiwiPWAUpdate.show(); });
    await pause(200);
    const up = await rect(p, '#kiwi-update-ready');
    check(Math.abs((up.h - up.b) - 18) <= 1, 'without a tab bar the update pill keeps its place at the bottom edge');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\nentitlement-panel-language: ${checks} passed, 0 failed`);
