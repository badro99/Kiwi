#!/usr/bin/env node
/* Charges fixes · l'éditeur et la page Marges, dans le vrai dashboard.html.
 *
 * Le calcul est tenu au centime par tools/charges-test.js. Ici on prouve ce
 * que le commerçant fait et voit, avec de vrais clics :
 *   · sans charges, Marges dit « Résultat matière » et propose de les
 *     renseigner, sans aucun chiffre inventé ;
 *   · l'éditeur ajoute un loyer, une électricité et une assurance annuelle,
 *     règle les charges sociales et la commission carte, et enregistre ;
 *   · Marges dit alors le résultat de la période, chaque retenue à sa ligne,
 *     et un résultat net égal au calcul ;
 *   · retirer une charge n'efface pas les mois où elle a pesé ;
 *   · un montant faux n'est pas enregistré : l'erreur est dite au champ ;
 *   · en arabe la page se lit de droite à gauche, et au téléphone rien ne
 *     déborde.
 * La page est mise en session réelle sur un établissement de banc (une carte,
 * des ventes, des coûts gelés à la vente) : la démo Café Atlas garde ses
 * panneaux, ce n'est pas elle qu'on teste. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const E = require(path.join(root, 'assets/charges-engine.js'));
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');
const shots = process.env.KIWI_SHOTS || '';

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function open({ lang = 'fr', width = 1366 } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('dialog', async (d) => { problems.push('dialog: ' + d.message()); await d.dismiss(); });
  await page.setViewport({ width, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    if (u.startsWith(base) || u.startsWith('data:')) return r.continue();
    return r.abort();
  });
  await page.evaluateOnNewDocument((lang) => {
    try { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
    try { localStorage.setItem('kiwiLang', lang); } catch (_) {}
  }, lang);
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.readyState === 'complete' && window.KiwiCharges && window.KiwiFinance && window.Kiwi && window.Kiwi.handlers['nav-finance'], { timeout: 20000 });
  await sleep(1500);
  const explore = await page.$('.kob-root [data-explore]');
  if (explore) { await explore.click(); await sleep(900); }
  const skip = await page.$('[data-kiwi-skip]');
  if (skip) { await skip.click(); await sleep(600); }
  /* Un établissement de banc en session réelle : 60 ventes sur 7 jours, deux
   * plats sur trois chiffrés à la vente, un ticket sur dix venu de Glovo. */
  await page.evaluate(() => {
    const items = [{ id: 'm1', name: 'Tajine poulet citron', price: 85 }, { id: 'm2', name: 'Thé à la menthe', price: 18 }, { id: 'm3', name: 'Pastilla', price: 120 }];
    window.KiwiMenuStore.items = () => items;
    const now = Date.now(), sales = [];
    for (let i = 0; i < 60; i++) {
      const k = i % 3, q = 1 + (i % 2), price = items[k].price;
      sales.push({ id: 'bench-' + i, ts: now - (i * 2.6 + 1) * 3600e3, amount: price * q, method: i % 4 === 0 ? 'cash' : 'card', channel: i % 10 === 0 ? 'glovo' : '',
        lines: [{ itemId: items[k].id, name: items[k].name, qty: q, unitPrice: price, total: price * q, unitCost: [30, 4, i % 2 ? 0 : 45][k] }] });
    }
    window.__bench = sales;
    window.KiwiSales.list = () => sales;
    const W = window.KiwiRestaurantMenuWorkspace; if (W) W.isRestaurant = () => false;
    window.KiwiEnv.isReal = () => true;
    window.Kiwi.handlers['nav-finance']();
  });
  await page.waitForSelector('[data-finance-root] .fin-real', { visible: true, timeout: 10000 });
  return { ctx, page, problems };
}
/* textContent, not innerText: the eyebrows are uppercased by CSS */
const text = (page) => page.$eval('[data-finance-root]', (e) => e.textContent.replace(/\s+/g, ' '));
async function openEditor(page, how) {
  await page.click(how || '[data-charges-card] [data-action="charges-open"]');
  await page.waitForSelector('[data-charges-editor]', { visible: true, timeout: 5000 });
  await page.waitForFunction(() => { const d = document.querySelector('.kiwi-drawer'); if (!d) return false; const r = d.getBoundingClientRect(); const ok = window.__chgLast === r.left; window.__chgLast = r.left; return ok; }, { polling: 150, timeout: 5000 });
}
async function typeIn(page, rowIndex, field, value) {
  const rows = await page.$$('[data-charges-editor] [data-row]');
  const el = await rows[rowIndex].$(`[data-c="${field}"]`);
  await el.click({ clickCount: 3 });
  await el.type(value);
}

try {
  /* 1 · rien de saisi, puis la saisie, puis le résultat */
  {
    const { ctx, page, problems } = await open();
    const before = await text(page);
    check(/Résultat matière/.test(before) && !/Résultat net|Seuil de rentabilité/.test(before), 'without costs, Marges says « Résultat matière » and no net result, no break-even');
    check(/Votre vrai résultat commence ici/.test(before) && await page.$('[data-charges-card] [data-action="charges-open"]'), 'the « Charges fixes » card invites to enter them');

    await openEditor(page);
    await page.click('[data-chg="add"][data-cat="rent"]');
    await typeIn(page, 0, 'amount', '9000');
    await page.click('[data-chg="add"][data-cat="utilities"]');
    await typeIn(page, 1, 'amount', '1200');
    await page.click('[data-chg="add"][data-cat="insurance"]');
    await typeIn(page, 2, 'amount', '6000');
    const freq = await page.$$eval('[data-charges-editor] [data-row] select[data-c="freq"]', (s) => s.map((x) => x.value));
    check(freq.join() === 'month,month,year', `rent and electricity default to monthly, insurance to yearly (${freq.join(', ')})`);
    await page.type('[data-social]', '21');
    const rates = await page.$$eval('[data-rate]', (r) => r.map((x) => `${x.getAttribute('data-rate')}:${x.getAttribute('data-key')}`));
    check(rates.includes('methods:card') && rates.includes('channels:glovo') && !rates.includes('methods:cash'), `only the methods and channels seen in the sales are offered (${rates.join(', ')})`);
    const cap = await page.evaluate(() => { const n = document.querySelector('[data-chg-cap]'); const card = document.querySelector('[data-rate="methods"][data-key="card"]'); return { text: n && n.textContent, empty: card && card.value === '' }; });
    check(/0,50 % HT/.test(cap.text || '') && /0,15 %/.test(cap.text || '') && /relevé/.test(cap.text || '') && cap.empty, 'the card rate shows the Bank Al-Maghrib cap as a reference, never as a pre-filled rate');
    await page.type('[data-rate="methods"][data-key="card"]', '1,5');
    await page.type('[data-rate="channels"][data-key="glovo"]', '25');

    /* a wrong amount is refused at the field, nothing is saved */
    await typeIn(page, 1, 'amount', 'abc');
    await page.click('[data-chg="save"]');
    await sleep(300);
    const err = await page.evaluate(() => ({ open: !!document.querySelector('[data-charges-editor]'), msg: (document.querySelector('[data-row]:nth-child(2) [data-err]') || {}).textContent, invalid: document.activeElement && document.activeElement.getAttribute('aria-invalid'), saved: window.KiwiCharges.doc().lines.length }));
    check(err.open && /montant positif/i.test(err.msg || '') && err.invalid === 'true' && err.saved === 0, 'a wrong amount keeps the drawer open, says why at the field, focuses it, saves nothing');
    await typeIn(page, 1, 'amount', '1200');
    await page.click('[data-chg="save"]');
    await page.waitForFunction(() => !document.querySelector('[data-charges-editor]'), { timeout: 5000 });
    await sleep(600);

    const doc = await page.evaluate(() => window.KiwiCharges.doc());
    check(doc.lines.length === 3 && doc.social.rate === 21 && doc.commissions.methods.card === 1.5 && doc.commissions.channels.glovo === 25, 'saved: three lines, 21 % social charges, card 1,5 %, Glovo 25 %');
    const first = new Date(Math.min(...(await page.evaluate(() => window.__bench.map((s) => s.ts)))));
    const firstMonth = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
    check(doc.lines.every((l) => l.versions[0].from === firstMonth), `a new cost counts from the first sale Kiwi knows (${firstMonth}), not from the day it was typed`);

    const after = await text(page);
    check(/Résultat de la période/.test(after) && /− Commissions/.test(after) && /− Charges fixes · 7 jours/.test(after) && /= Résultat net/.test(after), 'Marges now says the result for the period, each deduction on its own line');
    const shown = await page.$eval('[data-net]', (e) => +e.getAttribute('data-net'));
    const expected = await page.evaluate(() => {
      const L = window.KiwiCost.ledger(window.__bench, { from: window.KiwiDateRange.bounds('septJours')[0], to: window.KiwiDateRange.bounds('septJours')[1] });
      return window.KiwiCharges.result({ range: 'septJours', cov: window.KiwiCost.summarize(L), ledger: L }).net;
    });
    check(shown === expected && Number.isFinite(shown), `the net result on screen is the engine's (${shown} MAD)`);
    check(/À couvrir chaque mois/.test(after) && /Assurance\s*500 MAD/.test(after.replace(/ | /g, ' ')), 'the card shows each cost per month: a 6 000 MAD yearly insurance is 500 MAD a month');
    const need = await page.$eval('[data-charges-breakeven]', (e) => e.getAttribute('data-need'));
    check(need && +need > 0 && /Seuil de rentabilité/.test(after), `the break-even card gives the month's sales to reach (${Math.round(+need)} MAD)`);
    check(!/[—]/.test(after) && !/NaN|undefined|Infinity/.test(after), 'no em dash, no NaN, no undefined on the page');
    const italic = await page.evaluate(() => [...document.querySelectorAll('[data-finance-root] *')].some((x) => getComputedStyle(x).fontStyle === 'italic'));
    check(!italic, 'nothing on the page is italic');
    if (shots) await page.screenshot({ path: path.join(shots, 'charges-marges-fr.png'), fullPage: true });

    /* Kiwi IQ répond avec les mêmes chiffres que la page */
    const digits = (x) => String(x).replace(/\D/g, '');
    const cardNeed = await page.$eval('[data-charges-breakeven] .chg-be-v', (e) => e.textContent);
    /* the reply that carries `marker` (the conversation may re-render) */
    const askIQ = async (q, marker) => {
      await page.evaluate((q) => { window.KiwiAgent.syncProfile(); window.KiwiAgent.ask(q); }, q);
      const find = (m) => { const s = [...document.querySelectorAll('.fa-stats')].map((x) => x.parentElement.textContent.replace(/\s+/g, ' ')).filter((t) => t.includes(m)); return s.length ? s[s.length - 1] : ''; };
      await page.waitForFunction(find, { timeout: 8000 }, marker);
      return page.evaluate(find, marker);
    };
    const be = await askIQ('Quel est mon seuil de rentabilité ?', 'Seuil · ventes du mois');
    check(be.includes('Seuil · ventes du mois') && digits(be).includes(digits(cardNeed)) && !/Réglages/.test(be), `Kiwi IQ gives the same break-even as the Marges card (${cardNeed.trim()})`);
    const ch = await askIQ('Décompose mes charges', 'premier poste');
    check(/Loyer/.test(ch) && /Assurance/.test(ch) && /premier poste/.test(ch), 'Kiwi IQ breaks the costs down from what was entered, rent first');
    await page.evaluate(() => { document.querySelectorAll('.kiwi-drawer-backdrop, .fa-backdrop').forEach((b) => (b.__kiwiClose ? b.__kiwiClose() : null)); });
    await page.keyboard.press('Escape');
    await sleep(500);

    /* 2 · retirer : par défaut à partir du mois prochain (ce mois-ci a été
     *     payé) ; le premier mois choisi, une ligne saisie par erreur disparaît */
    const cur = await page.evaluate(() => window.KiwiCharges.today().slice(0, 7));
    const next = E.days.monthOf(E.days.addDays(`${cur}-28`, 7));
    await openEditor(page);
    let rows = await page.$$('[data-charges-editor] [data-row]');
    await (await rows[1].$('[data-chg="remove"]')).click();
    await sleep(200);
    const goneRow = await page.evaluate(() => { const g = document.querySelector('[data-row].gone'); return g && { from: g.querySelector('[data-c="from"]').value, undo: !!g.querySelector('[data-chg="undo"]'), text: g.textContent.replace(/\s+/g, ' ') }; });
    check(goneRow && goneRow.undo && goneRow.from === next && /Les mois d’avant la gardent/.test(goneRow.text), `removing a cost defaults to next month (${goneRow && goneRow.from}), says earlier months keep it, and can be undone`);
    rows = await page.$$('[data-charges-editor] [data-row]');
    await (await rows[2].$('[data-chg="remove"]')).click();
    await sleep(200);
    const firstOf = await page.evaluate(() => window.KiwiCharges.doc().lines.find((l) => l.label === 'Assurance').versions[0].from);
    await page.select('[data-row].gone:nth-of-type(3) [data-c="from"], [data-charges-editor] [data-row]:nth-child(3) [data-c="from"]', firstOf);
    await page.click('[data-chg="save"]');
    await page.waitForFunction(() => !document.querySelector('[data-charges-editor]'), { timeout: 5000 });
    const docAfter = await page.evaluate(() => window.KiwiCharges.doc());
    const elec = docAfter.lines.find((x) => x.label === 'Électricité et eau');
    check(elec && !elec.deleted && elec.until === cur && E.monthlyOf(elec, cur) === 1200 && E.monthlyOf(elec, next) === 0, `electricity removed from ${next}: ${cur} still carries it, ${next} does not`);
    const ins = docAfter.lines.find((x) => x.id && x.deleted);
    check(ins && E.monthlyTotal(docAfter, cur) === 9000 + 1200, 'insurance removed from its very first month disappears entirely (kept only as a removal marker for other devices)');
    check(problems.length === 0, `no page error (${problems.join(' | ')})`);
    await ctx.close();
  }

  /* 3 · arabe, de droite à gauche */
  {
    const { ctx, page, problems } = await open({ lang: 'ar' });
    await page.evaluate(() => window.KiwiCharges.store.set({ v: 1, lines: [{ id: 'r', label: 'الإيجار', cat: 'rent', freq: 'month', versions: [{ from: '2020-01', amount: 9000 }], until: null, updatedAt: 1 }], social: { rate: 21 }, commissions: { methods: { card: 1.5 }, channels: {} }, updatedAt: 1 }));
    await sleep(800);
    const t = await text(page);
    check(/نتيجة الفترة/.test(t) && /النتيجة الصافية/.test(t) && /المصاريف الثابتة/.test(t) && /عتبة المردودية/.test(t), 'Arabic: result, net result, fixed costs and break-even are all translated');
    const dir = await page.evaluate(() => getComputedStyle(document.querySelector('[data-charges-card]')).direction);
    check(dir === 'rtl', 'Arabic: the cards read right to left');
    await openEditor(page);
    const ed = await page.$eval('[data-charges-editor]', (e) => e.textContent);
    check(/المصاريف الثابتة/.test(ed) && /التحملات الاجتماعية/.test(ed) && /العمولات/.test(ed) && !/[a-zA-Z]{4,}/.test(ed.replace(/MAD|Kiwi|Glovo/g, '')), 'Arabic: the editor has no French or English left');
    if (shots) await page.screenshot({ path: path.join(shots, 'charges-editor-ar.png') });
    check(problems.length === 0, `no page error in Arabic (${problems.join(' | ')})`);
    await ctx.close();
  }

  /* 4 · au téléphone */
  {
    const { ctx, page, problems } = await open({ width: 390 });
    await page.evaluate(() => window.KiwiCharges.store.set({ v: 1, lines: [{ id: 'r', label: 'Loyer', cat: 'rent', freq: 'month', versions: [{ from: '2020-01', amount: 9000 }], until: null, updatedAt: 1 }], social: { rate: null }, commissions: { methods: {}, channels: {} }, updatedAt: 1 }));
    await sleep(800);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(over <= 1, `phone: the Marges page does not scroll sideways (${over} px)`);
    await openEditor(page);
    const fit = await page.evaluate(() => {
      const d = document.querySelector('.kiwi-drawer').getBoundingClientRect();
      const bad = [...document.querySelectorAll('[data-charges-editor] input, [data-charges-editor] .kiwi-select-trigger, [data-charges-editor] .chg-x')].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && (r.right > d.right + 1 || r.left < d.left - 1); }).length;
      const small = [...document.querySelectorAll('[data-charges-editor] .chg-x, [data-charges-editor] input')].filter((x) => x.getBoundingClientRect().height < 36).length;
      return { bad, small };
    });
    check(fit.bad === 0 && fit.small === 0, `phone: every field of the editor fits the drawer and is at least 36 px tall (${fit.bad} out, ${fit.small} too small)`);
    if (shots) await page.screenshot({ path: path.join(shots, 'charges-editor-phone.png') });
    check(problems.length === 0, `no page error on the phone (${problems.join(' | ')})`);
    await ctx.close();
  }
  console.log(`\ncharges-browser-test: ${checks} passed`);
} finally {
  await browser.close();
  server.close();
}
