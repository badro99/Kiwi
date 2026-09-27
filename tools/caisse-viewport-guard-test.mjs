#!/usr/bin/env node
// #0091 · after the iPad keyboard closes, the till must not stay scrolled,
// or every tap lands below the finger. Headless Chrome cannot raise a real
// keyboard, so this reproduces its effect: a displaced page while a field is
// focused (left alone), then the field losing focus (pinned back to 0,0).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const html = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'kiwi-sw.js'), 'utf8');
const tag = html.match(/<script src="assets\/caisse-viewport\.js\?v=(\d+)" defer><\/script>/);
assert.ok(tag, 'kiwi-caisse.html loads the viewport guard');
assert.ok(sw.includes(`'/assets/caisse-viewport.js?v=${tag[1]}'`), 'the service worker precaches the same guard stamp');
console.log('  ✓ caisse loads and precaches the viewport guard');

const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required for the viewport guard proof');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 700 });
  // A page that CAN be displaced, like Safari lifting a field over the keyboard.
  await page.setContent('<style>body{margin:0}.tall{height:2400px}</style><input id="f"><button id="b">Créer</button><div class="tall"></div>');
  await page.addScriptTag({ path: path.join(ROOT, 'assets/caisse-viewport.js') });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  await page.focus('#f');
  await page.evaluate(() => window.scrollTo(0, 320));
  await wait(200);
  assert.equal(await page.evaluate(() => window.scrollY), 320, 'a focused field keeps its lift above the keyboard');
  console.log('  ✓ leaves the page alone while a field holds the keyboard');

  await page.evaluate(() => document.getElementById('f').blur());
  await wait(200);
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'the page returns to 0 once the keyboard is gone');
  console.log('  ✓ pins the page back when the field loses focus');

  await page.evaluate(() => window.scrollTo(0, 180));
  await wait(200);
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'a stray page scroll with no field focused is undone');
  console.log('  ✓ undoes a stray page scroll');

  await page.focus('#f');
  await page.evaluate(() => { window.scrollTo(0, 240); document.getElementById('b').focus(); });
  await wait(200);
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'moving focus to a button counts as leaving the keyboard');
  console.log('  ✓ a button taking focus releases the lift');
} finally {
  await browser.close();
}
console.log('\n✓ caisse viewport guard');
