#!/usr/bin/env node
/* Le deuxième appui d'un double tap, au vrai clic (26 nov. 2026).
 *
 * Sur un iPad, un doigt tape souvent deux fois. Le premier appui ferme une
 * feuille ou repeint une liste ; le second tombait sur ce qui venait de
 * glisser dessous :
 *   1 · écran cuisine : « Prendre » prenait DEUX bons (le suivant remontait
 *       sous le doigt), pareil pour « Prête » et « Servie » ;
 *   2 · carte OrderPro : « Ajouter » fermait la feuille, le second appui
 *       rouvrait le plat qui se trouvait derrière ;
 *   3 · caisse boutique : « Confirmer » encaissait, le second appui ouvrait
 *       la fiche de l'article placé sous le bouton ;
 *   4 · réservation : la première rangée d'horaires arrivait sous le pied de
 *       page collant, l'appui touchait « Retour ».
 * Un second appui voulu, une demi-seconde plus tard, passe toujours. */
import assert from 'node:assert/strict';
import { harness, demoPage, openTill, sleep } from './surface-matrix-lib.mjs';

const h = await harness('ghost-tap');
const centre = (page, sel, i = 0) => page.evaluate((sel, i) => {
  const e = document.querySelectorAll(sel)[i];
  if (!e) return null;
  const b = e.getBoundingClientRect();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}, sel, i);
const doubleTap = async (page, p, gap = 0) => {
  await page.mouse.click(p.x, p.y);
  if (gap) await sleep(gap);
  await page.mouse.click(p.x, p.y);
};

try {
  /* ── 1 · écran cuisine ─────────────────────────────────────────────────── */
  await h.S.run('kitchen · a double tap bumps one ticket, not two', async (t) => {
    const now = Date.now();
    const orders = () => [1, 2, 3, 4, 5, 6].map((n) => ({
      id: 'ghost-' + n, number: n, status: 'accepted', mode: 'table', table: String(n + 3), server: 'Amina K', channel: 'kiwi',
      created_ts: now - (8 - n) * 60000, updated_ts: now,
      lines: [{ id: 'l' + n, name: 'Tajine kefta', qty: 1, station: '', stationAccepted: false, stationReady: false, course: 'main' }],
    }));
    const posts = [];
    const routes = {
      'GET /api/order/queue': () => ({ body: { ok: true, serverNow: Date.now(), zone: 'Africa/Casablanca', orders: orders(), nextCursor: null } }),
      'POST /api/order/queue': (r) => { posts.push(JSON.parse(r.postData() || '{}')); return { body: { ok: true, lines: [] } }; },
    };
    const { ctx, page } = await demoPage(h, 'fr', 'tablet', { kiwiLiveMerchant: 'ghost-tap-bistro', kiwiPaired: '1', kiwiCuisineLang: 'fr' }, routes);
    t.defer(() => ctx.close());
    t.watch(page);
    // coverage: surface=kitchen locale=fr viewport=tablet
    await page.goto(h.base + '/kiwi-cuisine.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#s-new [data-take]', { timeout: 20000 });
    const cols = () => page.evaluate(() => ['s-new', 's-cook', 's-pass'].map((id) => document.querySelectorAll('#' + id + ' .tk').length).join('/'));
    assert.equal(await cols(), '6/0/0', 'six tickets wait in « Nouvelles »');

    t.step('double tap on Prendre');
    await doubleTap(page, await centre(page, '#s-new [data-take]'));
    await sleep(300);
    assert.equal(await cols(), '5/1/0', 'a double tap on « Prendre » takes one ticket');
    await sleep(350);
    await doubleTap(page, await centre(page, '#s-new [data-take]'), 180);
    await sleep(300);
    assert.equal(await cols(), '4/2/0', 'a slower double tap (180 ms) takes one ticket too');

    t.step('two deliberate taps');
    await sleep(350);
    const take = await centre(page, '#s-new [data-take]');
    await page.mouse.click(take.x, take.y);
    await sleep(550);
    await page.mouse.click(take.x, take.y);
    await sleep(300);
    assert.equal(await cols(), '2/4/0', 'two deliberate taps, half a second apart, take two tickets');

    t.step('double tap on Prête, then a tap elsewhere at once');
    await doubleTap(page, await centre(page, '#s-cook [data-ready]'));
    const other = await centre(page, '#s-new [data-take]');
    await page.mouse.click(other.x, other.y);
    await sleep(300);
    assert.equal(await cols(), '1/4/1', 'a double tap on « Prête » readies one ticket, and a tap in another column right after still counts');

    t.step('double tap on Servie');
    await sleep(350);
    await doubleTap(page, await centre(page, '#s-cook [data-ready]'));
    await sleep(600);
    assert.equal(await cols(), '1/3/2', 'two tickets at the pass');
    await doubleTap(page, await centre(page, '#s-pass [data-served]'));
    await sleep(300);
    assert.equal(await cols(), '1/3/1', 'a double tap on « Servie » serves one ticket');
    assert.equal(posts.filter((p) => p.status === 'cooking').length, 5, 'the server heard five « Prendre », one per ticket taken');
  });

  /* ── 2 · carte OrderPro ────────────────────────────────────────────────── */
  await h.S.run('orderpro · a double tap on Ajouter does not reopen a dish', async (t) => {
    const { ctx, page } = await demoPage(h, 'fr', 'phone');
    t.defer(() => ctx.close());
    t.watch(page);
    // coverage: surface=orderpro locale=fr viewport=phone
    await page.goto(h.base + '/OrderPro.html?s=demo', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('.mode-card', { visible: true, timeout: 30000 });
    await sleep(600);
    await page.click('.mode-card');
    await page.waitForSelector('.num-key', { visible: true, timeout: 10000 });
    for (const d of ['1', '4']) {
      const i = await page.evaluate((d) => [...document.querySelectorAll('.num-key')].findIndex((x) => x.textContent.trim() === d), d);
      const p = await centre(page, '.num-key', i);
      await page.mouse.click(p.x, p.y);
    }
    await page.click('#continue-btn');
    await page.waitForSelector('.dish-add', { visible: true, timeout: 15000 });
    await sleep(900);
    const sheetOpen = () => page.evaluate(() => document.getElementById('custom-sheet').classList.contains('is-open'));
    const cartQty = () => page.evaluate(() => { const m = (document.querySelector('.cart-pill')?.innerText || '').match(/\d+/); return m ? +m[0] : 0; });

    t.step('open a dish, double tap Ajouter');
    await page.evaluate(() => document.querySelector('.dish-add').scrollIntoView({ block: 'center' }));
    await sleep(300);
    const add = await centre(page, '.dish-add');
    await page.mouse.click(add.x, add.y);
    await page.waitForFunction(() => document.getElementById('custom-sheet').classList.contains('is-open'), { timeout: 8000 });
    await sleep(500);
    const ok = await centre(page, '#custom-add-btn');
    const behind = await page.evaluate((p) => document.elementsFromPoint(p.x, p.y).some((e) => !e.closest('#custom-sheet') && e.closest('.dish, .dish-card, [data-item], .dish-add')), ok);
    assert.ok(behind, 'a dish sits behind the « Ajouter » button (or this test proves nothing)');
    await doubleTap(page, ok);
    await sleep(900);
    assert.equal(await sheetOpen(), false, 'the customizer stays closed after a double tap on « Ajouter »');
    assert.equal(await cartQty(), 1, 'the dish went to the cart once');

    t.step('a deliberate tap at the same spot is heard again');
    await sleep(300);
    await page.mouse.click(ok.x, ok.y);   // the cart pill now sits there
    await sleep(800);
    assert.equal(await page.evaluate(() => !!document.querySelector('#cart-sheet.is-open, #custom-sheet.is-open')), true, 'the same spot answers again once the double tap is over');
  });

  /* ── 3 · caisse boutique ───────────────────────────────────────────────── */
  await h.S.run('boutique · a double tap on Confirmer does not open an article', async (t) => {
    // coverage: surface=caisse-boutique locale=fr viewport=tablet
    const { page } = await openTill(h, t, 'caisse-boutique', 'fr', 'tablet');
    await sleep(900);
    const veils = () => page.evaluate(() => [...document.querySelectorAll('#pos-boutique .modal-veil.is-open')].map((v) => v.id));
    const clickText = async (scope, text) => {
      const p = await page.evaluate((scope, text) => {
        const e = [...document.querySelectorAll(scope)].filter((x) => { const b = x.getBoundingClientRect(); return b.width > 2 && b.height > 2; })
          .filter((x) => (x.innerText || '').trim().startsWith(text)).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }, scope, text);
      if (!p) return false;
      await page.mouse.click(p.x, p.y);
      return true;
    };
    t.step('sell one article, cash');
    const card = await centre(page, '#pos-boutique .bq-card');
    await page.mouse.click(card.x, card.y);
    await page.waitForFunction(() => document.querySelector('#pos-boutique #bq-sheet-veil.is-open, #pos-boutique .modal-veil.is-open'), { timeout: 8000 });
    await sleep(500);
    assert.ok(await clickText('#bq-sheetm button', 'Ajouter au ticket'), 'the article sheet offers « Ajouter au ticket »');
    await sleep(500);
    if (await clickText('#bq-sheetm button', 'Vendre quand même')) await sleep(500);
    assert.deepEqual(await veils(), [], 'the article sheet closed');
    await page.click('#bq-validate');
    await page.waitForSelector('#bq-pay-veil.is-open', { timeout: 8000 });
    await sleep(500);
    assert.ok(await clickText('#bq-paym button, #bq-paym [role=button]', 'Espèces'), 'cash is offered');
    await page.waitForSelector('#bq-cash-ok', { visible: true, timeout: 8000 });
    await sleep(400);
    const ok = await centre(page, '#bq-cash-ok');
    const behind = await page.evaluate((p) => document.elementsFromPoint(p.x, p.y).some((e) => e.classList.contains('bq-card')), ok);
    assert.ok(behind, 'an article card sits behind « Confirmer » (or this test proves nothing)');
    const sales = () => page.evaluate(() => (document.querySelector('#pos-boutique').innerText.match(/(\d+)\s+ventes?/) || [])[1] || '');
    const before = await sales();
    t.step('double tap on Confirmer');
    await doubleTap(page, ok, 120);
    await sleep(1200);
    assert.deepEqual(await veils(), [], 'nothing opens under a double tap on « Confirmer »');
    if (before) assert.equal(+(await sales()), +before + 1, 'one sale was recorded');
    t.step('a deliberate tap on the article behind still opens it');
    await page.mouse.click(ok.x, ok.y);
    await sleep(700);
    assert.equal((await veils()).length, 1, 'the article under the finger opens once the double tap is over');
  });

  /* ── 4 · réservation ───────────────────────────────────────────────────── */
  await h.S.run('booking · the first row of slots is not under the sticky footer', async (t) => {
    const cfg = { kind: 'restaurant', name: 'Café Atlas', tz: 'Africa/Casablanca', hoursSet: true, settings: { windowDays: 14 },
      services: [{ id: 'dej', name: 'Déjeuner', duration: 90, maxParty: 6, deposit: 0, price: 0 }] };
    const routes = { 'GET /api/booking': (r) => {
      const u = new URL(r.url());
      if (!u.searchParams.get('service')) return { body: cfg };
      return { body: { ...cfg, slots: ['12:00', '12:30', '13:00', '20:00', '20:30'].map((x) => ({ startAt: u.searchParams.get('date') + 'T' + x + ':00Z', available: true })) } };
    } };
    const { ctx, page } = await demoPage(h, 'fr', 'phone', {}, routes);
    t.defer(() => ctx.close());
    t.watch(page);
    // coverage: surface=booking locale=fr viewport=phone
    await page.goto(h.base + '/booking.html?merchant=cafe-atlas', { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('[data-service]', { visible: true, timeout: 20000 });
    await sleep(600);
    await page.click('[data-service]');
    await page.waitForSelector('[data-slot]', { timeout: 15000 });
    await sleep(900);
    const hits = await page.evaluate(() => [...document.querySelectorAll('[data-slot]')].map((b) => {
      b.scrollIntoView({ block: 'nearest' });
      const r = b.getBoundingClientRect();
      const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return b.textContent.trim() + ':' + (e && e.closest('[data-slot]') === b ? 'slot' : (e && e.className) || 'nothing');
    }));
    assert.deepEqual(hits, ['12:00:slot', '12:30:slot', '13:00:slot', '20:00:slot', '20:30:slot'], 'every slot brought into view is the thing under the finger');
    t.step('tap the first slot');
    await page.evaluate(() => document.querySelector('[data-slot]').scrollIntoView({ block: 'nearest' }));
    await sleep(300);
    const p = await centre(page, '[data-slot]');
    await page.mouse.click(p.x, p.y);
    await sleep(900);
    assert.match(await page.evaluate(() => document.querySelector('.bk-head span')?.textContent || ''), /^03/, 'the tap on a slot goes on to step 03, not back to 01');
  });
} finally {
  await h.close();
  await h.S.finish();
}
