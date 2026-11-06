/* Coût simple · sur tablette (721 à 900 px), les lignes d'ingrédients se saisissent
 * sans faire défiler un tableau de 1 120 px.
 *
 * Le vrai CSS de assets/simple-food-cost/editor.js est chargé dans Chromium avec
 * la structure réelle du tableau (dix colonnes) ; on mesure la largeur du tableau
 * et les colonnes de ses fiches à 800 px, 600 px et 1100 px. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.error('Chromium unavailable'); process.exit(3); }
const src = fs.readFileSync('assets/simple-food-cost/editor.js', 'utf8');
const a = src.indexOf("s.textContent = `") + "s.textContent = `".length;
const css = src.slice(a, src.indexOf('`;', a));
const lbl = Array.from({ length: 10 }, (_, i) => `--l${i + 1}:'L${i + 1}'`).join(';');
const cells = Array.from({ length: 10 }, (_, i) => `<td><input value="v${i}"></td>`).join('');
const html = `<!doctype html><html><head><style>:root{--n-200:#ddd;--n-500:#777;--paper-soft:#f1eee7;--ink:#111;--surface:#fff;--mono:monospace}.mi-list-wrap{overflow-x:auto}table{border-collapse:collapse}${css}</style></head><body><div class="sfc"><div class="mi-list-wrap" id="wrap"><table class="mi-list sfc-lines" id="t" style="${lbl}"><thead><tr>${Array.from({ length: 10 }, (_, i) => `<th>H${i}</th>`).join('')}</tr></thead><tbody><tr>${cells}</tr></tbody></table></div></div></body></html>`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const S = suite('sfc-tablet', { browser });
async function measure(width) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage(); await page.setViewport({ width, height: 900 }); await page.setContent(html);
  const m = await page.evaluate(() => { const t = document.getElementById('t'), w = document.getElementById('wrap'); return { table: t.getBoundingClientRect().width, wrap: w.clientWidth, scrolls: w.scrollWidth > w.clientWidth + 1, thead: getComputedStyle(t.tHead).display, cols: getComputedStyle(t.tBodies[0].rows[0]).gridTemplateColumns.split(' ').length }; });
  await context.close(); return m;
}
await S.run('tablet 800px: ingredient lines are cards, no horizontal travel', async () => {
  const m = await measure(800);
  assert.ok(!m.scrolls && m.table <= m.wrap + 1, `table ${m.table}px in a ${m.wrap}px wrapper`);
  assert.equal(m.thead, 'none'); assert.equal(m.cols, 3, 'three columns of fields per card');
});
await S.run('phone 600px: two columns, as before', async () => { const m = await measure(600); assert.ok(!m.scrolls); assert.equal(m.cols, 2); });
await S.run('desktop 1100px: the ten-column table stays', async () => { const m = await measure(1100); assert.notEqual(m.thead, 'none'); assert.ok(m.table >= 1100 - 1, 'full table width kept'); });
await browser.close();
await S.finish();
