/* Jon's Burgers, 26 nov. 2026 · « le clignotement constant ». Filmé sur Planning :
 * toute la page refaisait son fondu chaque seconde pendant que quelqu'un était
 * pointé. Deux causes, chacune tenue ici, mouvement ALLUMÉ :
 *  1. /api/team/live renvoie un service en cours qui finit « maintenant » : ses
 *     heures bougent à chaque seconde. team.js comparait à la seconde, donc
 *     redessinait Équipe/Planning chaque seconde et prévenait Accueil, le plan
 *     de salle et les meilleurs vendeurs (kiwi-team-changed) toutes les 20 s.
 *     Il compare maintenant des minutes, et ne prévient les autres écrans que
 *     quand l'équipe ou sa présence change.
 *  2. appPage() rappelait pageShell(), qui retirait puis remettait la même
 *     classe sur <body> : calm-repaint y lisait une NAVIGATION et laissait
 *     rejouer le fondu de la page à chaque repeint (Planning, Rapport
 *     journalier, Réservations…). pageShell ne touche plus rien de juste.
 * Et le bouton « Créer la proposition » vert et muet sans horaires d'ouverture
 * devient « Configurer les horaires », qui ouvre l'éditeur.
 * node tools/planning-calm-browser-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { suite, ROOT } from './browser-trace.mjs';

const require = createRequire(new URL('../app/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.error('Chromium unavailable'); process.exit(3); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now() - 3 * 3600e3;
const live = { mode: 'seconds', hits: 0, extra: false };
const member = (id, name) => ({ id, firstName: name, lastName: 'Test', role: 'manager', status: 'on-duty', since: T0, pauseTs: 0 });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/kiwi-sw.js') { res.writeHead(404); res.end(); return; }
  if (url.pathname === '/api/team/live') {
    live.hits++;
    const day = new Date().toISOString().slice(0, 10);
    /* seconds : la vraie réponse d'un service en cours. minutes : une minute de plus à chaque lecture, pour forcer un vrai repeint. */
    const hours = live.mode === 'minutes' ? live.hits / 60 : Math.round((Date.now() - T0) / 1000) / 3600;
    const members = [member('m1', 'Selam')].concat(live.extra ? [member('m2', 'Achraf')] : []);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, merchant: url.searchParams.get('merchant'), members, pointedHours: { m1: { [day]: hours } }, deferredPunches: {}, pendingCorrections: [], now: Date.now() }));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(url.pathname === '/api/me' ? 200 : 404, { 'content-type': 'application/json' });
    res.end(url.pathname === '/api/me' ? '{"authenticated":false}' : '{}'); return;
  }
  const file = path.resolve(ROOT, url.pathname === '/' ? 'dashboard.html' : url.pathname.slice(1));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const S = suite('planning-calm', { browser });

/* Le tableau de bord d'un restaurant à soi, mouvement allumé, le poller d'équipe branché sur le stub. */
async function planning(t) {
  const page = t.watch(await browser.newPage());
  await page.setViewport({ width: 1366, height: 700 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.evaluateOnNewDocument(() => {
    const venue = { id: 'v-jon-test', name: 'Jon Test', fullDisplay: 'Jon Test', slug: 'jon-test', location: '', type: 'restaurant', custom: true, siblings: '', status: 'En service', ice: '·', txCount: 0, staffCount: 0, hours: '', methods: '', goal: 0 };
    localStorage.setItem('kiwiCustomVenues', JSON.stringify([venue]));
    localStorage.setItem('kiwiVenue', venue.id);
    localStorage.setItem('kiwiOnboarded', '1');
    localStorage.setItem('kiwiLang', 'fr');
    const p = window.__calm = { team: 0, fades: [], hosts: 0, bodyClass: 0 };
    addEventListener('kiwi-team-changed', () => { p.team++; });
    /* Une entrée qui JOUE vraiment (le garde finit les autres avant la première image). */
    document.addEventListener('animationstart', (e) => {
      const a = e.target.getAnimations().find((x) => x.animationName === e.animationName);
      if (a && a.playState === 'running') p.fades.push(String(e.target.className).slice(0, 40) + ':' + e.animationName);
    }, true);
  });
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.Kiwi && window.Kiwi.handlers['nav-payroll'] && window.__kiwiLock && window.KiwiCloudDoc);
  await page.evaluate(() => window.__kiwiLock.reveal());
  await page.waitForFunction(() => !document.querySelector('.app.kw-app-hidden'));
  /* Tant que la porte est dans la page, le poller d'équipe attend 5 min : on la laisse partir. */
  await page.waitForFunction(() => { const g = document.querySelector('[data-kiwi-lock]'); return !g || !g.isConnected || g.style.display === 'none'; });
  await page.bringToFront();
  /* Le slug d'un vrai compte vient de /api/me ; ici on le donne au poller directement. */
  await page.evaluate(() => { window.KiwiCloudDoc.slugFor = () => 'jon-test'; });
  await page.evaluate(() => window.Kiwi.handlers['nav-payroll']());
  await page.waitForSelector('.dash-genpage .genpage-head h1', { visible: true });
  await page.evaluate(() => {
    const p = window.__calm;
    new MutationObserver((rs) => { for (const r of rs) {
      if (r.type === 'attributes' && r.target === document.body) p.bodyClass++;
      else for (const n of r.addedNodes) if (n.classList && n.classList.contains('dash-genpage')) p.hosts++;
    } }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.dispatchEvent(new Event('kiwi:request-wake'));
  });
  return page;
}
const reset = (page) => page.evaluate(() => { const p = window.__calm; p.team = 0; p.fades = []; p.hosts = 0; p.bodyClass = 0; });
const read = (page) => page.evaluate(() => ({ ...window.__calm, fades: window.__calm.fades.slice() }));

await S.run('a shift ticking by the second repaints nothing; a new person on shift still shows', async (t) => {
  live.mode = 'seconds'; live.extra = false;
  const page = await planning(t);
  t.step('the first answer paints once, then the same team with a few more seconds changes nothing');
  await sleep(2500);
  await reset(page);
  const before = live.hits;
  await sleep(6000);
  const quiet = await read(page);
  assert.ok(live.hits - before >= 2, `the poller kept reading (${live.hits - before} reads)`);
  assert.equal(quiet.hosts, 0, 'Planning was not redrawn for seconds nobody sees');
  assert.equal(quiet.team, 0, 'Accueil, the floor plan and top sellers were not told the team changed');
  t.step('someone clocks in: the page and the other screens hear it');
  live.extra = true;
  await page.evaluate(() => document.dispatchEvent(new Event('kiwi:request-wake')));
  await page.waitForFunction(() => window.__calm.team >= 1 && window.__calm.hosts >= 1, { timeout: 8000 });
});

await S.run('a real repaint keeps the page still: no fade, same scroll, body classes untouched', async (t) => {
  live.mode = 'minutes'; live.extra = false;
  const page = await planning(t);
  await sleep(2500);
  await page.evaluate(() => window.scrollTo({ top: 320 }));
  await sleep(300);
  const y = await page.evaluate(() => window.scrollY);
  await reset(page);
  await page.waitForFunction(() => window.__calm.hosts >= 3, { timeout: 12000 });
  const seen = await read(page);
  assert.deepEqual(seen.fades.filter((f) => /dash-genpage/.test(f)), [], 'the page does not fade out and back in on each repaint');
  assert.equal(seen.bodyClass, 0, 'a repaint leaves <body> alone, so it is never read as a navigation');
  assert.equal(await page.evaluate(() => window.scrollY), y, 'the reading position stays');
  t.step('opening another page and coming back is still a real entrance');
  await page.evaluate(() => window.Kiwi.handlers['nav-accueil']());
  await sleep(400);
  await reset(page);
  await page.evaluate(() => window.Kiwi.handlers['nav-payroll']());
  await page.waitForFunction(() => window.__calm.fades.some((f) => /dash-genpage/.test(f)), { timeout: 5000 });
});

await S.run('without opening hours, the proposal button opens the hours editor', async (t) => {
  live.mode = 'seconds'; live.extra = false;
  const page = await planning(t);
  await page.evaluate(() => window.Kiwi.handlers['kt-plan-fair']());
  await page.waitForSelector('.k-modal [data-kt-fair-people], [data-kt-fair-people]', { visible: true });
  assert.equal(await page.$('[data-action="kt-plan-fair-build"]'), null, 'no green button that does nothing');
  const label = await page.$eval('.kb.atlas[data-action="kt-plan-hours"]', (b) => b.textContent.trim());
  assert.equal(label, 'Configurer les horaires');
  assert.equal(await page.$$eval('[data-action="kt-plan-hours"]', (l) => l.length), 1, 'one way to it, not two');
  await page.click('.kb.atlas[data-action="kt-plan-hours"]');
  await page.waitForFunction(() => [...document.querySelectorAll('h1, h2, h3, .k-modal-title, [class*="title"]')].some((n) => n.offsetParent && /Horaires d’ouverture/.test(n.textContent)), { timeout: 8000 });
  t.step('a disabled button looks disabled');
  const opacity = await page.evaluate(() => { const b = document.createElement('button'); b.className = 'kb atlas'; b.disabled = true; b.textContent = 'x'; document.body.appendChild(b); const o = Number(getComputedStyle(b).opacity); b.remove(); return o; });
  assert.ok(opacity < 0.6, 'opacity ' + opacity);
});

await browser.close();
server.close();
await S.finish();
