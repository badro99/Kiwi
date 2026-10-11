#!/usr/bin/env node
/* KIWI-SELECT · CE QUE LE BOUTON AFFICHE QUAND LE CODE CHANGE LA VALEUR
 *
 * `kiwi-select.js` remplace chaque <select> par un bouton qui affiche le
 * choix. Il ne se repeignait que sur un événement `change`. Or le code du
 * produit pose souvent `select.value = …` sans en émettre : le formulaire
 * envoyait la nouvelle valeur, l'écran montrait l'ancienne. Mesuré le
 * 2026-10-11 dans un vrai Chrome, sur ce fichier seul.
 *
 *   node tools/kiwi-select-programmatic-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require(require.resolve('puppeteer-core', {
    paths: [path.join(ROOT, 'app'), ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter)],
  }));
} catch {
  console.log('○ skip: puppeteer-core unavailable (kiwi-select assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => fs.existsSync(p));
if (!executablePath) {
  console.log('○ skip: Chromium unavailable (kiwi-select assertions not run)');
  process.exit(process.env.CI ? 1 : 0);
}

const SRC = fs.readFileSync(path.join(ROOT, 'assets/kiwi-select.js'), 'utf8');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let passed = 0, failed = 0;
const ok = async (label, fn) => {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
};
try {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html lang="fr"><body>
    <label for="s">Service</label>
    <select id="s"><option value="a">Déjeuner</option><option value="b">Dîner</option><option value="c">Brunch</option></select>
    <script>${SRC}</script></body></html>`);
  const shown = () => page.$eval('.kiwi-select-value-label', (n) => n.textContent);

  await ok('le bouton affiche le choix initial', async () => assert.equal(await shown(), 'Déjeuner'));
  await ok('select.value = … repeint le bouton, sans événement change', async () => {
    await page.evaluate(() => { document.getElementById('s').value = 'b'; });
    assert.equal(await shown(), 'Dîner');
  });
  await ok('select.selectedIndex = … aussi', async () => {
    await page.evaluate(() => { document.getElementById('s').selectedIndex = 2; });
    assert.equal(await shown(), 'Brunch');
  });
  await ok('la valeur native reste la vérité (lecture et soumission)', async () => {
    const v = await page.evaluate(() => { const s = document.getElementById('s'); s.value = 'a'; return [s.value, s.selectedIndex, s.options[0].selected]; });
    assert.deepEqual(v, ['a', 0, true]);
    assert.equal(await shown(), 'Déjeuner');
  });
  await ok('un choix à la souris passe toujours par le bouton', async () => {
    await page.click('.kiwi-select-trigger');
    await page.waitForSelector('.kiwi-select-option');
    const opts = await page.$$('.kiwi-select-option');
    await opts[1].click();
    assert.equal(await page.$eval('#s', (s) => s.value), 'b');
    assert.equal(await shown(), 'Dîner');
  });
} finally {
  await browser.close();
}
console.log(`\nkiwi-select: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
