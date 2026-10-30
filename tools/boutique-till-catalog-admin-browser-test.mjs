#!/usr/bin/env node
/* Kiwi · boutique-till-catalog-admin-browser-test · the operator switch
 * « Gestion complète de l’inventaire sur la caisse » (caisseInventoryAdmin)
 * works on the BOUTIQUE till, not only on the Maison till.
 *
 * Santos Store (29 October): the switch was on in the console and the team
 * still could not add an article. Only pos-maison read the flag; the boutique
 * till kept the August lock, with every create / edit / delete action turned
 * into a "do it on the dashboard" label and its body unreachable.
 *
 * Off: the till shows the dashboard labels and no editing button.
 * On, per worker (owner, 29 October): a cashier the owner did not tick in
 * Équipe gets the labels; ticked, she edits; a manager always edits.
 * On: real clicks create an article (total, then the sizes grid), change its
 * price, add a size, delete that size and delete the article, through the
 * real forms, with no page error. Demo till only: nothing reaches a server.
 *   node tools/boutique-till-catalog-admin-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('boutique-till-catalog-admin');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };

const { page } = await demoPage(h, 'fr', 'desktop', { 'kiwiSkin2027:dashboard': '0' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
// coverage: surface=caisse-boutique locale=fr viewport=desktop
await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiCaisseLang, { timeout: 30000 });
await sleep(500);
await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
await page.waitForSelector('#pos-boutique.is-on', { visible: true, timeout: 20000 });
await sleep(1200);

const coreUrl = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/assets\/pos-boutique\.js\?/.test(u)));
ok(!!coreUrl, 'the till loaded its boutique module');

async function showInventory(on) {
  await page.evaluate(async (u, on) => {
    window.KiwiConfig = window.KiwiConfig || {};
    window.KiwiConfig.features = { ...(window.KiwiConfig.features || {}), caisseInventoryAdmin: on };
    const m = await import(u);
    m.switchView('ventes');
    m.switchView('inventaire');
  }, coreUrl, on);
  await page.waitForSelector('[data-bq-panel="inventaire"] .bqi-tools', { visible: true, timeout: 10000 });
  await page.waitForFunction((on) => !!document.querySelector('#bqi-new') === on, { timeout: 5000 }, on).catch(() => {});
  await sleep(200);
}
const product = (name) => page.evaluate((name) => {
  const cat = window.KiwiBoutiqueCatalog;
  const p = cat.listProducts({ q: name }).find((x) => x.name === name);
  if (!p) return null;
  const d = cat.getProduct(p.id);
  return { id: p.id, price: p.priceMAD, variants: d.variants.map((v) => ({ id: v.id, size: v.size, stock: v.stock })) };
}, name);
const type = async (sel, value) => {
  await page.waitForSelector(sel, { visible: true, timeout: 5000 });
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, value);
};
const click = async (sel) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.click(sel); await sleep(450); };

/* ── off · the August lock still holds ───────────────────────────────────── */
await showInventory(false);
ok(await page.$('#bqi-new') === null, 'switch off · no « Nouvel article » button');
ok(await page.$('[data-bq-panel="inventaire"] .bqi-dashboard-only') !== null, 'switch off · the till says articles are managed on the dashboard');

/* ── on · the whole cycle, real clicks ───────────────────────────────────── */
await showInventory(true);
ok(await page.$('#bqi-new') !== null, 'switch on · « Nouvel article » is offered');
const NAME = 'TEST KIWI Robe lin';
/* The form asks for the total; a « taille » article then opens its sizes grid
   (boutique-sizes.js) to split the pieces, one box per size. */
const sizeBox = (size) => page.evaluateHandle((size) => [...document.querySelectorAll('[data-kbs-in]')]
  .find((i) => i.offsetParent && new RegExp('· ' + size + '$').test(i.getAttribute('aria-label') || '')) || null, size);
const fill = async (size, value) => {
  const box = (await sizeBox(size)).asElement();
  if (!box) return false;
  await box.click({ clickCount: 3 });
  await box.type(value);
  return true;
};
await click('#bqi-new');
await type('[data-bqx-name]', NAME);
await type('[data-bqi-price]', '450');
await type('[data-kbs-total]', '3');
await click('#bqi-n-save');
await page.waitForSelector('[data-kbs-in]', { visible: true, timeout: 8000 });
ok(await fill('M', '3'), 'the sizes grid opens on the new article, with a box for M');
await click('[data-kbs-save]');
await sleep(500);
let p = await product(NAME);
ok(!!p && p.price === 450 && p.variants.length === 1 && p.variants[0].size === 'M' && p.variants[0].stock === 3, 'the article is created with its price, size and stock', JSON.stringify(p));

await page.waitForSelector('[data-inv-edit]', { visible: true, timeout: 5000 }).catch(() => {});
ok(await page.$('[data-inv-edit]') !== null && await page.$('[data-inv-delete]') !== null,
  'its sheet offers Modifier and Supprimer');
await click('[data-inv-edit]');
await type('#bqi-e-price', '480');
await click('#bqi-e-save');
p = await product(NAME);
ok(!!p && p.price === 480, 'Modifier changes the price', JSON.stringify(p && p.price));

await page.waitForSelector('[data-kbs-in]', { visible: true, timeout: 5000 }).catch(() => {});
ok(await fill('L', '2'), 'the sheet keeps the sizes grid, with a box for L');
await click('[data-kbs-save]');
await sleep(500);
p = await product(NAME);
ok(!!p && p.variants.length === 2 && p.variants.some((v) => v.size === 'L' && v.stock === 2), 'typing into L adds size L', JSON.stringify(p && p.variants));

const vL = p && p.variants.find((v) => v.size === 'L');
await click(`[data-kbs-del="${vL && vL.id}"]`);
await click('#bqi-vdel-ok');
p = await product(NAME);
ok(!!p && p.variants.length === 1 && p.variants[0].size === 'M', 'Supprimer on size L asks, then removes only that size', JSON.stringify(p && p.variants));

await click('[data-inv-delete]');
await click('#bqi-del-ok');
ok(await product(NAME) === null, 'Supprimer removes the article after confirmation');

/* ── on · the owner's per-worker choice (Équipe › « Peut modifier l'inventaire sur la caisse ») ── */
await page.evaluate(() => {
  window.KiwiConfig.pins = [{ id: 'p1', name: 'Sara Test', role: 'Caissière' }];
  window.KiwiStaff = { name: 'Sara Test', role: 'Caissière' };
});
await showInventory(true);
ok(await page.$('#bqi-new') === null && await page.$('[data-bq-panel="inventaire"] .bqi-dashboard-only') !== null, 'switch on · a cashier the owner did not tick gets no editing button');
await page.evaluate(() => {
  let slug = '';
  try { const v = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); slug = String((v && v.merchant) || localStorage.getItem('kiwiLiveMerchant') || ''); } catch (_) {}
  localStorage.setItem('kiwi:tillInvStaff:' + slug, JSON.stringify(['sara test']));
});
await showInventory(true);
ok(await page.$('#bqi-new') !== null, 'once ticked in Équipe, the same cashier gets « Nouvel article »');
await page.evaluate(() => { window.KiwiStaff = { name: 'Yassine Test', role: 'Manager' }; });
await showInventory(true);
ok(await page.$('#bqi-new') !== null, 'a manager edits without being ticked');

ok(errors.length === 0, 'no page error during the whole cycle', errors.slice(0, 3).join(' | '));

await h.close?.();
console.log(`\nboutique-till-catalog-admin: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
