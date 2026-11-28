#!/usr/bin/env node
// The loyalty card read by the till's camera (assets/caisse/card-scan.js), on
// the 2027 note: a paired restaurant, a synthetic server, and Chromium's fake
// camera FILMING a real card QR (KIWI-C:<client>), so the decoder, the attach
// and the note's card buttons run end to end. Owner, 2026-11-27: Amira Cafe's
// iPad has no douchette, so the card could not be read at all.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { harness, realPage, sleep } from './surface-matrix-lib.mjs';

const h = await harness('till-card-scan');
let ffmpeg = '';
try { ffmpeg = execFileSync('sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' }).trim(); } catch (_) {}
if (!ffmpeg) { console.log('○ skip: ffmpeg unavailable, the fake camera cannot film a card'); await h.close(); process.exit(process.env.CI ? 1 : 0); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-card-scan-'));
const merchant = 'matrix-real';
const program = { model: 'amount', visit: { target: 10, reward: '1 offert' }, amount: { perMad: 1, threshold: 300, reward: '−10 %' }, product: { target: 10, item: 'Café', reward: '1 offert' } };
const clients = [{ id: 'c1', name: 'Nora Benali', points: 120, stamps: 0, updated_ts: 1 }, { id: 'c2', name: 'Youssef Amrani', points: 340, stamps: 0, updated_ts: 1 }];

/* The card's QR, drawn by the till's own encoder, turned into a camera feed. */
const qrPage = await h.browser.newPage();
await qrPage.setViewport({ width: 640, height: 480 });
await qrPage.setContent('<body style="margin:0;background:#fff"></body>');
await qrPage.addScriptTag({ path: path.join(root, 'assets/qrcode.js') });
await qrPage.evaluate(() => { document.body.innerHTML = '<div style="position:fixed;inset:0;display:grid;place-items:center">' + window.KiwiQR.svg('KIWI-C:c2', { size: 300, margin: 4, ecl: 'M' }) + '</div>'; });
await qrPage.screenshot({ path: path.join(tmp, 'card.png') });
await qrPage.close();
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-loop', '1', '-i', path.join(tmp, 'card.png'), '-t', '2', '-pix_fmt', 'yuv420p', '-vf', 'scale=640:480', path.join(tmp, 'card.y4m')]);
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
const camera = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + path.join(tmp, 'card.y4m')] });

const routes = (walletOn) => ({
  'GET /api/me': { authenticated: true, onboarded: true, stores: [{ merchant, name: 'Amira Cafe', type: 'restaurant' }] },
  'GET /api/config': { name: 'Amira Cafe', type: null, pins: [], features: { skin2027: true } },
  'GET /api/pair/state': { ok: true, paired: true, merchant },
  'GET /api/menu': { menu: { cats: [{ id: 'drinks', name: 'Boissons' }], items: [{ id: 'cafe', name: 'Café', price: 20, catId: 'drinks', avail: true }] } },
  'GET /api/feed': { events: [], sales: [] }, 'GET /api/team/live': { members: [] },
  'GET /api/clients': { clients, cursor: 1, more: false },
  'GET /api/wallet/enroll': walletOn ? { merchant: { slug: merchant, name: 'Amira Cafe' }, program: { model: 'amount', target: 300 } } : () => ({ status: 404, body: { error: 'no-card' } }),
  'POST /api/wallet/till-token': { url: 'https://kiwi-os.com/carte/' + merchant + '?t=till-token', expiresIn: 600 },
  'GET /api/store': (r) => ({ status: 200, body: { ok: true, data: new URL(r.url()).searchParams.get('feature') === 'fidelity' ? program : null } }),
});

/* Elements inside the kit's shadow roots. */
const bill = (page, fn, arg) => page.evaluate((src, a) => {
  const b = document.querySelector('k-bill'); const R = b && b.shadowRoot;
  return R ? new Function('R', 'a', src)(R, a) : null;
}, fn, arg);
async function tapBill(page, sel) {
  const at = await bill(page, "const e = R.querySelector(a); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;", sel);
  assert.ok(at, sel + ' is on the note');
  await page.mouse.click(at.x, at.y);
}
const act = (page) => bill(page, "const e = R.querySelector('[data-client-act]'); return e ? e.getAttribute('data-client-act') : '';");

async function openTill(t, viewport, walletOn) {
  const { ctx, page } = await realPage({ ...h, browser: camera }, 'fr', viewport, routes(walletOn), {
    kiwiPaired: '1', kiwiPairedVenue: JSON.stringify({ merchant, venueId: merchant, name: 'Amira Cafe', type: 'restaurant' }),
    ['kiwi:fidelity:v1:' + merchant]: JSON.stringify(program), 'kiwiSkin2027:till': '1', kiwiCardScanFacing: 'environment',
  });
  t.defer(() => ctx.close()); t.watch(page);
  t.step('open a paired 2027 restaurant till and count the opening float');
  await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  /* As the shipped loyalty suite waits: the opening screen shown, the demo pad gone, its fade finished. */
  await page.waitForFunction(() => {
    const screen = document.querySelector('#clockin-screen'), pin = document.querySelector('#pin-screen');
    return screen && screen.classList.contains('is-visible') && (!pin || getComputedStyle(pin).display === 'none')
      && screen.getAnimations().every((a) => a.playState === 'finished');
  }, { timeout: 20000 });
  await page.click('#clockin-btn');
  /* The float sheet is in the kit's shadow roots: wait until its pad paints. */
  await page.waitForFunction(() => {
    const all = []; const walk = (r) => r.querySelectorAll('*').forEach((x) => { all.push(x); if (x.shadowRoot) walk(x.shadowRoot); });
    walk(document);
    return all.some((x) => x.children.length === 0 && /^\s*Fond de caisse\s*$/.test(x.textContent) && x.getBoundingClientRect().width > 0);
  }, { timeout: 20000 });
  await sleep(600);
  /* The kit's float pad: 3, 0, 0, then « Ouvrir la caisse » (positions per viewport). */
  const keys = viewport === 'tablet' ? [[800, 237], [700, 477], [700, 477], [700, 556]] : [[315, 458], [195, 698], [195, 698], [195, 778]];
  for (const [x, y] of keys) { await page.mouse.click(x, y); await sleep(250); }
  await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.kiwi-greet.is-visible'), { timeout: 20000 });
  return { page };
}

/* A button anywhere, shadow roots included, by its text. */
async function tapText(page, re) {
  const at = await page.evaluate((src) => {
    const rx = new RegExp(src, 'i'), all = [];
    const walk = (r) => r.querySelectorAll('*').forEach((x) => { all.push(x); if (x.shadowRoot) walk(x.shadowRoot); });
    walk(document);
    const e = all.filter((x) => x.matches('button,[role=button]')).find((b) => b.getBoundingClientRect().width > 0 && rx.test(b.textContent));
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, re);
  assert.ok(at, 'a button reads ' + re);
  await page.mouse.click(at.x, at.y);
  await sleep(900);
}

async function noteWithCafe(page, viewport) {
  await tapText(page, '^\\s*À emporter');
  await tapText(page, 'Café');
  /* Phone: the note sits behind its bar. */
  if (viewport === 'phone') { await page.mouse.click(195, 734); await sleep(1200); }
  await page.waitForFunction(() => { const b = document.querySelector('k-bill'); const e = b && b.shadowRoot && b.shadowRoot.querySelector('[data-client]'); return e && e.getBoundingClientRect().width > 0; }, { timeout: 20000 });
}

try {
  const openByCamera = (viewport) => async (t) => {
    const { page } = await openTill(t, viewport, true);
    await noteWithCafe(page, viewport);
    t.step('no customer yet: the note offers to scan a card');
    await page.waitForFunction(() => { const b = document.querySelector('k-bill'); return b && b.shadowRoot.querySelector('[data-client-act="scan"]'); }, { timeout: 15000 });
    assert.equal(await bill(page, "return R.querySelector('[data-client-act]').getAttribute('aria-label');"), 'Scanner une carte');
    t.step('the scanner opens with the store sign-up code beside the camera, and the camera reads the card');
    await tapBill(page, '[data-client-act]');
    await page.waitForFunction(() => window.KiwiCaisseSaleClient.current() === 'c2', { timeout: 15000 });
    assert.equal(await page.evaluate(() => !!document.querySelector('.kw-cs')), false, 'the scanner closes on a read');
    t.step('the note shows the customer, the count whole, and now hands out their Wallet card');
    await page.waitForFunction(() => { const b = document.querySelector('k-bill'); return b && b.shadowRoot.querySelector('[data-client-act="card"]'); }, { timeout: 15000 });
    assert.equal(await bill(page, "const e = R.querySelector('.cp'); return e && e.textContent;"), '340 pts');
    await tapBill(page, '[data-client-act]');
    await page.waitForFunction(() => { const q = document.querySelector('.kw-wt-qr'); return q && !q.hidden && q.querySelector('svg'); }, { timeout: 15000 });
  };
  await h.S.run('card scan by camera · fr · tablet', async (t) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=tablet
    await openByCamera('tablet')(t);
  });
  await h.S.run('card scan by camera · fr · phone', async (t) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=phone
    await openByCamera('phone')(t);
  });
  await h.S.run('card scan sign-up side · fr · tablet', async (t) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=tablet
    const { page } = await openTill(t, 'tablet', true);
    await noteWithCafe(page, 'tablet');
    await page.waitForFunction(() => { const b = document.querySelector('k-bill'); return b && b.shadowRoot.querySelector('[data-client-act="scan"]'); }, { timeout: 15000 });
    t.step('the scanner shows the store sign-up QR before any read');
    /* A camera that never answers keeps the screen up without a read. */
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(() => {}); try { delete window.BarcodeDetector; } catch (_) {} });
    await tapBill(page, '[data-client-act]');
    await page.waitForFunction(() => { const q = document.querySelector('.kw-cs-qr'); return q && !q.hidden && q.querySelector('svg'); }, { timeout: 15000 });
    await page.evaluate(() => window.KiwiCardScan.close());
    assert.equal(await page.evaluate(() => !!document.querySelector('.kw-cs')), false);
  });
  await h.S.run('card off: no card button · fr · tablet', async (t) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=tablet
    const { page } = await openTill(t, 'tablet', false);
    await noteWithCafe(page, 'tablet');
    t.step('a store without the card keeps the plain « Client & fidélité » row');
    await sleep(1500);
    assert.equal(await act(page), '');
  });
} finally { await camera.close().catch(() => {}); fs.rmSync(tmp, { recursive: true, force: true }); await h.close(); await h.S.finish(); }
