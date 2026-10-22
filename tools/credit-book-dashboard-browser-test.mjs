#!/usr/bin/env node
/* Garde : la page « Carnet de crédit » du tableau de bord, dans un vrai
 * navigateur (2026-10-22).
 *
 * tools/credit-book-test.mjs vérifie les calculs de l'ardoise dans une vm. Rien
 * ne vérifiait ce que le commerçant voit : la page peinte, ses montants au
 * centime, l'alerte des dettes anciennes, le résumé du haut, l'arabe sur un
 * téléphone, ni la mise à jour quand la caisse note un règlement.
 *
 * La page est servie avec les vraies feuilles de style du tableau de bord et le
 * vrai assets/trade-workspaces.js ; seuls le commerce (une épicerie réelle),
 * l'état de la caisse et Kiwi.appPage sont fournis par le test.
 *
 *  1 · deux ardoises ouvertes, la plus grosse en premier ; une ardoise soldée
 *      n'apparaît pas ;
 *  2 · les soldes gardent les centimes (12,50 MAD, pas 13) ;
 *  3 · seule la dette de plus de 30 jours porte l'alerte, et la date de la plus
 *      ancienne dette tient compte des règlements (premier noté, premier réglé) ;
 *  4 · le résumé compte les ardoises : clients, alertes, solde total ;
 *  5 · un règlement noté à la caisse met la page ouverte à jour seul ;
 *  6 · en arabe sur 390 px : sens de lecture, rien ne déborde, noms entiers ;
 *  7 · un compte de démonstration n'affiche aucune ardoise.
 */
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

/* Les feuilles que dashboard.html charge pour cette page, dans son ordre. */
const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const sheets = [...html.matchAll(/<link rel="stylesheet" href="(assets\/[^"]+\.css)(?:\?v=\d+)?"/g)].map((m) => m[1])
  .filter((h) => /tokens|trade-workspaces|dashboard-shell|design-vexel\.css/.test(h));
if (!sheets.some((s) => s.includes('trade-workspaces'))) throw new Error('dashboard.html ne charge plus trade-workspaces.css');

const DAY = 864e5;
const NOW = Date.now();
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
/* L'ardoise telle que pos-epicerie.js l'écrit (CARNET : hist de dettes et de règlements). */
const CARNET = [
  { id: 'c-1', name: 'Fatima-Zahra Benkirane', phone: '0612345678', hist: [
    { id: 'h1', type: 'debt', amt: 12.5, at: iso(3) },
  ] },
  { id: 'c-2', name: 'Si Mohammed El Alaoui', phone: '0661000000', hist: [
    { id: 'h2', type: 'debt', amt: 200, at: iso(45) },   // réglée par le premier règlement
    { id: 'h3', type: 'debt', amt: 150, at: iso(40) },   // la plus ancienne encore ouverte
    { id: 'h4', type: 'pay', amt: 250, at: iso(10) },
    { id: 'h5', type: 'debt', amt: 80.75, at: iso(2) },
  ] },
  { id: 'c-3', name: 'Rachid Tazi', hist: [
    { id: 'h6', type: 'debt', amt: 60, at: iso(5) },
    { id: 'h7', type: 'pay', amt: 60, at: iso(1) },
  ] },
];

const page0 = (isReal) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${sheets.map((s) => `<link rel="stylesheet" href="/${s}">`).join('\n')}
<style>html,body{margin:0}main{padding:24px;max-width:100%;box-sizing:border-box}</style>
<script>
  window.__lang = new URLSearchParams(location.search).get('lang') || 'fr';
  window.KiwiI18n = { getLang: () => window.__lang };
  window.KiwiEnv = { isReal: () => ${isReal ? 'true' : 'false'} };
  window.KiwiVenue = { getCurrentVenueData: () => ({ id: 'epi-atlas', name: 'Épicerie Atlas', type: 'epicerie' }), getVenue: () => 'epi-atlas', subscribe: () => {} };
  const subs = [];
  window.__doc = { verticals: { epicerie: { data: { carnet: ${JSON.stringify(CARNET)} } } } };
  window.KiwiVerticalState = { store: { get: (id) => id === 'epi-atlas' ? window.__doc : null, subscribe: (fn) => subs.push(fn) } };
  window.__tillWrites = (doc) => { window.__doc = doc; subs.forEach((fn) => fn()); };
  window.Kiwi = { handlers: {}, appPage: (nav, o) => {
    const el = document.querySelector('main'); el.innerHTML = '<h1>' + o.title + '</h1><p class="sub">' + o.subtitle + '</p>' + o.body;
    return { el }; } };
  if (window.__lang === 'ar') { document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; }
</script>
<script src="/assets/trade-workspaces.js"></script></head><body><main></main></body></html>`;

const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  if (pathname === '/real' || pathname === '/demo') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page0(pathname === '/real')); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('credit-book-dashboard', { browser });
const check = (ok, msg) => { if (!ok) throw new Error(msg); console.log('  ✓ ' + msg); };
const norm = (s) => String(s || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

async function open(t, { kind = 'real', lang = 'fr', width = 1280 } = {}) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width, height: 900 });
  await page.goto(`${base}/${kind}?lang=${lang}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.KiwiTradeWorkspaces);
  const ok = await page.evaluate(() => window.KiwiTradeWorkspaces.render('credit'));
  check(ok === true, 'la page Carnet de crédit se rend pour une épicerie');
  return page;
}
const readPage = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.tw-card-till')].map((c) => {
    const h = c.querySelector('h3'), r = h.getBoundingClientRect();
    const meta = Object.fromEntries([...c.querySelectorAll('.tw-meta span')].map((s) => [s.querySelector('b').textContent, s.textContent.slice(s.querySelector('b').textContent.length)]));
    const alert = c.querySelector('.tw-alert');
    return { name: h.textContent, nameW: r.width, nameH: r.height, lineH: parseFloat(getComputedStyle(h).lineHeight) || parseFloat(getComputedStyle(h).fontSize) * 1.3,
      clipped: h.scrollWidth > h.clientWidth + 1, meta, alert: alert && getComputedStyle(alert).display !== 'none' && alert.getBoundingClientRect().height > 0 ? alert.textContent : '' };
  });
  const stats = [...document.querySelectorAll('.tw-stat')].map((s) => ({ k: s.querySelector('span').textContent, v: s.querySelector('strong').textContent }));
  const hint = document.querySelector('.tw-till-h span')?.textContent || '';
  return { cards, stats, hint, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, dir: getComputedStyle(document.querySelector('.tw-till') || document.body).direction };
});

await S.run('ardoises, centimes, alerte et résumé (FR, 1280 px)', async (t) => {
  const page = await open(t);
  const v = await readPage(page);
  check(v.cards.length === 2, `deux ardoises ouvertes, l'ardoise soldée est absente (${v.cards.map((c) => c.name).join(', ')})`);
  check(v.cards[0].name === 'Si Mohammed El Alaoui', 'la plus grosse dette vient en premier');
  check(norm(v.cards[0].meta['Solde']) === '180,75 MAD', `solde au centime : 200 + 150 + 80,75 − 250 = 180,75 (${norm(v.cards[0].meta['Solde'])})`);
  check(norm(v.cards[1].meta['Solde']) === '12,50 MAD', `12,50 reste 12,50, jamais 13 (${norm(v.cards[1].meta['Solde'])})`);
  const since = await page.evaluate((d) => new Date(d).toLocaleString('fr', { day: 'numeric', month: 'short' }), CARNET[1].hist[1].at);
  check(norm(v.cards[0].meta['Plus ancienne dette']) === norm(since), `la plus ancienne dette ouverte est la deuxième, le premier règlement couvre la première (${norm(v.cards[0].meta['Plus ancienne dette'])})`);
  check(/250 MAD/.test(norm(v.cards[0].meta['Dernier règlement'])), 'le dernier règlement montre son montant');
  check(v.cards[0].alert === 'Plus de 30 jours' && v.cards[1].alert === '', 'seule la dette de plus de 30 jours porte l’alerte, et elle est peinte');
  check(v.cards.every((c) => !c.clipped && c.nameH < c.lineH * 1.6), 'les noms tiennent sur une ligne, sans coupe');
  const stat = Object.fromEntries(v.stats.map((s) => [s.k, norm(s.v)]));
  check(stat['À surveiller'] === '1', `résumé : une ardoise à surveiller (${stat['À surveiller']})`);
  check(stat['Actifs'] === '2', `résumé : deux clients actifs (${stat['Actifs']})`);
  const balanceKey = 'Solde ouvert';
  check(balanceKey && stat[balanceKey] === '193,25 MAD', `résumé : 193,25 MAD dus au total (${balanceKey && stat[balanceKey]})`);
  check(/^2 · 193,25 MAD dû au total/.test(norm(v.hint)), `en-tête : « ${norm(v.hint)} »`);
  check(v.overflow <= 0, 'rien ne déborde à 1280 px');
});

await S.run('un règlement noté à la caisse met la page à jour', async (t) => {
  const page = await open(t);
  await page.evaluate(() => {
    const doc = JSON.parse(JSON.stringify(window.__doc));
    doc.verticals.epicerie.data.carnet[0].hist.push({ id: 'h8', type: 'pay', amt: 12.5, at: new Date().toISOString() });
    window.__tillWrites(doc);
  });
  await page.waitForFunction(() => document.querySelectorAll('.tw-card-till').length === 1, { timeout: 5000 });
  const v = await readPage(page);
  check(v.cards.length === 1 && v.cards[0].name === 'Si Mohammed El Alaoui', 'l’ardoise réglée quitte la page sans recharger');
  check(/^1 · 180,75 MAD/.test(norm(v.hint)), `l’en-tête suit : « ${norm(v.hint)} »`);
});

await S.run('arabe, téléphone 390 px', async (t) => {
  const page = await open(t, { lang: 'ar', width: 390 });
  const v = await readPage(page);
  check(v.dir === 'rtl', 'la page se lit de droite à gauche');
  check(v.cards.length === 2, 'les deux ardoises sont là');
  check(v.cards[0].alert === 'أكثر من 30 يوماً', `l’alerte est en arabe (${v.cards[0].alert})`);
  check(Object.keys(v.cards[0].meta).includes('أقدم دين'), 'les libellés sont en arabe');
  check(!/[a-zé]{4,}/i.test(Object.keys(v.cards[0].meta).join(' ') + v.hint.replace(/MAD|درهم/g, '')), `aucun libellé français ne reste (${norm(v.hint)})`);
  check(v.overflow <= 0, `rien ne déborde à 390 px (${v.overflow} px)`);
  check(v.cards.every((c) => !c.clipped && c.nameW >= 150), `les noms gardent leur largeur (${v.cards.map((c) => Math.round(c.nameW)).join(', ')} px)`);
});

await S.run('un compte de démonstration ne montre aucune ardoise', async (t) => {
  const page = await open(t, { kind: 'demo' });
  const v = await readPage(page);
  check(v.cards.length === 0, 'aucune carte « Depuis la caisse » hors compte réel');
});

await browser.close();
server.close();
S.finish();
