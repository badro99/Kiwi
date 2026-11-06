#!/usr/bin/env node
// Pressing till, demo store: a counter clerk creates a business (B2B) customer
// with a negotiated rate, the ticket applies that rate, an out-of-range rate is
// refused, and the same customer's business account can be removed again.
// Synthetic demo data only; nothing is printed or paid.
import assert from 'node:assert/strict';
import { harness, openTill, sleep } from './surface-matrix-lib.mjs';

const h = await harness('pressing-b2b-client');
const wait = { visible: true, timeout: 8000 };

async function click(page, selector) {
  await page.waitForSelector(selector, wait);
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }));
  await page.click(selector);
}
async function fill(page, selector, value) {
  await click(page, selector);
  await page.$eval(selector, (el) => { el.value = ''; });
  await page.type(selector, value);
}
async function startIntake(page) {
  await click(page, '[data-px-item="chemise"]');
  await click(page, '#px-sheet-veil.is-open #px-sheet-add');
  await page.waitForSelector('#px-ticket .px-line', wait);
  await click(page, '#px-validate');
  await page.waitForSelector('#px-client-veil.is-open #px-cl-q', wait);
}
const ticketText = (page) => page.$eval('#px-ticket', (el) => el.textContent.replace(/\s+/g, ' '));

try {
  await h.S.run('a business customer with a negotiated rate · fr · tablet', async (t) => {
    // coverage: surface=caisse-pressing locale=fr viewport=tablet
    const { page } = await openTill(h, t, 'caisse-pressing', 'fr', 'tablet');
    t.watch(page);

    t.step('the new-customer form offers the business account and the store rate');
    await startIntake(page);
    await click(page, '#px-cl-new');
    await page.waitForSelector('#px-cl-b2b', wait);
    assert.match(await page.$eval('#px-clientm .px-cl-form', (el) => el.textContent), /Taux du commerce : \d+(?:,\d+)? %/);

    t.step('a rate outside 0 to 50 % is refused and nothing is created');
    await fill(page, '#px-cl-name', 'Hôtel Essai Kiwi');
    await fill(page, '#px-cl-tel', '0612 34 56 78');
    await click(page, '#px-cl-b2b');
    await fill(page, '#px-cl-b2b-rate', '60');
    await click(page, '#px-cl-create');
    await sleep(300);
    assert.ok(await page.$('#px-cl-create'), 'the form stays open on a refused rate');

    t.step('12,5 % is kept on the customer and applied to the ticket');
    await fill(page, '#px-cl-b2b-rate', '12,5');
    await click(page, '#px-cl-create');
    await page.waitForSelector('#px-date-veil.is-open [data-px-d]', wait);
    assert.match(await ticketText(page), /Remise B2B –12,5 %/, 'the ticket prints the negotiated rate');

    t.step('the same customer can leave the business account');
    // The order itself is not needed: close the date sheet, reopen the customer sheet.
    await page.evaluate(() => document.querySelectorAll('#px-date-veil.is-open [data-px-close], #px-date-veil.is-open .px-modal-x').forEach((b) => b.click()));
    await page.waitForFunction(() => !document.querySelector('#px-date-veil.is-open'), { timeout: 8000 });
    await click(page, '#px-tk-client');   // the ticket's customer row reopens the sheet
    await page.waitForSelector('#px-client-veil.is-open #px-cl-q', wait);
    await page.type('#px-cl-q', '0612345678');
    await page.waitForSelector('[data-px-cl] .px-b2b-chip', wait);
    await click(page, '#px-cl-b2b-edit');
    await page.waitForSelector('#px-cl-b2b-save', wait);
    assert.equal(await page.$eval('#px-cl-b2b-rate', (el) => el.value), '12,5', 'the editor shows the saved rate');
    await click(page, '#px-cl-b2b');
    await click(page, '#px-cl-b2b-save');
    await page.waitForSelector('[data-px-cl]', wait);
    assert.equal(await page.$('[data-px-cl] .px-b2b-chip'), null, 'the business chip is gone');
  });
} finally {
  await h.close();
  await h.S.finish();
}
