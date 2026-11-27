#!/usr/bin/env node
/* wallet-dashboard-browser-test · the Wallet card settings in the real
 * dashboard (assets/wallet-dashboard.js), synthetic server only.
 *
 *   node tools/wallet-dashboard-browser-test.mjs
 *
 * What this holds, with real clicks from the customer directory:
 *   · opening « Programme fidélité » loads the Wallet panel under the
 *     programme, filled from the shop's « wallet » document;
 *   · the preview card is Kiwi-branded (no colour pickers) with the programme's stamps;
 *   · the count line says how many customers hold the card, by phone type;
 *   · « Enregistrer » posts { feature:'wallet', merchant, data, baseRev } with
 *     the revision it read, and a stale answer is said, then reread. */
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { harness, realPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('wallet-dashboard');
const merchant = 'matrix-real';
const OWNER = String(randomInt(1000, 10000));

async function click(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 20000 });
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.click(selector);
}
async function unlock(page) {
  await page.waitForSelector('[data-kiwi-lock] [data-kiwi-pin-input]', { timeout: 30000 });
  await sleep(600);
  await page.focus('[data-kiwi-lock] [data-kiwi-pin-input]');
  for (const d of OWNER) { await page.keyboard.press(d); await sleep(60); }
  await page.waitForFunction(() => { const l = document.querySelector('[data-kiwi-lock]'); return !l || l.classList.contains('is-unlocking') || getComputedStyle(l).display === 'none' || l.hidden; }, { timeout: 15000 });
  await sleep(2600);
}

try {
  await h.S.run('wallet card settings in the dashboard · fr · desktop', async (t) => {
    const posts = [];
    let rev = 4;
    const program = { model: 'visit', visit: { target: 8, reward: 'Café' } };
    const routes = {
      'GET /api/me': { authenticated: true, onboarded: true, name: 'Mira Test', business: 'Matrix Kitchen', type: 'restaurant', stores: [{ merchant, name: 'Matrix Kitchen', type: 'restaurant' }] },
      'GET /api/config': { name: 'Matrix Kitchen', type: 'restaurant', plan: 'pro', planExplicit: true, features: { crm: true, loyalty: true }, pins: [{ name: 'Mira Test', role: 'owner' }] },
      'POST /api/pin/verify': (req) => {
        let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (_) {}
        return body.pin === OWNER ? { status: 200, body: { ok: true, staff: { id: 'st_owner', name: 'Mira Test', role: 'owner' }, merchant } } : { status: 401, body: { error: 'bad-pin' } };
      },
      'GET /api/clients': { clients: [{ id: 'nora', name: 'Nora Test', stamps: 3, updated_ts: 1 }], cursor: 1, more: false },
      'GET /api/store': (req) => {
        const feature = new URL(req.url()).searchParams.get('feature');
        if (feature === 'fidelity') return { status: 200, body: { ok: true, data: program } };
        if (feature === 'wallet') return { status: 200, body: { ok: true, rev, data: { on: true, name: 'Matrix Café', bg: '#112233', color: '#ffcc00', address: 'Tanger' } } };
        return { status: 200, body: { ok: true, data: null } };
      },
      'POST /api/store': (req) => {
        const body = JSON.parse(req.postData());
        if (body.feature !== 'wallet') return { status: 200, body: { ok: true, rev: 1 } };
        posts.push(body);
        if (posts.length === 1) { rev = 6; return { status: 409, body: { error: 'stale' } }; }
        return { status: 200, body: { ok: true, rev: rev + 1 } };
      },
      'GET /api/wallet/stats': { ok: true, clients: 5, apple: 3, appleInWallet: 2, google: 1, web: 1 },
    };
    const { ctx, page } = await realPage(h, 'fr', 'desktop', routes, { ['kiwi:fidelity:v1:' + merchant]: JSON.stringify(program) });
    t.defer(() => ctx.close()); t.watch(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    t.step('open the real dashboard and the loyalty programme from the customer directory');
    // coverage: surface=dashboard locale=fr viewport=desktop
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await unlock(page);
    await page.waitForFunction(() => window.KiwiClients?.bookId?.() === 'matrix-real' && window.KiwiEnv?.isReal?.());
    await page.evaluate(() => document.querySelector('[data-action="clients-directory"]').click());
    await click(page, '#cd-loyalty');

    t.step('the Wallet panel mounts under the programme, filled from the shop document');
    await page.waitForSelector('.kiwi-modal .kw-wd .kw-wd-card', { visible: true, timeout: 20000 });
    const filled = await page.evaluate(() => {
      const box = document.querySelector('.kiwi-modal .kw-wd');
      const inputs = [...box.querySelectorAll('input')];
      return { on: inputs.find((i) => i.type === 'checkbox').checked, values: inputs.filter((i) => i.type !== 'checkbox').map((i) => i.value) };
    });
    assert.equal(filled.on, true);
    assert.ok(filled.values.includes('Matrix Café') && filled.values.includes('Tanger') && !filled.values.includes('#112233'), JSON.stringify(filled.values));

    t.step('the preview card wears Kiwi riad, never the shop old colours, and the programme stamps');
    const card = await page.$eval('.kiwi-modal .kw-wd-card', (c) => ({ bg: getComputedStyle(c).backgroundColor, text: c.textContent, dots: c.querySelectorAll('.kw-wd-dots i').length }));
    assert.equal(card.bg, 'rgb(3, 26, 19)', "Kiwi's Nuit green, not the shop's #112233");
    assert.match(card.text, /Matrix Café/);
    assert.equal(card.dots, 8, 'one dot per stamp of « 8 visites »');

    t.step('the count line reads the stats');
    await page.waitForFunction(() => /5/.test(document.querySelector('.kiwi-modal .kw-wd-stats')?.textContent || ''));
    const stats = await page.$eval('.kiwi-modal .kw-wd-stats', (e) => e.textContent);
    assert.match(stats, /5/); assert.match(stats, /3/); assert.match(stats, /2/);

    t.step('save posts the document with the revision read; a stale answer rereads and the next save wins');
    await page.$eval('.kiwi-modal .kw-wd input:not([type="checkbox"])', (i) => i.scrollIntoView({ block: 'center' }));
    const nameInput = await page.evaluateHandle(() => [...document.querySelectorAll('.kiwi-modal .kw-wd input')].find((i) => i.value === 'Matrix Café'));
    await nameInput.click({ clickCount: 3 });
    await page.keyboard.type('Matrix Kitchen');
    await click(page, '.kiwi-modal .kw-wd-btn.main');
    await page.waitForFunction(() => document.querySelector('.kiwi-modal .kw-wd-btn.main ~ .kw-wd-say.bad'));
    assert.equal(posts.length, 1);
    assert.deepEqual({ feature: posts[0].feature, merchant: posts[0].merchant, baseRev: posts[0].baseRev, name: posts[0].data.name, on: posts[0].data.on, bg: posts[0].data.bg },
      { feature: 'wallet', merchant, baseRev: 4, name: 'Matrix Kitchen', on: true, bg: '#112233' });
    await page.waitForFunction(() => !document.querySelector('.kiwi-modal .kw-wd-btn.main').disabled);
    await sleep(300);
    await click(page, '.kiwi-modal .kw-wd-btn.main');
    await page.waitForFunction(() => { const s = document.querySelector('.kiwi-modal .kw-wd-btn.main ~ .kw-wd-say'); return s && !s.classList.contains('bad') && /enregistr/i.test(s.textContent); }, { timeout: 15000 });
    assert.equal(posts.length, 2);
    assert.equal(posts[1].baseRev, 6, 'the reread revision goes with the second save');
    assert.deepEqual(errors, [], 'no page error');
  });
} finally { await h.close(); await h.S.finish(); }
