#!/usr/bin/env node
/* Garde : revenir sur l'onglet ne re-rend plus tout le tableau de bord (2026-10-22).
 *
 * merchant-config.js relit la config à chaque `focus` de la fenêtre et
 * l'applique deux fois (tout de suite, puis 500 ms après). Pour un magasin
 * dont le type n'a pas changé, KiwiVenue.applyServerType prévenait quand même
 * tous ses abonnés, qui re-rendaient tout le tableau de bord : deux fois par
 * retour sur l'onglet, 1,2 s de page figée mesurée sur Santos en production.
 * Les abonnés n'entendent plus qu'un changement réel : magasin, métier (dont le
 * sous-type, la raison d'être de cet avertissement), fuseau ou heure de bascule.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer;
try { puppeteer = req('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('venue-type-refocus', { browser });

await S.run('an unchanged server type does not re-render the dashboard', async (t) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width: 1440, height: 900 });
  await pinTradingHour(page, 15);
  t.step('open the demo dashboard');
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiVenue && typeof window.KiwiVenue.applyServerType === 'function', { timeout: 15000 });
  await sleep(2500);
  const r = await page.evaluate(() => {
    const V = window.KiwiVenue; let heard = 0;
    V.subscribe(() => { heard++; });
    const type = V.getVenueType();
    const out = { type };
    V.applyServerType(type); out.first = heard;
    V.applyServerType(type); V.applyServerType(type); V.applyServerType(type);
    out.repeats = heard - out.first;
    const C = window.KiwiConfig || (window.KiwiConfig = {});
    const tz = C.timezone; C.timezone = 'Europe/Paris';
    const before = heard; V.applyServerType(type); out.afterZone = heard - before;
    C.timezone = tz;
    const other = type === 'restaurant' ? 'boutique' : 'restaurant';
    const b2 = heard; out.changed = V.applyServerType(other); out.afterType = heard - b2;
    return out;
  });
  if (r.first > 1) throw new Error('first application notified ' + r.first + ' times');
  if (r.repeats !== 0) throw new Error('three identical re-applications notified subscribers ' + r.repeats + ' times (each one re-renders the dashboard)');
  if (r.afterZone !== 1) throw new Error('a new store time zone must reach subscribers once, got ' + r.afterZone);
  if (!r.changed || r.afterType !== 1) throw new Error('a real trade change must still notify once, got ' + r.afterType);
  console.log('  ✓ same type: ' + r.repeats + ' re-render on repeat; new zone: 1; new trade (' + r.type + ' → other): 1');
});

server.close();
await S.finish();
