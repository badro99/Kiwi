#!/usr/bin/env node
import assert from 'node:assert/strict';
import { harness, openTill } from './surface-matrix-lib.mjs';
import { click, view, cash, add, pickReturn, voucher } from './surface-matrix-credit-lib.mjs';
const h = await harness('surface-matrix-states-credit');
const tills = { open: (t, locale, viewport) => openTill(h, t, 'caisse-boutique', locale, viewport) };
try {
  for (const locale of ['fr', 'en', 'ar']) for (const viewport of ['phone', 'tablet']) {
    await h.S.run(`checkout and store credit · ${locale} · ${viewport}`, async t => {
      t.notice('UNREACHABLE demo manager refusal/recovery: shipped demo bypasses manager approval; no coverage claimed here.');
      // coverage: surface=caisse-boutique locale=fr viewport=phone
      // coverage: surface=caisse-boutique locale=en viewport=phone
      // coverage: surface=caisse-boutique locale=ar viewport=phone
      // coverage: surface=caisse-boutique locale=fr viewport=tablet
      // coverage: surface=caisse-boutique locale=en viewport=tablet
      // coverage: surface=caisse-boutique locale=ar viewport=tablet
      const { page } = await tills.open(t, locale, viewport);
      t.step('add an item, choose cash, confirm checkout');
      await cash(page);
      t.step('return a past sale for store credit');
      await pickReturn(page, '1207');
      await click(page, '[data-bq-do-avoir]');
      const { code, balance } = await voucher(page);
      t.step('spend the issued voucher at checkout');
      await view(page, 'vente');
      await add(page);
      await click(page, '[data-bq-m="avoir"]');
      // The voucher payment sheet speaks the till's language (it stayed French).
      const title = { fr: 'Avoir en paiement', en: 'Pay with a credit note', ar: 'الدفع بسند رصيد' }[locale];
      await page.waitForFunction((x) => [...document.querySelectorAll('#bq-pay-veil.is-open .modal-title')].some((el) => el.textContent.trim() === x), { timeout: 5000 }, title);
      await page.type('#bq-av-code', code);
      await click(page, '#bq-av-code-form button[type="submit"]');
      // If the new item exceeds the voucher, pay the remainder in cash.
      if (await page.$('#bq-pay-veil.is-open [data-bq-m="especes"]')) {
        await click(page, '[data-bq-m="especes"]'); await click(page, '#bq-cash-ok');
      }
      await page.waitForSelector('#bq-pay-veil.is-open', { hidden: true });
      await view(page, 'echanges');
      const av = await page.$(`[data-bq-av="${code}"]`);
      if (av) { await av.click(); assert.notEqual(await page.$eval('.bq-avoir-amt', el => el.textContent), balance, 'the issued credit balance decreased'); }
      assert.equal(await page.evaluate(() => document.documentElement.lang), locale);
      assert.equal(await page.evaluate(() => document.documentElement.dir), locale === 'ar' ? 'rtl' : 'ltr');
    });
  }
} finally { await h.close(); await h.S.finish(); }
