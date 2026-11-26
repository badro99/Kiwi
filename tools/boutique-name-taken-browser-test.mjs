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

await page.evaluate((names) => { const cat = window.KiwiBoutiqueCatalog; cat.listProducts().filter((p) => names.includes(p.name)).forEach((p) => cat.deleteProduct(p.id)); }, [ONE, TWO]);
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
  await sleep(300);
  const msg = await dash.evaluate(() => { const m = document.querySelector('[data-kbs-name-taken]'); return m && m.offsetParent ? m.textContent : ''; });
  ok(msg.includes(existing.name), 'C · dashboard « Nouveau produit » says the name exists', msg);
  await js('[data-action="bqx-new-save"]'); await sleep(500);
  const after = await dash.evaluate(() => window.KiwiBoutiqueCatalog.listProducts().length);
  ok(after === existing.n, 'C · and creates nothing', `${existing.n} → ${after}`);
  await dash.evaluate(() => { const c = document.querySelector('[data-kbd-clear]'); if (c) c.click(); });
}
await h.close?.();
console.log(`\nboutique-name-taken-browser: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
