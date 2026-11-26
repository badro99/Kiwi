#!/usr/bin/env node
/* Kiwi · boutique-size-minus-browser-test · the − of the restock grid takes
 * from the existing stock too.
 *
 * Owner, 25 Nov 2026 (photo of the iPad): « make the minus able to deduct old
 * stock as well, not just the new one ». On the restock screen the − now goes
 * below zero on a size that has stock, never further than that stock:
 *   A · two taps on − give −2, the size says « 3 → 1 en stock » in red, the
 *       count says « 2 pièces à retirer »; saving leaves S at 1, as an
 *       adjustment (ajust) in the stock journal;
 *   B · −5 on a size with 1 is refused in words and moves nothing;
 *   C · « +4 » on L and « −1 » on S save together;
 *   D · a size with nothing in stock cannot go below zero.
 * Demo till only: nothing reaches a server.
 *   node tools/boutique-size-minus-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('boutique-size-minus');
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


const stepOn = (i, d) => page.evaluate((i, d) => { const b = document.querySelectorAll('[data-kbs-in]')[i].closest('li, td').querySelector(`[data-kbs-step="${d}"]`); b.click(); }, i, d);
const haveText = (i) => page.evaluate((i) => { const inp = document.querySelectorAll('[data-kbs-in]')[i]; const h = document.querySelector(`[data-kbs-have="${CSS.escape(inp.getAttribute('data-kbs-in'))}"]`); return h ? [h.textContent.trim(), h.classList.contains('is-down')] : null; }, i);
const countText = () => page.$eval('[data-kbs-count]', (c) => c.textContent.trim());
const msg = () => page.$eval('[data-kbs-msg]', (m) => m.textContent.trim());

/* Setup: a product with S 3 and L 2. */
const NAME = 'TEST KIWI Jean retrait';
await click('#bqi-new');
await type('[data-bqx-name]', NAME);
await type('[data-bqi-price]', '200');
await type('[data-bqi-cost]', '100');   // le coût d'achat est exigé (26 nov.)
await type('[data-kbs-total]', '5');
await click('#bqi-n-save');
await page.waitForSelector('[data-kbs-in]', { visible: true, timeout: 8000 });
await sleep(300);
await setBox(2, '3');   // S
await setBox(4, '2');   // L
await click('[data-kbs-save]');
await sleep(400);
ok(await sizesOf(NAME) === 'S:3 L:2', 'setup · S 3 and L 2 in stock', await sizesOf(NAME));
await close();
await reopen(NAME);
/* ── A · minus below zero takes from the existing stock ─────────────────── */
const sKey = await page.evaluate((name) => { const cat = window.KiwiBoutiqueCatalog; const p = cat.listProducts({ q: name }).find((x) => x.name === name); const v = cat.getProduct(p.id).variants.find((x) => x.size === 'S'); return v.id; }, NAME);
const sIdx = await page.evaluate((k) => [...document.querySelectorAll('[data-kbs-in]')].findIndex((i) => i.getAttribute('data-kbs-in') === k), sKey);
ok(sIdx >= 0, 'A · the S box is on the restock screen', String(sIdx));
await stepOn(sIdx, -1); await stepOn(sIdx, -1);
ok((await boxes())[sIdx] === '-2', 'A · two taps on − give −2', JSON.stringify(await boxes()));
const h1 = await haveText(sIdx);
ok(h1 && /3 → 1 en stock/.test(h1[0]) && h1[1], 'A · the size says « 3 → 1 en stock » in red', JSON.stringify(h1));
ok(/2 pièces à retirer/.test(await countText()), 'A · the count says 2 pieces to remove', await countText());
await stepOn(sIdx, -1); await stepOn(sIdx, -1);
ok((await boxes())[sIdx] === '-3', 'A · − stops at the stock (3), never below', (await boxes())[sIdx]);
await stepOn(sIdx, 1);
await page.evaluate(() => { const cat = window.KiwiBoutiqueCatalog; const orig = cat.adjustStock; window.__adj = []; cat.adjustStock = (id, d, why, extra) => { window.__adj.push([id, d, why]); return orig(id, d, why, extra); }; });
await click('[data-kbs-save]');
await sleep(400);
ok(await sizesOf(NAME) === 'S:1 L:2', 'A · saved: S goes from 3 to 1, L untouched', await sizesOf(NAME));
ok(JSON.stringify(await page.evaluate(() => window.__adj)) === JSON.stringify([[sKey, -2, 'ajust']]), 'A · saved as one stock adjustment (ajust) of −2', JSON.stringify(await page.evaluate(() => window.__adj)));

/* ── B · more than the stock is refused in words ────────────────────────── */
await setBox(sIdx, '-5');
await click('[data-kbs-save]');
ok(/plus que le stock/.test(await msg()), 'B · −5 on a size with 1 is refused', await msg());
ok(await sizesOf(NAME) === 'S:1 L:2', 'B · and nothing moved', await sizesOf(NAME));

/* ── C · add and remove in one save ─────────────────────────────────────── */
const lKey = await page.evaluate((name) => { const cat = window.KiwiBoutiqueCatalog; const p = cat.listProducts({ q: name }).find((x) => x.name === name); return cat.getProduct(p.id).variants.find((x) => x.size === 'L').id; }, NAME);
const lIdx = await page.evaluate((k) => [...document.querySelectorAll('[data-kbs-in]')].findIndex((i) => i.getAttribute('data-kbs-in') === k), lKey);
await setBox(sIdx, '-1');
await setBox(lIdx, '4');
ok(/4 pièces à ajouter · 1 pièce à retirer/.test(await countText()), 'C · the count says both', await countText());
await click('[data-kbs-save]');
await sleep(400);
ok(await sizesOf(NAME) === 'S:0 L:6', 'C · S 1 → 0 and L 2 → 6', await sizesOf(NAME));

/* ── D · a size with nothing in stock cannot go below zero ──────────────── */
await stepOn(sIdx, -1);
ok((await boxes())[sIdx] === '', 'D · − on an empty size stays empty', JSON.stringify((await boxes())[sIdx]));
await close();

await page.evaluate((nm) => { const cat = window.KiwiBoutiqueCatalog; const p = cat.listProducts({ q: nm }).find((x) => x.name === nm); if (p && cat.deleteProduct) cat.deleteProduct(p.id); }, NAME);
ok(errors.length === 0, 'no page error', errors.slice(0, 3).join(' | '));
await h.close?.();
console.log(`\nboutique-size-minus-browser: ${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
