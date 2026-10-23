#!/usr/bin/env node
// Uses browser-trace through the shared harness (Chromium; run serially).
// Refused till operations reach the owner as a card on the real dashboard:
// each one says what it was and why it was refused, the owner approves or
// declines it with real clicks, and an approval the server refused (refund
// over the sale's balance, usually because it was already redone) can still
// be declined instead of staying stuck. Synthetic real session, no credentials.
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { harness, realPage, sleep, verify } from './surface-matrix-lib.mjs';

const h = await harness('quarantine-review');
const merchant = 'matrix-real';
const REGION = 'section[aria-labelledby="quarantine-title"]';
const words = {
  fr: { title: 'Opérations à valider', decline: 'Déclarer non effectuée', approve: 'Valider', cap: 'déjà été refait' },
  en: { title: 'Operations to review', decline: 'Mark as not performed', approve: 'Approve', cap: 'already redone' },
  ar: { title: null, decline: null, approve: null, cap: null },
};
const OWNER = String(randomInt(1000, 10000));
async function unlock(page) {
  await page.waitForFunction(() => { const p = document.querySelector('[data-kiwi-lock] k-pin-pad'); return p && p.shadowRoot && p.shadowRoot.querySelector('[data-key="1"]'); }, { timeout: 30000 });
  for (const d of OWNER) {
    const key = await page.evaluateHandle((x) => document.querySelector('[data-kiwi-lock] k-pin-pad').shadowRoot.querySelector('[data-key="' + x + '"]'), d);
    const box = await key.asElement().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(40);
  }
  await page.waitForFunction(() => { const l = document.querySelector('[data-kiwi-lock]'); return !l || l.classList.contains('is-unlocking') || getComputedStyle(l).display === 'none' || l.hidden; }, { timeout: 15000 });
  await sleep(2600);
}

async function scenario(t, locale, viewport) {
  const decisions = [];
  let entries = [
    { id: 'rf-open', ref: 'R-16501', kind: 'refund', amountCents: 30800, method: 'cash', ts: Date.UTC(2026, 8, 5, 12), originalSaleId: 'S-16501', reason: 'manager-required', status: 'pending', lastError: '' },
    { id: 'rf-capped', ref: 'R-16502', kind: 'refund', amountCents: 500, method: 'cash', ts: Date.UTC(2026, 8, 6, 12), originalSaleId: 'S-16502', reason: 'manager-required', status: 'approving', lastError: 'refund-exceeds-sale' },
  ];
  const routes = {
    'GET /api/me': { authenticated: true, onboarded: true, name: 'Mira Test', business: 'Matrix Kitchen', type: 'restaurant',
      stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
    'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', plan: 'pro', planExplicit: true, features: {}, pins: [{ name: 'Mira Test', role: 'owner' }] },
    'POST /api/pin/verify': (req) => {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
      return body.pin === OWNER ? { status: 200, body: { ok: true, staff: { id: 'st_owner', name: 'Mira Test', role: 'owner' }, merchant } } : { status: 401, body: { error: 'bad-pin' } };
    },
    'GET /api/quarantine': () => ({ status: 200, body: { ok: true, merchant, entries } }),
    'POST /api/quarantine': (req) => {
      const body = JSON.parse(req.postData() || '{}');
      assert.equal(body.merchant, merchant);
      decisions.push(body.action + ':' + body.id);
      entries = entries.filter((e) => e.id !== body.id);
      return { status: 200, body: { ok: true, id: body.id, status: body.action === 'approve' ? 'approved' : 'declined' } };
    },
  };
  const { ctx, page } = await realPage(h, locale, viewport, routes);
  t.defer(() => ctx.close());
  t.watch(page);
  const confirms = [];
  page.on('dialog', (d) => { confirms.push(d.message()); d.accept(); });
  t.step('load a synthetic real dashboard with two refused till refunds');
  // coverage: surface=dashboard locale=fr viewport=desktop
  // coverage: surface=dashboard locale=fr viewport=phone
  // coverage: surface=dashboard locale=en viewport=desktop
  // coverage: surface=dashboard locale=en viewport=phone
  // coverage: surface=dashboard locale=ar viewport=desktop
  // coverage: surface=dashboard locale=ar viewport=phone
  await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
  await unlock(page);
  await page.waitForSelector(REGION + ' li', { visible: true, timeout: 20000 });
  const card = await page.$eval(REGION, (el) => ({ text: el.innerText, items: el.querySelectorAll('li').length, dir: getComputedStyle(el).direction }));
  assert.equal(card.items, 2, 'both refused operations are listed');
  assert.ok(/16501/.test(card.text) && /16502/.test(card.text), 'receipt numbers are shown');
  const w = words[locale];
  if (w.title) assert.ok(card.text.includes(w.title) && card.text.includes(w.cap), 'title and the over-cap explanation are in ' + locale);
  else assert.ok(!/Opérations à valider|Operations to review/.test(card.text), 'Arabic card is not French or English');
  await page.$eval(REGION, (el) => el.scrollIntoView({ block: 'start' }));
  await verify({ ...h, baseline: { ...h.baseline, ['quarantine-' + locale + '-' + viewport]: {} } }, t,
    { page, region: REGION }, 'quarantine-' + locale + '-' + viewport, locale);

  t.step('the stuck over-cap refund can be declined');
  const declineCapped = await page.evaluateHandle((r) => [...document.querySelectorAll(r + ' li')].find((li) => /16502/.test(li.textContent)).querySelectorAll('button')[1], REGION);
  assert.equal(await declineCapped.evaluate((b) => b.disabled), false, 'decline is offered after a refused approval');
  await declineCapped.asElement().click();
  await page.waitForFunction((r) => document.querySelectorAll(r + ' li').length === 1, { timeout: 15000 }, REGION);

  t.step('approve the remaining refund after its confirmation');
  const approve = await page.evaluateHandle((r) => document.querySelector(r + ' li button'), REGION);
  await approve.asElement().click();
  await page.waitForFunction((r) => { const el = document.querySelector(r); return !el || el.hidden; }, { timeout: 15000 }, REGION);
  assert.deepEqual(decisions, ['decline:rf-capped', 'approve:rf-open']);
  assert.equal(confirms.length, 2, 'each decision asks for confirmation first');
}

async function unreachable(t) {
  const routes = {
    'GET /api/me': { authenticated: true, onboarded: true, name: 'Mira Test', business: 'Matrix Kitchen', type: 'restaurant',
      stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
    'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', plan: 'pro', planExplicit: true, features: {}, pins: [{ name: 'Mira Test', role: 'owner' }] },
    'POST /api/pin/verify': (req) => {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
      return body.pin === OWNER ? { status: 200, body: { ok: true, staff: { id: 'st_owner', name: 'Mira Test', role: 'owner' }, merchant } } : { status: 401, body: { error: 'bad-pin' } };
    },
    // GET /api/quarantine is left out: the harness answers 503, as when offline.
  };
  const { ctx, page } = await realPage(h, 'fr', 'phone', routes);
  t.defer(() => ctx.close());
  t.watch(page);
  t.step('an unreachable review endpoint with nothing known shows no card');
  await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
  await unlock(page);
  await sleep(2500);
  const shown = await page.$eval(REGION, (el) => !el.hidden && !!el.getClientRects().length).catch(() => false);
  assert.equal(shown, false, 'no alarming card when the server is simply unreachable');
}

try {
  await h.S.run('unreachable review endpoint stays quiet · fr · phone', (t) => unreachable(t));
  for (const locale of ['fr', 'en', 'ar']) for (const viewport of ['desktop', 'phone']) {
    await h.S.run(`owner settles refused operations · ${locale} · ${viewport}`, (t) => scenario(t, locale, viewport));
  }
} finally {
  await h.close();
  await h.S.finish();
}
