#!/usr/bin/env node
/* Relevé de paie : rendu PDF réel dans Chromium (r21 planning#A2).
 * Le vrai statementHtml, avec 12 salariés dont un nom arabe très long (sans espace) et un nom latin très long,
 * est imprimé en PDF A4 : une page par relevé, aucun nom qui déborde de la page, et une police capable d'écrire
 * l'arabe est bien embarquée (elle n'existe pas dans le même document en noms latins).
 * Prouve : pagination et embarquement des polices du moteur d'impression de Chromium.
 * Ne prouve pas : l'imprimante de l'utilisateur ni la boîte d'impression du système. */
import { suite } from './browser-trace.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { statementHtml } from '../assets/planning/pay-statement.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
let current = '';
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname === '/statement.html') { rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); rs.end(current); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((resolve) => { server.once('error', () => { console.error('Browser test server unavailable in this environment'); process.exit(3); }); server.listen(0, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const tests = suite('pay-statement-pdf', { browser });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const make = (lang, names) => {
  const core = { trLang: () => lang, esc, fmtPay: (n) => n.toFixed(2), fmtHours: (h) => String(h) };
  const rows = names.map((name, i) => ({ id: 'm' + i, name, hours: 38 + i, ref: 'RP-20261005-m' + i, rate: 2347, base: 90000, gross: 90000 + i, advance: 1000, net: 89000 + i, rated: true }));
  return statementHtml(core, { name: 'Café Amira', ice: '001234567000089' }, { days: ['2026-10-05', '2026-10-11'] }, rows);
};
const pages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
/* Font names written in the PDF (subset prefix removed), from plain objects and from decompressed object streams. */
function fontNames(pdf) {
  const texts = [pdf.toString('latin1')];
  const raw = pdf.toString('latin1');
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length, end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try { texts.push(zlib.inflateSync(pdf.subarray(start, end)).toString('latin1')); } catch (_) { /* not a Flate stream */ }
  }
  return new Set([...texts.join('\n').matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([A-Za-z0-9_+-]+)/g)].map((m) => m[1]));
}
async function render(t, html) {
  current = html;
  const ctx = await browser.createBrowserContext(); t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.goto(base + '/statement.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.$$eval('article', (list) => list.map((a) => ({ over: a.scrollWidth > a.clientWidth + 1 || [...a.querySelectorAll('h2, p, td, th')].some((n) => n.getBoundingClientRect().right > document.documentElement.clientWidth + 1 || n.getBoundingClientRect().left < -1) })));
  const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  return { pdf, overflow, articles: overflow.length };
}

await tests.run('long-arabic-and-latin-names-paginate-one-page-each-and-embed-an-arabic-font', async (t) => {
  const latin = Array.from({ length: 12 }, (_, i) => 'Employee ' + i);
  const arabicLong = 'محمد' + 'عبدالرحمنالإدريسيالحسنيالعلويالمراكشيالفاسيالسلاوي'.repeat(3);
  const mixed = latin.slice(); mixed[3] = arabicLong; mixed[7] = 'Averyveryveryveryveryveryveryveryveryverylongsurnamewithoutanyspace'.repeat(2);
  t.step('latin names only');
  const plain = await render(t, make('fr', latin));
  t.step('same statement with a very long Arabic and a very long Latin name');
  const withArabic = await render(t, make('ar', mixed));
  assert.equal(withArabic.articles, 12);
  assert.equal(pages(plain.pdf), 12, 'one A4 page per statement (latin)');
  assert.equal(pages(withArabic.pdf), 12, 'one A4 page per statement even with very long names (no spill onto a second page)');
  assert.ok(withArabic.overflow.every((o) => !o.over), 'no statement overflows the page width with a long name: ' + JSON.stringify(withArabic.overflow.map((o) => o.over)));
  const a = fontNames(plain.pdf), b = fontNames(withArabic.pdf);
  assert.ok(b.size > 0, 'fonts are embedded in the PDF');
  const extra = [...b].filter((name) => !a.has(name));
  assert.ok(extra.length > 0, 'the Arabic statement embeds a font the Latin one does not (' + [...b].join(', ') + ' vs ' + [...a].join(', ') + ')');
});

server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
await tests.finish();
