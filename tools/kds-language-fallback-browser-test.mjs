#!/usr/bin/env node
/* L'écran cuisine web (kiwi-cuisine.html) parle la langue du patron.
 *
 * `lang()` ne lisait que kiwiCuisineLang et retombait sur le français : un
 * écran de cuisine ouvert dans un navigateur restait français quelle que soit
 * la langue choisie dans le produit. L'ordre est maintenant :
 *
 *   kiwiCuisineLang (choix fait sur CET écran)
 *     → kiwiLang (langue partagée du produit)
 *       → langue du navigateur (fr / en / ar, 1re préférée prise en charge)
 *         → fr
 *
 * et <html lang> / <html dir> suivent le résultat (rtl pour l'arabe).
 * Le test charge la vraie page dans Chromium, sans réseau marchand : seules les
 * requêtes vers le serveur statique local passent.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN
  || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });

let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log('  ✓ ' + label); };

/* store : clés localStorage posées avant le chargement ; browserLangs :
   navigator.languages simulé (ou null = celui de Chromium, ici en-US). */
async function open(store, browserLangs) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (r.url().startsWith(base)) r.continue(); else r.abort(); });
  await page.evaluateOnNewDocument((s, langs) => {
    Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
    if (langs) {
      Object.defineProperty(navigator, 'languages', { get: () => langs });
      Object.defineProperty(navigator, 'language', { get: () => langs[0] });
    }
  }, store, browserLangs || null);
  await page.goto(base + '/kiwi-cuisine.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('lang') && document.getElementById('lang').textContent.trim() !== '', { timeout: 8000 });
  const out = await page.evaluate(() => ({
    lang: document.documentElement.getAttribute('lang'),
    dir: document.documentElement.getAttribute('dir'),
    button: document.getElementById('lang').textContent.trim(),
    stored: localStorage.getItem('kiwiCuisineLang'),
  }));
  await context.close();
  return out;
}

try {
  let r = await open({ kiwiLang: 'en' });
  check(r.lang === 'en' && r.dir === 'ltr' && r.button === 'EN', 'kiwiLang=en : l\'écran s\'ouvre en anglais, html lang=en dir=ltr');
  check(r.stored === null, 'une langue déduite n\'est pas persistée comme un choix de l\'écran');

  r = await open({ kiwiLang: 'ar' });
  check(r.lang === 'ar' && r.dir === 'rtl', 'kiwiLang=ar : html lang=ar dir=rtl');

  r = await open({ kiwiLang: 'en', kiwiCuisineLang: 'fr' });
  check(r.lang === 'fr' && r.dir === 'ltr', 'kiwiCuisineLang l\'emporte sur kiwiLang');

  r = await open({}, ['ar-MA', 'fr']);
  check(r.lang === 'ar' && r.dir === 'rtl', 'sans clé : la langue du navigateur (ar-MA) est prise');

  r = await open({}, ['en-GB']);
  check(r.lang === 'en', 'sans clé : navigateur en-GB donne l\'anglais');

  r = await open({}, ['de-DE', 'en-US']);
  check(r.lang === 'en', 'une langue non prise en charge est sautée au profit de la suivante');

  r = await open({}, ['de-DE']);
  check(r.lang === 'fr' && r.dir === 'ltr', 'rien de reconnu : retombée sur le français');

  r = await open({ kiwiLang: 'xx' }, ['en-US']);
  check(r.lang === 'en', 'une valeur kiwiLang invalide est ignorée');

  console.log(`kds-language-fallback-browser-test: ${checks} checks passed`);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
