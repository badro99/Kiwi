import { forLocales } from './test-locales.mjs';
/* Verify first-use table loading through the real dashboard and its existing guards. */
import assert from 'node:assert/strict';
import { harness, dashboardWalker } from './surface-matrix-lib.mjs';
const h = await harness('pages-tables');
const nav = dashboardWalker(h);
const resources = page => page.evaluate(() => [...document.scripts].filter(script => script.src)
  .map(script => new URL(script.src).pathname).filter(path => path.startsWith('/assets/pages/tables')));
try {
  for (const locale of forLocales(['fr','en','ar'])) {
    await h.S.run('table first use and reopen · ' + locale, async t => {
      const { page } = await nav.open(t,'dashboard-transactions',locale,'desktop');
      assert.deepEqual(await resources(page),[],'table owner and prerequisites absent at boot');
      await page.evaluate(() => {
        const previous = Kiwi.handlers['nav-tables'];
        Kiwi.handlers['nav-tables'] = function() {
          window.__tableGuardCalls = (window.__tableGuardCalls || 0) + 1;
          return previous.apply(this,arguments);
        };
      });
      await nav.open(t,'dashboard-tables',locale,'desktop');
      assert.deepEqual(await resources(page),[
        '/assets/pages/tables-data.js','/assets/pages/tables-drawing.js','/assets/pages/tables-operations.js','/assets/pages/tables.js',
      ],'exact prerequisite order on first open');
      assert.equal(await page.evaluate(() => window.__tableGuardCalls),2,'captured guard runs before loading and rechecks after loading');
      assert.equal(await page.$eval('.dash-genpage',el => !!el.querySelector('.pds-page')),true,'real table workflow rendered');
      await nav.open(t,'dashboard-transactions',locale,'desktop');
      await nav.open(t,'dashboard-tables',locale,'desktop');
      assert.equal((await resources(page)).length,4,'reopen reuses loaded owner');
      assert.equal(await page.evaluate(() => window.__tableGuardCalls),4,'captured guard remains installed on reopen');
    });
  }
} finally {
  await h.close();
  await h.S.finish();
}
