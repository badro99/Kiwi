#!/usr/bin/env node
// An Arabic question on a French dashboard gets its answer laid out right to
// left. On 27 Nov 2026 « نسيت الرقم السري ديالي » was answered in Arabic but
// set left to right: the full stop opened the line, « Kiwi » broke the
// sentence in two, the text hugged the left edge. Each bubble now takes its
// direction from its own words, whatever the language of the page.
// The demo boutique is synthetic: no merchant data, no model reached.
import assert from 'node:assert/strict';
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';
const h = await harness('agent-bidi');

// Where each text line starts: an RTL line starts at the right edge of its
// block, an LTR line at the left. Measured on the first strong letter.
const lines = (page) => page.evaluate(() => {
  const out = [];
  const strong = /[A-Za-zÀ-ɏ؀-ۿ]/;
  for (const bubble of document.querySelectorAll('.fa-drawer .fa-msg .fa-bubble')) {
    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.data.search(strong);
      if (i < 0) continue;
      let block = n.parentElement;
      while (block !== bubble && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
      if (block.textContent.trim().search(strong) !== block.textContent.trim().indexOf(n.data.trim()[n.data.trim().search(strong)])) continue;
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
      const c = r.getBoundingClientRect(), b = block.getBoundingClientRect(), cs = getComputedStyle(block);
      const left = b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
      const right = b.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
      out.push({ who: bubble.closest('.fa-msg').classList.contains('user') ? 'user' : 'agent',
        arabic: /[؀-ۿ]/.test(n.data[i]), text: n.data.trim().slice(0, 40),
        fromLeft: Math.round(c.left - left), fromRight: Math.round(right - c.right) });
      break;
    }
  }
  return out;
});
async function click(page, selector) {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  await el.scrollIntoView(); await el.click();
}
async function ask(page, q) {
  const before = await page.$$eval('.fa-drawer .fa-msg.agent', (m) => m.length);
  await page.type('.fa-drawer textarea, .fa-drawer input[type="text"]', q);
  await click(page, '.fa-drawer [data-fa-send]');
  await page.waitForFunction((n) => document.querySelectorAll('.fa-drawer .fa-msg.agent:not(:has(.fa-typing))').length > n, { timeout: 15000 }, before);
  await sleep(300);
}

// The model's answer of 27 Nov, word for word: Arabic with « Kiwi » inside.
const ANSWER = 'عذرًا، لا يمكنني مساعدتك في استعادة أو تغيير كلمة السر. يرجى التواصل مع فريق دعم Kiwi عبر القنوات الرسمية للحصول على المساعدة.';
try {
  await h.S.run('an Arabic answer on a French dashboard reads right to left · fr · desktop', async (t) => {
    const { ctx, page } = await demoPage(h, 'fr', 'desktop', {}, {
      'POST /api/ai/ask': () => ({ status: 200, body: { ok: true, text: ANSWER } }) });
    t.defer(() => ctx.close()); t.watch(page);
    t.step('open the demo dashboard in French and its assistant');
    // coverage: surface=dashboard locale=fr viewport=desktop
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    const explore = await page.evaluateHandle(() => [...document.querySelectorAll('button,a')]
      .find((el) => /Explorer la d|Explore the d|استكشف/.test(el.textContent)) || null);
    if (explore.asElement()) await explore.asElement().click();
    await explore.dispose(); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.dir || 'ltr'), 'ltr', 'the page itself is French, left to right');
    await page.waitForFunction(() => window.KiwiAgent && window.Kiwi && window.Kiwi.drawer, { timeout: 20000 });
    await page.evaluate(() => window.KiwiAgent.open());
    await page.waitForSelector('.fa-drawer [data-fa-send]', { visible: true, timeout: 15000 });

    t.step('ask in Darija, then in French');
    await ask(page, 'نسيت الرقم السري ديالي 🙈');
    const offer = await page.$('.fa-drawer [data-fa-cloud]');
    if (offer) {   // the demo asks once before a question leaves the device
      const n = await page.$$eval('.fa-drawer .fa-msg.agent', (m) => m.length);
      await offer.click();
      await page.waitForFunction((k) => [...document.querySelectorAll('.fa-drawer .fa-msg.agent')].slice(k - 1)
        .some((m) => /[\u0600-\u06FF]/.test(m.textContent) && !m.querySelector('[data-fa-stopwrap]')), { timeout: 15000 }, n);
      await page.$$eval('.fa-drawer .fa-msg.agent', (ms) => ms.filter((m) => m.querySelector('[data-fa-cloud]')).forEach((m) => m.remove()));
    }
    await ask(page, 'combien de ventes aujourd’hui ?');
    const seen = await lines(page);
    const ar = seen.filter((l) => l.arabic), fr = seen.filter((l) => !l.arabic);
    assert.ok(ar.some((l) => l.who === 'user') && ar.some((l) => l.who === 'agent'), 'an Arabic question and an Arabic answer were drawn: ' + JSON.stringify(seen));
    assert.ok(fr.some((l) => l.who === 'agent'), 'a French answer was drawn: ' + JSON.stringify(seen));
    for (const l of ar) assert.ok(l.fromRight <= 2 && l.fromLeft > l.fromRight, `Arabic starts at the right edge: ${JSON.stringify(l)}`);
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.fa-drawer .fa-msg.agent .fa-bubble')]
      .map((b) => b.querySelector(':scope > [data-fa-stream], :scope > div:first-child'))
      .map((el) => el && getComputedStyle(el).fontSize));
    assert.equal(new Set(sizes).size, 1, 'a server answer reads at the size of a computed one: ' + sizes);
    for (const l of fr) assert.ok(l.fromLeft <= 2, `French still starts at the left edge: ${JSON.stringify(l)}`);
  });
} finally { await h.close(); await h.S.finish(); }
