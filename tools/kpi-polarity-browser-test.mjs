#!/usr/bin/env node
/* Kiwi · kpi-polarity-browser-test · a delta's colour follows its KPI's
 * polarity, never its sign (spec §10.21).
 *
 * Two layers. In node: every row of §10.21's polarity table, read from the
 * spec itself, names keys whose KiwiLedger.polarity agrees with the row, and
 * KiwiLedger names no key the table leaves out. In the browser: the gallery's
 * k-kpi-grid is given one tile per key at +5, −5 and 0, in the light and the
 * dark theme, and each delta's painted colour (text and arrow) must be the
 * colour of the token its polarity and sign select: accent-ink for a good
 * change, danger for a bad one, ink-2 for a neutral key or a zero.
 *
 *   node tools/kpi-polarity-browser-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { kitBrowser, settle, ROOT } from './kit-browser.mjs';
import { suite } from './browser-trace.mjs';

console.log('kpi-polarity-browser-test');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* ── The spec's table against the ledger ─────────────────────────────────── */
const NAMES = {
  'revenue': 'revenue', 'orders': 'orders', 'average basket': 'avg_ticket', 'returning customers': 'returning', 'margin': 'margin',
  'refunds': 'refunds', 'cancelled sales': 'cancelled', 'voided items': 'voided', 'discounts given': 'discounts', 'cash difference (absolute)': 'cash_difference',
  'card share': 'card_share', 'cash share': 'cash_share',
};
const WORD = { 'up is good': 'up-good', 'up is bad': 'up-bad', 'neutral': 'neutral' };
const spec = fs.readFileSync(path.join(ROOT, 'docs/specs/kiwi-design-2027.md'), 'utf8');
const at = spec.indexOf('| KPI | Polarity | Up is shown in | Down is shown in |');
check(at > 0, '§10.21 carries the polarity table');
const rows = spec.slice(at).split('\n').slice(2).reduce((a, l) => (a.done || !l.startsWith('|') ? (a.done = true, a) : (a.push(l), a)), Object.assign([], { done: false })).map((l) => l.split('|').map((c) => c.trim()).filter(Boolean));
check(rows.length === 3, `the table has its three rows (${rows.length})`);
const ledger = createRequire(import.meta.url)(path.join(ROOT, 'assets/kit/ledger.js'));
const covered = new Set();
for (const [kpis, pol] of rows) {
  const want = WORD[pol.toLowerCase()];
  for (const name of kpis.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== 'any mix')) {
    const key = NAMES[name];
    assert.ok(key, `the table names a KPI this test does not know: "${name}"`);
    covered.add(key);
    check(ledger.polarity(key) === want, `${key}: the ledger says ${ledger.polarity(key)}, the table ${want}`);
  }
}
const extra = ['revenue', 'orders', 'avg_ticket', 'tips', 'returning', 'margin', 'refunds', 'cancelled', 'voided', 'discounts', 'cash_difference', 'card_revenue', 'cash_revenue', 'card_share', 'cash_share']
  .filter((k) => ledger.polarity(k) && !covered.has(k));
/* tips, card_revenue and cash_revenue are not in the table's words: tips is up-good like revenue, the two revenues are a mix. */
check(extra.every((k) => ({ tips: 'up-good', card_revenue: 'neutral', cash_revenue: 'neutral' })[k] === ledger.polarity(k)), `the keys outside the table follow its rules (${extra.join(', ')})`);

/* ── The paint ───────────────────────────────────────────────────────────── */
const kb = await kitBrowser('kpi-polarity');
const s = suite('kpi-polarity', { browser: kb.browser });
const KEYS = Object.values(NAMES).concat(['tips', 'card_revenue', 'cash_revenue']);

for (const theme of ['light', 'dark']) {
  await s.run(theme, async (t) => {
    // coverage: surface=shell-kit locale=en viewport=desktop
    const page = t.watch(await kb.open('/kit.html', { theme: theme === 'dark' ? 'dark' : undefined }));
    await page.evaluate((keys) => {
      const tiles = [];
      keys.forEach((k) => [5, -5, 0].forEach((d) => tiles.push({ key: k, label: k + ' ' + d, value: '1', delta: d, deltaKind: 'num' })));
      document.querySelector('#kpi').tiles = tiles;
    }, KEYS);
    await settle(page, 150);
    const got = await page.evaluate(() => {
      const rgb = (v) => { const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const host = document.querySelector('#kpi');
      const tok = (n) => rgb(getComputedStyle(host).getPropertyValue(n).trim());
      const paint = { good: tok('--k-accent-ink'), bad: tok('--k-danger'), neutral: tok('--k-ink-2') };
      const out = [];
      host.shadowRoot.querySelectorAll('.tile').forEach((tile) => {
        const dl = tile.querySelector('.dl');
        if (!dl) return;
        const lab = tile.querySelector('.lb').textContent;
        const use = dl.querySelector('svg');
        out.push({
          text: dl.textContent, label: lab, polarity: dl.getAttribute('data-polarity'),
          color: getComputedStyle(dl).color, fill: use ? getComputedStyle(use).fill : null, arrow: !!use,
        });
      });
      return { paint, out };
    });
    check(got.out.length === KEYS.length * 3, `${theme}: one delta per key and change (${got.out.length})`);
    check(new Set(Object.values(got.paint)).size === 3, `${theme}: accent-ink, danger and ink-2 are three different paints`);
    for (const d of got.out) {
      const m = /^(\S+) (-?\d+)$/.exec(d.label.trim());
      const key = m[1], delta = Number(m[2]);
      const pol = ledger.polarity(key);
      const want = !delta || pol === 'neutral' ? 'neutral' : ((delta > 0) === (pol === 'up-good') ? 'good' : 'bad');
      assert.equal(d.polarity, pol, `${theme}: ${key} carries its ledger polarity`);
      assert.equal(d.color, got.paint[want], `${theme}: ${key} ${delta > 0 ? '+' : ''}${delta} paints ${want} (${d.color})`);
      if (delta) assert.ok(d.arrow && d.fill === got.paint[want], `${theme}: ${key} ${delta}: the arrow is filled ${want}`);
      else assert.ok(!d.arrow, `${theme}: ${key} 0 has no arrow`);
    }
    check(true, `${theme}: all ${got.out.length} deltas paint their polarity's colour, text and arrow; a zero has no arrow`);
    check(page.__errors.length === 0, `${theme}: no page errors`);
  });
}

await kb.close();
console.log(`✓ kpi-polarity-browser-test · ${checks} contrôles`);
await s.finish();
