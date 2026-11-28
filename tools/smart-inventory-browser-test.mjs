#!/usr/bin/env node
/* Kiwi · smart-inventory-browser-test · « Inventaire intelligent », the God
 * mode switch asked for Mabs Outfitters (owner, 28 November 2026): « it starts
 * with category, then gives you an optional sous-cat, the moment you choose a
 * category it gives you a pregiven reference, for example jeans gives you
 * JENxxxx based on the latest number we arrived to, never doubles an existing
 * reference », and « no slash anymore, only JENxxxx ».
 *   0 · the generator alone: prefix taken from the category's own names,
 *       highest number across the whole catalogue (archives too, any zero
 *       padding, anything after the number), four digits, three-letter
 *       fallback for a category with no reference yet;
 *   A · switch off: the « Nouveau produit » form is the one from before;
 *   B · switch on: the category comes first, the sub-category waits for it,
 *       choosing the category writes the next reference in the name;
 *   C · a sub-category created on the spot sits under its parent and the
 *       product is saved in it under the proposed reference;
 *   D · a number another till took while the form was open is skipped at save;
 *   E · a name typed by hand is never replaced.
 * Demo till only: nothing reaches a server.
 *   node tools/smart-inventory-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';
import { parseRef, prefixFor, nextReference } from '../assets/smart-inventory.js';

let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };

/* ── 0 · the generator ─────────────────────────────────────────────────── */
{
  const cats = [{ id: 'j', name: 'Jeans' }, { id: 's', name: 'Slim', parentId: 'j' }, { id: 'c', name: 'Écharpe' }, { id: 'z', name: 'Zara Originale' }];
  const ps = [
    { name: 'JEN0086/90', categoryId: 'j' }, { name: 'Jen0057MX', categoryId: 'j' }, { name: 'JEA001', categoryId: 'j' },
    { name: 'JEN00152/90', categoryId: 's' }, { name: 'JEN0153', categoryId: null, archived: true },
    { name: 'ZARA/136/800', categoryId: 'z' },
  ];
  ok(JSON.stringify(parseRef('JEN00152/90')) === '{"prefix":"JEN","n":152}' && parseRef('ZARA/136/800') === null && parseRef('') === null, '0 · a reference reads as prefix + number, whatever the padding and suffix');
  ok(prefixFor('j', ps, cats) === 'JEN', '0 · the prefix is the one the category (and its sub-categories) already uses most', prefixFor('j', ps, cats));
  ok(nextReference('j', ps, cats).ref === 'JEN0154', '0 · the next number follows the highest anywhere, archives and sub-categories included', nextReference('j', ps, cats).ref);
  ok(nextReference('s', ps, cats).ref === 'JEN0154', '0 · a sub-category with its own references keeps that prefix', nextReference('s', ps, cats).ref);
  ok(nextReference('c', ps, cats).ref === 'ECH0001' && nextReference('z', ps, cats).ref === 'ZAR0001', '0 · no reference yet: three letters of the name, accents dropped, from 0001', nextReference('c', ps, cats).ref + ' ' + nextReference('z', ps, cats).ref);
  ok(nextReference('nope', ps, cats) === null, '0 · an unknown category proposes nothing');
}

const h = await harness('smart-inventory');
const { page } = await demoPage(h, 'fr', 'desktop', { 'kiwiSkin2027:till': '1' });
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
const setSmart = (on) => page.evaluate(async (u, on) => {
  window.KiwiConfig = window.KiwiConfig || {};
  window.KiwiConfig.features = { ...(window.KiwiConfig.features || {}), caisseInventoryAdmin: true, boutiqueSizeColors: false, smartInventory: on };
  const m = await import(u);
  m.switchView('ventes');
  m.switchView('inventaire');
}, coreUrl, on);
await page.evaluate(() => { try { localStorage.removeItem('kiwiSmartInventory'); } catch (_) {} });
await setSmart(false);
await page.waitForSelector('#bqi-new', { visible: true, timeout: 10000 });

const type = async (sel, value) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.click(sel, { clickCount: 3 }); await page.type(sel, value); };
const click = async (sel) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.click(sel); await sleep(350); };
const close = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('[data-inv-x]')].find((x) => x.offsetParent); if (b) b.click(); }); await sleep(500); };
const nameVal = () => page.$eval('[data-bqx-name]', (i) => i.value);
const openNew = async () => { await click('#bqi-new'); await page.waitForSelector('[data-bqx-name]', { visible: true, timeout: 5000 }); await sleep(500); };
const findProd = (name) => page.evaluate((name) => { const p = window.KiwiBoutiqueCatalog.listProducts({ includeArchived: true }).find((x) => x.name === name); return p ? { id: p.id, categoryId: p.categoryId } : null; }, name);

/* ── A · switch off ────────────────────────────────────────────────────── */
await openNew();
const offOrder = await page.evaluate(() => {
  const n = document.querySelector('[data-bqx-name]').getBoundingClientRect().top, c = document.querySelector('[data-bqx-cat]').getBoundingClientRect().top;
  return { nameFirst: n < c, sub: !!document.querySelector('[data-si-sub]'), name: document.querySelector('[data-bqx-name]').value };
});
ok(offOrder.nameFirst && !offOrder.sub && offOrder.name === '', 'A · switch off: name first, no sub-category, no reference', JSON.stringify(offOrder));
await close();

/* ── B · switch on ─────────────────────────────────────────────────────── */
const ids = await page.evaluate(() => {
  const cat = window.KiwiBoutiqueCatalog;
  const parent = cat.addCategory('TEST KIWI Jeans');
  const a = cat.addProduct({ name: 'TKW0041/90', categoryId: parent.id, priceMAD: 100 });
  cat.addProduct({ name: 'Tkw0007MX', categoryId: parent.id, priceMAD: 100 });
  const old = cat.addProduct({ name: 'TKW0042', priceMAD: 100 });
  cat.archiveProduct(old.id, true);
  return { parent: parent.id, made: [a.id, old.id] };
});
await setSmart(true);
await page.waitForSelector('#bqi-new', { visible: true, timeout: 10000 });
await openNew();
await page.waitForSelector('[data-si-sub-f]', { timeout: 5000 });
const onOrder = await page.evaluate(() => {
  const n = document.querySelector('[data-bqx-name]'), c = document.querySelector('[data-bqx-cat]');
  return { catFirst: c.getBoundingClientRect().top < n.getBoundingClientRect().top, subHidden: document.querySelector('[data-si-sub-f]').hidden, name: n.value, ph: n.placeholder };
});
ok(onOrder.catFirst, 'B · switch on: the category comes before the name');
ok(onOrder.subHidden && onOrder.name === '' && /Choisissez d’abord la catégorie/.test(onOrder.ph), 'B · before a category: no sub-category, empty name that asks for the category first', JSON.stringify(onOrder));
await page.select('[data-bqx-cat]', ids.parent);
await sleep(300);
ok(await nameVal() === 'TKW0043', 'B · choosing the category writes the next reference, TKW0043 (TKW0042 is archived, still taken)', await nameVal());
ok(await page.$eval('[data-si-hint]', (el) => /TKW0043/.test(el.textContent)), 'B · and says it is the next reference');
ok(await page.$eval('[data-si-sub-f]', (el) => !el.hidden && !!el.offsetParent), 'B · the optional sub-category shows up');
ok(await page.$eval('[data-bqi-pn]', (el) => el.textContent.trim()) === 'TKW0043', 'B · the preview card shows the reference too');

/* ── C · a sub-category made on the spot ──────────────────────────────── */
await page.select('[data-si-sub]', '__new');
await sleep(200);
await type('[data-si-add-name]', 'TEST KIWI Slim');
await click('[data-si-add-ok]');
const child = await page.evaluate((pid) => { const c = window.KiwiBoutiqueCatalog.listCategories().find((x) => x.name === 'TEST KIWI Slim'); return c ? { id: c.id, parentId: c.parentId } : null; }, ids.parent);
ok(child && child.parentId === ids.parent, 'C · « + Nouvelle sous-catégorie » makes a category under TEST KIWI Jeans', JSON.stringify(child));
ok(child && await page.$eval('[data-si-sub]', (s) => s.value) === child.id, 'C · and selects it');
ok(await page.$eval('[data-bqx-cat]', (s) => [...s.options].every((o) => o.textContent !== 'TEST KIWI Slim')), 'C · the category list keeps only parents');
await type('[data-bqi-price]', '390');
await type('[data-bqi-cost]', '120');
await type('[data-kbs-total]', '1');
await click('#bqi-n-save');
await sleep(600);
const saved = await findProd('TKW0043');
ok(saved && child && saved.categoryId === child.id, 'C · saved as TKW0043, in the sub-category', JSON.stringify(saved));
await close(); await close();

/* ── D · a number taken meanwhile is skipped ──────────────────────────── */
await openNew();
await page.select('[data-bqx-cat]', ids.parent);
await sleep(300);
ok(await nameVal() === 'TKW0044', 'D · the next form proposes TKW0044 (the sub-category counts for its parent)', await nameVal());
ok(child && await page.$eval('[data-si-sub]', (s, id) => [...s.options].some((o) => o.value === id), child.id), 'D · the new sub-category is offered under its parent');
await page.evaluate(() => window.KiwiBoutiqueCatalog.addProduct({ name: 'TKW0044/10', priceMAD: 100 }));   // another till, synced in
await type('[data-bqi-price]', '390');
await type('[data-bqi-cost]', '120');
await type('[data-kbs-total]', '1');
await click('#bqi-n-save');
await sleep(600);
const raced = await findProd('TKW0045');
ok(raced && raced.categoryId === ids.parent && !(await findProd('TKW0044')), 'D · saving moves to TKW0045: TKW0044 is never doubled', JSON.stringify(raced));
await close(); await close();

/* ── E · a typed name stays ───────────────────────────────────────────── */
await openNew();
await type('[data-bqx-name]', 'TEST KIWI nom à la main');
await page.select('[data-bqx-cat]', ids.parent);
await sleep(300);
ok(await nameVal() === 'TEST KIWI nom à la main', 'E · a name typed by hand is not replaced by the reference', await nameVal());
ok(await page.$eval('[data-si-hint]', (el) => /TKW0046/.test(el.textContent)), 'E · the hint still says the next reference, TKW0046');
await close();

await page.evaluate((ids) => {
  const cat = window.KiwiBoutiqueCatalog;
  cat.listProducts({ includeArchived: true }).filter((p) => /^tkw/i.test(p.name)).forEach((p) => cat.deleteProduct && cat.deleteProduct(p.id));
  cat.listCategories().filter((c) => /^TEST KIWI /.test(c.name)).forEach((c) => cat.deleteCategory(c.id));
  Object.keys(localStorage).filter((k) => k.startsWith('kiwiDraft:')).forEach((k) => localStorage.removeItem(k));
}, ids);
ok(errors.length === 0, 'no page error', errors.slice(0, 3).join(' | '));
await h.close?.();
console.log(`\nsmart-inventory-browser: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
