#!/usr/bin/env node
// Synthetic Shopify API only. All post-load navigation uses actual UI input.
// Gap: a merchant must understand the failure and be able to recover from it.
import assert from 'node:assert/strict';
import { harness, demoPage, sleep, verify } from './surface-matrix-lib.mjs';

const h = await harness('surface-matrix-states-shopify');
const wait = { visible: true, timeout: 10000 };
const copy = {
  fr: { refresh: 'Actualiser les correspondances', retry: 'Réessayer', replay: 'Rattraper les commandes en ligne',
    error: 'Synchronisation interrompue. Réessayez pour renvoyer le stock.', none: 'Aucune commande en ligne à rattraper.' },
  en: { refresh: 'Refresh matches', retry: 'Retry', replay: 'Catch up online orders',
    error: 'Synchronization interrupted. Retry to send stock again.', none: 'No online order to catch up.' },
  ar: { refresh: 'تحديث المطابقات', retry: 'إعادة المحاولة', replay: 'استدراك الطلبات الإلكترونية',
    error: 'توقفت المزامنة. أعد المحاولة لإرسال المخزون مجددًا.', none: 'لا توجد طلبات إلكترونية لاستدراكها.' },
};

async function click(page, selector) {
  await page.waitForSelector(selector, wait);
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }));
  // Drawers slide up on phones: click once the target has stopped moving.
  await page.waitForFunction((s) => {
    const r = document.querySelector(s).getBoundingClientRect(), at = r.top + ',' + r.left;
    const still = window.__matrixAt === at; window.__matrixAt = at; return still;
  }, { polling: 100, timeout: 5000 }, selector);
  await page.click(selector);
}

async function button(page, label) {
  const handle = await page.waitForFunction((text) => [...document.querySelectorAll('.shp button')]
    .find((el) => el.textContent.trim() === text), { timeout: 10000 }, label);
  const el = handle.asElement();
  assert.ok(el, 'Shopify control exists: ' + label);
  await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await el.click();
  await handle.dispose();
}

async function check(t, cell, state, locale, viewport) {
  const key = `matrix-state-shopify-${state}-${locale}-${viewport}`;
  const strict = { ...h, baseline: { ...h.baseline, [key]: {} } };
  await cell.page.waitForSelector(cell.region, wait);
  await cell.page.evaluate(() => Promise.race([document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 1000))]));
  await sleep(350);
  await verify(strict, t, cell, key, locale);
}

const connector = {
  async open(t, locale, viewport) {
    // A synthetic custom demo boutique exposes Settings > Delivery channels.
    // No built-in demo homepage currently contains the retired integration card.
    const venue = { id: 'matrix-shopify', name: 'Matrix Shopify', fullDisplay: 'Matrix Shopify',
      slug: 'matrix-shopify', type: 'boutique', custom: true, location: '',
      siblings: '', status: '', txCount: 0, staffCount: 0, hours: '', methods: '', goal: 0 };
    const { ctx, page } = await demoPage(h, locale, viewport, {
      kiwiCustomVenues: JSON.stringify([venue]), kiwiVenue: venue.id, kiwiOnboarded: '1',
    });
    t.defer(() => ctx.close());
    t.watch(page);
    const s = copy[locale], calls = [];
    let recovered = false;
    // demoPage already blocks remote traffic and answers other APIs offline.
    // Replace interception before navigation, never replace app state/handlers.
    page.removeAllListeners('request');
    page.on('request', (request) => {
      const url = new URL(request.url());
      const answer = (body, status = 200) => request.respond({ status,
        contentType: 'application/json', body: JSON.stringify(body) });
      if (url.origin === h.base && url.pathname === '/api/shopify/status') {
        if (request.method() === 'GET') return answer({
          connection: { shop: 'matrix-synthetic.myshopify.com', status: 'active',
            location: { id: 'matrix-location', name: 'Matrix stock' }, lastError: recovered ? null : s.error },
          locations: [{ id: 'matrix-location', name: 'Matrix stock' }],
          mapping: { active: 1, drift: 0 }, queue: { pending: recovered ? 1 : 0, failed: recovered ? 0 : 1 },
        });
        const body = JSON.parse(request.postData() || '{}');
        calls.push(body);
        if (body.action === 'refresh-mapping') return answer({ connection: { status: 'active' }, preview: {
          counts: { matched: 1, sku: 1 },
          matches: [{ kiwiTitle: 'Matrix cotton', shopifyTitle: 'Matrix cotton', method: 'sku' }],
        } });
        if (body.action === 'retry') { recovered = true; return answer({ ok: true }); }
        if (body.action === 'replay-orders') return answer({ result: { orders: 0, pieces: 0, lines: 0 } });
        return answer({ error: 'unexpected-synthetic-action' }, 400);
      }
      if (url.origin === h.base && url.pathname.startsWith('/api/')) return answer({ error: 'offline' }, 503);
      return request.url().startsWith(h.base + '/') || request.url().startsWith('data:') ? request.continue() : request.abort();
    });
    t.step('load dashboard, open integrations, then Shopify');
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    const explore = await page.waitForFunction(() => [...document.querySelectorAll('button,a')]
      .find((el) => /Explorer la d|Explore the d|استكشف/.test(el.textContent)) || false,
    { timeout: 3000 }).catch(() => null);
    if (explore) { await explore.asElement().click(); await explore.dispose(); }
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-action="settings"]', { timeout: 30000 });
    const settings = '[data-action="settings"]';
    const off = await page.$eval(settings, (el) => {
      const r = el.getBoundingClientRect(); return r.right <= 0 || r.left >= innerWidth;
    });
    if (off) {
      // Off screen behind the menu (phone, tablet): same entry as dashboardWalker,
      // the sidebar link clicked in script. Every later step is a real click.
      await page.evaluate((x) => document.querySelector(x).click(), settings);
    } else await click(page, settings);
    await click(page, '[data-action="add-integration"]');
    await click(page, 'button[data-action="integration-connect"][data-channel="shopify"]');
    await page.waitForSelector('.shp-select', wait);
    assert.equal(await page.$eval('.shp-store strong', (el) => el.textContent), 'matrix-synthetic.myshopify.com');
    return { page, region: '.kiwi-backdrop .kiwi-modal', calls, s };
  },
};

try {
  for (const locale of ['fr', 'en', 'ar']) {
    for (const viewport of ['phone', 'tablet']) {
      await h.S.run(`Shopify setup, sync error and recovery · ${locale} · ${viewport}`, async (t) => {
        // coverage: surface=dashboard locale=fr viewport=phone
        // coverage: surface=dashboard locale=en viewport=phone
        // coverage: surface=dashboard locale=ar viewport=phone
        // coverage: surface=dashboard locale=fr viewport=tablet
        // coverage: surface=dashboard locale=en viewport=tablet
        // coverage: surface=dashboard locale=ar viewport=tablet
        const cell = await connector.open(t, locale, viewport);
        const { page, calls, s } = cell;
        t.step('inspect location setup and exact SKU mapping');
        await page.select('.shp-select', 'matrix-location');
        await button(page, s.refresh);
        await page.waitForSelector('.shp-preview .shp-list summary', wait);
        await click(page, '.shp-preview .shp-list summary');
        await page.waitForFunction(() => [...document.querySelectorAll('.shp-list div')]
          .some((el) => el.textContent.includes('Matrix cotton') && el.getBoundingClientRect().height > 0));
        assert.equal(calls[0].action, 'refresh-mapping');
        await check(t, cell, 'mapping', locale, viewport);

        t.step('read the synthetic failed sync and its recovery instruction');
        await page.waitForFunction((text) => [...document.querySelectorAll('.shp .chl-once')]
          .some((el) => el.textContent === text), {}, s.error);
        await page.$eval('.shp .chl-once', (el) => el.scrollIntoView({ block: 'center' }));
        await check(t, cell, 'sync-error', locale, viewport);
        t.step('retry failed stock delivery and verify the failure clears');
        await button(page, s.retry);
        await page.waitForFunction(() => !document.querySelector('.shp .chl-once') && !document.querySelector('.shp.is-loading'));
        assert.equal(calls.filter((c) => c.action === 'retry').length, 1);
        await check(t, cell, 'retry-recovered', locale, viewport);

        t.step('replay online orders safely and read the empty replay result');
        const dialogResult = new Promise((resolve, reject) => page.once('dialog', async (dialog) => {
          const message = dialog.message();
          try { await dialog.accept(); resolve(message); } catch (error) { reject(error); }
        }));
        await button(page, s.replay);
        assert.equal(await dialogResult, s.none);
        assert.deepEqual(calls.filter((c) => c.action === 'replay-orders'), [{ action: 'replay-orders', dryRun: true }]);
        await check(t, cell, 'replay-empty', locale, viewport);
      });
    }
  }
} finally {
  await h.close();
  await h.S.finish();
}
