#!/usr/bin/env node
/* Kiwi · scanned-line-remise-browser-test · a discount on ONE ticket line.
 *
 * Owner, 24 November 2026: « it does not let me do reduction on the scanned
 * article ». A scan puts the article straight on the ticket; the discount
 * chips lived only in the sheet a tile opens, and the boutique ticket had no
 * « Remise » button at all. Now, on the boutique and the maison till:
 *   · every ticket line has a « Remise » button;
 *   · it opens the discount picker for THAT line only: −10 % lands on it, the
 *     other line is untouched;
 *   · « Sans » takes it off again;
 *   · the boutique ticket has a « Remise sur le ticket » button (maison had one).
 * Demo tills only, opened by KiwiPosDispatch.unlockById: no code is entered.
 *   node tools/scanned-line-remise-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const SHOT = process.env.SHOT || '';
const h = await harness('scanned-line-remise');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };

async function scanKeys(page, code) {
  const c = await page.createCDPSession(); let t = Date.now() / 1000;
  for (const ch of code) { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: 'Digit' + ch, text: ch, timestamp: t }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: 'Digit' + ch, timestamp: t + 0.002 }); t += 0.008; }
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, timestamp: t });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, timestamp: t + 0.002 });
  await c.detach(); await sleep(600);
}

for (const T of [
  { id: 'boutique', on: '#pos-boutique.is-on, body.is-pos-boutique', line: '.bq-line', btn: '[data-bq-rem-line]', chip: '[data-bq-tkrem]', tkBtn: '#bq-tk-remise' },
  { id: 'maison', on: '#pos-maison.is-on', line: '.mz-line', btn: '[data-mz-rem-line]', chip: '[data-mz-tkrem]', tkBtn: '#mz-tk-remise' },
]) {
  console.log(`· ${T.id}`);
  const { page } = await demoPage(h, 'fr', 'desktop', { 'kiwiSkin2027:dashboard': '0' });
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: SHOT ? 1.5 : 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  // coverage: surface=caisse-boutique locale=fr viewport=desktop
  // coverage: surface=caisse-maison locale=fr viewport=desktop
  await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
  await sleep(500);
  await page.evaluate((id) => window.KiwiPosDispatch.unlockById(id), T.id);
  await page.waitForSelector(T.on, { timeout: 20000 });
  await sleep(2000);
  const reset = await page.$('#bq-tk-reset, #mz-tk-reset');
  if (reset) { await reset.click(); await sleep(400); }
  const eans = await page.evaluate(() => { const c = window.KiwiBoutiqueCatalog; const out = []; for (const p of (c.listProducts({}) || [])) { for (const v of (c.getProduct(p.id).variants || [])) { const b = c.primaryBarcode(v); if (b && /^\d{8,13}$/.test(b) && v.stock > 0) { out.push(b); break; } } if (out.length >= 2) break; } return out; });
  ok(eans.length === 2, 'two articles with a barcode in stock', JSON.stringify(eans));
  for (const e of eans) await scanKeys(page, e);
  const lines = await page.$$eval(T.line, (a) => a.length);
  ok(lines === 2, 'both scans landed on the ticket', String(lines));
  ok((await page.$$eval(T.btn, (a) => a.filter((b) => b.offsetParent).length)) === 2, 'each line shows a « Remise » button');
  ok(!!(await page.$(T.tkBtn)), 'the ticket shows its « Remise sur le ticket » button');
  const totalBefore = await page.$eval('.bq-tk-total .val, .mz-tk-total .val', (x) => x.textContent.trim());
  await page.evaluate((sel) => document.querySelectorAll(sel)[0].click(), T.btn);
  await sleep(500);
  ok(/Remise ·/.test(await page.$eval('.modal-veil.is-open .modal-title', (x) => x.textContent).catch(() => '')), 'it opens « Remise · <article> »', await page.$eval('.modal-veil.is-open .modal-title', (x) => x.textContent).catch(() => 'no modal'));
  if (SHOT) await page.screenshot({ path: `${SHOT}/${T.id}-1-picker.png` });
  await page.evaluate((sel) => { const b = [...document.querySelectorAll(sel)].find((x) => /10 %/.test(x.textContent)); b && b.click(); }, T.chip);
  await sleep(700);
  const labels = await page.$$eval(T.btn, (a) => a.map((b) => b.textContent.trim()));
  ok(/10 %/.test(labels[0]) && /^Remise$/.test(labels[1]), '−10 % lands on that line only', JSON.stringify(labels));
  const totalAfter = await page.$eval('.bq-tk-total .val, .mz-tk-total .val', (x) => x.textContent.trim());
  ok(totalAfter !== totalBefore, 'the total drops', `${totalBefore} → ${totalAfter}`);
  if (SHOT) await page.screenshot({ path: `${SHOT}/${T.id}-2-ticket.png` });
  await page.evaluate((sel) => document.querySelectorAll(sel)[0].click(), T.btn);
  await sleep(500);
  await page.evaluate((sel) => { const b = [...document.querySelectorAll(sel)].find((x) => /Sans/.test(x.textContent)); b && b.click(); }, T.chip);
  await sleep(600);
  ok((await page.$$eval(T.btn, (a) => a.map((b) => b.textContent.trim()))).every((x) => x === 'Remise'), '« Sans » takes it off again');
  ok(!errors.length, 'no page error', errors.join(' | '));
  await page.close();
}
console.log(bad ? `✗ scanned-line-remise: ${bad} failed, ${n} passed` : `✓ scanned-line-remise: ${n} passed`);
await h.close();
process.exit(bad ? 1 : 0);
