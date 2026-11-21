#!/usr/bin/env node
/* Coût réel en arabe : le pourcentage de l'alerte de marge est du bon côté.
 *
 * Mesuré dans la mise en page, pas à l'œil : dans une page dir="rtl", le vrai
 * panneau (assets/pages-pro/cost-variance.js) dessine l'alerte « marge réelle
 * sous le seuil ». Pour chaque <bdi dir="ltr"> de la phrase, le signe « % »
 * doit être À DROITE des chiffres (« 55,7 % », jamais « % 55,7 »), et le
 * moins d'un montant à GAUCHE des chiffres (« −93 MAD »). */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer;
try { puppeteer = req('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/tokens.css"></head><body><div data-costvar-slot></div>
<script>
window.KiwiI18n = { getLang: () => 'ar' };
window.KiwiCloudDoc = { currentSlug: () => 'resto-cv' };
window.Kiwi = { handlers: {}, toast() {} };
const payload = { merchant: 'resto-cv', scope: 'site', storeCount: 1, canEdit: true,
  range: { fromDay: '2026-11-10', toDay: '2026-11-16', from: 0, to: 1 },
  sites: [{ merchant: 'resto-cv', name: 'Resto', coverage: {}, losses: [],
    ratios: { netSalesCents: 100000, cogsCents: 40000, wasteCents: 4300, marginOnConsumptionCents: 55700 },
    target: { minMarginPct: 65, realMarginPct: 55.7, breached: true, shortfallCents: 9300, thresholdCents: 65000, maxConsumptionCents: 35000 },
    variance: { rows: [], countsFound: true, windows: [] } }] };
window.fetch = async () => ({ ok: true, status: 200, json: async () => payload });
</script>
<script src="/assets/pages-pro/cost-variance.js"></script>
<script>window.Kiwi.handlers['costvar-mount'](document.querySelector('[data-costvar-slot]'), { real: true });</script>
</body></html>`;

const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  if (pathname === '/cv-rtl.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  const type = p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': type }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('cost-variance-rtl', { browser });

for (const width of [390, 1280]) {
  await S.run(`arabic margin alert keeps « 55,7 % » left to right at ${width}px`, async (t) => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await page.setViewport({ width, height: 900 });
    t.step('open the panel in an rtl page');
    await page.goto(`${base}/cv-rtl.html`, { waitUntil: 'load' });
    await page.waitForSelector('.cv-alert.bad bdi', { timeout: 10000 });
    const out = await page.evaluate(() => {
      const alert = document.querySelector('.cv-alert.bad');
      const pos = (node, i) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); return r.getBoundingClientRect(); };
      const tokens = [...alert.querySelectorAll('bdi')].map((b) => {
        const tn = b.firstChild;
        const txt = tn.data;
        const digits = [...txt].map((c, i) => (/[0-9٠-٩]/.test(c) ? i : -1)).filter((i) => i >= 0);
        const first = pos(tn, digits[0]), last = pos(tn, digits[digits.length - 1]);
        const p = txt.indexOf('%'), m = txt.indexOf('−');
        return { txt, dir: getComputedStyle(b).direction,
          pctRight: p < 0 ? null : pos(tn, p).left >= last.right - 0.5,
          minusLeft: m < 0 ? null : pos(tn, m).right <= first.left + 0.5 };
      });
      return { pageDir: getComputedStyle(document.body).direction, raw: /[⁦⁩]/.test(alert.innerHTML), tokens };
    });
    t.step('measure each isolated number');
    if (out.pageDir !== 'rtl') throw new Error('page is not rtl: ' + out.pageDir);
    if (out.raw) throw new Error('a raw U+2066/U+2069 is left in the alert');
    const pcts = out.tokens.filter((x) => x.pctRight !== null);
    if (pcts.length < 2) throw new Error('expected the real margin and the floor as two percentages: ' + JSON.stringify(out.tokens));
    for (const x of out.tokens) {
      if (x.dir !== 'ltr') throw new Error(`${x.txt}: direction ${x.dir}`);
      if (x.pctRight === false) throw new Error(`« % » painted left of the digits in « ${x.txt} »`);
      if (x.minusLeft === false) throw new Error(`minus painted right of the digits in « ${x.txt} »`);
    }
    console.log(`  ✓ ${width}px : ${out.tokens.map((x) => x.txt).join(' · ')} (% à droite, isolés ltr)`);
  });
}

server.close();
await S.finish();
