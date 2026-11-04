#!/usr/bin/env node
/* Kiwi · landing-pricing-hydrated-test.mjs · landing#2.
 *
 * The landing claims suite checks pricing copy and markup, and runs the shipped
 * client component for fr, en and ar from the JSON source. This one runs it the
 * way a visitor gets it: for EVERY shipped page (fr, en, ar, de, it, nl, es),
 * the props the page itself hydrates with (the Flight record inlined in the
 * page, not the source file) go into the page's own pricing chunk, and a long
 * seeded walk of clicks and arrow keys moves between "monthly" and "annual".
 * After every step, for every plan, what is displayed must be what the oracle
 * says for that state: the monthly price, or the annual monthly-equivalent;
 * the billed line ("billed monthly", or "billed yearly" with the exact annual
 * total, twelve times the annual price); the signup link carrying that period;
 * Ultra on its fixed monthly price in both states.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prices, formatPrice } from './landing-pricing.mjs';

/* the shipped client component runs inside the runtime helper's vm (loaded lazily, like the claims suite) */
const { landingRuntime, descendants, nodeText } = await import('./landing-runtime.mjs');
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pages = { 'index.html': 'fr', 'fr/index.html': 'fr', 'en/index.html': 'en', 'ar/index.html': 'ar', 'de/index.html': 'de', 'it/index.html': 'it', 'nl/index.html': 'nl', 'es/index.html': 'es' };
const digits = (s) => s.replace(/[^\d]/g, '');

/* tiny seeded generator: the walk is the same on every machine */
let seed = 20261104;
const rnd = (n) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };

/* the shared chunk set, as the claims suite resolves it: any page may reference it */
const chunkRefs = new Set(Object.keys(pages).flatMap((page) => [...read(page).matchAll(/\/(?:_next\/static\/chunks|es\/chunks)\/[\w.-]+\.js/g)].map((m) => m[0].slice(1))));
let steps = 0;
for (const [page, locale] of Object.entries(pages)) {
  const html = read(page);
  const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1])).join('');
  const records = flight.split('\n').filter((line) => line.includes('"tiers":')).map((line) => JSON.parse(line.slice(line.indexOf(':') + 1))[3].t);
  assert.equal(records.length, 1, `${page}: one pricing record is hydrated`);
  const copy = records[0];
  const chunk = [...chunkRefs]
    .find((c) => c.includes('2c2tj5hx4r2-w') && c.startsWith(locale === 'es' ? 'es/' : '_next/'));
  assert.ok(chunk, `${page}: its pricing chunk is referenced`);
  const runtime = landingRuntime(path.join(ROOT, chunk)), render = () => runtime.render(18667, { locale, t: copy });
  let tree = render(), annual = false;

  const check = (why) => {
    const cards = descendants(tree).filter((n) => n.props['data-plan'] && n.props['data-plan'] !== 'ultimate');
    assert.equal(cards.length, 4, `${page}: four plans (${why})`);
    cards.forEach((card, i) => {
      const nodes = descendants(card), text = nodeText(card);
      const price = nodeText(nodes.find((n) => n.props.className?.startsWith('kw-price-in')));
      const shown = i === 3 ? prices[3].monthly : annual ? prices[i].annual : prices[i].monthly;
      assert.equal(digits(price), String(shown), `${page} ${copy.tiers[i].name}: displayed price ${price} must be ${shown} (${annual ? 'annual' : 'monthly'}, ${why})`);
      if (i < 3) {
        const total = prices[i].annual * 12;
        assert.equal(total, prices[i].total, 'twelve times the annual monthly price is the annual payment');
        const billed = annual ? copy.billedYearly.replace('{total}', formatPrice(total, locale)) : copy.billedMonthly;
        assert.ok(text.includes(billed), `${page} ${copy.tiers[i].name}: billed line "${billed}" (${why})`);
        if (annual) assert.ok(digits(text).includes(String(total)), `${page} ${copy.tiers[i].name}: annual total ${total} is on the card`);
        assert.equal(nodes.find((n) => n.type === 'a').props.href, `/dashboard.html?plan=${copy.tiers[i].signupPlan}&period=${annual ? 'annual' : 'monthly'}`, `${page} ${copy.tiers[i].name}: signup link period (${why})`);
      }
    });
    const radios = descendants(tree).filter((n) => n.props.role === 'radio');
    assert.deepEqual(radios.map((r) => r.props['aria-checked']), [!annual, annual], `${page}: exactly the active period is checked (${why})`);
    assert.deepEqual(radios.map((r) => r.props.tabIndex), [annual ? -1 : 0, annual ? 0 : -1], `${page}: roving tab stop follows the period (${why})`);
    steps++;
  };
  check('first paint');
  for (let k = 0; k < 40; k++) {
    const radios = descendants(tree).filter((n) => n.props.role === 'radio');
    const move = rnd(4);
    if (move < 2) { radios[move].props.onClick(); annual = move === 1; }
    else {
      const key = move === 2 ? 'ArrowLeft' : 'ArrowRight';
      descendants(tree).find((n) => n.props.role === 'radiogroup').props.onKeyDown({ key, preventDefault() {} });
      /* with two options, either arrow moves to the other one, wrapping */
      annual = !annual;
    }
    tree = render();
    check(`step ${k + 1}`);
  }
}
console.log(`  ✓ landing pricing hydrated: ${Object.keys(pages).length} pages, ${steps} monthly/annual states checked on the shipped chunks, price, billed total and signup link each time`);
