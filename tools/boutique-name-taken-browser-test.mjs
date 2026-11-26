#!/usr/bin/env node
/* Kiwi · boutique-name-taken-browser-test · a product name already in the
 * inventory is said under the field and refused.
 *
 * Owner, 26 November 2026 (Santos renaming its articles to codes, CHE0001
 * typed a second time): « this should tell u, this name exists already ».
 *   A · till « Nouveau produit »: a name already in the inventory, typed with
 *       another case and extra spaces, shows the message while typing;
 *       « Créer le produit » creates nothing; a free name clears it and creates;
 *   B · till « Modifier le produit »: renaming to another product's name is
 *       said and refused; the product keeps its name;
 *   C · dashboard « Nouveau produit » (Maison Mansour demo): same message,
 *       nothing created.
 * Demo till only: nothing reaches a server.
 *   node tools/boutique-name-taken-browser-test.mjs
 */
import { harness, demoPage, dashboardWalker, sleep } from './surface-matrix-lib.mjs';

const h = await harness('boutique-name-taken');
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
await page.evaluate(async (u) => {
  window.KiwiConfig = window.KiwiConfig || {};
  window.KiwiConfig.features = { ...(window.KiwiConfig.features || {}), caisseInventoryAdmin: true, boutiqueSizeColors: false };
  const m = await import(u);
  m.switchView('ventes');
  m.switchView('inventaire');
}, coreUrl);
await page.waitForSelector('#bqi-new', { visible: true, timeout: 10000 });

const ONE = 'TEST KIWI CHE0001', TWO = 'TEST KIWI CHE0002';
const type = async (sel, value) => {
  await page.waitForSelector(sel, { visible: true, timeout: 5000 });
  await page.click(sel, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(sel, value);
};
const click = async (sel) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.click(sel); await sleep(400); };
const named = (name) => page.evaluate((name) => window.KiwiBoutiqueCatalog.listProducts().filter((p) => p.name === name).map((p) => p.id), name);
const taken = () => page.evaluate(() => { const m = [...document.querySelectorAll('[data-kbs-name-taken]')].find((x) => x.offsetParent); return m ? m.textContent : ''; });
const close = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('[data-inv-x]')].find((x) => x.offsetParent); if (b) b.click(); }); await sleep(500); };
const create = async (name) => {
  await click('#bqi-new');
  await page.waitForSelector('[data-bqx-name]', { visible: true, timeout: 8000 });
  await type('[data-bqx-name]', name);
  await click('input[name="bqx-pf-kind"][value="tu"]');
  await type('[data-bqi-price]', '150');
  await type('[data-bqi-cost]', '100');   // le coût d'achat est exigé (26 nov.)
  await type('[data-kbs-total]', '1');
};

/* ── A · till « Nouveau produit » ─────────────────────────────────────────── */
await create(ONE);
await click('#bqi-n-save');
ok((await named(ONE)).length === 1, 'A · the first « ' + ONE + ' » is created');
await close();
await create('  test kiwi   che0001 ');
const said = await taken();
ok(said.includes(ONE) && /existe déjà/.test(said), 'A · the same name in lower case with extra spaces is said while typing', said);
await click('#bqi-n-save');
const all = await page.evaluate(() => window.KiwiBoutiqueCatalog.listProducts().filter((p) => p.name.toLowerCase().replace(/\s+/g, ' ').trim() === 'test kiwi che0001').length);
ok(all === 1, '« Créer le produit » creates nothing', 'count ' + all);
ok(await page.$eval('[data-bqx-name]', (i) => i.getAttribute('aria-invalid')) === 'true', 'A · the name field is marked and the window stays open');
await type('[data-bqx-name]', TWO);
ok(await taken() === '', 'A · a free name clears the message');
await click('#bqi-n-save');
ok((await named(TWO)).length === 1, 'A · and creates the product');

/* ── B · till « Modifier le produit » (its sheet is open after creating) ─── */
await page.waitForSelector('[data-inv-edit]', { visible: true, timeout: 8000 });
await click('[data-inv-edit]');
await page.waitForSelector('#bqi-e-name', { visible: true, timeout: 5000 });
ok(await taken() === '', 'B · its own name is not « already taken »');
await type('#bqi-e-name', ONE.toLowerCase());
ok((await taken()).includes(ONE), 'B · renaming to another product\'s name is said', await taken());
await click('#bqi-e-save');
ok((await named(TWO)).length === 1 && (await named(ONE)).length === 1, 'B · and refused: both keep their names');
await close();

/* ── D · the purchase cost is required on the till (owner, 26 Nov 2026) ─── */
await create('TEST KIWI ORD0010');
await page.$eval('[data-bqi-cost]', (i) => { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
await click('#bqi-n-save');
ok((await named('TEST KIWI ORD0010')).length === 0, 'D · no purchase cost: « Créer le produit » creates nothing');
const costErr = await page.$eval('[data-bqi-err="cost"]', (e) => (e.hidden ? '' : e.textContent));
ok(/coût d’achat/.test(costErr), 'D · and says why under the field', costErr);
await type('[data-bqi-cost]', '80');
await click('#bqi-n-save');
ok((await named('TEST KIWI ORD0010')).length === 1, 'D · with a cost it is created');
await close();
await create('TEST KIWI ORD0002');
await click('#bqi-n-save');
await close();

/* ── E · the inventory reads codes as numbers: ORD0002 before ORD0010 ───── */
const order = await page.evaluate(() => {
  const cat = window.KiwiBoutiqueCatalog;
  return [...document.querySelectorAll('[data-inv-open]')].map((r) => (cat.getProduct(r.getAttribute('data-inv-open')) || { product: {} }).product.name).filter((x) => /^TEST KIWI (CHE|ORD)/.test(x || ''));
});
ok(JSON.stringify(order) === JSON.stringify([ONE, TWO, 'TEST KIWI ORD0002', 'TEST KIWI ORD0010']), 'E · till inventory sorted by name, numbers read as numbers (created 0010 first)', JSON.stringify(order));

await page.evaluate((names) => { const cat = window.KiwiBoutiqueCatalog; cat.listProducts().filter((p) => names.includes(p.name)).forEach((p) => cat.deleteProduct(p.id)); }, [ONE, TWO, 'TEST KIWI ORD0010', 'TEST KIWI ORD0002']);
ok(errors.length === 0, 'no page error', errors.slice(0, 3).join(' | '));

/* ── C · the dashboard form ───────────────────────────────────────────────── */
{
  // coverage: surface=dashboard-product-editor locale=fr viewport=tablet
  const { page: dash } = await dashboardWalker(h).open({ step() {}, watch: (p) => p }, 'dashboard-transactions', 'fr', 'tablet');
  const js = (sel) => dash.evaluate((sel) => document.querySelector(sel).click(), sel);
  await js('[data-action="venue-toggle"]'); await sleep(400);
  await js('[data-action="venue-pick"][data-venue="maisonMansour"]');
  await dash.waitForSelector('[data-nav="inventory"]', { timeout: 8000 });
  await js('[data-nav="inventory"]'); await sleep(800);
  const existing = await dash.evaluate(() => { const p = window.KiwiBoutiqueCatalog.listProducts()[0]; return p ? { name: p.name, n: window.KiwiBoutiqueCatalog.listProducts().length } : null; });
  ok(!!existing, 'C · the demo store has products', JSON.stringify(existing));
  await js('[data-action="bqx-new"]');
  await dash.waitForSelector('[data-bqx-name]', { visible: true, timeout: 8000 }); await sleep(600);
  await dash.evaluate(() => { const c = document.querySelector('[data-kbd-clear]'); if (c) c.click(); });
  await dash.type('[data-bqx-name]', existing.name.toUpperCase());
  await dash.type('[data-bqx-price]', '220');
  await dash.type('[data-bqx-cost]', '100');
  await sleep(300);
  const msg = await dash.evaluate(() => { const m = document.querySelector('[data-kbs-name-taken]'); return m && m.offsetParent ? m.textContent : ''; });
  ok(msg.includes(existing.name), 'C · dashboard « Nouveau produit » says the name exists', msg);
  await js('[data-action="bqx-new-save"]'); await sleep(500);
  const after = await dash.evaluate(() => window.KiwiBoutiqueCatalog.listProducts().length);
  ok(after === existing.n, 'C · and creates nothing', `${existing.n} → ${after}`);
  await dash.evaluate(() => { const c = document.querySelector('[data-kbd-clear]'); if (c) c.click(); });
  await dash.keyboard.press('Escape'); await sleep(600);

  /* ── F · dashboard grid order, and the banner for products without a cost ── */
  await js('[data-nav="inventory"]'); await sleep(1000);
  const gridNames = await dash.$$eval('#bqx-grid [data-action="bqx-open"]', (all) => all.map((c) => c.getAttribute('aria-label')).filter(Boolean));
  const sorted = gridNames.slice().sort(new Intl.Collator('fr', { numeric: true, sensitivity: 'base' }).compare);
  ok(gridNames.length > 2 && JSON.stringify(gridNames) === JSON.stringify(sorted), 'F · dashboard grid sorted by name', JSON.stringify(gridNames.slice(0, 6)));
  const victim = await dash.evaluate(() => { const cat = window.KiwiBoutiqueCatalog; const p = cat.listProducts()[1]; cat.updateProduct(p.id, { cost: 0 }); return { id: p.id, name: p.name }; });
  await js('[data-nav="inventory"]'); await sleep(1200);
  const banner = await dash.evaluate(() => { const b = document.querySelector('[data-cost-nudge]'); return b && b.offsetParent ? b.textContent.replace(/\s+/g, ' ').trim() : ''; });
  ok(/sans coût d’achat/.test(banner), 'F · the inventory says which products have no purchase cost', banner);
  await dash.click('[data-cost-nudge-open]'); await sleep(500);
  const row = `[data-cost-row="${victim.id}"] [data-cost-in]`;
  ok(!!(await dash.$(row)), 'F · « Compléter maintenant » lists the product with a cost box', victim.name);
  await dash.type(row, '85');
  await dash.click('[data-cost-save]'); await sleep(900);
  ok(await dash.evaluate((id) => window.KiwiBoutiqueCatalog.getProduct(id).product.cost, victim.id) === 85, 'F · the typed cost is saved on the product');
  const gone = await dash.evaluate(() => window.KiwiBoutiqueCatalog.listProducts().filter((p) => !(p.cost > 0)).length === 0 ? !document.querySelector('[data-cost-nudge]') : true);
  ok(gone, 'F · and the banner leaves once every cost is filled');
}
await h.close?.();
console.log(`\nboutique-name-taken-browser: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
