#!/usr/bin/env node
/* Kiwi · boutique-size-split-browser-test · a carton split over its sizes on
 * the boutique till, with real clicks and real typing.
 *
 * Owner, 29 October 2026: « make an optimal way to add variants ». Creating a
 * product with a total quantity opens the sizes screen (boutique-sizes.js);
 * boutique-size-split.js adds the one-tap split, the quick entry and the
 * remainder link. This suite types a product, then:
 *   A · « S-XL 5 M3 » in quick entry fills S 5, M 8, L 5, XL 5 as it is typed;
 *   B · the remainder link puts the 7 missing pieces on M (the last size named);
 *   C · Enregistrer creates exactly those four sizes, nothing at 0;
 *   D · a second product: the shape chip splits the whole total in one tap,
 *       Annuler empties it again, and Égal spreads it with the extra in the
 *       middle; the arrow keys add and remove one piece in a box;
 *   E · colours: « TEST KIWI Robe noire » starts with the black column;
 *       typing « noir s-xl 2 bleu m3 l3 » adds a blue column on the spot and
 *       fills both; the bars stack in the colours; Enregistrer creates each
 *       colour + size with its colour, and the till label says « Bleu · M ».
 * All of it sits behind the merchant option « boutiqueSizeColors » (off by
 * default, switched on per merchant in the console); 0 checks the screen with
 * it off is the one from before.
 * Demo till only: nothing reaches a server.
 *   node tools/boutique-size-split-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('boutique-size-split');
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

const type = async (sel, value) => {
  await page.waitForSelector(sel, { visible: true, timeout: 5000 });
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, value);
};
const click = async (sel) => { await page.waitForSelector(sel, { visible: true, timeout: 5000 }); await page.click(sel); await sleep(350); };
const boxes = () => page.$$eval('[data-kbs-in]', (all) => all.map((i) => i.value));
const sizesOf = (name) => page.evaluate((name) => {
  const cat = window.KiwiBoutiqueCatalog;
  const p = cat.listProducts({ q: name }).find((x) => x.name === name);
  return p ? cat.getProduct(p.id).variants.map((v) => v.size + ':' + v.stock).join(' ') : null;
}, name);
async function create(name, total) {
  await click('#bqi-new');
  await type('[data-bqx-name]', name);
  await type('[data-bqi-price]', '390');
  await type('[data-kbs-total]', String(total));
  await click('#bqi-n-save');
  await page.waitForSelector('[data-kbsp-quick]', { visible: true, timeout: 8000 });
  await sleep(300);
}
const close = async () => {
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^\s*Fermer\s*$/.test(x.textContent) && x.offsetParent); if (b) b.click(); });
  await sleep(500);
};

/* ── 0 · switched off (every merchant until the console turns it on) ──────── */
const ZERO = 'TEST KIWI Pull sans option';
await click('#bqi-new');
await type('[data-bqx-name]', ZERO);
await type('[data-bqi-price]', '390');
await type('[data-kbs-total]', '6');
await click('#bqi-n-save');
await page.waitForSelector('[data-kbs-in]', { visible: true, timeout: 8000 });
await sleep(300);
ok(!(await page.$('[data-kbsp-quick]')) && !(await page.$('.kbc')) && !(await page.$('table.kbm')), '0 · option off: the sizes screen is the one from before (no split, no colours)');
await page.evaluate(() => { const i = document.querySelectorAll('[data-kbs-in]')[3]; i.value = '6'; i.dispatchEvent(new Event('input', { bubbles: true })); });
await click('[data-kbs-save]');
await sleep(500);
ok(await sizesOf(ZERO) === 'M:6', '0 · and it still saves as before', await sizesOf(ZERO));
const zeroCode = await page.evaluate((name) => { const cat = window.KiwiBoutiqueCatalog; const p = cat.listProducts({ q: name }).find((x) => x.name === name); return cat.primaryBarcode(cat.getProduct(p.id).variants[0]); }, ZERO);
ok(/^20\d{11}$/.test(zeroCode), '0 · option off: the barcode comes from the shop counter, as before', zeroCode);
await close();
await page.evaluate(() => { window.KiwiConfig.features.boutiqueSizeColors = true; });

/* ── A · B · C : quick entry, remainder, save ─────────────────────────────── */
const ONE = 'TEST KIWI Hoodie split';
await create(ONE, 30);
ok(await page.$eval('[data-kbsp-quick]', (i) => i === document.activeElement), 'the quick entry has the focus when the sizes screen opens');
ok(await page.$eval('[data-kbsp]', (el) => /Répartir les 30 pièces/.test(el.textContent)), 'it says how many pieces are to split');
await page.keyboard.type('s-xl 5 m3', { delay: 25 });
await sleep(300);
ok(JSON.stringify(await boxes()) === JSON.stringify(['', '', '5', '8', '5', '5', '']), 'A · « S-XL 5 M3 » fills S 5 · M 8 · L 5 · XL 5 while typing', JSON.stringify(await boxes()));
ok(await page.$eval('[data-kbs-count]', (el) => el.textContent.trim()) === '23 sur 30 réparties', 'the count follows', await page.$eval('[data-kbs-count]', (el) => el.textContent));
const rest = await page.$eval('[data-kbsp-rest]', (b) => b.textContent.trim()).catch(() => '');
ok(rest === 'Mettre les 7 restantes sur M', 'B · the remainder link names the last size typed', rest);
await click('[data-kbsp-rest]');
ok((await boxes())[3] === '15', 'B · one click puts the 7 pieces on M');
ok(await page.$eval('[data-kbs-count]', (el) => el.classList.contains('is-ok')), 'the count turns to « all split »');
await click('[data-kbs-save]');
await sleep(500);
ok(await sizesOf(ONE) === 'S:5 M:15 L:5 XL:5', 'C · saved as four sizes, none created at 0', await sizesOf(ONE));
ok(!!(await page.$('[data-kbsp-total]')), 'after saving, the strip offers a restock split with its own total');
await close();

/* ── D : chips, undo, arrows ──────────────────────────────────────────────── */
const TWO = 'TEST KIWI Caftan split';
await create(TWO, 24);
await page.waitForFunction(() => { const b = document.querySelector('[data-kbsp-go="curve"]'); return b && !b.disabled && b.textContent.trim(); }, { timeout: 5000 });
const chip = await page.$eval('[data-kbsp-go="curve"]', (b) => b.textContent.trim());
ok(/Comme vos ventes|Comme votre stock|Courbe classique/.test(chip), 'the shape chip says where the shape comes from', chip);
ok(await page.$eval('[data-kbsp-why]', (p) => p.textContent.length > 10), 'a line explains it in words');
ok(await page.$$eval('[data-kbsp-bar]', (all) => all.some((b) => +getComputedStyle(b).getPropertyValue('--g') > 0)), 'the curve is previewed before any tap');
await click('[data-kbsp-go="curve"]');
let v = (await boxes()).map((x) => +x || 0);
ok(v.reduce((s, x) => s + x, 0) === 24, 'one tap splits all 24 pieces', JSON.stringify(v));
await click('[data-kbsp-undo]');
ok((await boxes()).every((x) => x === ''), 'Annuler empties the boxes again');
await click('[data-kbsp-go="even"]');
v = (await boxes()).map((x) => +x || 0);
ok(JSON.stringify(v) === JSON.stringify([3, 3, 4, 4, 4, 3, 3]), 'Égal · 3 each, the 3 extra on S M L', JSON.stringify(v));
const mBox = (await page.$$('[data-kbs-in]'))[3];
await mBox.click();
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowDown');
ok((await boxes())[3] === '5', 'arrow up twice, down once · M goes from 4 to 5');
ok(await page.$eval('[data-kbsp-msg]', (m) => /1 pièce de trop/.test(m.textContent)), 'one piece over the total is said plainly', await page.$eval('[data-kbsp-msg]', (m) => m.textContent));
await page.keyboard.press('ArrowDown');
await click('[data-kbs-save]');
await sleep(500);
ok(await sizesOf(TWO) === 'XXS:3 XS:3 S:4 M:4 L:4 XL:3 XXL:3', 'saved as the even split', await sizesOf(TWO));
await close();

/* ── E : colours ──────────────────────────────────────────────────────────── */
const THREE = 'TEST KIWI Robe noire';
await create(THREE, 14);
const chips = () => page.$$eval('.kbc-chip', (all) => all.map((c) => c.textContent.trim()));
ok(JSON.stringify(await chips()) === JSON.stringify(['Noir']), 'E · the colour in the name is picked: Noir', JSON.stringify(await chips()));
await page.keyboard.type('noir s-xl 2 bleu m3 l3', { delay: 30 });
await sleep(500);
ok(JSON.stringify(await chips()) === JSON.stringify(['Noir', 'Bleu']), 'E · typing « bleu » adds the blue column', JSON.stringify(await chips()));
ok(!!(await page.$('table.kbm')), 'two colours · the screen becomes a size × colour grid');
ok(await page.$eval('[data-kbsp-quick]', (i) => i === document.activeElement && /BLEU M3 L3|bleu m3 l3/i.test(i.value)), 'the typing carries on in quick entry after the column appears');
const col = (k) => page.$eval(`[data-kbm-tot="${k}"]`, (th) => th.textContent.trim());
ok(await col('noir') === '8' && await col('bleu') === '6', 'column totals · Noir 8, Bleu 6', (await col('noir')) + ' / ' + (await col('bleu')));
const segs = await page.$$eval('[data-kbsp-bar]', (bars) => bars.map((b) => [...b.querySelectorAll('.kbsp-stack i')].filter((i) => +i.style.flexGrow > 0).length));
ok(segs[3] === 2 && segs[2] === 1, 'size M is stacked in two colours, S in one', JSON.stringify(segs));
ok(await page.$eval('[data-kbs-count]', (el) => el.classList.contains('is-ok')), '14 of 14 split');
await click('[data-kbs-save]');
await sleep(500);
const robe = await page.evaluate((name) => {
  const cat = window.KiwiBoutiqueCatalog;
  const p = cat.listProducts({ q: name }).find((x) => x.name === name);
  const d = cat.getProduct(p.id);
  return { list: d.variants.map((v) => v.colorId + ':' + v.size + '=' + v.stock).sort().join(' '), codes: d.variants.every((v) => !!cat.primaryBarcode(v)), blueLabel: (d.variants.find((v) => v.colorId === 'bleu') || {}).colorLabel };
}, THREE);
ok(robe.list === 'bleu:L=3 bleu:M=3 noir:L=2 noir:M=2 noir:S=2 noir:XL=2', 'E · saved as six colour + size variants', robe.list);
ok(robe.codes && robe.blueLabel === 'Bleu', 'each has its barcode, and carries its colour name');
const label = await page.evaluate(async (u) => {
  const m = await import(u.replace(/pos-boutique\.js\?v=\d+$/, 'boutique-sizes.js'));
  return m.variantWords({ colorId: 'bleu', colorLabel: 'Bleu', size: 'M' }, 'fr');
}, coreUrl);
ok(label === 'Bleu · M', 'the till and the label say « Bleu · M »', label);
const codes = await page.evaluate((name) => {
  const cat = window.KiwiBoutiqueCatalog;
  const p = cat.listProducts({ q: name }).find((x) => x.name === name);
  const by = {}; cat.getProduct(p.id).variants.forEach((v) => { by[v.colorId + ':' + v.size] = cat.primaryBarcode(v); });
  return by;
}, THREE);
const bm = codes['bleu:M'] || '', ns = codes['noir:S'] || '', nxl = codes['noir:XL'] || '';
ok(bm.slice(1, 3) === '31' && bm.slice(10, 12) === '04' && ns.slice(1, 3) === '10' && ns.slice(10, 12) === '03' && nxl.slice(10, 12) === '06', 'E · readable barcodes · Bleu M = 2 31 … 04, Noir S = 2 10 … 03', JSON.stringify(codes));
ok(new Set(Object.values(codes).map((c) => c.slice(3, 10))).size === 1, 'E · every variant of the dress shares the same middle');
ok(await page.$$eval('table.kbm .kbm-code b', (b) => b.length) >= 12 && await page.$eval('.kbm-key', (p) => /deux chiffres pour la couleur/.test(p.textContent)), 'E · the grid shows each code with its colour and size digits in green, and says how to read them');
ok(await page.$eval('table.kbm thead .kbm-dig', (d) => d.textContent.trim()) === '10', 'E · the black dot carries its code, 10');
const clash = await page.evaluate(async () => {
  const cat = window.KiwiBoutiqueCatalog;
  const C = await import('/assets/boutique-size-codes.js');
  const p = cat.addProduct({ name: 'TEST KIWI Pull beige marron', priceMAD: 100, kind: 'taille' });
  const a = cat.ensureVariant({ productId: p.id, colorId: 'beige', size: 'M', stock: 1 }).variant;
  const b = cat.ensureVariant({ productId: p.id, colorId: 'marron', size: 'M', stock: 1 }).variant;
  const plan = C.planner(cat, p.id, ['M']);
  const ca = cat.generateBarcode(a.id, plan.code('beige', 'M'));
  const cb = cat.generateBarcode(b.id, plan.code('marron', 'M'));
  cat.deleteProduct && cat.deleteProduct(p.id);
  return { ca, cb, read: [C.parts(ca), C.parts(cb)].map((x) => x && x[1] + '/' + x[3]) };
});
ok(clash.ca !== clash.cb && clash.read.join(' ') === '01/04 12/04', 'beige M and brown M · two readable codes of their own (01 and 12), nothing shared', JSON.stringify(clash));
await close();

ok(errors.length === 0, 'no page error', errors.slice(0, 3).join(' | '));
await h.close?.();
console.log(`\nboutique-size-split-browser: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
