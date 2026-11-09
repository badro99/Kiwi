#!/usr/bin/env node
/* App natif · documents et PDF : la feuille de document est un vrai dialogue
 * modal, et un module natif qui échoue ou ne répond jamais ne coince rien.
 *
 * app/src/native-files.js tourne ici tel qu'il est livré (Chromium, faux
 * Capacitor, faux plugin KiwiPrinterSocket pilotable). Aucun marchand réel.
 *  B0 · la feuille ouverte par window.open('') prend le focus, le garde
 *       (Tab, focus venu de l'extérieur), a un nom accessible (dialogue et
 *       cadre, avant et après l'écriture du document), Échap la ferme et le
 *       focus revient au bouton qui l'a ouverte ;
 *  B1 · deux documents DIFFÉRENTS demandés à la suite partent tous les deux ;
 *       le même document demandé deux fois de suite (onload + bouton) ne part
 *       qu'une fois ;
 *  A2 · plugin qui rejette : un seul toast d'échec, la feuille s'ouvre et se
 *       ferme encore, le focus revient, un lien normal navigue ; plugin qui ne
 *       répond jamais : aucun toast, rien ne bloque, le document suivant part.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { harness } from './surface-matrix-lib.mjs';

const h = await harness('native-files-journey');
const S = h.S;
const root = path.resolve(new URL('..', import.meta.url).pathname);
const SOURCE = fs.readFileSync(path.join(root, 'app/src/native-files.js'), 'utf8');
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };

const PAGE = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fixture</title></head><body>'
  + '<button id="opener">Ouvrir</button><a id="nav" href="#ailleurs">Ailleurs</a><button id="after">Après</button>'
  + '<div id="kr-print-root">Reçu A</div>'
  + '<script>'
  + 'window.__prints=[];window.__toasts=[];window.__mode="resolve";'
  + 'window.KiwiCaisseToast=function(m){window.__toasts.push(m);};'
  + 'window.Capacitor={isNativePlatform:function(){return true;},Plugins:{KiwiPrinterSocket:{printHtml:function(o){window.__prints.push(o.html);'
  + 'if(window.__mode==="reject")return Promise.reject(new Error("boom"));if(window.__mode==="never")return new Promise(function(){});return Promise.resolve({});}}}};'
  + '</script><script src="/app/src/native-files.js"></script></body></html>';

async function open(t) {
  const ctx = await h.browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/fixture.html') return r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE });
    if (u.pathname === '/app/src/native-files.js') return r.respond({ status: 200, contentType: 'text/javascript', body: SOURCE });
    return r.continue();
  });
  await page.setViewport({ width: 402, height: 874, isMobile: true, hasTouch: true });
  // coverage: surface=native-files locale=fr viewport=phone
  await page.goto(h.base + '/fixture.html', { waitUntil: 'load' });
  return page;
}
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) : ''; });
const printRoot = (page, text) => page.evaluate((x) => { document.getElementById('kr-print-root').textContent = x; window.print(); }, text);
const settle = (page) => page.evaluate(() => new Promise((r) => setTimeout(r, 60)));

await S.run('B0 · la feuille de document est un dialogue modal', async (t) => {
  const page = await open(t);
  await page.focus('#opener');
  await page.evaluate(() => { window.__win = window.open(''); });
  check(await active(page) === 'kiwi-native-doc-close', 'le focus entre dans la feuille, sur Fermer');
  check(await page.$eval('.kiwi-native-doc', (e) => (e.getAttribute('aria-label') || '').length > 0 && e.getAttribute('role') === 'dialog'), 'le dialogue a un nom accessible dès l’ouverture');
  check(await page.$eval('iframe.kiwi-native-doc-frame', (e) => e.title.length > 0), 'le cadre a un titre avant même l’écriture du document');
  await page.evaluate(() => { const d = window.__win.document; d.open(); d.write('<!doctype html><title>Facture 12</title><body>Facture</body>'); d.close(); });
  check(await page.$eval('.kiwi-native-doc', (e) => e.getAttribute('aria-label') === 'Facture 12') && await page.$eval('iframe', (e) => e.title === 'Facture 12'), 'le nom suit le titre du document écrit');
  // Le focus essaie de s'échapper vers la page derrière : il est ramené dans la feuille.
  await page.evaluate(() => document.getElementById('after').focus());
  check(await active(page) === 'kiwi-native-doc-close', 'le focus ne sort pas vers la page derrière');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    await settle(page);
    const inside = await page.evaluate(() => { const a = document.activeElement; return !!a && !!(a.closest('.kiwi-native-doc')); });
    assert.ok(inside, 'Tab ' + (i + 1) + ' reste dans la feuille : ' + await active(page));
  }
  console.log('  ✓ Tab ne quitte pas la feuille');
  await page.keyboard.press('Escape');
  check(await page.$('.kiwi-native-doc') === null, 'Échap ferme la feuille');
  check(await active(page) === 'opener', 'le focus revient au bouton qui l’a ouverte');
  await page.evaluate(() => { window.open(''); });
  await page.click('.kiwi-native-doc-close');
  check(await page.$('.kiwi-native-doc') === null && await active(page) === 'opener', 'Fermer rend aussi le focus');
});

await S.run('B1 · l’anti-doublon vaut par document', async (t) => {
  const page = await open(t);
  await printRoot(page, 'Reçu A');
  await printRoot(page, 'Reçu B');
  check(await page.evaluate(() => window.__prints.length) === 2, 'deux documents différents demandés à la suite partent tous les deux');
  await printRoot(page, 'Reçu B');
  check(await page.evaluate(() => window.__prints.length) === 2, 'le même document redemandé tout de suite ne part qu’une fois');
});

await S.run('A2 · plugin qui rejette', async (t) => {
  const page = await open(t);
  await page.evaluate(() => { window.__mode = 'reject'; });
  await page.focus('#opener');
  await printRoot(page, 'Reçu R');
  await settle(page);
  check(await page.evaluate(() => window.__toasts.length) === 1, 'un seul toast d’échec');
  await page.evaluate(() => { window.open(''); });
  await page.keyboard.press('Escape');
  check(await page.$('.kiwi-native-doc') === null && await active(page) === 'opener', 'la feuille s’ouvre et se ferme encore, focus rendu');
  await page.click('#nav');
  check(await page.evaluate(() => location.hash) === '#ailleurs', 'la navigation par lien reste utilisable');
  await printRoot(page, 'Reçu S');
  check(await page.evaluate(() => window.__prints.length) === 2, 'le document suivant part malgré l’échec');
});

await S.run('A2 · plugin qui ne répond jamais', async (t) => {
  const page = await open(t);
  await page.evaluate(() => { window.__mode = 'never'; });
  await page.focus('#opener');
  await printRoot(page, 'Reçu N');
  await settle(page);
  check(await page.evaluate(() => window.__toasts.length) === 0, 'aucun toast tant que le plugin n’a pas répondu');
  await page.evaluate(() => { window.open(''); });
  check(await active(page) === 'kiwi-native-doc-close', 'la feuille prend le focus malgré l’impression en attente');
  await page.keyboard.press('Escape');
  check(await active(page) === 'opener', 'le focus revient au bouton');
  await page.click('#nav');
  check(await page.evaluate(() => location.hash) === '#ailleurs', 'la navigation par lien reste utilisable');
  await printRoot(page, 'Reçu M');
  check(await page.evaluate(() => window.__prints.length) === 2, 'le document suivant part sans attendre le premier');
});

await S.finish();
