#!/usr/bin/env node
/* Kiwi · boutique-drafts-browser-test · nothing typed on the boutique till is
 * lost by closing a window, and a count that does not match the announced
 * total can still be saved.
 *
 * Owner, 25 November 2026: « before counting you create the product with a
 * minimum quantity, say one; when you finish counting it doesn't let you…
 * make me a button that lets me do it anyway », and « when you leave by
 * mistake it deletes everything; it needs to remember and put it back ».
 *   A · a product created with total 1, five pieces typed in the sizes, the
 *       window closed: reopening brings back « Quantité totale 1 », the five
 *       pieces and a note that says so;
 *   B · Enregistrer refuses (5 ≠ 1) and offers « Enregistrer 5 pièces quand
 *       même », which saves exactly what was counted and forgets the draft;
 *   C · the « Nouveau produit » form: name, price and total typed, the window
 *       closed, reopened with them back; « Tout effacer » empties it; a created
 *       product leaves no draft behind;
 *   D · colours on: an added colour column and its numbers come back too;
 *   E · six colours on a portrait iPad: the grid scrolls sideways, the new
 *       colour shows, the size column stays pinned;
 *   F · the dashboard's « Nouveau produit » (Maison Mansour demo) keeps its
 *       name and price across a close too.
 * Demo till only: nothing reaches a server.
 *   node tools/boutique-drafts-browser-test.mjs
 */
import { harness, demoPage, dashboardWalker, sleep } from './surface-matrix-lib.mjs';

const h = await harness('boutique-drafts');
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
const pidOf = (name) => page.evaluate((name) => { const cat = window.KiwiBoutiqueCatalog; const p = cat.listProducts({ q: name }).find((x) => x.name === name); return p ? p.id : null; }, name);
const sizesOf = (name) => page.evaluate((name) => {
  const cat = window.KiwiBoutiqueCatalog;
  const p = cat.listProducts({ q: name }).find((x) => x.name === name);
  return p ? cat.getProduct(p.id).variants.map((v) => v.size + ':' + v.stock).join(' ') : null;
}, name);
const drafts = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('kiwiDraft:')));
/* « Fermer » : the cross or the footer button, whichever the open window has. */
const close = async () => {
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-inv-x]')].find((x) => x.offsetParent); if (b) b.click(); });
  await sleep(500);
};
const reopen = async (name) => {
  const pid = await pidOf(name);
  await page.evaluate((pid) => {
    const q = document.querySelector('.bqi-scan input');
    if (q) { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); }
  }, pid);
  await sleep(300);
  await page.waitForSelector(`[data-inv-open="${pid}"]`, { timeout: 5000 });
  await page.evaluate((pid) => document.querySelector(`[data-inv-open="${pid}"]`).click(), pid);
  await page.waitForSelector('[data-kbs-in]', { visible: true, timeout: 8000 });
  await sleep(300);
};
const setBox = (i, v) => page.evaluate((i, v) => { const b = document.querySelectorAll('[data-kbs-in]')[i]; b.value = v; b.dispatchEvent(new Event('input', { bubbles: true })); }, i, v);

/* ── A · the count survives a closed window ───────────────────────────────── */
const ONE = 'TEST KIWI Carton compté';
await click('#bqi-new');
await type('[data-bqx-name]', ONE);
await type('[data-bqi-price]', '390');
await type('[data-kbs-total]', '1');
await click('#bqi-n-save');
await page.waitForSelector('[data-kbs-in]', { visible: true, timeout: 8000 });
await sleep(300);
await setBox(2, '3');   // S
await setBox(3, '2');   // M
await close();
ok(!(await page.$eval('[data-kbs-in]', (el) => !!el.offsetParent).catch(() => false)) && await sizesOf(ONE) === '', 'A · the window is closed with five pieces typed and nothing saved', await sizesOf(ONE));
await reopen(ONE);
ok(JSON.stringify(await boxes()) === JSON.stringify(['', '', '3', '2', '', '', '']), 'A · reopening brings the five pieces back in their sizes', JSON.stringify(await boxes()));
ok(await page.$eval('.kbs-top', (el) => /Quantité totale\s*1/.test(el.textContent)), 'A · and the creation total of 1, so the screen is still the creation one', await page.$eval('.kbs-top', (el) => el.textContent));
ok(await page.$eval('[data-kbd-note]', (el) => /revenue/.test(el.textContent)).catch(() => false), 'A · a note says the entries came back');

/* ── B · save what was counted ───────────────────────────────────────────── */
await click('[data-kbs-save]');
ok(await page.$eval('[data-kbs-msg]', (m) => /font 5 pièces/.test(m.textContent)), 'B · Enregistrer still says the sizes (5) do not match the total (1)');
const force = await page.$eval('[data-kbs-force]', (b) => b.textContent.trim()).catch(() => '');
ok(force === 'Enregistrer 5 pièces quand même', 'B · and offers to save the 5 counted pieces anyway', force);
await click('[data-kbs-force]');
await sleep(400);
ok(await sizesOf(ONE) === 'S:3 M:2', 'B · exactly what was counted is saved', await sizesOf(ONE));
ok(!(await drafts()).some((k) => /:sizes:/.test(k)), 'B · and the draft is forgotten', JSON.stringify(await drafts()));
await close();
await reopen(ONE);
ok(!(await page.$('[data-kbd-note]')) && (await boxes()).every((x) => x === ''), 'B · reopened after saving: no note, empty boxes');
await setBox(3, '1');
await close();
await reopen(ONE);
ok((await boxes())[3] === '1', 'B · a restock typed and left also comes back');
await close();

/* ── C · the « Nouveau produit » form ────────────────────────────────────── */
const TWO = 'TEST KIWI Robe à moitié saisie';
await click('#bqi-new');
await type('[data-bqx-name]', TWO);
await type('[data-bqi-price]', '450');
await type('[data-kbs-total]', '12');
await close();
await click('#bqi-new');
const back = await page.evaluate(() => [document.querySelector('[data-bqx-name]').value, document.querySelector('[data-bqi-price]').value, document.querySelector('[data-kbs-total]').value]);
ok(JSON.stringify(back) === JSON.stringify([TWO, '450', '12']), 'C · name, price and total come back in the new-product form', JSON.stringify(back));
ok(await page.$eval('[data-kbd-note]', (el) => !!el.offsetParent).catch(() => false), 'C · with the note at the top of the form');
ok(await page.$eval('[data-bqi-pn]', (el) => el.textContent.trim()) === TWO, 'C · the preview card follows the restored name');
await click('[data-kbd-clear]');
const cleared = await page.evaluate(() => [document.querySelector('[data-bqx-name]').value, document.querySelector('[data-bqi-price]').value, document.querySelector('[data-kbs-total]').value]);
ok(cleared.every((x) => x === '') && !(await page.$('[data-kbd-note]')), '« Tout effacer » empties the form and removes the note', JSON.stringify(cleared));
await type('[data-bqx-name]', TWO);
await type('[data-bqi-price]', '450');
await type('[data-kbs-total]', '2');
await click('#bqi-n-save');
await page.waitForSelector('[data-kbs-in]', { visible: true, timeout: 8000 });
await close();
await click('#bqi-new');
ok(await page.$eval('[data-bqx-name]', (i) => i.value) === '' && !(await page.$('[data-kbd-note]')), 'C · a created product leaves no form draft behind');
await close();

/* ── D · colours on: the added column comes back with its numbers ────────── */
await page.evaluate(() => { window.KiwiConfig.features.boutiqueSizeColors = true; });
const THREE = 'TEST KIWI Pull couleurs';
await click('#bqi-new');
await type('[data-bqx-name]', THREE);
await type('[data-bqi-price]', '300');
await type('[data-kbs-total]', '1');
await click('#bqi-n-save');
await page.waitForSelector('[data-kbsp-quick]', { visible: true, timeout: 8000 });
await click('[data-kbc-add]');
const pick = await page.$eval('[data-kbc-pick]', (b) => b.getAttribute('data-kbc-pick')).catch(() => '');
await click(`[data-kbc-pick="${pick}"]`);
const cols = await page.$$eval('[data-kbs-col]', (all) => [...new Set(all.map((i) => i.getAttribute('data-kbs-col')))]);
const col = cols[cols.length - 1];
await page.evaluate((col) => { const i = document.querySelectorAll(`[data-kbs-col="${col}"]`)[3]; i.value = '4'; i.dispatchEvent(new Event('input', { bubbles: true })); }, col);
await close();
await reopen(THREE);
const colsBack = await page.$$eval('[data-kbs-col]', (all) => [...new Set(all.map((i) => i.getAttribute('data-kbs-col')))]);
ok(colsBack.includes(col), 'D · the colour added before closing is back as a column', JSON.stringify({ col, colsBack }));
ok(await page.evaluate((col) => document.querySelectorAll(`[data-kbs-col="${col}"]`)[3].value, col) === '4', 'D · with its 4 pieces on M');
await close();

/* ── E · more than four colours on an iPad: the grid scrolls sideways ────────
   Owner, 25 Nov (photo of a portrait iPad): « when you have more than 4
   colours you can't drag to see the other ones ». */
await page.setViewport({ width: 820, height: 1180 });
await reopen(THREE);
for (let k = 0; k < 4; k++) {
  if (!(await page.$('[data-kbc-pal]:not([hidden])'))) await click('[data-kbc-add]');
  const next = await page.$$eval('[data-kbc-pal]:not([hidden]) [data-kbc-pick]', (all) => all.filter((b) => b.offsetParent).map((b) => b.getAttribute('data-kbc-pick')));
  await click(`[data-kbc-pal]:not([hidden]) [data-kbc-pick="${next[0]}"]`);
}
const geo = () => page.$eval('[data-kbm-scroll]', (sc) => {
  const box = sc.getBoundingClientRect();
  const heads = [...sc.querySelectorAll('thead th[scope="col"]')].map((th) => th.getBoundingClientRect());
  const last = heads[heads.length - 1];
  return { n: heads.length, sw: sc.scrollWidth, cw: sc.clientWidth, x: sc.scrollLeft, lastIn: last.left >= box.left - 1 && last.right <= box.right + 1, boxRight: box.right, vw: innerWidth };
});
let g = await geo();
ok(g.n >= 5 && g.sw > g.cw, 'E · six colours on a portrait iPad: the grid is wider than its box and scrolls', JSON.stringify(g));
ok(g.lastIn, 'E · the colour just added is scrolled into view', JSON.stringify(g));
ok(g.boxRight <= g.vw, 'E · the grid box itself stays inside the screen', JSON.stringify(g));
/* A real finger: a touch drag from right to left slides the grid. */
await page.$eval('[data-kbm-scroll]', (sc) => { sc.scrollLeft = 0; sc.scrollIntoView({ block: 'center' }); });
await sleep(200);
const rb = await page.$eval('[data-kbm-scroll] tbody tr:nth-child(2) th', (th) => { const r = th.closest('[data-kbm-scroll]').getBoundingClientRect(); return { y: th.getBoundingClientRect().top + 20, x0: r.right - 30, x1: r.left + 120 }; });
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: rb.y }] });
await touch('touchStart', rb.x0);
for (let k = 1; k <= 12; k++) { await touch('touchMove', rb.x0 + (rb.x1 - rb.x0) * k / 12); await sleep(16); }
await touch('touchEnd');
await sleep(500);
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
const slid = await page.$eval('[data-kbm-scroll]', (sc) => sc.scrollLeft);
ok(slid > 40, 'E · a finger dragged right to left slides the grid to the hidden colours', 'scrollLeft ' + slid);
await page.$eval('[data-kbm-scroll]', (sc) => { sc.scrollLeft = 0; });
const firstCol = await page.$eval('[data-kbm-scroll] th[scope="row"]', (th) => th.getBoundingClientRect().left);
await page.$eval('[data-kbm-scroll]', (sc) => { sc.scrollLeft = sc.scrollWidth; });
g = await geo();
const stuck = await page.$eval('[data-kbm-scroll] th[scope="row"]', (th) => th.getBoundingClientRect().left);
ok(g.x > 0 && Math.abs(stuck - firstCol) < 2, 'E · dragged to the end, the size column stays pinned on the left', JSON.stringify({ x: g.x, firstCol, stuck }));
const sx = g.x;
await page.evaluate(() => { const i = document.querySelectorAll('[data-kbs-in]')[0]; i.value = '2'; i.dispatchEvent(new Event('input', { bubbles: true })); });
ok((await geo()).x === sx, 'E · typing a number does not jump the grid back to the start');
await close();
await page.setViewport({ width: 1366, height: 900 });

await page.evaluate((names) => { const cat = window.KiwiBoutiqueCatalog; names.forEach((nm) => { const p = cat.listProducts({ q: nm }).find((x) => x.name === nm); if (p && cat.deleteProduct) cat.deleteProduct(p.id); }); }, [ONE, TWO, THREE]);
ok(errors.length === 0, 'no page error', errors.slice(0, 3).join(' | '));

/* ── F · the dashboard form remembers too ─────────────────────────────────── */
{
  // coverage: surface=dashboard-product-editor locale=fr viewport=tablet
  const { page: dash } = await dashboardWalker(h).open({ step() {}, watch: (p) => p }, 'dashboard-transactions', 'fr', 'tablet');
  const js = (sel) => dash.evaluate((sel) => document.querySelector(sel).click(), sel);
  await js('[data-action="venue-toggle"]'); await sleep(400);
  await js('[data-action="venue-pick"][data-venue="maisonMansour"]');
  await dash.waitForSelector('[data-nav="inventory"]', { timeout: 8000 });
  await js('[data-nav="inventory"]'); await sleep(800);
  await js('[data-action="bqx-new"]');
  await dash.waitForSelector('[data-bqx-name]', { visible: true, timeout: 8000 }); await sleep(400);
  await dash.type('[data-bqx-name]', 'TEST KIWI fiche du tableau');
  await dash.type('[data-bqx-price]', '220');
  await sleep(300);
  await dash.keyboard.press('Escape'); await sleep(800);
  await js('[data-action="bqx-new"]');
  await dash.waitForSelector('[data-bqx-name]', { visible: true, timeout: 8000 });
  await dash.waitForSelector('[data-kbd-note]', { timeout: 5000 }).catch(() => null);
  const back = await dash.evaluate(() => [document.querySelector('[data-bqx-name]').value, document.querySelector('[data-bqx-price]').value]);
  ok(JSON.stringify(back) === JSON.stringify(['TEST KIWI fiche du tableau', '220']), 'F · dashboard « Nouveau produit »: name and price come back after a close', JSON.stringify(back));
  ok(!!(await dash.$('[data-kbd-note]')), 'F · with the same note and « Tout effacer »');
  await dash.click('[data-kbd-clear]'); await sleep(300);
  ok(await dash.$eval('[data-bqx-name]', (i) => i.value) === '', 'F · « Tout effacer » empties it');
}
await h.close?.();
console.log(`\nboutique-drafts-browser: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
