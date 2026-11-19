#!/usr/bin/env node
/* L'argent des livraisons n'est pas une vente du magasin (Santos, 19 nov. 2026).
 *
 * Le 18 novembre, l'écran de clôture de Santos annonçait 13 598 MAD « hors
 * livraisons » pour 13 098 réellement vendus au comptoir : un encaissement de
 * livreur (« Livraison reçue · … », 500 MAD en virement, écrit par
 * /api/receivables) était relu par la caisse comme une vente, et comptait
 * dans le total, sous « Autres », avec une transaction et ses articles.
 *
 * Trois chiffres, jamais mélangés (propriétaire) :
 *   1. les ventes du magasin (espèces + carte) ;
 *   2. les colis partis, à recevoir ;
 *   3. l'argent des livreurs reçu ce jour-là, à part.
 * Les espèces d'un livreur reçues AU COMPTOIR restent dans le tiroir attendu :
 * elles y sont physiquement. Un encaissement fait ailleurs (autre caisse,
 * virement) n'y entre pas.
 *
 * Vraie caisse boutique dans Chromium (tools/retail-ui-fixture.mjs), journée
 * semée dans son journal local, vrais clics. Puis les helpers de z-split.js
 * seuls, pour la relecture du serveur.
 *   node tools/z-delivery-collections-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; console.log('  ✓ ' + m); };

/* ── 1. La relecture du serveur reconnaît un encaissement de livreur ── */
{
  const src = fs.readFileSync(path.join(ROOT, 'assets/pos-boutique/z-split.js'), 'utf8').replace(/^export \{[^}]*\};?\s*$/m, '');
  const ctx = vm.createContext({ window: {} });
  ctx.globalThis = ctx;
  vm.runInContext(src + ';globalThis.Z = { zRowKind, zIsCollection };', ctx);
  const Z = ctx.Z;
  ok(typeof Z.zRowKind === 'function', 'z-split exposes zRowKind');
  ok(Z.zRowKind({ channel: 'delivery', label: 'Livraison reçue · Robe lin' }) === 'livraison-reglement', 'a courier collection row is tagged as such');
  ok(Z.zRowKind({ channel: 'delivery', label: 'Robe lin' }) === 'vente', 'the delivery sale itself stays a sale');
  ok(Z.zRowKind({ channel: 'counter', label: 'Livraison reçue · x' }) === 'vente', 'only the delivery channel counts');
  ok(Z.zIsCollection({ kind: 'livraison-reglement' }) && !Z.zIsCollection({ kind: 'vente' }), 'zIsCollection reads the kind');
}

/* ── 2. L'écran de clôture et le Z imprimé, dans la vraie caisse ── */
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] })); } catch (_) {}
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(fs.existsSync);
if (!puppeteer || !executablePath) { console.error('Chromium unavailable'); process.exit(3); }

const fixture = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const base = await new Promise((resolve, reject) => {
    let out = '', err = '';
    const timer = setTimeout(() => reject(Error('fixture startup: ' + err)), 15000);
    fixture.stdout.on('data', (c) => { out += c; const m = out.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/); if (m) { clearTimeout(timer); resolve(JSON.parse(m[1]).base); } });
    fixture.stderr.on('data', (c) => { err += c; });
    fixture.once('exit', (c) => { clearTimeout(timer); reject(Error('fixture exited ' + c + ': ' + err)); });
  });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const s = suite('z-delivery-collections', { browser });
  await s.run('close screen keeps courier money apart', async (t) => {
    const page = t.watch(await browser.newPage());
    await page.setViewport({ width: 1280, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      if (req.url() === base + '/boutique.html') {
        const html = await (await fetch(req.url())).text();
        /* Une session réelle synthétique : le journal local est relu, comme en boutique. Tout reste en boucle locale. */
        await req.respond({ status: 200, contentType: 'text/html', body: html.replace('isReal:()=>false', 'isReal:()=>true') });
      } else await (req.url().startsWith(base + '/') || req.url().startsWith('data:') ? req.continue() : req.abort());
    });
    await page.evaluateOnNewDocument(() => {
      window.__z = [];
      window.KiwiPrinter = { printDayReport: (o) => { window.__z.push(o); return Promise.resolve({ ok: true }); } };
    });
    await page.goto(base + '/boutique.html', { waitUntil: 'load' });
    await page.evaluate(() => {
      const now = Date.now(), at = (min) => new Date(now - min * 60000).toISOString();
      const line = (unit) => [{ pid: 'p-fixture', size: 'M', color: '', qty: 1, unit, remise: 0, returned: false, note: '' }];
      localStorage.setItem('kiwi:bqDay', JSON.stringify({ v: 1, s: [
        { id: 'BQ-901', at: at(50), by: 'Sara', kind: 'vente', methods: 'espèces', parts: [{ m: 'espèces', amount: 300 }], lines: line(300), total: 300 },
        { id: 'BQ-902', at: at(40), by: 'Sara', kind: 'vente', methods: 'carte', parts: [{ m: 'carte', amount: 200 }], lines: line(200), total: 200 },
        { id: 'BQ-903', at: at(30), by: 'Sara', kind: 'vente', methods: 'livraison', parts: [{ m: 'livraison', amount: 450 }], lines: line(450), total: 450 },
        /* Le livreur rapporte 150 MAD en espèces au comptoir (recordDeliveryCash). */
        { id: 'BQ-880-L1', syncId: 'col-a', serverId: 'col-a', at: at(20), by: 'Sara', kind: 'livraison-reglement', deliveryOf: 'BQ-880', methods: 'espèces', parts: [{ m: 'espèces', amount: 150 }], lines: [], total: 150 },
        /* Le cas Santos : 500 MAD encaissés ailleurs, relus du serveur avec le panier. */
        { id: 'BQ-870', serverId: 'col-b', at: at(10), by: 'Caisse', kind: 'livraison-reglement', remote: true, methods: 'virement', received: 500, lines: line(500), total: 500 },
      ] }));
      localStorage.setItem('kiwi:bqShift', JSON.stringify({ openedAt: now - 3 * 3600000, openedBy: 'Sara', float: 100, sid: 'fixture-shift', openSent: true }));
    });
    await page.reload({ waitUntil: 'load' });
    /* Le fixture n'a pas la feuille de la clôture : sans elle, l'écran se pose dans le flux, sous d'autres boutons. */
    await page.addStyleTag({ url: base + '/assets/caisse-shell.css' });
    await page.waitForSelector('#bq-close-day', { visible: true, timeout: 8000 });
    await page.click('#bq-close-day');
    await page.waitForSelector('#bq-cloture.is-open', { visible: true, timeout: 8000 });
    const screen = await page.$eval('#bq-cloture', (v) => ({
      rows: [...v.querySelectorAll('.clo-row')].map((r) => [r.querySelector('.clo-row-label').textContent.trim(), r.querySelector('.clo-row-value').textContent.trim()]),
      drawer: [...v.querySelectorAll('.clo-drawer-line')].map((r) => [...r.children].map((c) => c.textContent.trim())),
    }));
    const val = (label, after) => { const i = after ? screen.rows.findIndex((r) => r[0] === after) : 0; const r = screen.rows.slice(i).find((x) => x[0] === label); return r ? r[1].replace(/\s/g, ' ') : null; };
    const num = (s) => s == null ? null : +String(s).replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.');
    ok(val('Transactions') === '2', 'the till counts its 2 sales, not the collections (' + val('Transactions') + ')');
    ok(num(val('Total encaissé')) === 500, 'till total is 300 cash + 200 card = 500 (' + val('Total encaissé') + ')');
    ok(num(val('dont Espèces')) === 300, 'till cash is the 300 sold at the counter');
    ok(!screen.rows.some((r) => r[0] === 'dont Autres'), 'no « Autres » line from a courier transfer');
    ok(!screen.rows.some((r) => r[0] === 'dont Virement / Versement'), 'the courier transfer is not a till transfer either');
    ok(val('Articles vendus') === '2', 'articles are the counter’s 2 pieces');
    ok(val('Ventes en livraison', 'Livraisons') === '1', 'one delivery sale, the collections are not deliveries sold');
    ok(num(val('Montant à recevoir', 'Livraisons')) === 450, 'still 450 to collect');
    ok(num(val('Argent des livraisons reçu', 'Livraisons')) === 650, 'courier money received today: 150 + 500 = 650, in the Livraisons block');
    const drawer = Object.fromEntries(screen.drawer.map(([a, b]) => [a, b]));
    ok(num(drawer['Espèces des livraisons']) === 150, 'the 150 cash a courier left at the counter is in the drawer');
    ok(num(drawer['Attendu en caisse']) === 550, 'expected cash = 100 float + 300 sales + 150 courier cash = 550 (' + drawer['Attendu en caisse'] + ')');

    await page.$eval('#bqclo-print', (b) => b.scrollIntoView({ block: 'center' }));
    await new Promise((r) => setTimeout(r, 1200));   /* les lignes de l'écran entrent en cascade : cliquer une fois posé */
    await page.click('#bqclo-print');
    await page.waitForFunction(() => window.__z.length >= 2, { timeout: 8000 });
    const z = await page.evaluate(() => window.__z.map((o) => ({ title: o.title, net: o.report.net, txns: o.report.txns, expected: o.report.cash && o.report.cash.expected, receivable: o.report.receivable })));
    const store = z[0], delivery = z[1];
    ok(store.net === 500 && store.txns === 2, 'printed store Z: 500 over 2 tickets (' + JSON.stringify(store) + ')');
    ok(store.expected === 550, 'printed store Z drawer expects 550, the courier cash entering as a drawer movement');
    ok(delivery.net === 450 && delivery.txns === 1 && delivery.receivable === 450, 'printed delivery Z keeps its meaning: the one parcel sent, 450 to collect (' + JSON.stringify(delivery) + ')');
  });
  console.log(`z-delivery-collections: ${checks} assertions`);
  process.exitCode = await s.finish({ exit: false });
} finally { if (browser) await browser.close(); fixture.kill(); }
