#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
// No merchant services: realPage fails closed for every unlisted API/host.
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { secret, fillSecret } from './browser-trace.mjs';
import { harness, realPage, sleep } from './surface-matrix-lib.mjs';
import { tradingHourMs } from './demo-clock.mjs';
import { click, tkAct, view, pickReturn, voucher, ticket, openFloat } from './surface-matrix-credit-lib.mjs';
const h = await harness('surface-matrix-states-credit-real');
const code = String(randomInt(1000, 10000));
const wrong = String((Number(code) + 1) % 10000).padStart(4, '0');
const accepted = secret('synthetic-manager', code), refused = secret('synthetic-wrong', wrong);
const merchant = 'matrix-real';
const past = tradingHourMs() - 24 * 60000;
const catalog = { v: 1, categories: [{ id: 'clothes', name: 'Clothes' }],
  products: [{ id: 'matrix-shirt', name: 'Matrix Shirt', categoryId: 'clothes', kind: 'tu', art: 'foulard', price: 100, priceMAD: 100, active: true }],
  variants: [{ id: 'matrix-variant', productId: 'matrix-shirt', size: 'TU', colorId: 'black', colorLabel: 'Noir', colorHex: '#111111', stock: 10, base: 10, baseAt: 1, barcodes: [] }] };
try {
  for (const locale of forLocales(['fr', 'en', 'ar'])) for (const viewport of ['phone', 'tablet']) {
    await h.S.run(`real credit refusal and recovery · ${locale} · ${viewport}`, async t => {
      let issues = 0, failures = 0, approvals = 0;
      const credits = [{ id: 'existing-credit', code: 'AV-BEFORE', amountCents: 2500, balanceCents: 2500, customerId: 'matrix-client', customerName: 'Matrix Customer', createdAt: Date.now(), expiresAt: Date.now() + 365 * 86400000, status: 'active' }];
      const routes = {
        'GET /api/config': { name: 'Matrix Boutique', type: 'boutique', plan: 'pro', pins: [{ name: 'Mira Test', role: 'owner' }], features: {} },
        'GET /api/pair/state': { ok: true, paired: true },
        'GET /api/catalog': { data: catalog, rev: 1 },
        'POST /api/catalog': { ok: true, rev: 2 },
        'GET /api/store': req => ({ body: { data: null, rev: 0, feature: new URL(req.url()).searchParams.get('feature') } }),
        'POST /api/store': { ok: true, rev: 1 },
        'GET /api/clients': { clients: [{ id: 'matrix-client', name: 'Matrix Customer', phone: '0600000000', points: 0 }], cursor: 0, more: false },
        'GET /api/team/live': { entries: [] },
        'POST /api/team/live': { ok: true },
        'POST /api/ticket-sequence': req => ({ body: { start: 1001, end: 1500, period: JSON.parse(req.postData()).period } }),
        'GET /api/feed': { sales: [{ id: 'matrix-sale', ref: 'MATRIX-1000', ts: past, method: 'cash', amountCents: 10000,
          lines: [{ itemId: 'matrix-shirt', name: 'Matrix Shirt', size: 'TU', qty: 1, unit: 100, total: 100 }] }] },
        // A store credit is tied to its original sale: the till registers that
        // sale first, and the server answers like functions/api/sale.js.
        'POST /api/sale': req => ({ body: { ok: true, id: JSON.parse(req.postData()).id, stored: true } }),
        'GET /api/store-credits': () => ({ body: { credits } }),
        'POST /api/pin/verify': req => {
          const body = JSON.parse(req.postData() || '{}');
          assert.equal(req.method(), 'POST');
          assert.equal(body.merchant, merchant);
          if (body.action) {
            assert.equal(body.action.kind, 'refund');
            assert.equal(body.action.originalSaleId, 'matrix-sale');
            assert.equal(body.action.amountCents, 10000);
            assert.equal(body.action.refundMethod, 'avoir');
          }
          if (body.pin !== code) { failures++; return { status: 401, body: { error: 'bad-pin' } }; }
          approvals++;
          return { body: { ok: true, staff: { id: 'matrix-manager', name: 'Mira Test', role: 'owner' }, approval: 'matrix-refund-capability', merchant } };
        },
        'POST /api/store-credits': req => {
          const body = JSON.parse(req.postData() || '{}');
          issues++;
          assert.equal(body.action, 'issue');
          assert.equal(body.approval, 'matrix-refund-capability');
          assert.equal(body.originalSaleId, 'matrix-sale');
          assert.equal(body.amountCents, 10000);
          assert.equal(body.customerId, 'matrix-client');
          const credit = { id: body.id, code: 'AV-MATRIX', amountCents: body.amountCents, balanceCents: body.amountCents,
            customerId: body.customerId, customerName: body.customerName, originalSaleId: body.originalSaleId, originalRef: body.originalRef,
            createdAt: Date.now(), expiresAt: body.expiresAt, status: 'active' };
          credits.push(credit); return { body: { credit } };
        },
      };
      const { ctx, page } = await realPage(h, locale, viewport, routes, {
        kiwiPaired: '1', kiwiPairedVenue: JSON.stringify({ merchant, type: 'boutique', name: 'Matrix Boutique' }),
        'kiwiSkin2027:till': '1',
        // A paired register's durable journal retains the customer identity;
        // /api/feed imports otherwise deliberately create anonymous sale rows.
        'kiwi:bqDay': JSON.stringify({ v: 1, m: merchant, s: [{
          id: 'MATRIX-1000', serverId: 'matrix-sale', at: new Date(past), clientId: 'matrix-client',
          by: 'Mira Test', kind: 'vente', methods: 'espèces', total: 100, remote: true,
          lines: [{ pid: 'matrix-shirt', name: 'Matrix Shirt', size: 'TU', color: 'black', qty: 1, unit: 100, remise: 0, returned: false }],
        }] }),
      });
      t.defer(() => ctx.close()); t.watch(page);
      t.step('boot the paired real boutique and open its shift');
      // coverage: surface=caisse-boutique locale=fr viewport=phone
      // coverage: surface=caisse-boutique locale=en viewport=phone
      // coverage: surface=caisse-boutique locale=ar viewport=phone
      // coverage: surface=caisse-boutique locale=fr viewport=tablet
      // coverage: surface=caisse-boutique locale=en viewport=tablet
      // coverage: surface=caisse-boutique locale=ar viewport=tablet
      // coverage: surface=boutique-return-refusal locale=fr viewport=phone
      // coverage: surface=boutique-return-refusal locale=fr viewport=tablet
      // coverage: surface=boutique-return-refusal locale=en viewport=phone
      // coverage: surface=boutique-return-refusal locale=en viewport=tablet
      // coverage: surface=boutique-return-refusal locale=ar viewport=phone
      // coverage: surface=boutique-return-refusal locale=ar viewport=tablet
      await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
      await page.waitForSelector('#cp-pin-screen k-pin-pad', { visible: true });
      await fillSecret(page, '#cp-pin-screen k-pin-pad >>> [data-key="del"]', accepted);
      await openFloat(page);
      await page.waitForSelector('#pos-boutique.is-on', { visible: true, timeout: 20000 });
      await page.waitForSelector('#bqci-btn', { hidden: true });
      assert.equal(await page.evaluate(() => KiwiEnv.isReal()), true);
      approvals = 0; // The staff unlock is separate from refund approval.
      await page.waitForFunction(() => window.KiwiClients?.get?.('matrix-client'), { timeout: 15000 });
      await pickReturn(page, 'MATRIX-1000');
      await click(page, '[data-bq-av="AV-BEFORE"]');
      const before = await voucher(page);
      await click(page, '[data-bq-do-avoir]');
      const pad = '[data-till-pin="manager"] k-pin-pad';
      await page.waitForSelector(pad, { visible: true });
      t.step('server refuses the wrong manager code; no credit is created');
      await fillSecret(page, `${pad} >>> [data-key="del"]`, refused);
      const translated = {
        fr: 'Ce code ne fonctionne pas. Trop de codes incorrects mettent en pause tous les codes des caisses de ce commerce.',
        en: "That code didn't work. Too many wrong codes pause every code on this store's tills.",
        ar: 'هذا الرمز غير صحيح. كثرة الرموز الخاطئة توقف جميع رموز صناديق هذا المتجر.',
      }[locale];
      await page.waitForFunction((sel, text) => document.querySelector(sel)?.shadowRoot?.textContent.includes(text), {}, pad, translated);
      const message = await page.$(`${pad} >>> .pol`);
      assert.ok(message && await message.isVisible(), 'translated refusal is visible');
      assert.equal(await message.evaluate(el => el.textContent.replace(/[⁦-⁩]/g, '')), translated);
      assert.equal(failures, 1); assert.equal(issues, 0); assert.equal(credits.length, 1); assert.equal(credits[0].balanceCents, 2500);
      assert.equal(await page.$('#bq-avoir-veil.is-open'), null);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-till-pin="manager"][open]', { hidden: true });
      // The closing pad fades over the list; tap once the voucher is on top again.
      await page.waitForFunction(() => { const e = document.querySelector('[data-bq-av="AV-BEFORE"]'); if (!e) return false; const r = e.getBoundingClientRect(); return !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-bq-av]'); }, { timeout: 5000 });
      await click(page, '[data-bq-av="AV-BEFORE"]');
      assert.equal((await voucher(page)).balance, before.balance, 'customer balance remains visible and unchanged');
      assert.equal(issues, 0, 'no POST creating store credit after refusal');
      t.step('retry the same return with the accepted manager code');
      await sleep(800);
      await click(page, '[data-bq-do-avoir]');
      await fillSecret(page, `${pad} >>> [data-key="del"]`, accepted);
      await page.waitForSelector('#bq-avoir-veil.is-open', { visible: true, timeout: 15000 });
      assert.equal(approvals, 1); assert.equal(issues, 1);
      assert.equal(credits[1].balanceCents, 10000);
      assert.match(await page.$eval('#bq-avoirmm .modal-subtle', el => el.textContent), /Matrix Customer/);
      assert.equal((await voucher(page)).code, 'AV-MATRIX');
      await view(page, 'vente');
      await ticket(page);
      await tkAct(page, 'client', '#bq-tk-client');
      await click(page, '[data-bq-cl="matrix-client"]');
      // Under the 2027 skin the customer row is off and the kit's Clientes button carries the name and the credit (#105).
      const kitClient = '#pos-boutique k-button[data-bq-tk-act="client"]';
      const avSel = await page.$eval(kitClient, (e) => e.getClientRects().length > 0).catch(() => false) ? kitClient : '[data-bq-tk-av]';
      await page.waitForFunction((q) => { const e = document.querySelector(q); return e && /125/.test((e.getAttribute('label') || e.textContent).replace(/[⁦-⁩\s\u202f\u00a0]/g, '')); }, { timeout: 15000 }, avSel);
      assert.match(await page.$eval(avSel, el => (el.getAttribute('label') || el.textContent).replace(/[⁦-⁩]/g, '')), /125/, 'the ticket shows the customer\'s total credit: 25 already held plus the 100 just issued');
      assert.equal(await page.evaluate(() => document.documentElement.lang), locale);
      assert.equal(await page.evaluate(() => document.documentElement.dir), locale === 'ar' ? 'rtl' : 'ltr');
    });
  }
} finally { await h.close(); await h.S.finish(); }
