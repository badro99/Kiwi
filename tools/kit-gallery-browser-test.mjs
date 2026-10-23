#!/usr/bin/env node
/* Kiwi · kit-gallery-browser-test · the gallery baseline (spec §21.1, stage 2).
 *
 * kit.html in light and dark, English and Arabic, at a phone width (390) and
 * a counter width (1280):
 *   · no page error and no console error;
 *   · every kit element on the page is defined (none is left a placeholder);
 *   · the page never scrolls sideways, and no section is wider than the page;
 *   · Arabic runs right to left, and the kit's roots follow (`dir` reaches
 *     inside, the bill's total sits on the start edge's opposite side).
 * Then each section is compared with its screenshot baseline, under reduced
 * motion so every animation stands on its true frame, with the viewport as
 * tall as the section: light English at 1280 and dark Arabic at 390. A changed component shows up as a changed picture;
 * KIWI_UPDATE_SNAPSHOTS=1 rewrites the baselines when the change is meant.
 *
 *   node tools/kit-gallery-browser-test.mjs */
import assert from 'node:assert/strict';
import { kitBrowser, settle } from './kit-browser.mjs';
import { suite, expectScreenshot } from './browser-trace.mjs';

console.log('kit-gallery-browser-test');
const kb = await kitBrowser('kit-gallery');
const s = suite('kit-gallery', { browser: kb.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const SECTIONS = ['s-buttons', 's-small', 's-controls', 's-feedback', 's-list', 's-nav', 's-overlays', 's-pin', 's-dash', 's-till', 's-kds'];

const inspect = (page) => page.evaluate(() => {
  const names = new Set();
  const undefinedEls = [];
  const walk = (root) => root.querySelectorAll('*').forEach((el) => {
    if (el.localName.startsWith('k-')) {
      names.add(el.localName);
      if (!customElements.get(el.localName)) undefinedEls.push(el.localName);
    }
    if (el.shadowRoot) walk(el.shadowRoot);
  });
  walk(document);
  const vw = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll('main > section')].filter((sec) => sec.getBoundingClientRect().right > vw + 1 || sec.scrollWidth > sec.clientWidth + 1).map((sec) => sec.id);
  const bill = document.querySelector('#bill');
  const billDir = bill ? getComputedStyle(bill.shadowRoot.firstElementChild || bill).direction : null;
  return { names: [...names], undefinedEls, sideways: document.scrollingElement.scrollWidth - vw, wide, dir: document.documentElement.dir || 'ltr', billDir };
});

for (const theme of ['light', 'dark']) for (const lang of ['en', 'ar']) for (const width of [390, 1280]) {
  const label = `${theme} · ${lang} · ${width}`;
  await s.run(label, async (t) => {
    // coverage: surface=shell-kit locale=en viewport=phone
    // coverage: surface=shell-kit locale=en viewport=desktop
    // coverage: surface=shell-kit locale=ar viewport=phone
    // coverage: surface=shell-kit locale=ar viewport=desktop
    const page = t.watch(await kb.open('/kit.html', { theme: theme === 'dark' ? 'dark' : undefined, lang, width, height: 900 }));
    const r = await inspect(page);
    check(r.undefinedEls.length === 0 && r.names.length >= 38, `${label}: all ${r.names.length} kit elements on the page are defined${r.undefinedEls.length ? ' (not: ' + [...new Set(r.undefinedEls)].join(', ') + ')' : ''}`);
    check(r.sideways <= 0 && r.wide.length === 0, `${label}: no sideways scroll (${r.sideways}px) and no section wider than the page${r.wide.length ? ' (' + r.wide.join(', ') + ')' : ''}`);
    if (lang === 'ar') check(r.dir === 'rtl' && r.billDir === 'rtl', `${label}: the page and the kit's roots run right to left (${r.dir}, bill ${r.billDir})`);
    check(page.__errors.length === 0, `${label}: no page errors (${page.__errors.join(' | ') || 'none'})`);
  });
}

for (const [theme, lang, width] of [['light', 'en', 1280], ['dark', 'ar', 390]]) {
  await s.run(`baseline · ${theme} · ${lang} · ${width}`, async (t) => {
    // coverage: surface=shell-kit locale=en viewport=desktop
    // coverage: surface=shell-kit locale=ar viewport=phone
    const page = t.watch(await kb.open('/kit.html', { theme: theme === 'dark' ? 'dark' : undefined, lang, width, height: 900, reduced: true }));
    await page.evaluate(() => { document.querySelectorAll('k-toast').forEach((x) => x.remove()); const c = document.querySelector('.k-caret'); if (c) c.remove(); });
    await page.addStyleTag({ content: '*{caret-color:transparent!important}.g-top{position:static!important}' });
    await settle(page, 300);
    for (const id of SECTIONS) {
      t.step(id);
      const el = await page.$('#' + id);
      /* The whole section inside the viewport: a sticky part (the cash count's
         summary, the bill's footer) then rests where it lays out, not where a
         half-scrolled capture would catch it. */
      const h = await el.evaluate((n) => Math.ceil(n.getBoundingClientRect().height));
      await page.setViewport({ width, height: Math.max(900, h + 40), deviceScaleFactor: 1 });
      await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
      await settle(page, 160);
      const r = await expectScreenshot(t, el, `${id}-${theme}-${lang}-${width}`, { page });
      checks++;
      console.log(`  ✓ ${id} · ${theme} ${lang} ${width}${r.written ? ' (baseline written)' : ''}`);
    }
  });
}

await kb.close();
console.log(`✓ kit-gallery-browser-test · ${checks} contrôles`);
await s.finish();
