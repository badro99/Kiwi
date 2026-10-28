// UI-only helpers shared by the demo and isolated real credit journeys.
import assert from 'node:assert/strict';
export async function click(page, selector) {
  // Locator clicks wait for a stable, enabled control after drawer transitions.
  // A locator timeout does not say what it waited for; name the selector.
  try {
    await page.locator(selector).setTimeout(15000).wait();
    // Sheets and pads fade out over the controls beneath them; a person taps
    // once the control is on top again, so wait for that too.
    await page.waitForFunction((sel) => {
      const e = document.querySelector(sel); if (!e) return false;
      e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = e.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === e || e.contains(top));
    }, { timeout: 5000 }, selector);
    await page.locator(selector).setTimeout(15000).click();
  } catch (e) { e.message = `${selector} · ${e.message}`; throw e; }
}
/* The boutique's opening float. The shipped till offers chips; under the 2027
   skin the chips stay hidden and « Ouvrir la caisse » opens the kit's count
   sheet, where the amount is typed on its keypad (as on the restaurant till). */
export async function openFloat(page, amount = 300) {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  await page.waitForSelector('#bqci-btn', { visible: true, timeout: 30000 });
  await pause(700);   // the screen fades in
  const chip = `#bqci-chips [data-float="${amount}"]`;
  const chips = await page.$eval(chip, (e) => e.getClientRects().length > 0).catch(() => false);
  if (chips) {
    for (let k = 0; k < 20; k++) {
      await page.click(chip).catch(() => {});
      if (await page.evaluate(() => !document.getElementById('bqci-btn').disabled)) break;
      await pause(300);
    }
    await click(page, '#bqci-btn:not([disabled])');
  } else {
    await click(page, '#bqci-btn:not([disabled])');
    await page.waitForFunction(() => { const c = document.querySelector('k-sheet k-cash-count'); return c && c.shadowRoot && c.shadowRoot.querySelector('[data-kp-key="0"]'); }, { timeout: 15000 });
    const tap = (q) => page.evaluate((sel) => {
      const el = document.querySelector('k-sheet k-cash-count').shadowRoot.querySelector(sel);
      if (!el) return false;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      el.click();
      return true;
    }, q);
    for (const k of String(amount)) { assert.ok(await tap(`[data-kp-key="${k}"]`), `the count sheet has the key ${k}`); await pause(80); }
    assert.ok(await tap('[data-w="commit"]'), 'the count sheet has its commit button');
  }
  await page.waitForSelector('#bq-clockin', { hidden: true, timeout: 20000 });
}
export async function view(page, name) {
  const peek = await page.$('#pos-boutique.vx-ticket-open .vx-peek');
  if (peek && await peek.isVisible()) await click(page, '#pos-boutique .vx-peek');
  const sel = `[data-bq-view="${name}"]`;
  // On a phone the side menu may still be sliding from the last step; decide
  // whether to open it only once the tab has stopped moving.
  await page.waitForFunction((q) => {
    const r = document.querySelector(q).getBoundingClientRect(), k = r.left + ',' + r.top;
    const same = window.__bqNavPos === k; window.__bqNavPos = k; return same;
  }, { polling: 120, timeout: 4000 }, sel);
  const off = await page.$eval(sel, el => el.getBoundingClientRect().right <= 0 || el.getBoundingClientRect().left >= innerWidth);
  const hidden = await page.$eval(sel, el => !el.getClientRects().length);
  if (off || hidden) { await click(page, '#pos-boutique .vx-burger'); }
  await click(page, sel);
  await page.waitForSelector(`[data-bq-panel="${name}"].is-on`, { visible: true });
}
export async function ticket(page) {
  // On a phone the ticket bar slides in a moment after the item sheet closes;
  // wait for it there instead of reading the page mid-transition.
  if (await page.evaluate(() => innerWidth < 600)) await page.waitForSelector('#pos-boutique .vx-peek', { visible: true, timeout: 5000 });
  const peek = await page.$('#pos-boutique .vx-peek');
  if (peek && await peek.isVisible() && !await page.$('#pos-boutique.vx-ticket-open')) {
    await click(page, '#pos-boutique .vx-peek');
  }
}
export async function add(page) {
  await click(page, '[data-bq-item]:not(.is-out)');
  await click(page, '#bq-sheet-add:not([disabled])');
  await page.waitForSelector('#bq-sheet-veil.is-open', { hidden: true });
  await ticket(page);
  await click(page, '#bq-validate:not([disabled])');
}
export async function cash(page) {
  await add(page);
  await click(page, '[data-bq-m="especes"]');
  await page.waitForSelector('#bq-cash-ok', { visible: true });
  assert.ok(await page.$eval('#bq-cash-in', el => Number(el.value) > 0), 'payment confirmation has a positive amount');
  await click(page, '#bq-cash-ok');
  await page.waitForSelector('#bq-pay-veil.is-open', { hidden: true });
}
export async function pickReturn(page, ref) {
  await view(page, 'echanges');
  await click(page, `[data-bq-pick="${ref}:0"]`);
  await click(page, '[data-bq-motif="Taille"]');
}
export async function voucher(page) {
  await page.waitForSelector('#bq-avoir-veil.is-open', { visible: true });
  const code = await page.$eval('.bq-avoir-code', el => el.textContent.split(' · ')[0].trim());
  const balance = await page.$eval('.bq-avoir-amt', el => el.textContent);
  assert.ok(balance.trim(), 'voucher balance is visible');
  await click(page, '#bq-avoir-veil .bq-sheet-foot [data-bq-close]');
  return { code, balance };
}
