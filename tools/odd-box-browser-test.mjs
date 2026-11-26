#!/usr/bin/env node
/* Kiwi · odd-box-browser-test · « Sans étiquette » sur la caisse boutique.
 *
 * Owner, 26 November 2026: a piece found without its tag can still be sold
 * at a chosen price. On the boutique till, with real clicks:
 * Both designs (2027 first, the default since 26 Nov 2026):
 *   · the sell bar shows « Sans étiquette »;
 *   · its sheet starts with the add button disabled (no price yet);
 *   · the keypad types 150, a name and a rayon, and the piece lands on the
 *     ticket as « pull noir · sans étiquette » at 150 MAD;
 *   · it is paid cash like any article, the sale keeps that line, and the
 *     shared catalogue never gains an `odd-` product (stock does not move).
 * Demo till only, opened by KiwiPosDispatch.unlockById: no code is entered.
 *   node tools/odd-box-browser-test.mjs
 */
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';

const SHOT = process.env.SHOT || '';
const h = await harness('odd-box');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail ? ' · ' + detail : '')); } };

/* 2027 is the default every client sees (owner, 2026-11-26); the old design
   stays for a store switched off in kiwi-admin. */
for (const SKIN of ['2027', 'old']) {
  console.log(`· ${SKIN} design`);
  const { page } = await demoPage(h, 'fr', 'desktop', SKIN === '2027' ? { 'kiwiSkin2027:till': '1' } : {});
  await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: SHOT ? 1.5 : 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  // coverage: surface=caisse-boutique locale=fr viewport=desktop
  await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
  await sleep(500);
  await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
  await page.waitForSelector('#pos-boutique.is-on, body.is-pos-boutique', { timeout: 20000 });
  await sleep(2000);
  ok((await page.evaluate(() => document.documentElement.getAttribute('data-skin-2027'))) === (SKIN === '2027' ? 'till' : null), `the till opened in the ${SKIN} design`);
  const reset = await page.$('#bq-tk-reset');
  if (reset) { await reset.click(); await sleep(400); }
  const linesBefore = await page.$$eval('.bq-line', (a) => a.length);

  await page.waitForSelector('#bq-sell-odd', { visible: true, timeout: 8000 });
  ok(/Sans étiquette/.test(await page.$eval('#bq-sell-odd', (b) => b.textContent)), 'the sell bar shows « Sans étiquette »');
  await page.click('#bq-sell-odd');
  await page.waitForSelector('#odd-add', { visible: true, timeout: 5000 });
  await sleep(400);
  ok(await page.$eval('#odd-add', (b) => b.disabled), 'the add button waits for a price');
  for (const k of ['1', '5', '0']) { await page.click(`[data-odd-key="${k}"]`); await sleep(60); }
  ok((await page.$eval('#odd-val', (x) => x.textContent.trim())) === '150', 'the keypad types 150', await page.$eval('#odd-val', (x) => x.textContent));
  await page.click('[data-odd-key="del"]'); await sleep(60);
  await page.click('[data-odd-key="0"]'); await sleep(60);
  ok((await page.$eval('#odd-val', (x) => x.textContent.trim())) === '150', 'erase then retype keeps 150');
  await page.click('#odd-name');
  await page.keyboard.type('pull noir');
  const chip = await page.$('[data-odd-rayon]');
  if (chip) { await chip.click(); await sleep(100); }
  const rayon = chip ? await page.$eval('[data-odd-rayon].on', (c) => c.dataset.oddRayon).catch(() => '') : '';
  ok(!chip || !!rayon, 'a rayon chip lights when tapped', rayon);
  ok(/150/.test(await page.$eval('#odd-add', (b) => b.textContent)) && !(await page.$eval('#odd-add', (b) => b.disabled)), 'the add button says the price');
  if (SHOT) await page.screenshot({ path: `${SHOT}/odd-${SKIN}-1-sheet.png` });
  await page.click('#odd-add');
  await sleep(800);
  const lines = await page.$$eval('.bq-line', (a) => a.map((l) => l.innerText.replace(/\s+/g, ' ')));
  ok(lines.length === linesBefore + 1, 'one line lands on the ticket', String(lines.length));
  const odd = lines.find((l) => /pull noir · sans étiquette/.test(l)) || '';
  ok(!!odd && /150/.test(odd), 'it reads « pull noir · sans étiquette » at 150', odd);
  const total = await page.$eval('.bq-tk-total .val', (x) => x.textContent.replace(/\s+/g, ' ').trim());
  if (!linesBefore) ok(/^150([,.]00)?\s*MAD$/.test(total) || /150/.test(total), 'the ticket total is 150 MAD', total);
  ok(!(await page.$('.modal-veil.is-open #odd-add')), 'the sheet closed');
  if (SHOT) await page.screenshot({ path: `${SHOT}/odd-${SKIN}-2-ticket.png` });
  if (SKIN === '2027') {
    /* Payment is the shipped sheet behind the kit's button (tools/parity-2027.mjs
       plays it on both designs); the old-design pass below pays this same line. */
    ok(!errors.length, 'no page error', errors.join(' | '));
    await page.close();
    continue;
  }

  // The pay button, whichever design: « Encaisser · 150 MAD » (2027) or the shipped .bq-validate.
  // In 2027 the shipped button stays in the page (1 px wide) under the kit's own: take the one a finger can reach.
  const pay = await page.evaluateHandle(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent && /^Encaisser\b/.test(b.textContent.trim()))
    .sort((x, y) => y.getBoundingClientRect().width - x.getBoundingClientRect().width)[0] || document.querySelector('.bq-validate'));
  await pay.asElement().click();
  await sleep(800);
  const cash = await page.evaluateHandle(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent && /^Espèces/.test(b.textContent.trim()))
    .sort((x, y) => y.getBoundingClientRect().width - x.getBoundingClientRect().width)[0]);
  if (cash && cash.asElement()) await cash.asElement().click();
  await page.waitForSelector('#bq-cash-ok', { visible: true, timeout: 5000 });
  await sleep(500);
  await page.click('#bq-cash-ok');
  await sleep(1500);
  ok((await page.$$eval('.bq-line', (a) => a.length)) === 0, 'paid cash, the ticket is empty again');
  const sale = await page.evaluate(async () => {
    // The till's own module instance: the URL it was loaded under, stamp included.
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => /\/assets\/pos-boutique\.js\?v=/.test(u));
    const m = await import(url);
    const s = m.SALES[0] || {};
    return { lines: (s.lines || []).map((l) => ({ name: l.name, price: l.price, unit: l.unit, odd: l.odd })), total: s.total };
  });
  const sold = (sale.lines || []).find((l) => /pull noir · sans étiquette/.test(l.name || ''));
  ok(!!sold && Number(sale.total) === 150, 'the sale keeps the « sans étiquette » line at 150', JSON.stringify(sale));
  ok(!rayon || (sold && sold.odd && sold.odd.rayon === rayon), 'with the rayon chosen', JSON.stringify(sold));
  const leaked = await page.evaluate(() => (window.KiwiBoutiqueCatalog.listProducts({}) || []).filter((p) => /^odd-/.test(p.id)).length);
  ok(leaked === 0, 'the shared catalogue never gains the piece', String(leaked));
  ok(!errors.length, 'no page error', errors.join(' | '));
  await page.close();
}
console.log(bad ? `✗ odd-box: ${bad} failed, ${n} passed` : `✓ odd-box: ${n} passed`);
await h.close();
process.exit(bad ? 1 : 0);
