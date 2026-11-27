#!/usr/bin/env node
/* Jon's Burgers requests (26 Nov 2026) · in a real Chromium, French, demo data only.
 *   node tools/jon-requests-browser-test.mjs
 *
 * A counter restaurant (order, pay, wait) asked for ten changes. Held here
 * with real clicks on the shipped pages, behind a static server with no /api,
 * so nothing reaches a merchant:
 *   · Paramètres › Caisse & Reçu › « Commande au comptoir » and « Remises
 *     nommées » save what the owner ticks and types;
 *   · the classic till: no « Envoyer en cuisine » at the counter, a comment
 *     for the kitchen, only the named discount, « Sur place ou à emporter ? »
 *     asked at payment, and the order lands « En préparation » with its
 *     comment and service on the kitchen screen and the kitchen ticket
 *     (options and comment double height);
 *   · the 2027 till (Jon's): the bill's comment row and the discount sheet
 *     offering only the named discounts;
 *   · Menu & modificateurs: a group moves up and every dish follows, a choice
 *     moves up or down in the group editor, and « Réordonner les options »
 *     moves a group (dish and tabs follow) and a group's choices;
 *   · Livraison: the price grid lists the products, a typed price is saved.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname.startsWith('/api/') || pathname === '/kiwi-sw.js') { res.writeHead(404); res.end(); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('jon-requests', { browser });
const check = (yes, msg, detail) => { assert.ok(yes, msg + (detail ? ' · ' + detail : '')); console.log('  ✓ ' + msg); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* The demo till has no merchant: point its store at a test one, so the
   owner's documents (counter flow, named discounts) have somewhere to live.
   (Pairing for real would swap the demo menu for a server one.) */
const MERCHANT = 'test-burgers';

async function open(tr, url) {
  const ctx = await browser.createBrowserContext();
  tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  await page.setViewport({ width: 1366, height: 900 });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  tr.step('open ' + url);
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  // coverage: surface=dashboard locale=fr viewport=desktop
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  return { page, errors };
}

/* The settings page repaints once more after it opens; a tap that lands on
   the outgoing copy does nothing. Tap again, as a person would. */
async function tapUntil(page, sel, until) {
  for (let i = 0; i < 10; i++) {
    await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })).catch(() => {});
    await page.click(sel).catch(() => {});
    if (await page.waitForSelector(until, { visible: true, timeout: 1500 }).then(() => true, () => false)) return;
  }
  throw new Error('never opened: ' + until);
}
async function clockIn(page) {
  await page.waitForSelector('.ci-float-chip', { visible: true, timeout: 30000 });
  for (let i = 0; i < 20; i++) {
    await page.click('.ci-float-chip').catch(() => {});
    const armed = await page.waitForFunction(() => { const b = document.getElementById('clockin-btn'); return !!b && !b.disabled; }, { timeout: 1000 }).then(() => true, () => false);
    if (armed) break;
  }
  for (let i = 0; i < 20; i++) {
    await page.click('#clockin-btn').catch(() => {});
    const gone = await page.waitForFunction(() => { const b = document.getElementById('clockin-btn'); return !b || !b.offsetParent; }, { timeout: 1000 }).then(() => true, () => false);
    if (gone) break;
  }
}
/* The owner's two settings, as the dashboard writes them. */
const ownerSettings = () => page => page.evaluate(async (m) => {
  window.KiwiStore.currentVenue = () => m;
  await window.KiwiCounterFlow.save({ direct: true, payToKitchen: true, typeAtPay: true });
  await window.KiwiDiscountPolicy.save(window.KiwiDiscountPolicy.percentages(), undefined, [{ name: 'Personnel', pct: 20 }]);
}, MERCHANT);

try {
  await S.run('dashboard · Caisse & Reçu saves « Commande au comptoir » and « Remises nommées »', async (tr) => {
    const { page, errors } = await open(tr, '/dashboard.html');
    await page.waitForSelector('[data-explore]', { visible: true, timeout: 30000 });
    await page.click('[data-explore]');
    await page.waitForSelector('[data-kiwi-skip]', { visible: true });
    await page.click('[data-kiwi-skip]');
    await page.waitForFunction(() => window.KiwiVenue?.getVenueType?.() === 'restaurant' && !!window.KiwiCounterFlow && !!window.KiwiDiscountPolicy?.presets, { timeout: 30000 });
    tr.step('Paramètres › Commande au comptoir');
    /* The demo dashboard sits behind its code screen; Paramètres opens
       through its own handler, every tap after that is a real click. */
    await page.evaluate(() => window.Kiwi.handlers.settings());
    await page.waitForSelector('[data-action="settings-counter-flow"]', { visible: true, timeout: 20000 });
    check(true, 'the restaurant sees « Commande au comptoir » in Caisse & Reçu');
    await tapUntil(page, '[data-action="settings-counter-flow"]', '[data-tps-flow="typeAtPay"]');
    const before = await page.$$eval('[data-tps-flow]', (els) => els.map((e) => e.checked));
    check(before.every((v) => v === false), 'the three switches start off: a pay-later restaurant keeps its till');
    for (const k of ['payToKitchen', 'typeAtPay', 'direct']) await page.click(`[data-tps-flow="${k}"]`);
    await page.click('[data-tps-save]');
    await page.waitForFunction(() => { const f = window.KiwiCounterFlow.get(); return f.direct && f.payToKitchen && f.typeAtPay; }, { timeout: 10000 });
    check(true, 'ticking the three and « Enregistrer » saves them');
    await page.waitForFunction(() => /Cuisine directe/.test(document.querySelector('[data-action="settings-counter-flow"]')?.textContent || ''), { timeout: 10000 });
    await wait(400);
    check(true, 'the Caisse & Reçu row now sums up the three settings');

    tr.step('Paramètres › Remises nommées');
    await page.waitForSelector('[data-action="settings-discount-presets"]', { visible: true, timeout: 20000 });
    await tapUntil(page, '[data-action="settings-discount-presets"]', '[data-tps-name]');
    await page.type('[data-tps-row]:last-child [data-tps-name]', 'Étudiant');
    await page.type('[data-tps-row]:last-child [data-tps-pct]', '10');
    await page.click('[data-tps-add]');
    await page.type('[data-tps-row]:last-child [data-tps-name]', 'Personnel');
    await page.type('[data-tps-row]:last-child [data-tps-pct]', '150');
    await page.click('[data-tps-save]');
    await page.waitForFunction(() => /1 à 100/.test(document.querySelector('[data-tps-presets] [data-tps-err]')?.textContent || ''));
    check(true, 'a percentage above 100 is refused with a sentence');
    await page.click('[data-tps-row]:last-child [data-tps-pct]', { clickCount: 3 });
    await page.type('[data-tps-row]:last-child [data-tps-pct]', '20');
    await page.click('[data-tps-save]');
    await page.waitForFunction(() => window.KiwiDiscountPolicy.presets().length === 2, { timeout: 10000 });
    const saved = await page.evaluate(() => ({ presets: window.KiwiDiscountPolicy.presets(), pcts: window.KiwiDiscountPolicy.percentages() }));
    check(JSON.stringify(saved.presets) === JSON.stringify([{ name: 'Étudiant', pct: 10 }, { name: 'Personnel', pct: 20 }]), 'the two named discounts are saved in order', JSON.stringify(saved));
    check(JSON.stringify(saved.pcts) === '[10,20]', 'their percentages become the only ones a till accepts', JSON.stringify(saved.pcts));
    check(errors.length === 0, 'no script error on the dashboard', errors.join(' | '));
  });

  await S.run('classic till · counter: comment, named discount, eat-in or takeaway at payment, kitchen starts at once', async (tr) => {
    const { page, errors } = await open(tr, '/kiwi-caisse.html?demo=restaurant');
    await clockIn(page);
    await page.waitForFunction(() => typeof renderCart === 'function' && Array.isArray(menuItems) && menuItems.length > 0 && !!window.KiwiCounterFlow, { timeout: 20000 });
    await ownerSettings()(page);
    tr.step('À emporter, then a real tap on a dish without options');
    await page.click('.mode-pill[data-mode="vrap"]');
    const dish = await page.evaluate(() => { currentOrder().replaceCart([]); renderCart(); const d = menuItems.find((m) => !(m.opts && m.opts.length) && !m.formula && m.price > 0 && m.cat); return { id: d.id, cat: d.cat, price: d.price, name: d.name }; });
    await page.waitForSelector(`.cat-pill[data-cat="${dish.cat}"]`, { visible: true, timeout: 20000 });
    await page.click(`.cat-pill[data-cat="${dish.cat}"]`);
    await page.waitForSelector(`.menu-item[data-menu-id="${dish.id}"]`, { visible: true });
    await page.click(`.menu-item[data-menu-id="${dish.id}"]`);
    await page.waitForFunction(() => cart.length === 1);
    check(await page.$eval('#rp-send-kitchen', (b) => !b.offsetParent), 'no « Envoyer en cuisine » at the counter: paying sends');

    tr.step('comment for the kitchen');
    await page.waitForSelector('#rp-comment [data-cf-edit]', { visible: true });
    check(/Ajouter un commentaire/.test(await page.$eval('#rp-comment [data-cf-edit]', (e) => e.textContent)), 'the bill offers « Ajouter un commentaire »');
    await page.click('#rp-comment [data-cf-edit]');
    await page.waitForSelector('.cf-veil .cf-text', { visible: true });
    await page.type('.cf-veil .cf-text', 'Sans gluten, allergie arachides');
    await page.click('.cf-veil [data-cf="ok"]');
    await page.waitForFunction(() => /Sans gluten/.test(document.querySelector('#rp-comment [data-cf-text]')?.textContent || ''));
    check(true, 'the comment shows under the bill lines');

    tr.step('Réduction: only the named discount');
    /* 20 % asks a manager's code (an existing rule, not this change): the
       approval is granted here, as the till's other suites do. */
    await page.evaluate(() => { window.requireManager = (_label, done) => done({ id: 'm1', name: 'Resp Test' }); });
    await page.click('[data-action="discount"]');
    await page.waitForSelector('#rm-pct-chips [data-rm-name]', { visible: true, timeout: 10000 });
    const sheet = await page.evaluate(() => ({
      chips: [...document.querySelectorAll('#rm-pct-chips .rm-pct-chip')].map((b) => b.textContent.trim()),
      typeShown: !!document.getElementById('rm-type')?.offsetParent,
      reasonsShown: !!document.getElementById('rm-reasons')?.offsetParent,
    }));
    check(sheet.chips.length === 1 && /Personnel · 20 %/.test(sheet.chips[0]), 'the sheet offers « Personnel · 20 % » and nothing else', JSON.stringify(sheet.chips));
    check(!sheet.typeShown && !sheet.reasonsShown, 'no free amount, no typed reason');
    await page.click('#rm-pct-chips [data-rm-name="Personnel"]');
    await page.click('#rm-confirm');
    await wait(300);
    const disc = await page.evaluate(() => ({ d: vrapDiscount && { reason: vrapDiscount.reason, value: vrapDiscount.value, amount: vrapDiscount.amount }, total: document.getElementById('rp-total')?.textContent.trim() }));
    check(disc.d && disc.d.reason === 'Personnel' && disc.d.value === 20 && Math.abs(disc.d.amount - dish.price * 0.2) < 0.01, 'the discount is on the bill under its name', JSON.stringify(disc));

    tr.step('Encaisser: the cash sheet, then « Sur place ou à emporter ? » at the very end');
    const before = await page.evaluate(() => kdsOrders.length);
    await page.click('#pay-charge');
    await page.waitForSelector('#cash-confirm', { visible: true, timeout: 10000 });
    await page.click('#cash-confirm');
    await page.waitForSelector('[data-cf-type] [data-cf-pick="emporter"]', { visible: true, timeout: 10000 });
    check(/Sur place ou à emporter/.test(await page.$eval('[data-cf-type] .cf-title', (e) => e.textContent)), 'paying asks « Sur place ou à emporter ? »');
    await page.click('[data-cf-type] [data-cf-pick="emporter"]');
    await page.waitForFunction((b) => kdsOrders.length > b, { timeout: 10000 }, before);
    const kds = await page.evaluate((b) => {
      const o = kdsOrders[kdsOrders.length - 1];
      return { added: kdsOrders.length - b, status: kdsViewStatus(o, 'all'), comment: o.comment, service: o.service, html: kdsOrderInner(o, false), fields: counterTicketFields(o) };
    }, before);
    check(kds.added === 1, 'paying sent the order to the kitchen', JSON.stringify(kds.added));
    check(kds.status === 'cooking', 'it lands « En préparation », not waiting', kds.status);
    check(kds.comment === 'Sans gluten, allergie arachides' && /Sans gluten/.test(kds.html), 'the kitchen screen shows the comment');
    check(kds.service === 'emporter' && /emporter/i.test(kds.html), 'the kitchen screen says « À emporter »');
    const ticket = await page.evaluate((fields) => {
      const bytes = window.KiwiEscPos.kitchenTicket(Object.assign({ title: 'CUISINE', items: [{ qty: 1, name: 'Burger', note: 'Sans oignon' }] }, fields));
      return Array.from(bytes);
    }, kds.fields);
    const latin = Buffer.from(ticket).toString('latin1');
    const tall = '\x1d!\x01';
    check(/EMPORTER/.test(latin), 'the kitchen ticket prints the service');
    check(latin.includes(tall + '!! Sans gluten'), 'the comment prints double height, before the dishes');
    check(latin.includes(tall + '> Sans oignon'), 'an option prints double height under its dish');
    check(errors.length === 0, 'no script error on the till', errors.join(' | '));
  });

  await S.run('2027 till · the bill carries the comment row and no send button, the discount sheet only the named discounts', async (tr) => {
    const ctx = await browser.createBrowserContext();
    tr.defer(() => ctx.close());
    const page = tr.watch(await ctx.newPage());
    await page.setViewport({ width: 1366, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
    await page.evaluateOnNewDocument(() => { localStorage.setItem('kiwiSkin2027:till', '1'); });
    tr.step('open the 2027 till (Jon\'s), takeaway');
    // coverage: surface=caisse-entry locale=fr viewport=desktop
    await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
    await page.evaluate(() => doOpenService());
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
    await ownerSettings()(page);
    await page.waitForFunction(() => { const r = document.querySelector('k-rail'); return r && r.shadowRoot.querySelector('[data-id="takeaway"]'); }, { timeout: 20000 });
    await page.click('k-rail >>> [data-id="takeaway"]');
    await wait(200);
    await page.evaluate(() => { const b = document.querySelector('#vrap-new-order'); if (b) b.click(); });
    await page.waitForFunction(() => menuItems.length > 0 && !document.querySelector('#vrap-builder').hidden, { timeout: 20000 });
    const id = await page.evaluate(() => { const g = document.querySelector('k-menu-grid'); const t = [...g.shadowRoot.querySelectorAll('[data-item]')].find((b) => !b.hasAttribute('data-opts') && b.getAttribute('aria-disabled') !== 'true'); return t && t.getAttribute('data-item'); });
    await page.click(`k-menu-grid >>> [data-item="${id}"]`);
    await page.waitForFunction(() => cart.length === 1, { timeout: 10000 });
    tr.step('the bill: comment row, no « Envoyer en cuisine »');
    await page.waitForSelector('k-bill >>> [data-w="comment"]', { visible: true, timeout: 10000 });
    check(!(await page.$('k-bill >>> [data-w="send"]')), 'the 2027 bill has no send button at the counter');
    await page.click('k-bill >>> [data-w="comment"]');
    await page.waitForSelector('.cf-veil .cf-text', { visible: true });
    await page.type('.cf-veil .cf-text', 'Bien cuit');
    await page.click('.cf-veil [data-cf="ok"]');
    await page.waitForFunction(() => /Bien cuit/.test(document.querySelector('k-bill')?.shadowRoot?.textContent || ''), { timeout: 10000 });
    check(true, 'the comment shows on the 2027 bill');
    tr.step('Remise');
    await page.click('k-bill >>> [data-w="discount"]');
    await page.waitForSelector('k-discount >>> [data-presets]', { visible: true, timeout: 10000 });
    const kit = await page.evaluate(() => {
      const r = document.querySelector('k-discount').shadowRoot;
      return { presets: [...r.querySelectorAll('[data-presets]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), keypad: !!r.querySelector('k-keypad, [data-key]') };
    });
    check(kit.presets.length === 1 && /Personnel · 20/.test(kit.presets[0]), 'the 2027 sheet offers « Personnel · 20 % » only', JSON.stringify(kit.presets));
    check(!kit.keypad, 'no keypad: nothing typed by hand');
    check(errors.length === 0, 'no script error on the 2027 till', errors.join(' | '));
  });

  await S.run('dashboard · Menu & modificateurs reorders groups and choices; Livraison lists the products', async (tr) => {
    const { page, errors } = await open(tr, '/dashboard.html');
    await page.waitForSelector('[data-explore]', { visible: true, timeout: 30000 });
    await page.click('[data-explore]');
    await page.waitForSelector('[data-kiwi-skip]', { visible: true });
    await page.click('[data-kiwi-skip]');
    await page.waitForFunction(() => window.KiwiVenue?.getVenueType?.() === 'restaurant' && !!window.KiwiMenuStore && !!window.KiwiDelivery, { timeout: 30000 });
    await page.evaluate(() => window.KiwiMenuStore.loadExample());
    const setup = await page.evaluate(() => {
      const S = window.KiwiMenuStore;
      S.addOptGroup('Cuisson'); S.addOptGroup('Sauce');
      const d = S.data(); const g1 = d.opts.find((g) => g.name === 'Cuisson'), g2 = d.opts.find((g) => g.name === 'Sauce');
      S.addOptChoice(g2.id, 'Ketchup', 0); S.addOptChoice(g2.id, 'Algérienne', 2);
      const it = d.items.find((x) => !x.archived);
      S.setItemOpts(it.id, [g1.id, g2.id]);
      return { g1: g1.id, g2: g2.id, item: it.id };
    });
    tr.step('Menu page: move « Sauce » up');
    await page.evaluate(() => window.KiwiVenue.showMenu());
    await page.waitForSelector(`[data-action="rmw-group-move"][data-arg="${setup.g2}:-1"]`, { visible: true, timeout: 20000 });
    await page.click(`[data-action="rmw-group-move"][data-arg="${setup.g2}:-1"]`);
    await page.waitForFunction((g2, g1) => { const d = window.KiwiMenuStore.data(); const ids = d.opts.map((g) => g.id); return ids.indexOf(g2) < ids.indexOf(g1); }, { timeout: 10000 }, setup.g2, setup.g1);
    const itemOpts = await page.evaluate((id) => window.KiwiMenuStore.data().items.find((x) => x.id === id).opts, setup.item);
    check(itemOpts[0] === setup.g2 && itemOpts[1] === setup.g1, 'the group moved up, and the dish asks it first', JSON.stringify(itemOpts));
    tr.step('group editor: move « Algérienne » above « Ketchup »');
    await page.click(`[data-action="rmw-group-edit"][data-arg="${setup.g2}"]`);
    await page.waitForSelector('[data-choice] [data-choice-up]', { visible: true, timeout: 10000 });
    const rows = await page.$$('[data-choice]');
    const up = await rows[1].$('[data-choice-up]');
    await up.click();
    await page.click('[data-save]');
    await page.waitForFunction((g2) => { const g = window.KiwiMenuStore.data().opts.find((x) => x.id === g2); return g && g.choices[0] && g.choices[0].name === 'Algérienne'; }, { timeout: 10000 }, setup.g2);
    check(true, 'the choice order is saved as arranged');

    tr.step('« Réordonner les options »: groups tab, then one group\'s choices');
    await page.waitForSelector('[data-action="rmw-opts-reorder"]', { visible: true, timeout: 10000 });
    await page.click('[data-action="rmw-opts-reorder"]');
    await page.waitForSelector(`.rmw-ro-list [data-reorder-id="${setup.g2}"] [data-ro-step="1"]`, { visible: true, timeout: 10000 });
    await page.click(`.rmw-ro-list [data-reorder-id="${setup.g2}"] [data-ro-step="1"]`);
    await page.waitForFunction((g2, g1) => { const ids = window.KiwiMenuStore.data().opts.map((g) => g.id); return ids.indexOf(g1) < ids.indexOf(g2); }, { timeout: 10000 }, setup.g2, setup.g1);
    const sheet = await page.evaluate((id) => ({ item: window.KiwiMenuStore.data().items.find((x) => x.id === id).opts, tabs: [...document.querySelectorAll('.rmw-ro-tabs [data-ro-cat]')].map((b) => b.dataset.roCat) }), setup.item);
    check(sheet.item[0] === setup.g1 && sheet.tabs[1] === setup.g1 && sheet.tabs[2] === setup.g2, 'a group moved down in the sheet: the dish and the tabs follow', JSON.stringify(sheet));
    /* The strip was just redrawn in the new order: a tap on the outgoing tab does nothing, tap again. */
    await tapUntil(page, `.rmw-ro-tabs [data-ro-cat="${setup.g2}"]`, `.rmw-ro-tabs [data-ro-cat="${setup.g2}"].on`);
    await page.waitForSelector('.rmw-ro-list [data-reorder-id]:first-child [data-ro-step="1"]', { visible: true, timeout: 10000 });
    await page.click('.rmw-ro-list [data-reorder-id]:first-child [data-ro-step="1"]');
    await page.waitForFunction((g2) => window.KiwiMenuStore.data().opts.find((x) => x.id === g2).choices[0].name === 'Ketchup', { timeout: 10000 }, setup.g2);
    check(true, 'a choice moved down in its group\'s tab');
    await page.click('[data-catalog-done]');
    tr.step('group editor: the down arrow');
    /* The sheet is still closing: tap « Modifier les choix » until the editor opens. */
    await tapUntil(page, `[data-action="rmw-group-edit"][data-arg="${setup.g2}"]`, '[data-choice]:first-child [data-choice-down]');
    await page.click('[data-choice]:first-child [data-choice-down]');
    await page.click('[data-save]');
    await page.waitForFunction((g2) => window.KiwiMenuStore.data().opts.find((x) => x.id === g2).choices[0].name === 'Algérienne', { timeout: 10000 }, setup.g2);
    check(true, 'a choice moved down in the group editor is saved');

    tr.step('dish card: this dish asks « Sauce » before « Cuisson », the rest of the menu does not change');
    const before = await page.evaluate((id) => window.KiwiMenuStore.data().items.find((x) => x.id === id).opts.slice(), setup.item);
    await page.evaluate((id) => window.Kiwi.handlers['rmw-item-edit'](null, id), setup.item);
    await page.waitForSelector('[data-opt-list] [data-opt-row]:first-child [data-opt-mv="1"]', { visible: true, timeout: 10000 });
    const shown = await page.$$eval('[data-opt-list] [data-opt-row]', (rows) => rows.map((r) => r.querySelector('[data-opt]').dataset.opt + ':' + r.querySelector('[data-opt-n]').textContent));
    check(shown[0] === before[0] + ':1' && shown[1] === before[1] + ':2', 'the dish card lists its groups in its own order, numbered', JSON.stringify(shown));
    await page.click('[data-opt-list] [data-opt-row]:first-child [data-opt-mv="1"]');
    const saves = await page.$$('[data-save]');
    let saveBtn = null;
    for (const b of saves) if (await b.isVisible()) saveBtn = b;
    await saveBtn.click();
    await page.waitForFunction((id, first) => window.KiwiMenuStore.data().items.find((x) => x.id === id).opts[0] === first, { timeout: 10000 }, setup.item, before[1]);
    check(true, 'the dish now asks its second group first');
    await page.evaluate((g) => window.KiwiMenuStore.moveOptGroup(g, -1), before[1]);
    const kept = await page.evaluate((id) => window.KiwiMenuStore.data().items.find((x) => x.id === id).opts, setup.item);
    check(kept[0] === before[1] && kept[1] === before[0], 'a menu-wide move keeps the order set on the dish card', JSON.stringify(kept));

    tr.step('Livraison: Glovo on, a product price typed');
    await page.evaluate(() => window.KiwiDelivery.openSettings());
    await page.waitForSelector('[data-pid="glovo"] [data-kdl-on]', { visible: true, timeout: 10000 });
    await page.click('[data-pid="glovo"] [data-kdl-on]');
    await page.waitForSelector('[data-kdl-products] [data-kdl-item][data-p="glovo"]', { visible: true, timeout: 10000 });
    const n = await page.$$eval('[data-kdl-products] [data-kdl-item]', (els) => els.length);
    check(n > 0, `the grid lists the products (${n})`);
    const first = await page.$eval('[data-kdl-products] [data-kdl-item][data-p="glovo"]', (e) => e.getAttribute('data-kdl-item'));
    await page.type(`[data-kdl-products] [data-kdl-item="${first}"][data-p="glovo"]`, '55');
    await page.click('[data-kdl-save]');
    await page.waitForFunction((id) => window.KiwiDelivery.priceOf(id, 'glovo') === 55, { timeout: 10000 }, first);
    check(true, 'the product price on Glovo is saved');
    check(errors.length === 0, 'no script error on the dashboard', errors.join(' | '));
  });
} finally {
  await browser.close().catch(() => {});
  server.close();
}
process.exit(S.failed ? 1 : 0);
