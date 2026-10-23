#!/usr/bin/env node
/* Kiwi · French left on screen under English and Arabic (tools/french-leak-browser-test.mjs)
 *
 * Opens the demo dashboard, switches to EN
 * then AR, clicks every sidebar destination for real and lists the visible
 * text that is still French. One report per language and page, written to
 * .kiwi/results/french-leak/<lang>.json and summarised on stdout.
 *
 * French is recognised by accented letters or a common French word. Text
 * that is demo DATA (a product, a client, a merchant name) is not UI copy:
 * nodes inside tables, lists of products and receipt previews are reported
 * separately as « data » so the UI count is not inflated by « Tajine ».
 *
 *   node tools/french-leak-browser-test.mjs             # the gate: EN + AR against the baseline
 *   node tools/french-leak-browser-test.mjs --report    # the lists only, no verdict
 *   KIWI_SWEEP_LANGS=en node tools/french-leak-browser-test.mjs --report
 *
 * The check compares each language's UI count with tools/french-leak-baseline.json
 * and fails when it rises. When a fix brings a count down, lower the baseline
 * (KIWI_UPDATE_FRENCH_BASELINE=1); never raise it to make a red go away. The
 * baseline is zero since 2026-10-23: the floor plan's seeded room names and its
 * COMPTOIR / CUISINE blocks read in the interface language (pdsZoneName,
 * pdsFixLabel), its « Salle » palette group found its key, and the demo
 * dishes are named in the screen's language (demoClock.js). The demo boutique till joined the sweep on 2026-10-20:
 * Vente, Scan, Inventaire, Échanges, Vendus, Clientes and Acomptes, each by a
 * click on its rail.
 */
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const root = process.env.KIWI_ROOT || path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'app/package.json'));
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (_) { console.log('  · puppeteer-core absent (npm --prefix app ci), sweep skipped'); process.exit(0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('  · no Chromium, sweep skipped'); process.exit(0); }
const LANGS = (process.env.KIWI_SWEEP_LANGS || 'en,ar').split(',').map((s) => s.trim()).filter(Boolean);

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Collected in the page: every visible text node, with whether it sits in data. */
function collect() {
  const FR_WORDS = ["aujourd'hui", 'aujourd’hui', 'semaine', 'ventes', 'vente', 'recette', 'caisse', 'commande', 'commandes', 'employé', 'employés', 'équipe',
    'réservation', 'réservations', 'paiement', 'paiements', 'règlement', 'règlements', 'annuler', 'enregistrer', 'ajouter', 'supprimer', 'modifier',
    'rechercher', 'aucun', 'aucune', 'encaissé', 'chiffre', 'jour', 'jours', 'hier', 'depuis', 'avec', 'dans', 'les', 'des', 'une', 'sont',
    'pas', 'tous', 'toutes', 'fermer', 'ouvrir', 'nouveau', 'nouvelle', 'voir', 'tout', 'fournisseur', 'fournisseurs', 'produits', 'articles', 'prix',
    'heure', 'heures', 'créer', 'valider', 'remboursement', 'espèces', 'pourboire', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
    'dimanche', 'janv', 'févr', 'avr', 'juil', 'août', 'déc', 'mois', 'année', 'clôture', 'livraison', 'livraisons', 'remise', 'remises', 'salle',
    'cuisine', 'serveur', 'serveuse', 'facture', 'factures', 'reçu', 'ticket moyen', 'sur place', 'à emporter', 'en attente', 'terminé', 'activer',
    'désactiver', 'paramètres', 'réglages', 'télécharger', 'imprimer', 'envoyer', 'précédent', 'suivant', 'derniers', 'dernière', 'dernier',
    'synchronisé', 'synchroniser', 'hors ligne', 'opérations', 'protégées', 'conservé', 'conservées', 'en cours', 'essai', 'joignable'];
  const word = new RegExp('(^|[^\\p{L}])(' + FR_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^\\p{L}])', 'iu');
  const accent = /[éèêëàâçùûôîïœ]/i;
  const DATA = 'table, tbody, [data-product], [data-item], .kpi-feed, .feed, .receipt, .tx-row, .menu-item, .dish, .client-row, .bq-item, .ep-dt-who, .ep-ard-who, input, textarea, select, option';
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (t.length < 3 || !/\p{L}{3}/u.test(t)) continue;
    const el = n.parentElement;
    if (!el || el.closest('script,style,noscript,[aria-hidden="true"],.sr-only,svg')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    if (!(accent.test(t) || word.test(t))) continue;
    /* An accent alone is usually a name (Café Atlas, Thé à la menthe): kept apart. */
    out.push({ t: t.slice(0, 120), data: !!el.closest(DATA), name: !word.test(t), where: (el.closest('[id]')?.id || el.className || el.tagName).toString().slice(0, 60) });
  }
  return out;
}

const report = {};
try {
  for (const lang of LANGS) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
    await page.evaluateOnNewDocument((l) => { try { localStorage.setItem('kiwiLang', l); } catch (_) {} }, lang);
    // coverage: surface=dashboard locale=en viewport=desktop
    // coverage: surface=dashboard locale=ar viewport=desktop
    await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
    const explore = await page.waitForSelector('.kob-root [data-explore]', { visible: true, timeout: 15000 }).catch(() => null);
    if (explore) { await explore.click(); await sleep(900); }
    const skip = await page.waitForSelector('[data-kiwi-skip]', { visible: true, timeout: 15000 }).catch(() => null);
    if (skip) await skip.click();
    await page.waitForFunction(() => window.KiwiI18n, { timeout: 15000 });
    await page.evaluate((l) => KiwiI18n.setLang(l), lang);
    await sleep(1500);
    const navs = await page.$$eval('.sidebar nav a[data-nav]', (as) => as.filter((a) => a.offsetWidth).map((a) => a.dataset.nav));
    const pages = ['accueil', ...navs.filter((n) => n !== 'accueil')];
    report[lang] = {};
    for (const nav of pages) {
      if (nav !== 'accueil' || navs.includes('accueil')) {
        const a = await page.$(`.sidebar nav a[data-nav="${nav}"]`);
        if (a) { try { await a.click(); } catch (_) {} }
      }
      await sleep(1400);
      const found = await page.evaluate(collect);
      const ui = [...new Set(found.filter((f) => !f.data && !f.name).map((f) => f.t))];
      const names = [...new Set(found.filter((f) => !f.data && f.name).map((f) => f.t))];
      const data = [...new Set(found.filter((f) => f.data).map((f) => f.t))];
      report[lang][nav] = { ui, names, data };
      await page.keyboard.press('Escape').catch(() => {});
    }
    await ctx.close();

    /* The demo till: its own language system (caisse-lang.js), opened like a
       cashier would: the opening float screen, then the floor once the till
       is open. */
    const tctx = await browser.createBrowserContext();
    const till = await tctx.newPage();
    await till.setViewport({ width: 1180, height: 820 });
    await till.setRequestInterception(true);
    till.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
    await till.evaluateOnNewDocument((l) => { try { localStorage.setItem('kiwiLang', l); localStorage.setItem('kiwiCaisseLang', l); } catch (_) {} }, lang);
    // coverage: surface=caisse-entry locale=en viewport=desktop
    // coverage: surface=caisse-entry locale=ar viewport=desktop
    await till.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    await sleep(3000);
    const split = (found) => ({
      ui: [...new Set(found.filter((f) => !f.data && !f.name).map((f) => f.t))],
      names: [...new Set(found.filter((f) => !f.data && f.name).map((f) => f.t))],
      data: [...new Set(found.filter((f) => f.data).map((f) => f.t))],
    });
    report[lang]['caisse:open'] = split(await till.evaluate(collect));
    const chip = await till.$('.ci-float-chip[data-float="300"]');
    if (chip) {
      await chip.click(); await sleep(400);
      const go = await till.$('#clockin-btn');
      if (go) { await go.click(); await sleep(2500); }
    }
    report[lang]['caisse:floor'] = split(await till.evaluate(collect));
    await tctx.close();

    /* The demo boutique till (three quarters of the money on Kiwi): the same
       caisse-lang.js, its own screens. Each rail destination by a real click. */
    const bctx = await browser.createBrowserContext();
    const bq = await bctx.newPage();
    await bq.setViewport({ width: 1180, height: 820 });
    await bq.setRequestInterception(true);
    bq.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
    await bq.evaluateOnNewDocument((l) => { try { localStorage.setItem('kiwiLang', l); localStorage.setItem('kiwiCaisseLang', l); } catch (_) {} }, lang);
    // coverage: surface=caisse-entry locale=en viewport=desktop
    // coverage: surface=caisse-entry locale=ar viewport=desktop
    await bq.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    const booted = await bq.waitForFunction(() => window.KiwiPosDispatch && window.KiwiBoutiqueCatalog, { timeout: 20000 }).then(() => true).catch(() => false);
    if (booted) {
      await bq.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
      await bq.waitForFunction(() => document.querySelector('.bq-card'), { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      const views = await bq.$$eval('.bq-rail [data-bq-view]', (bs) => bs.map((b) => b.dataset.bqView));
      /* « Clientes » opens the shared client book over the current page
         (assets/clients-book.js), so the page under it is read again: each
         string counts once across the boutique till. */
      const seen = { ui: new Set(), names: new Set(), data: new Set() };
      for (const v of views) {
        const b = await bq.$(`.bq-rail [data-bq-view="${v}"]`);
        if (b) { try { await b.click(); } catch (_) {} }
        await sleep(1200);
        const got = split(await bq.evaluate(collect));
        for (const k of Object.keys(seen)) { got[k] = got[k].filter((x) => !seen[k].has(x)); got[k].forEach((x) => seen[k].add(x)); }
        report[lang]['boutique:' + v] = got;
        await bq.keyboard.press('Escape').catch(() => {});
      }
    } else {
      report[lang]['boutique:boot'] = { ui: ['(the demo boutique till did not boot)'], names: [], data: [] };
    }
    await bctx.close();

    /* The demo épicerie till (Kiwi Basic, the entry plan): the same
       caisse-lang.js. Each rail view by a real click, then the sheets a
       grocer opens all day: payment, the tab picker, a neighbour's tab and
       its repayment. Products, aisles and neighbours are demo data. */
    const ectx = await browser.createBrowserContext();
    const ep = await ectx.newPage();
    await ep.setViewport({ width: 1180, height: 820 });
    await ep.setRequestInterception(true);
    ep.on('request', (r) => (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort()));
    await ep.evaluateOnNewDocument((l) => { try { localStorage.setItem('kiwiLang', l); localStorage.setItem('kiwiCaisseLang', l); } catch (_) {} }, lang);
    // coverage: surface=caisse-entry locale=en viewport=desktop
    // coverage: surface=caisse-entry locale=ar viewport=desktop
    await ep.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
    const epBooted = await ep.waitForFunction(() => window.KiwiPosDispatch, { timeout: 20000 }).then(() => true).catch(() => false);
    if (epBooted) {
      await ep.evaluate(() => window.KiwiPosDispatch.unlockById('epicerie'));
      await ep.waitForFunction(() => document.querySelector('.ep-card'), { timeout: 20000 }).catch(() => {});
      await sleep(1200);
      const seenE = { ui: new Set(), names: new Set(), data: new Set() };
      const look = async (label) => {
        const got = split(await ep.evaluate(collect));
        for (const k of Object.keys(seenE)) { got[k] = got[k].filter((x) => !seenE[k].has(x)); got[k].forEach((x) => seenE[k].add(x)); }
        report[lang]['epicerie:' + label] = got;
      };
      const tap = async (sel) => { const el = await ep.$(sel); if (el) { try { await el.click(); } catch (_) {} } await sleep(700); return !!el; };
      const close = async () => { await ep.evaluate(() => { const x = [...document.querySelectorAll('[data-ep-close]')].filter((b) => b.offsetWidth).pop(); if (x) x.click(); }); await sleep(450); };
      await look('caisse');
      await tap('.ep-card:not(.is-out)');
      if (await tap('#ep-pay')) { await look('pay'); await tap('[data-ep-m="ardoise"]'); await look('pay-tab'); await close(); await close(); }
      for (const v of await ep.$$eval('.ep-rail [data-ep-view]', (bs) => bs.map((b) => b.dataset.epView))) {
        await tap(`.ep-rail [data-ep-view="${v}"]`);
        await look(v);
        if (v === 'carnet' && await tap('[data-ep-ard]')) { await look('tab'); if (await tap('#ep-ard-settle')) { await look('settle'); await close(); } await close(); }
      }
    } else {
      report[lang]['epicerie:boot'] = { ui: ['(the demo épicerie till did not boot)'], names: [], data: [] };
    }
    await ectx.close();
  }
} finally {
  await browser.close();
  server.close();
}

const dir = path.join(root, '.kiwi/results/french-leak');
fs.mkdirSync(dir, { recursive: true });
for (const lang of Object.keys(report)) {
  fs.writeFileSync(path.join(dir, lang + '.json'), JSON.stringify(report[lang], null, 2));
  const pages = Object.entries(report[lang]);
  const ui = pages.reduce((s, [, v]) => s + v.ui.length, 0);
  const data = pages.reduce((s, [, v]) => s + v.data.length, 0);
  const names = pages.reduce((s, [, v]) => s + v.names.length, 0);
  console.log(`\n■ ${lang.toUpperCase()} · ${ui} French UI string(s), ${names} accented name(s), ${data} in data, over ${pages.length} page(s)`);
  for (const [nav, v] of pages.sort((a, b) => b[1].ui.length - a[1].ui.length)) {
    if (!v.ui.length) continue;
    console.log(`  ${nav} · ${v.ui.length}: ${v.ui.slice(0, 6).map((s) => '« ' + s + ' »').join(' · ')}`);
  }
}
console.log('\nreports in .kiwi/results/french-leak/');

if (!process.argv.includes('--report')) {
  const file = path.join(root, 'tools/french-leak-baseline.json');
  const counts = Object.fromEntries(Object.entries(report).map(([l, pages]) => [l, Object.values(pages).reduce((s, v) => s + v.ui.length, 0)]));
  if (process.env.KIWI_UPDATE_FRENCH_BASELINE === '1') {
    fs.writeFileSync(file, JSON.stringify(counts, null, 2) + '\n');
    console.log('  baseline written', JSON.stringify(counts));
    process.exit(0);
  }
  const base = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  let red = 0;
  for (const [l, n] of Object.entries(counts)) {
    const b = base[l];
    if (b == null) { console.log(`  ✗ ${l}: no baseline (KIWI_UPDATE_FRENCH_BASELINE=1 to write one)`); red++; }
    else if (n > b) { console.log(`  ✗ ${l}: ${n} French UI string(s) on screen, baseline ${b}`); red++; }
    else if (n < b) console.log(`  ✓ ${l}: ${n}, below the baseline ${b} · lower it with KIWI_UPDATE_FRENCH_BASELINE=1`);
    else console.log(`  ✓ ${l}: ${n} French UI string(s), at the baseline`);
  }
  console.log(red ? `\n✗ french-leak-browser-test · ${red} language(s) above baseline` : '\n✓ french-leak-browser-test green');
  process.exit(red ? 1 : 0);
}
