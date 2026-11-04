// Real layered dashboard, derive failure and readable revenue chart. Run by lead.
import assert from 'node:assert/strict';
import { harness, demoPage, sleep } from './surface-matrix-lib.mjs';
const h = await harness('home-composition');
try {
  for (const viewport of ['phone', 'tablet']) await h.S.run(viewport, async t => {
    const { ctx, page } = await demoPage(h, 'fr', viewport);
    t.defer(() => ctx.close()); t.watch(page);
    t.step('load the complete dashboard skins');
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => {
      const entry = [...document.querySelectorAll('button,a')].find(n => /Explorer la d/.test(n.textContent));
      entry?.click();
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.KiwiDateRange?.__internal && document.querySelector('[data-kpi] [data-kpi-val]'));
    t.step('fail a real KPI derivation through the live renderer');
    const key = await page.evaluate(() => {
      const owner = window.KiwiDateRange.__internal;
      const tile = [...document.querySelectorAll('[data-kpi]')].find(n => n.querySelector('[data-kpi-val]') && owner.KPI_CATALOG[n.dataset.kpi]);
      const key = tile.dataset.kpi;
      const original = owner.KPI_CATALOG[key].derive;
      window.__restoreHomeDerive = () => { owner.KPI_CATALOG[key].derive = original; owner.renderKpiBand(); };
      owner.KPI_CATALOG[key].derive = () => { throw Error('fixture ledger unavailable'); };
      owner.renderKpiBand();
      return key;
    });
    await sleep(100);
    const rendered = await page.evaluate(key => {
      const tile = document.querySelector('[data-kpi="' + key + '"]');
      const value = tile.querySelector('[data-kpi-val]');
      const box = value.getBoundingClientRect(), style = getComputedStyle(value);
      const model = window.KiwiDateRange.home().tiles.items.find(item => item.key === key);
      return { text: value.textContent.trim(), model: model.value, delta: model.delta,
        visible: box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' };
    }, key);
    assert.equal(rendered.text, '·'); assert.equal(rendered.model, '·'); assert.equal(rendered.delta, null);
    assert.equal(rendered.visible, true, 'failure placeholder is painted by the real composition');
    await page.evaluate(() => window.__restoreHomeDerive());
    t.step('read the actual revenue chart after a KPI failure');
    const chart = await page.$eval('[data-rev-svg]', svg => {
      const box = svg.getBoundingClientRect();
      const labels = [...svg.querySelectorAll('text')].filter(n => !n.closest('.rev-tip') && n.textContent.trim()).map(n => {
        const r = n.getBoundingClientRect(); return { text: n.textContent.trim(), x: r.x, right: r.right, y: r.y, h: r.height };
      });
      return { width: box.width, paths: svg.querySelectorAll('path').length, labels,
        invalid: [...svg.querySelectorAll('path')].some(n => /NaN|Infinity/.test(n.getAttribute('d') || '')) };
    });
    assert.ok(chart.width > 0 && chart.paths > 0 && chart.labels.length > 0);
    assert.equal(chart.invalid, false);
    for (const label of chart.labels) assert.ok(label.h > 0, 'chart label has readable painted height: ' + label.text);
    const ticks = chart.labels.slice().sort((a,b) => a.x - b.x);
    for (let i = 1; i < ticks.length; i++) if (Math.abs(ticks[i].y - ticks[i - 1].y) < 4)
      assert.ok(ticks[i].x >= ticks[i - 1].right, 'adjacent chart labels do not overlap');
  });
} finally { await h.close(); await h.S.finish(); }
