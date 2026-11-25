#!/usr/bin/env node
/* Kiwi · exchange-price-cut-browser-test · « Baisser la différence » on the
 * boutique till's exchange sheet, with real clicks in the demo till.
 *
 * Owner, 25 Nov 2026: a customer swapped for a dearer piece and the shop let
 * her pay 150 instead of the 169 the till asked. Held here:
 *   · a positive difference shows « Baisser la différence »; a tap opens
 *     « La cliente paie »;
 *   · typing an amount below the difference updates the shown difference and
 *     the « Encaisser » button, and says what was given;
 *   · a figure not below the difference is refused in words and changes nothing;
 *   · « Encaisser » opens the payment sheet on the lowered amount.
 * Money and records are held by tools/exchange-price-cut-test.mjs.
 *   node tools/exchange-price-cut-browser-test.mjs */
import assert from 'node:assert/strict';
import { harness, openTill, sleep } from './surface-matrix-lib.mjs';

const h = await harness('exchange-price-cut-browser');
const wait = { visible: true, timeout: 6000 };
const num = (s) => Number(String(s).replace(/[^\d,.]/g, '').replace(/\s/g, '').replace(',', '.'));

try {
  await h.S.run('lower an exchange difference · fr · tablet', async (t) => {
    // coverage: surface=boutique-exchange locale=fr viewport=tablet
    const { page } = await openTill(h, t, 'caisse-boutique', 'fr', 'tablet');
    const click = async (sel) => { await page.waitForSelector(sel, wait); await page.click(sel); };
    t.step('pick a seeded past sale and start an exchange');
    await page.evaluate(() => document.querySelector('[data-bq-view="echanges"]').click());
    await click('[data-bq-pick="1207:0"]');
    await click('[data-bq-motif="Taille"]');
    await click('[data-bq-do-exch]');
    await page.waitForSelector('#bq-exch-cancel', wait);
    t.step('choose the dearest replacement in stock');
    const item = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-bq-item]:not(.is-out)')];
      const price = (b) => Number((b.textContent.match(/(\d[\d\s]*)(?:[.,]\d+)?\s*MAD/) || [, '0'])[1].replace(/\s/g, ''));
      cards.sort((a, b) => price(b) - price(a));
      return cards[0] && cards[0].getAttribute('data-bq-item');
    });
    assert.ok(item, 'a replacement card exists');
    await click(`[data-bq-item="${item}"]`);
    await page.waitForSelector('#bq-sheet-veil.is-open #bq-sheet-add', wait);
    await sleep(400);
    await click('#bq-sheet-add');
    await page.waitForSelector('#bq-exch-veil.is-open #bq-exch-go', wait);
    const diff = num(await page.$eval('.bq-exch-diff .amt', (el) => el.textContent));
    assert.ok(diff > 20, 'the replacement costs more than the returned piece: ' + diff);

    t.step('open « La cliente paie »');
    await click('[data-bq-xc-open]');
    await page.waitForSelector('[data-bq-xc-in]', wait);
    t.step('a figure not below the difference is refused');
    await page.type('[data-bq-xc-in]', String(diff + 5));
    assert.equal(await page.$eval('[data-bq-xc-in]', (i) => i.getAttribute('aria-invalid')), 'true');
    assert.match(await page.$eval('[data-bq-xc-msg]', (m) => m.textContent), /Moins que/);
    assert.equal(num(await page.$eval('.bq-exch-diff .amt', (el) => el.textContent)), diff, 'the difference is untouched');

    t.step('type what the customer pays');
    const pay = diff - 19;
    await page.click('[data-bq-xc-in]', { clickCount: 3 });
    await page.type('[data-bq-xc-in]', String(pay));
    assert.equal(num(await page.$eval('.bq-exch-diff .amt', (el) => el.lastChild.textContent)), pay, 'the shown difference follows');
    assert.equal(num(await page.$eval('.bq-exch-diff .amt s', (el) => el.textContent)), diff, 'with the old difference struck through');
    const goText = await page.$eval('#bq-exch-go', (b) => b.textContent.trim());
    assert.ok(/^Encaisser/.test(goText) && num(goText) === pay, 'the button reads Encaisser ' + pay + ': ' + goText);
    assert.match(await page.$eval('[data-bq-xc-msg]', (m) => m.textContent), /Remise accordée · 19/);
    await page.screenshot({ path: process.env.KIWI_SHOT || '/dev/null' }).catch(() => {});

    t.step('Encaisser opens the payment on the lowered amount');
    await click('#bq-exch-go');
    await page.waitForSelector('#bq-pay-veil.is-open', wait);
    await sleep(400);
    const payText = (await page.$eval('#bq-pay-veil.is-open', (el) => el.textContent)).replace(/[\s\u202f\u00a0]/g, '');
    assert.ok(payText.includes(String(pay)), 'the payment sheet shows ' + pay);
    assert.ok(!payText.includes(String(diff) + 'MAD'), 'and not the full difference');
  });
} finally {
  await h.close();
  await h.S.finish();
}
