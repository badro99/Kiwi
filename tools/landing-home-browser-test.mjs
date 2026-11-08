#!/usr/bin/env node
/* Kiwi · accueil dans un vrai navigateur : grille des offres dans le conteneur,
 * console propre dans les sept langues (l'erreur React #418 de /de/ /it/ /nl/ :
 * l'étiquette « Milk » du chunk contre « Milch » du HTML), ancre #features sur
 * son titre, boutons d'inscription, menu téléphone à sept langues, note Ultra
 * sous « Annuel ». Les langues sont toutes lues ici : c'est la garde de #418. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pricingCopy } from './landing-pricing.mjs';
import { SIGNUP_PATH } from './landing-home.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer;
try { puppeteer = req('puppeteer-core'); } catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  let p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': path.basename(p) === 'opengraph-image' ? 'image/png' : mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const s = suite('landing-home', { browser });
const delay = ms => new Promise(r => setTimeout(r, ms));
const LOCALES = ['fr', 'en', 'ar', 'es', 'de', 'it', 'nl'];
const check = (cond, msg) => { if (!cond) throw new Error(msg); };
async function open(t, locale, width, height = 900, hash = '') {
  const page = t.watch(await browser.newPage());
  t.defer(() => page.close());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width, height });
  await page.goto(`${origin}/${locale}/${hash}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await delay(900);
  return { page, errors };
}

for (const locale of LOCALES) {
  await s.run(`${locale}: loads and hydrates with a clean console`, async t => {
    const { errors } = await open(t, locale, 1440);
    check(errors.length === 0, `${locale}: console errors: ${errors.join(' | ').slice(0, 300)}`);
  });
}
for (const locale of ['fr', 'ar']) {
  await s.run(`${locale}: pricing grid sits inside the page container`, async t => {
    for (const width of [1440, 1280, 1180, 1024, 390]) {
      const { page } = await open(t, locale, width);
      const r = await page.evaluate(() => {
        const box = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; };
        return { grid: box(document.querySelector('.kw-pricing-grid')), container: box(document.querySelector('#features > div')), width: innerWidth, scroll: document.documentElement.scrollWidth };
      });
      check(r.grid[0] === r.container[0] && r.grid[1] === r.container[1], `${locale} ${width}px: grid ${r.grid} vs container ${r.container}`);
      check(r.scroll <= r.width, `${locale} ${width}px: horizontal scroll`);
    }
  });
}
await s.run('fr: #features lands on its heading, desktop and phone', async t => {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const { page } = await open(t, 'fr', width, height, '#features');
    await delay(1200);
    const top = await page.evaluate(() => document.querySelector('#features h2').getBoundingClientRect().top);
    check(top > 40 && top < 260, `${width}px: heading top at ${Math.round(top)}px after #features`);
  }
});
await s.run('every locale: start buttons open the Basic signup and the demo button asks in its language', async t => {
  for (const locale of LOCALES) {
    const { page } = await open(t, locale, 1440);
    const r = await page.evaluate(() => ({
      start: [...document.querySelectorAll('a.bg-black[href]')].map(a => a.getAttribute('href')),
      demo: document.querySelector('header a[href^="https://wa.me"]')?.getAttribute('href'),
      footer: [...document.querySelectorAll('footer a[href^="https://wa.me"]')].map(a => a.getAttribute('href')),
    }));
    check(r.start.length >= 2 && r.start.every(h => h === SIGNUP_PATH), `${locale}: start buttons ${r.start}`);
    const message = 'https://wa.me/212624495159?text=' + encodeURIComponent(pricingCopy[locale].demoMessages.demo);
    check(r.demo === message, `${locale}: header demo href ${r.demo}`);
    check(r.footer.includes(message), `${locale}: footer demo href`);
  }
});
await s.run('de, es: the phone menu lists seven languages with working links', async t => {
  for (const locale of ['de', 'fr']) {
    const { page } = await open(t, locale, 390, 844);
    await page.click('button[aria-controls="kw-mobile-menu"]');
    await delay(500);
    const links = await page.evaluate(() => [...document.querySelectorAll('#kw-mobile-menu [role="group"] a')].map(a => a.getAttribute('href')));
    check(links.length === 7, `${locale}: ${links.length} language links in the phone menu`);
    check(JSON.stringify(links) === JSON.stringify(['/fr/', '/en/', '/es/', '/ar/', '/de/', '/it/', '/nl/']), `${locale}: phone menu links ${links}`);
  }
});
await s.run('Ultra says it has no annual plan once Annuel is selected', async t => {
  for (const locale of ['fr', 'de']) {
    const { page } = await open(t, locale, 1440);
    await page.evaluate(() => document.querySelector('#pricing [role="radio"]:nth-of-type(2)').click());
    await delay(400);
    const text = await page.evaluate(() => document.querySelector('[data-plan="ultra"]').textContent);
    check(text.includes(pricingCopy[locale].ultraNoAnnual), `${locale}: Ultra card text "${text.slice(0, 120)}"`);
  }
});
await s.finish();
server.close();
await browser.close();
