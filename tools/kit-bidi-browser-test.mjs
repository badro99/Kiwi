#!/usr/bin/env node
/* Kiwi · kit-bidi-browser-test · figures read the right way round in Arabic
 * (spec §6.3, §9.6).
 *
 * The gallery in Arabic, right to left, every component on the page:
 *   · no text node, in the page or inside any kit root, holds U+2068/U+2069
 *     (FSI/PDI belong in attributes only), U+200E, U+200F or U+061C: in the
 *     DOM an argument is a <bdi>;
 *   · every figure the formatter wrote is painted left to right, as one
 *     piece: its sign sits left of its first digit and its digit groups keep
 *     their order ("−1 127", never "1 127−" or "127 1"). The figure is read
 *     from the painted x of each character, not from the text;
 *   · and the same figure's unit stays outside the number's <bdi>.
 * Kit 2027 renders figures through KiwiStrings.fig / K.numHtml and sentences
 * through KiwiStrings.html / K.th; this suite is what holds them to it.
 *
 *   node tools/kit-bidi-browser-test.mjs */
import assert from 'node:assert/strict';
import { kitBrowser, settle } from './kit-browser.mjs';
import { suite } from './browser-trace.mjs';

console.log('kit-bidi-browser-test');
const kb = await kitBrowser('kit-bidi');
const s = suite('kit-bidi', { browser: kb.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const scan = (page) => page.evaluate(() => {
  const BAD = /[⁦-⁩‎‏؜]/;
  const FIG = /[−+]?\d[\d .,:]*\d|[−+]?\d/g;
  const texts = [];
  const walk = (root) => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) texts.push(n);
    root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
  };
  walk(document.body);
  const marked = [];
  const wrong = [];
  let figures = 0;
  const r = document.createRange();
  for (const n of texts) {
    const v = n.textContent;
    if (BAD.test(v)) marked.push(v.replace(/[⁦-⁩‎‏؜]/g, (c) => '<U+' + c.charCodeAt(0).toString(16).toUpperCase() + '>').slice(0, 60));
    let m; FIG.lastIndex = 0;
    while ((m = FIG.exec(v))) {
      const run = m[0];
      if (!/[−+ .,]/.test(run) || run.length < 2) continue;        /* a bare digit or a code has no order to lose */
      const xs = [];
      for (let i = 0; i < run.length; i++) {
        if (run[i] === ' ') continue;
        r.setStart(n, m.index + i); r.setEnd(n, m.index + i + 1);
        const b = r.getBoundingClientRect();
        if (!b.width) { xs.length = 0; break; }                               /* not painted: nothing to read */
        xs.push(b.left);
      }
      if (xs.length < 2) continue;
      figures++;
      for (let i = 1; i < xs.length; i++) if (xs[i] < xs[i - 1] - 0.5) { wrong.push(run.replace(/ /g, '⍽')); break; }
    }
  }
  return { marked, wrong, figures, dir: document.documentElement.dir };
});

for (const width of [390, 1280]) {
  await s.run(`Arabic · ${width}`, async (t) => {
    const page = t.watch(await kb.open('/kit.html', { lang: 'ar', width, height: 900 }));
    await settle(page, 300);
    const r = await scan(page);
    check(r.dir === 'rtl', `${width}: the page runs right to left`);
    check(r.marked.length === 0, `${width}: no text node holds an isolate or a direction mark${r.marked.length ? ' (' + r.marked.slice(0, 5).join(' | ') + ')' : ''}`);
    check(r.figures >= 40, `${width}: ${r.figures} painted figures read`);
    check(r.wrong.length === 0, `${width}: every figure paints left to right, its sign on the left${r.wrong.length ? ' (wrong: ' + [...new Set(r.wrong)].slice(0, 8).join(', ') + ')' : ''}`);
    check(page.__errors.length === 0, `${width}: no page errors`);
  });
}

await kb.close();
console.log(`✓ kit-bidi-browser-test · ${checks} contrôles`);
await s.finish();
