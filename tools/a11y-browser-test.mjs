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
 * « serious ». Depuis le 23 octobre aussi : l'accueil sur téléphone et en
 * arabe (avec un passage au clavier), la console opérateur sur tablette et sa
 * boîte de suppression, l'app équipe (connexion, pointage, congé) en FR/EN/AR,
 * le carnet de crédit de l'épicerie et l'éditeur « Coût simple ». Une feuille
 * ouverte doit aussi avoir pris le focus.
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

/* Les violations sérieuses de la page, ramenées à { règle: nœuds }. `within`
   borne l'audit à une partie de la page (l'éditeur posé dans le tableau de
   bord démo, déjà audité ailleurs) ; les cibles restent celles du document. */
async function audit(t, page, within) {
  t.step('run axe-core' + (within ? ' on ' + within : ''));
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(axeSource);
  const found = await page.evaluate(async (sel) => {
    const r = await window.axe.run(sel ? { include: [[sel]] } : document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    });
    return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.map((n) => n.target.join(' ')), sample: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) }));
  }, within || null);
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
    if (process.env.KIWI_A11Y_VERBOSE === '1') v.targets.forEach((x) => console.log('      · ' + x));
  });
  const better = Object.entries(was).filter(([id, n]) => (measured[surface][id] || 0) < n);
  better.forEach(([id, n]) => console.log(`  ! ${surface} · ${id} : ${measured[surface][id] || 0} nœud(s) au lieu de ${n}, resserrez la base (KIWI_UPDATE_A11Y_BASELINE=1)`));
  if (!worse.length) console.log(`  ✓ ${surface} : aucune violation sérieuse nouvelle (${found.length} règle(s) déjà connue(s))`);
  else throw new Error(`${surface} : ${worse.map((v) => v.id).join(', ')} au-delà de tools/a11y-baseline.json`);
}

const DEMO = { kiwiSkin2027: '1', 'kiwiSkin2027:dashboard': '1', kiwiSkipOnboard: '1', kiwiLang: 'fr' };

await S.run('page d’accueil', async (t) => {
  // coverage: surface=landing locale=fr viewport=desktop
  const page = await open(t, '/index.html', { kiwiLang: 'fr' });
  compare('landing', await audit(t, page));
});

/* 23 octobre : la page d'accueil est publiée en sept langues et lue surtout sur
 * un téléphone, mais l'audit n'ouvrait que le français sur un bureau. On ajoute
 * le téléphone (français), l'arabe de droite à gauche (bureau et téléphone), et
 * le clavier : chaque arrêt de Tab tombe sur un élément visible, hors d'une
 * zone aria-hidden, et l'ordre avance sans boucler sur place. */
async function keyboardWalk(t, page, stops = 40) {
  t.step('walk the page with Tab');
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
  const seen = [];
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return { tag: el.tagName.toLowerCase(), name, visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden',
        hidden: !!el.closest('[aria-hidden="true"],[inert]'), key: el.tagName + '|' + (el.id || '') + '|' + Math.round(r.top + scrollY) + '|' + Math.round(r.left) };
    });
    if (!f) break;
    if (!f.visible || f.hidden) throw new Error(`Tab ${i + 1} : ${f.tag} « ${f.name} » ${f.hidden ? 'dans une zone aria-hidden' : 'invisible'}`);
    seen.push(f.key);
  }
  if (seen.length < 5) throw new Error(`le clavier n'atteint que ${seen.length} élément(s)`);
  if (new Set(seen).size < Math.min(seen.length, 5)) throw new Error('le Tab tourne sur place');
  console.log(`  ✓ clavier : ${seen.length} arrêts visibles, aucun dans une zone masquée`);
}
await S.run('page d’accueil, téléphone', async (t) => {
  // coverage: surface=landing locale=fr viewport=phone
  const page = await open(t, '/index.html', { kiwiLang: 'fr' }, { width: 390, height: 844, mobile: true });
  compare('landing-phone', await audit(t, page));
  await keyboardWalk(t, page);
});
await S.run('page d’accueil, arabe', async (t) => {
  // coverage: surface=landing locale=ar viewport=desktop
  const page = await open(t, '/ar/index.html', { kiwiLang: 'ar' });
  if (await page.evaluate(() => document.documentElement.dir) !== 'rtl') throw new Error('la page arabe ne se lit pas de droite à gauche');
  const desk = await audit(t, page);
  await keyboardWalk(t, page);
  // coverage: surface=landing locale=ar viewport=phone
  const phone = await open(t, '/ar/index.html', { kiwiLang: 'ar' }, { width: 390, height: 844, mobile: true });
  compare('landing-ar', union(desk, await audit(t, phone)));
});
/* Les cinq autres langues publiées, bureau et téléphone, avec le même passage
 * au clavier : une page traduite ne doit pas perdre un nom, un contraste ou un
 * ordre de Tab que le français a. */
for (const lang of ['en', 'es', 'de', 'it', 'nl']) {
  await S.run('page d’accueil · ' + lang, async (t) => {
    // coverage: surface=landing locale=en viewport=desktop
    // coverage: surface=landing locale=es viewport=desktop
    // coverage: surface=landing locale=de viewport=desktop
    // coverage: surface=landing locale=it viewport=desktop
    // coverage: surface=landing locale=nl viewport=desktop
    const desk = await open(t, `/${lang}/index.html`, { kiwiLang: lang });
    if (await desk.evaluate(() => document.documentElement.lang) .then((l) => !String(l).startsWith(lang))) throw new Error(`la page ${lang} ne déclare pas sa langue`);
    const a = await audit(t, desk);
    // coverage: surface=landing locale=en viewport=phone
    // coverage: surface=landing locale=es viewport=phone
    // coverage: surface=landing locale=de viewport=phone
    // coverage: surface=landing locale=it viewport=phone
    // coverage: surface=landing locale=nl viewport=phone
    const phone = await open(t, `/${lang}/index.html`, { kiwiLang: lang }, { width: 390, height: 844, mobile: true });
    const b = await audit(t, phone);
    await keyboardWalk(t, phone);
    compare('landing-' + lang, union(a, b));
  });
}
await S.run('tableau de bord démo', async (t) => {
  // coverage: surface=dashboard locale=fr viewport=desktop
  const page = await open(t, '/dashboard.html', DEMO);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d/.test(x.textContent)); if (b) b.click(); });
  await sleep(800);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 20000 });
  await sleep(900);
  compare('dashboard', await audit(t, page));
});
await S.run('assistant d’installation', async (t) => {
  // coverage: surface=onboarding locale=fr viewport=phone
  const page = await open(t, '/dashboard.html?onboarding=1', { 'kiwiSkin2027:dashboard': '1', kiwiLang: 'fr' }, { width: 430, height: 900 });
  t.step('wait for the wizard');
  await page.waitForFunction(() => !!(document.getElementById('kit-onboarding') || document.querySelector('.kob-root')), { timeout: 20000 });
  await sleep(800);
  compare('onboarding', await audit(t, page));
});
await S.run('caisse démo', async (t) => {
  // coverage: surface=caisse-entry locale=fr viewport=desktop
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
    // coverage: surface=caisse-entry locale=fr viewport=desktop
    // coverage: surface=caisse-pressing locale=fr viewport=desktop
    // coverage: surface=caisse-hotel locale=fr viewport=desktop
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
  // coverage: surface=orderpro locale=fr viewport=phone
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
  // coverage: surface=kitchen locale=fr viewport=desktop
  const page = await open(t, '/kiwi-cuisine.html', { kiwiLiveMerchant: MERCHANT, kiwiPaired: '1', kiwiCuisineLang: 'fr' }, { width: 1280, height: 800, api, pin: false });   // l'âge des bons se lit sur la vraie horloge, celle du serveur
  t.step('wait for the bons');
  await page.waitForFunction(() => document.querySelectorAll('.tk .tk-act').length >= 4, { timeout: 20000 });
  await sleep(800);
  compare('kds', await audit(t, page));
  /* 23 octobre : la même cuisine sur le design 2027 (kiwiSkin2027:kds), que
     les commerces passés en 2027 voient. Ses bons vivent dans les racines
     fantômes du kit ; axe les parcourt. Le bouton « +2 plus récentes » y
     portait un nom qui ne contenait pas son texte. */
  const kit = await open(t, '/kiwi-cuisine.html', { kiwiLiveMerchant: MERCHANT, kiwiPaired: '1', kiwiCuisineLang: 'fr', 'kiwiSkin2027:kds': '1' }, { width: 1280, height: 800, api, pin: false });
  t.step('wait for the kit board');
  await kit.waitForFunction(() => { let n = 0; const w = (r) => r.querySelectorAll('*').forEach((e) => { if (e.classList && e.classList.contains('tk')) n++; if (e.shadowRoot) w(e.shadowRoot); }); w(document); return n >= 2; }, { timeout: 20000 });   // a lane shows its first bons, the rest behind « +N plus récentes »
  await sleep(800);
  compare('kds-2027', await audit(t, kit));
});

/* 23 octobre : cinq écrans relevés par une revue à l'aveugle comme absents de
 * cet audit. Chacun sur des données de démonstration ou fabriquées ici, jamais
 * un vrai commerce ; aucun code d'équipe saisi.
 *
 * Après une ouverture de feuille, le focus doit y être entré : un lecteur
 * d'écran ou un clavier qui reste derrière le voile ne sait pas qu'elle existe. */
const focusMisses = [];
async function focusInside(page, sel, what) {
  const inside = await page.evaluate((s) => { const box = document.querySelector(s); return !!(box && document.activeElement && box.contains(document.activeElement)); }, sel);
  if (!inside) { focusMisses.push(`${what} : le focus reste hors de la feuille ouverte (${sel})`); console.log('  ✗ ' + focusMisses[focusMisses.length - 1]); }
}
/* Les violations axe d'abord (le nombre compte pour la base), le focus ensuite. */
function compareThenFocus(surface, found) {
  const misses = focusMisses.splice(0);
  compare(surface, found);
  if (misses.length) throw new Error(misses.join(' ; '));
}

/* La console opérateur (kiwi-admin.html) en mode démo local : sur 127.0.0.1,
 * /api/admin hors ligne, elle tourne sur son jeu fictif (seedMock). Tablette
 * étroite, puis la boîte de suppression d'un établissement, le geste le plus
 * destructeur qu'elle offre. La console n'existe qu'en français (outil interne
 * de l'équipe Kiwi) : pas d'audit arabe ici. */
await S.run('console opérateur, tablette, suppression', async (t) => {
  // coverage: surface=console locale=fr viewport=tablet
  const page = await open(t, '/kiwi-admin.html', {}, { width: 768, height: 1024, mobile: true, pin: false });
  t.step('wait for the roster');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Supprimer'), { timeout: 20000 });
  await sleep(600);
  const list = await audit(t, page);
  t.step('open the delete dialog');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Supprimer').click());
  await page.waitForSelector('.md-back .md-card', { timeout: 5000 });
  await sleep(400);
  await focusInside(page, '.md-card', 'console · suppression');
  const dialog = await audit(t, page);
  t.step('Escape closes it');
  await page.keyboard.press('Escape');
  await sleep(200);
  if (await page.evaluate(() => !!document.querySelector('.md-back'))) throw new Error('console · Échap ne ferme pas la boîte de suppression');
  compareThenFocus('console', union(list, dialog));
});

/* L'app équipe (kiwi-serveur.html) : connexion, pointage, puis la demande de
 * congé, en français, anglais et arabe. /api/employee est simulé ici, avec une
 * employée fabriquée (example.com) ; la session est ouverte côté « serveur »
 * du test, aucun code n'est tapé. « Consulter sans pointer » mène à l'app. */
for (const lang of ['fr', 'en', 'ar']) {
  await S.run('app équipe · ' + lang, async (t) => {
    const MERCHANT = 'a11y-equipe';
    const st = { session: false };
    const payload = () => ({ ok: true, merchant: MERCHANT, employee: { id: 'e_a11y', name: 'Salma Test', firstName: 'Salma', initials: 'ST', role: 'serveur' },
      store: { type: 'restaurant', timezone: 'Africa/Casablanca', name: 'Bistro A11y' }, attendance: { open: null }, colleagues: [], messages: [],
      schedule: {}, planning: { requests: [], openShifts: [], swapRequests: [], notices: [] } });
    const api = (r) => {
      const u = new URL(r.url());
      const json = (status, body) => r.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (u.pathname === '/api/employee' && r.method() === 'GET') return st.session ? json(200, payload()) : json(401, { error: 'employee-session-required' });
      return json(503, { error: 'offline' });
    };
    const url = '/kiwi-serveur.html?merchant=' + MERCHANT;
    /* L'app suit le thème du téléphone : on pose les deux, sinon l'audit
       dépendrait du réglage clair/sombre de la machine qui le lance. */
    const states = [];
    for (const theme of ['light', 'dark']) {
      const storage = { ['kiwi-employee-language:' + MERCHANT]: lang, kiwiTheme: theme };
      st.session = false;
      const login = await open(t, url, storage, { width: 390, height: 844, mobile: true, api });
      t.step(`sign-in (${theme})`);
      await login.waitForSelector('#screen-pin.is-active #employee-login', { timeout: 20000 });
      await sleep(500);
      if (lang === 'ar' && await login.evaluate(() => document.documentElement.dir) !== 'rtl') throw new Error('app équipe · l’arabe ne passe pas de droite à gauche');
      states.push(await audit(t, login));
      st.session = true;
      // coverage: surface=employee locale=fr viewport=phone
      // coverage: surface=employee locale=en viewport=phone
      // coverage: surface=employee locale=ar viewport=phone
      const app = await open(t, url, storage, { width: 390, height: 844, mobile: true, api });
      t.step(`the clock-in screen (${theme})`);
      await app.waitForSelector('#screen-clockin.is-active', { timeout: 20000 });
      await sleep(600);
      states.push(await audit(t, app));
      t.step(`browse without clocking in, the profile, then leave (${theme})`);
      await app.click('#ci-browse-link');
      await app.waitForSelector('#screen-main.is-active', { timeout: 10000 });
      await app.evaluate(() => document.querySelector('.bt-btn[data-tab="profil"]').click());
      await app.waitForSelector('#kep-card [data-kep="leave"]', { timeout: 10000 });
      await app.evaluate(() => document.querySelector('#kep-card [data-kep="leave"]').click());
      await app.waitForSelector('.kep-overlay .kep-sheet', { timeout: 5000 });
      await sleep(500);
      await focusInside(app, '.kep-sheet', `app équipe · congé (${theme})`);
      states.push(await audit(t, app));
      await app.keyboard.press('Escape');
      await sleep(200);
      if (await app.evaluate(() => !!document.querySelector('.kep-overlay'))) focusMisses.push(`app équipe · Échap ne ferme pas la demande de congé (${theme})`);
    }
    compareThenFocus('employee-' + lang, union(...states));
  });
}

/* Le carnet de crédit de l'épicerie (assets/pos-epicerie.js) dans la caisse
 * démo, avec ses voisins fictifs : la liste, une ardoise en dette ancienne, une
 * ardoise à jour, le règlement (total puis partiel), une dette ajoutée à la
 * main, et le choix d'une ardoise pour un panier. En français (clair) et en
 * arabe (sombre). Échap ferme la feuille ouverte. */
for (const lang of ['fr', 'ar']) {
  await S.run('carnet de crédit · ' + lang + (lang === 'ar' ? ', sombre' : ''), async (t) => {
    /* le français en clair, l'arabe en sombre : les deux thèmes de la caisse */
    // coverage: surface=caisse-epicerie locale=fr viewport=desktop
    // coverage: surface=caisse-epicerie locale=ar viewport=desktop
    // coverage: surface=credit-book locale=fr viewport=desktop
    // coverage: surface=credit-book locale=ar viewport=desktop
    const page = await open(t, '/kiwi-caisse.html', { kiwiLang: lang, kiwiCaisseLang: lang, kiwiCaisseTheme: lang === 'ar' ? 'dark' : 'light' }, { width: 1180, height: 820 });
    await sleep(1200);
    t.step('open the épicerie till, the credit book');
    await page.evaluate(() => window.KiwiPosDispatch.unlockById('epicerie'));
    await page.waitForSelector('[data-ep-view="carnet"]', { timeout: 15000 });
    await page.evaluate(() => document.querySelector('[data-ep-view="carnet"]').click());
    await page.waitForSelector('[data-ep-ard="k1"]', { timeout: 5000 });
    await sleep(500);
    const states = [await audit(t, page)];
    const sheet = async (label, sel, act) => {
      t.step(label);
      await page.evaluate(act);
      await page.waitForSelector(sel + '.is-open', { timeout: 5000 });
      await sleep(350);
      await focusInside(page, sel + ' .modal', 'carnet · ' + label);
      states.push(await audit(t, page));
    };
    await sheet('a debt, the detail', '#ep-ard-veil', () => document.querySelector('[data-ep-ard="k1"]').click());
    await sheet('settle', '#ep-pay-veil', () => document.querySelector('#ep-ard-settle').click());
    await sheet('settle in part', '#ep-pay-veil', () => document.querySelector('[data-ep-settle="partial"]').click());
    await sheet('back, then add a debt', '#ep-pay-veil', () => { document.querySelector('#ep-paym [data-ep-close]').click(); document.querySelector('#ep-ard-add').click(); });
    await sheet('a settled tab', '#ep-ard-veil', () => { document.querySelector('#ep-paym [data-ep-close]').click(); document.querySelector('#ep-ardm [data-ep-close]').click(); document.querySelector('[data-ep-ard="k6"]').click(); });
    t.step('a basket put on a tab');
    await page.evaluate(() => { document.querySelector('#ep-ardm [data-ep-close]').click(); document.querySelector('[data-ep-view="caisse"]').click(); });
    await page.evaluate(() => document.querySelector('#ep-scan-mock').click());
    await page.waitForFunction(() => { const b = document.querySelector('#ep-credit'); return b && !b.disabled && !document.querySelector('#ep-scan-veil.is-open'); }, { timeout: 8000 });
    await sheet('the tab picker', '#ep-carnetpick-veil', () => document.querySelector('#ep-credit').click());
    t.step('Escape closes it');
    await page.keyboard.press('Escape');
    await sleep(200);
    if (await page.evaluate(() => !!document.querySelector('#ep-carnetpick-veil.is-open'))) focusMisses.push('carnet · Échap ne ferme pas la feuille');
    compareThenFocus('caisse-carnet-' + lang, union(...states));
  });
}

/* L'éditeur « Coût simple » (assets/simple-food-cost.js), dans la coquille
 * Kiwi.appPage du tableau de bord démo, comme l'onglet d'Analyse du menu le
 * pose. /api/foodcost est simulé : une fiche fabriquée, deux ingrédients et un
 * emballage. L'option n'existe que sur un compte réel ; on appelle le panneau
 * directement plutôt que de faire passer la démo pour un vrai compte. */
await S.run('coût simple · fr, en, ar', async (t) => {
  const sheetFixture = { id: 'sfc-a11y', name: 'Tajine poulet', kind: 'sheet', version: 2, updatedTs: Date.now() - 86400000, updatedBy: 'test', archived: false,
    data: { name: 'Tajine poulet', kind: 'sheet', menuItemId: '', menuItemName: '', sellingPrice: 110, vatIncluded: true, vatRate: 10, portions: 4, targetPct: 30, note: '',
      lines: [
        { id: 'a', name: 'Poulet', type: 'food', packPrice: 60, packQty: 1, packUnit: 'kg', useQty: 800, useUnit: 'g', yieldPct: 80, priceDate: '2026-10-01' },
        { id: 'b', name: 'Oignons', type: 'food', packPrice: null, packQty: 1, packUnit: 'kg', useQty: 300, useUnit: 'g', yieldPct: 100, priceDate: '' },
        { id: 'c', name: 'Barquette', type: 'packaging', packPrice: 50, packQty: 100, packUnit: 'unité', useQty: 4, useUnit: 'unité', yieldPct: 100, priceDate: '2026-09-01' },
      ] } };
  const api = (r) => {
    const u = new URL(r.url());
    if (u.pathname === '/api/foodcost' && r.method() === 'GET') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, canEdit: true, sheets: [sheetFixture] }) });
    return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
  };
  const page = await open(t, '/dashboard.html', DEMO, { api });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d/.test(x.textContent)); if (b) b.click(); });
  await sleep(800);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!(window.KiwiSimpleFoodCost && window.Kiwi && window.Kiwi.appPage), { timeout: 20000 });
  t.step('mount the editor, open the sheet');
  /* La démo n'a pas de commerce nommé : le panneau lit un identifiant fabriqué. */
  await page.evaluate(() => { const cd = window.KiwiCloudDoc || (window.KiwiCloudDoc = {}); cd.currentSlug = () => 'a11y-cout'; });
  await page.evaluate(() => window.Kiwi.appPage('a11y-cost', { title: 'Coût simple', subtitle: '', body: window.KiwiSimpleFoodCost.panel() }));
  await page.waitForSelector('[data-sfc-root] [data-sfc="open"]', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('[data-sfc-root] [data-sfc="open"]').click());
  await page.waitForSelector('[data-sfc-root] [data-sfc-line="2"]', { timeout: 5000 });
  await sleep(400);
  const states = [];
  for (const lang of ['fr', 'en', 'ar']) {
    t.step('editor in ' + lang);
    await page.evaluate((l) => window.KiwiI18n.setLang(l), lang);
    await page.waitForFunction((l) => document.documentElement.lang === l && !!document.querySelector('[data-sfc-root] [data-sfc-line="2"]'), { timeout: 5000 }, lang);
    await sleep(400);
    /* Chaque champ d'une ligne dit l'ingrédient ET le champ : « Poulet · Prix du lot ». */
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('[data-sfc-root] [data-sfc-line] [data-sfc-field]')]
      .filter((el) => { const row = el.closest('[data-sfc-line]'); const who = row.querySelector('[data-sfc-field="name"]').value; const n = el.getAttribute('aria-label') || ''; return !who || !n.includes(who) || n.trim() === who; })
      .map((el) => el.getAttribute('data-sfc-field')));
    if (unnamed.length) { focusMisses.push(`coût simple (${lang}) : ${unnamed.length} champ(s) de ligne sans nom « ingrédient · champ » (${[...new Set(unnamed)].join(', ')})`); console.log('  ✗ ' + focusMisses[focusMisses.length - 1]); }
    states.push(await audit(t, page, '[data-sfc-root]'));
  }
  compareThenFocus('foodcost', union(...states));
});

/* 25 octobre : la caisse 2027 (kiwiSkin2027:till) n'était pas auditée, seule
   l'ancienne caisse l'était. Elle portait 184 noms qui ne contenaient pas leur
   texte (les tuiles lues « Harira25,00 MAD », les onglets « 3 Commandes »), un
   compteur à 4,03:1 en arabe sombre et un écran de pointage transparent dont
   les boutons prenaient Tab. Menu, addition et encaissement, au bureau, sur
   un téléphone en arabe sombre et sur un téléphone couché. */
async function till2027(t, lang, width, height) {
  const page = await open(t, '/kiwi-caisse.html', { 'kiwiSkin2027:till': '1', kiwiCaisseLang: lang, ...(lang === 'ar' ? { kiwiCaisseTheme: 'dark' } : {}) }, { width, height, mobile: width < 500, pin: false });
  const states = [await audit(t, page)];
  t.step('open the service');
  await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
  await page.evaluate(() => doOpenService());
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await sleep(800);
  t.step('takeaway, three dishes');
  await page.evaluate(() => { for (const tag of ['k-rail', 'k-tabbar']) { const r = document.querySelector(tag); const b = r && r.shadowRoot && r.shadowRoot.querySelector('[data-id="takeaway"]'); if (b && b.getBoundingClientRect().width) { b.click(); return; } } });
  await sleep(400);
  await page.evaluate(() => { const b = document.querySelector('#vrap-new-order'); if (b) b.click(); });
  await page.waitForFunction(() => !!document.querySelector('k-menu-grid') && document.querySelector('k-menu-grid').shadowRoot.querySelector('[data-item]'), { timeout: 20000 });
  await page.evaluate(() => { const g = document.querySelector('k-menu-grid'); [...g.shadowRoot.querySelectorAll('[data-item]')].filter((x) => !x.hasAttribute('data-opts') && x.getAttribute('aria-disabled') !== 'true').slice(0, 3).forEach((b) => b.click()); });
  await sleep(500);
  states.push(await audit(t, page));
  t.step('the bill, then cash');
  await page.evaluate(() => { const rp = document.querySelector('.rightpanel'); if (rp && getComputedStyle(rp).position === 'fixed') document.body.classList.add('ticket-open'); });
  await sleep(500);
  states.push(await audit(t, page));
  await page.evaluate(() => document.querySelector('k-bill').shadowRoot.querySelector('[data-w="pay"]').click());
  await sleep(600);
  await page.evaluate(() => { const b = document.querySelector('k-pay').shadowRoot.querySelector('[data-method="cash"]'); if (b) b.click(); });
  await sleep(500);
  states.push(await audit(t, page));
  return union(...states);
}
await S.run('caisse 2027 · bureau', async (t) => {
  // coverage: surface=caisse-2027 locale=fr viewport=desktop
  compare('caisse-2027', await till2027(t, 'fr', 1366, 1024));
});
await S.run('caisse 2027 · téléphone, arabe sombre', async (t) => {
  // coverage: surface=caisse-2027 locale=ar viewport=phone
  compare('caisse-2027-phone-ar', await till2027(t, 'ar', 390, 844));
});
await S.run('caisse 2027 · téléphone couché', async (t) => {
  // coverage: surface=caisse-2027 locale=fr viewport=phone
  compare('caisse-2027-landscape', await till2027(t, 'fr', 844, 390));
});
/* La galerie du kit montre chaque composant 2027 avec ses états : un défaut
   d'un composant partagé (la pastille sans nom, la liste d'un groupe radio,
   la colonne de cuisine qui défile sans le clavier) s'y voit avant d'arriver
   sur une page. */
await S.run('galerie du kit 2027', async (t) => {
  // coverage: surface=kit-gallery locale=en viewport=desktop
  const desk = await open(t, '/kit.html', {}, { width: 1440, height: 900, pin: false });
  const a = await audit(t, desk);
  const phone = await open(t, '/kit.html', {}, { width: 390, height: 844, mobile: true, pin: false });
  compare('kit-gallery', union(a, await audit(t, phone)));
});

if (UPDATE) fs.writeFileSync(BASELINE_FILE, JSON.stringify(measured, null, 2) + '\n');
await browser.close();
server.close();
console.log(regressions ? `\na11y: ${regressions} violation(s) sérieuse(s) nouvelle(s)` : '\na11y: aucune violation sérieuse nouvelle');
await S.finish();
