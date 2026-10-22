#!/usr/bin/env node
/* L'accessibilité des surfaces principales, mesurée par axe-core dans Chromium.
 *   node tools/a11y-browser-test.mjs
 *   KIWI_UPDATE_A11Y_BASELINE=1 node tools/a11y-browser-test.mjs   (réécrit la base)
 *
 * Le 2026-10-19, les boutons de métier de l'assistant d'installation n'avaient
 * aucun nom : un lecteur d'écran disait « bouton », six fois. Aucun test ne le
 * voyait. axe-core (MPL-2.0, dépendance de développement de app/) passe sur la
 * page d'accueil, le tableau de bord démo, l'assistant d'installation et la
 * caisse démo, et relève les violations WCAG 2.1 A/AA « critical » et
 * « serious ».
 *
 * Les violations déjà présentes sont inscrites dans tools/a11y-baseline.json,
 * par surface et par règle, avec leur nombre de nœuds. La suite échoue sur une
 * règle nouvelle, ou sur plus de nœuds qu'inscrit : elle empêche d'empirer
 * sans exiger de tout corriger d'un coup. Quand un nombre baisse, elle le dit,
 * pour qu'on resserre la base.
 *
 * axe est injecté par le protocole DevTools (page.evaluate), que la CSP d'une
 * page ne bloque pas. Le service worker est tenu à l'écart et /api/ répond 503
 * (hors ligne), comme dans dash-desktop-browser-test.mjs. Aucun code saisi. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';
import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as kdsQueue from '../functions/api/order/queue.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer, axeSource;
try { puppeteer = req('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
try { axeSource = fs.readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8'); }
catch { console.log('○ skip: axe-core unavailable (npm --prefix app ci)'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const BASELINE_FILE = path.join(root, 'tools/a11y-baseline.json');
const UPDATE = process.env.KIWI_UPDATE_A11Y_BASELINE === '1';
const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : {};
const measured = {};

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
const S = suite('a11y', { browser });

async function open(t, url, storage, { width = 1440, height = 900, mobile = false, api = null, pin = true } = {}) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  if (pin) await pinTradingHour(page);   // « aujourd'hui » de la démo, à 15 h : le nombre de lignes ne dépend plus de l'heure (tools/demo-clock.mjs)
  await page.setViewport(mobile ? { width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width, height });
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return api ? api(r) : r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((items) => {
    Object.entries(items).forEach(([k, v]) => localStorage.setItem(k, v));
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, storage);
  t.step('open ' + url);
  await page.goto(base + url, { waitUntil: 'load' });
  await sleep(1500);
  return page;
}

/* Les violations sérieuses de la page, ramenées à { règle: nœuds }. */
async function audit(t, page) {
  t.step('run axe-core');
  await page.evaluate(axeSource);
  const found = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    });
    return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.map((n) => n.target.join(' ')), sample: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) }));
  });
  return found;
}
/* Plusieurs états d'une même surface (une feuille ouverte, puis le panier) :
   un nœud fautif dans deux états ne compte qu'une fois. */
function union(...audits) {
  const byId = new Map();
  for (const v of audits.flat()) {
    const was = byId.get(v.id);
    if (!was) { byId.set(v.id, { ...v, targets: [...v.targets] }); continue; }
    v.targets.forEach((x) => { if (!was.targets.includes(x)) was.targets.push(x); });
  }
  return [...byId.values()].map((v) => ({ ...v, nodes: v.targets.length, sample: v.targets.slice(0, 2) }));
}

let regressions = 0;
function compare(surface, found) {
  const was = baseline[surface] || {};
  measured[surface] = Object.fromEntries(found.map((v) => [v.id, v.nodes]));
  if (UPDATE) { console.log(`  ✓ ${surface}: ${found.length} règle(s) inscrite(s) dans la base`); return; }
  const worse = found.filter((v) => !(v.id in was) || v.nodes > was[v.id]);
  worse.forEach((v) => {
    regressions++;
    console.log(`  ✗ ${surface} · ${v.id} (${v.impact}) ${v.help} · ${v.nodes} nœud(s), base ${was[v.id] || 0} · ex. ${v.sample.join(' | ')}`);
  });
  const better = Object.entries(was).filter(([id, n]) => (measured[surface][id] || 0) < n);
  better.forEach(([id, n]) => console.log(`  ! ${surface} · ${id} : ${measured[surface][id] || 0} nœud(s) au lieu de ${n}, resserrez la base (KIWI_UPDATE_A11Y_BASELINE=1)`));
  if (!worse.length) console.log(`  ✓ ${surface} : aucune violation sérieuse nouvelle (${found.length} règle(s) déjà connue(s))`);
  else throw new Error(`${surface} : ${worse.map((v) => v.id).join(', ')} au-delà de tools/a11y-baseline.json`);
}

const DEMO = { kiwiSkin2027: '1', 'kiwiSkin2027:dashboard': '1', kiwiSkipOnboard: '1', kiwiLang: 'fr' };

await S.run('page d’accueil', async (t) => {
  const page = await open(t, '/index.html', { kiwiLang: 'fr' });
  compare('landing', await audit(t, page));
});
await S.run('tableau de bord démo', async (t) => {
  const page = await open(t, '/dashboard.html', DEMO);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d/.test(x.textContent)); if (b) b.click(); });
  await sleep(800);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 20000 });
  await sleep(900);
  compare('dashboard', await audit(t, page));
});
await S.run('assistant d’installation', async (t) => {
  const page = await open(t, '/dashboard.html?onboarding=1', { 'kiwiSkin2027:dashboard': '1', kiwiLang: 'fr' }, { width: 430, height: 900 });
  t.step('wait for the wizard');
  await page.waitForFunction(() => !!(document.getElementById('kit-onboarding') || document.querySelector('.kob-root')), { timeout: 20000 });
  await sleep(800);
  compare('onboarding', await audit(t, page));
});
await S.run('caisse démo', async (t) => {
  const page = await open(t, '/kiwi-caisse.html', { kiwiLang: 'fr' }, { width: 1180, height: 820 });
  await sleep(1200);
  compare('caisse', await audit(t, page));
});

/* 22 octobre : en parcourant l'hôtel de test, l'économat avait son bouton
 * principal vert sur vert en clair et son titre noir sur vert en sombre. Aucune
 * surface ci-dessus n'était en mode sombre ni dans une caisse de métier. */
await S.run('tableau de bord démo, mode sombre', async (t) => {
  const page = await open(t, '/dashboard.html', { ...DEMO, kiwiTheme: 'dark', kiwiDashTheme: 'dark' });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d/.test(x.textContent)); if (b) b.click(); });
  await sleep(800);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 20000 });
  await sleep(900);
  compare('dashboard-dark', await audit(t, page));
});
for (const [id, label] of [['pressing', 'caisse pressing'], ['hotel', 'caisse hôtel']]) {
  await S.run(label, async (t) => {
    const page = await open(t, '/kiwi-caisse.html', { kiwiLang: 'fr' }, { width: 1180, height: 820 });
    await sleep(1200);
    t.step('open the ' + id + ' till');
    await page.evaluate((v) => window.KiwiPosDispatch.unlockById(v), id);
    await sleep(1800);
    compare('caisse-' + id, await audit(t, page));
  });
}

/* 22 octobre : la commande par QR, que le client ouvre sur son téléphone, et
 * l'écran de cuisine n'étaient audités nulle part. La commande : la démo du
 * pitch (OrderPro.html?s=demo, Café Atlas servi par assets/orderpro-demo.js,
 * rien ne quitte le téléphone), menu à emporter, la feuille d'un plat à options
 * ouverte, puis le panier. */
await S.run('commande QR, démo', async (t) => {
  const page = await open(t, '/OrderPro.html?s=demo', { orderProLang: 'fr' }, { width: 390, height: 844, mobile: true });
  t.step('take away, the menu');
  await page.waitForSelector('#screen-mode.is-active', { timeout: 15000 });
  await page.tap('.mode-card[data-mode="takeout"]');
  await page.waitForSelector('#screen-menu.is-active [data-add="cappuccino"]', { timeout: 8000 });
  await sleep(900);
  const menu = await audit(t, page);
  t.step('the dish sheet');
  await page.tap('[data-add="cappuccino"]');
  await page.waitForSelector('#custom-sheet.is-open', { timeout: 5000 });
  await sleep(700);
  const sheet = await audit(t, page);
  t.step('add it, then open the basket');
  await page.tap('#custom-add-btn');
  await page.waitForFunction(() => !document.querySelector('#custom-sheet.is-open'), { timeout: 5000 });
  await sleep(500);
  await page.tap('[data-add="sparkling"]');
  await page.waitForFunction(() => document.getElementById('cart-count').textContent === '2', { timeout: 5000 });
  await page.tap('#cart-pill');
  await page.waitForSelector('#cart-sheet.is-open', { timeout: 5000 });
  await sleep(700);
  const cart = await audit(t, page);
  compare('orderpro', union(menu, sheet, cart));
});

/* L'écran de cuisine livré (kiwi-cuisine.html), branché sur le vrai
 * functions/api/order/queue.js et une base SQLite tirée de schema.sql, comme
 * kds-cards-browser-test.mjs : quatre bons de démo, une tablette « appairée » à
 * un commerce qui n'existe que dans cette base. Aucun code saisi, aucun vrai
 * commerce touché. */
await S.run('écran de cuisine', async (t) => {
  const MERCHANT = 'a11y-kds-bistro', AUTH_SECRET = 'a11y-kds-secret';
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
  const DB = {
    prepare(query) {
      let args = [];
      const st = {
        bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
        first() { const r = sql.prepare(query).get(...args); return r === undefined ? null : r; },
        all() { return { results: sql.prepare(query).all(...args) }; },
        run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
      };
      return st;
    },
    async batch(statements) {
      sql.exec('BEGIN IMMEDIATE');
      try { const out = []; for (const s of statements) out.push(await s.run()); sql.exec('COMMIT'); return out; }
      catch (e) { try { sql.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
  };
  const env = { DB, AUTH_SECRET };
  sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
    .run(MERCHANT, JSON.stringify({ orderpro: true }), 'Bistro A11y', Date.now());
  const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;
  let seq = 100;
  const line = (name, extra = {}) => ({ id: 'it-' + name.toLowerCase().replace(/\W+/g, '-'), name, qty: 1, unitPrice: 50, station: '', ...extra });
  const addOrder = ({ id, mode = 'table', table = null, ageMs, lines }) => {
    const created = Date.now() - ageMs;
    sql.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts, channel)
                 VALUES (?, ?, ?, ?, ?, 100, ?, 'accepted', ?, ?, 'caisse')`)
      .run(id, MERCHANT, ++seq, mode, table, JSON.stringify(lines), created, created);
  };
  addOrder({ id: 'k1', table: '5', ageMs: 2 * 60000, lines: [line('Tajine kefta', { note: 'Sans piment', visuals: [{ name: 'sans oignon' }] }), line('Thé à la menthe', { station: 'bar' })] });
  addOrder({ id: 'k2', mode: 'takeout', ageMs: 6 * 60000, lines: [line('Burger maison', { visuals: [{ name: 'bien cuit' }] }), line('Frites', { qty: 2 })] });
  addOrder({ id: 'k3', mode: 'delivery', ageMs: 9 * 60000, lines: [line('Couscous royal', { stationAccepted: true }), line('Pastilla au poulet', { stationAccepted: true })] });
  addOrder({ id: 'k4', table: '8', ageMs: 17 * 60000, lines: [line('Lasagnes', { stationAccepted: true, note: 'Allergie : œufs, vérifier' })] });
  const api = async (r) => {
    const url = new URL(r.url());
    if (url.pathname !== '/api/order/queue') return r.respond({ status: 404, contentType: 'application/json', body: '{"error":"not-found"}' });
    const method = r.method();
    const body = method === 'POST' ? r.postData() : undefined;
    const request = new Request(url.toString(), { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body });
    try {
      const res = await (method === 'POST' ? kdsQueue.onRequestPost : kdsQueue.onRequestGet)({ request, env, waitUntil() {} });
      r.respond({ status: res.status, contentType: 'application/json', body: await res.text() });
    } catch (e) { r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: String(e && e.message) }) }); }
  };
  const page = await open(t, '/kiwi-cuisine.html', { kiwiLiveMerchant: MERCHANT, kiwiPaired: '1', kiwiCuisineLang: 'fr' }, { width: 1280, height: 800, api, pin: false });   // l'âge des bons se lit sur la vraie horloge, celle du serveur
  t.step('wait for the bons');
  await page.waitForFunction(() => document.querySelectorAll('.tk .tk-act').length >= 4, { timeout: 20000 });
  await sleep(800);
  compare('kds', await audit(t, page));
});

if (UPDATE) fs.writeFileSync(BASELINE_FILE, JSON.stringify(measured, null, 2) + '\n');
await browser.close();
server.close();
console.log(regressions ? `\na11y: ${regressions} violation(s) sérieuse(s) nouvelle(s)` : '\na11y: aucune violation sérieuse nouvelle');
await S.finish();
