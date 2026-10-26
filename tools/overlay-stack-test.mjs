#!/usr/bin/env node
/* Les fenêtres et les tiroirs partagés (Kiwi.modal, Kiwi.drawer), conduits par
 * un vrai navigateur et de vraies entrées : un clic souris, une touche Échap.
 *
 *  · « Annuler » ([data-dismiss]) ferme une fenêtre. Jusqu'ici seul le tiroir
 *    le faisait ; une vingtaine de fenêtres avaient un « Annuler » inerte,
 *    dont la suppression d'un produit.
 *  · Échap ferme la couche du DESSUS et elle seule. Une fenêtre ouverte depuis
 *    la fiche produit refermait aussi la fiche.
 *  · Une fenêtre de saisie désigne son champ ([data-autofocus]) : la douchette
 *    tape dans le champ, pas dans la croix.
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
assert.ok(bin, 'Chromium required for the overlay stack');

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><button id="opener">Ouvrir</button></main><script src="/assets/interactive/helpers.js"></script><script src="/assets/interactive/handlers.js"></script><script src="/assets/interactive.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
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

async function fresh() {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.setViewport({width: 1024, height: 768});
  await p.goto(base);
  await p.waitForFunction(() => window.Kiwi && typeof Kiwi.modal === 'function');
  return {p, errors};
}
const count = (p, sel) => p.$$eval(sel, (els) => els.length);
const settle = () => pause(380);   // close() removes the layer after 280 ms

try {
  /* 1 · « Annuler » ferme une fenêtre, d'un vrai clic. */
  {
    const {p, errors} = await fresh();
    await p.evaluate(() => { window.__m = Kiwi.modal({title: 'Supprimer ?', body: '<p>Corps</p>', foot: '<button class="kb ghost" data-dismiss id="cancel">Annuler</button><button class="kb danger" id="go">Supprimer</button>'}); });
    await pause(320);
    await p.click('#go');
    await pause(80);
    check(await count(p, '.kiwi-backdrop') === 1, 'a button without [data-dismiss] leaves the window open');
    await p.click('#cancel');
    await settle();
    check(await count(p, '.kiwi-backdrop') === 0, '« Annuler » [data-dismiss] closes a window');
    check(errors.length === 0, 'no page error while dismissing');
    await p.close();
  }

  /* 2 · Un appelant qui branche encore [data-dismiss] lui-même : une seule fermeture. */
  {
    const {p, errors} = await fresh();
    await p.evaluate(() => {
      window.__closes = 0;
      const m = Kiwi.modal({title: 'Ancien', body: '', foot: '<button data-dismiss id="cancel">Fermer</button>'});
      const real = m.close;
      m.el.addEventListener('click', (e) => { if (e.target.closest('[data-dismiss]')) { window.__closes++; real(); } });
    });
    await pause(320);
    await p.click('#cancel');
    await settle();
    check(await count(p, '.kiwi-backdrop') === 0 && errors.length === 0, 'a caller that still wires [data-dismiss] closes once, cleanly');
    check(await p.evaluate(() => document.body.style.overflow !== 'hidden' && getComputedStyle(document.body).position !== 'fixed'), 'page scroll is released after a double-wired dismiss');
    await p.close();
  }

  /* 3 · Échap ferme la couche du dessus, puis la suivante. */
  {
    const {p} = await fresh();
    await p.evaluate(() => { Kiwi.drawer({title: 'Fiche produit', body: '<p>Variantes</p>'}); });
    await pause(320);
    await p.evaluate(() => { Kiwi.modal({title: 'Supprimer cette variante ?', foot: '<button data-dismiss>Annuler</button>'}); });
    await pause(320);
    await p.keyboard.press('Escape');
    await settle();
    check(await count(p, '.kiwi-backdrop') === 0, 'Escape closes the window on top');
    check(await count(p, '.kiwi-drawer-backdrop') === 1, 'Escape leaves the drawer underneath open');
    await p.keyboard.press('Escape');
    await settle();
    check(await count(p, '.kiwi-drawer-backdrop') === 0, 'a second Escape then closes the drawer');
    await p.close();
  }

  /* 4 · Deux Échap rapprochés : la fenêtre qui s'efface ne retient pas la touche. */
  {
    const {p} = await fresh();
    await p.evaluate(() => { Kiwi.drawer({title: 'Fiche', body: ''}); });
    await pause(320);
    await p.evaluate(() => { Kiwi.modal({title: 'Fenêtre', foot: ''}); });
    await pause(320);
    await p.keyboard.press('Escape');
    await pause(40);
    await p.keyboard.press('Escape');
    await settle();
    check(await count(p, '.kiwi-backdrop, .kiwi-drawer-backdrop') === 0, 'two quick Escapes close the window, then the drawer');
    await p.close();
  }

  /* 5 · Fenêtre sur fenêtre : seule celle du dessus se ferme. */
  {
    const {p} = await fresh();
    await p.evaluate(() => { Kiwi.modal({title: 'Dessous', foot: ''}); });
    await pause(320);
    await p.evaluate(() => { Kiwi.modal({title: 'Dessus', foot: ''}); });
    await pause(320);
    await p.keyboard.press('Escape');
    await settle();
    const left = await p.$$eval('.kiwi-backdrop h3', (els) => els.map((e) => e.textContent));
    check(left.length === 1 && left[0] === 'Dessous', 'Escape on stacked windows closes only the top one');
    await p.close();
  }

  /* 6 · Le champ désigné reçoit le focus ; sinon, comportement inchangé. */
  {
    const {p} = await fresh();
    await p.evaluate(() => { Kiwi.modal({title: 'Code existant', body: '<input id="code" data-autofocus>', foot: '<button data-dismiss>Annuler</button>'}); });
    await pause(200);
    check(await p.evaluate(() => document.activeElement && document.activeElement.id === 'code'), '[data-autofocus] field has focus when the window opens');
    await p.keyboard.type('4006381333931');
    check(await p.$eval('#code', (e) => e.value) === '4006381333931', 'a scan typed straight after opening lands in the field');
    await p.keyboard.press('Escape');
    await settle();

    await p.evaluate(() => { Kiwi.modal({title: 'Étiquettes', body: '<input id="copies" value="1" data-autofocus data-autofocus-select>', foot: ''}); });
    await pause(200);
    await p.keyboard.type('3');
    check(await p.$eval('#copies', (e) => e.value) === '3', '[data-autofocus-select] selects the value, so typing replaces it');
    await p.keyboard.press('Escape');
    await settle();

    await p.evaluate(() => { Kiwi.modal({title: 'Sans champ désigné', body: '<input id="plain">', foot: ''}); });
    await pause(200);
    check(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('kiwi-modal-close')), 'without [data-autofocus] the first control still takes focus');
    await p.close();
  }

  /* 7 · Le tiroir garde son [data-dismiss]. */
  {
    const {p} = await fresh();
    await p.evaluate(() => { Kiwi.drawer({title: 'Tiroir', body: '', foot: '<button data-dismiss id="close">Fermer</button>'}); });
    await pause(320);
    await p.click('#close');
    await settle();
    check(await count(p, '.kiwi-drawer-backdrop') === 0, 'a drawer still closes on [data-dismiss]');
    await p.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\noverlay-stack: ${checks} passed, 0 failed`);
