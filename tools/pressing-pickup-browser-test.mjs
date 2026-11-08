#!/usr/bin/env node
// Pressing pickup, demo store:
//  - a camera granted but whose video refuses to play is released (no track left live);
//  - a phone without BarcodeDetector reads our Code 39 tags with the software reader;
//  - typing in the pickup search keeps the same input element (caret, Arabic
//    composition) while the result list narrows, and the field opens a text keyboard.
// Synthetic demo data only; nothing is printed, paid or handed over.
import assert from 'node:assert/strict';
import { harness, openTill, sleep } from './surface-matrix-lib.mjs';

const h = await harness('pressing-pickup');
const wait = { visible: true, timeout: 8000 };

async function click(page, selector) {
  await page.waitForSelector(selector, wait);
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center' }));
  await page.click(selector);
}
async function view(page, name) {
  const selector = `[data-px-view="${name}"]`;
  await page.waitForSelector(selector, { timeout: 8000 });
  await page.$eval(selector, (el) => el.click());
  await page.waitForSelector(`[data-px-panel="${name}"].is-on`, wait);
}

try {
  await h.S.run('pickup search and camera · fr · tablet', async (t) => {
    const { page } = await openTill(h, t, 'caisse-pressing', 'fr', 'tablet');
    t.watch(page);

    t.step('typing narrows the results without replacing the field');
    await view(page, 'retrait');
    await page.waitForSelector('#px-rt-q', wait);
    assert.equal(await page.$eval('#px-rt-q', (el) => el.inputMode), 'search', 'names are searchable: a text keyboard, not a phone pad');
    const before = await page.$$eval('.px-rt-card', (els) => els.length);
    await page.$eval('#px-rt-q', (el) => { window.__rtField = el; });
    await click(page, '#px-rt-q');
    await page.type('#px-rt-q', '1037');
    await page.waitForFunction(() => document.querySelectorAll('.px-rt-card').length === 1, { timeout: 8000 });
    assert.ok(before > 1, 'the queue starts with several ready orders');
    assert.ok(await page.evaluate(() => document.querySelector('#px-rt-q') === window.__rtField), 'the same input element survives typing');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'px-rt-q', 'focus stays in the field');
    assert.equal(await page.$eval('#px-rt-q', (el) => el.value), '1037');

    t.step('a camera whose video refuses to play is released');
    await page.evaluate(() => {
      window.__tracks = [];
      navigator.mediaDevices.getUserMedia = async () => {
        const track = { stopped: false, stop() { this.stopped = true; } };
        window.__tracks.push(track);
        return { getTracks: () => [track] };
      };
      window.BarcodeDetector = class { static async getSupportedFormats() { return ['code_128']; } async detect() { return []; } };
      HTMLMediaElement.prototype.play = () => Promise.reject(new Error('NotAllowedError'));
      Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, set() {}, get() { return null; } });
    });
    await click(page, '#px-rt-scan');
    await click(page, '#px-scan-camera');
    await page.waitForFunction(() => window.__tracks.length === 1, { timeout: 8000 });
    await sleep(300);
    assert.equal(await page.evaluate(() => window.__tracks[0].stopped), true, 'the camera track is stopped after play() fails');
  });

  await h.S.run('camera scan without a native barcode reader · fr · phone', async (t) => {
    const { page } = await openTill(h, t, 'caisse-pressing', 'fr', 'phone');
    t.watch(page);

    t.step('a phone with no BarcodeDetector reads a Code 39 tag through the software reader');
    await view(page, 'retrait');
    await page.waitForSelector('#px-rt-q', wait);
    await page.evaluate(() => {
      delete window.BarcodeDetector;
      // The "camera" films a Code 39 tag for order 1037, drawn like the till draws its tags.
      const P = { '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '3': 'wnwwnnnnn', '7': 'nnnwnnwnw', '*': 'nwnnwnwnn' };
      const c = document.createElement('canvas'); c.width = 640; c.height = 360;
      const g = c.getContext('2d');
      const paint = () => {
        g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, 640, 360);
        g.fillStyle = '#111'; let x = 120;
        for (const ch of '*1037*') {
          P[ch].split('').forEach((w, i) => { const len = (w === 'w' ? 3 : 1) * 3; if (i % 2 === 0) g.fillRect(x, 90, len, 180); x += len; });
          x += 3;
        }
        requestAnimationFrame(paint);
      };
      paint();
      const stream = c.captureStream(15);
      window.__camStopped = false;
      stream.getTracks().forEach((tr) => { const stop = tr.stop.bind(tr); tr.stop = () => { window.__camStopped = true; stop(); }; });
      navigator.mediaDevices.getUserMedia = async () => stream;
    });
    await click(page, '#px-rt-scan');
    await click(page, '#px-scan-camera');
    await page.waitForFunction(() => document.querySelector('#px-rt-q') && document.querySelector('#px-rt-q').value === '1037', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('.px-rt-card').length === 1, { timeout: 8000 });
    assert.equal(await page.evaluate(() => window.__camStopped), true, 'the camera is released once the tag is read');
  });

  /* r21 pressing#A1 · the camera permission is refused mid-pickup: the same
     ticket is still reachable by typing its garment tag, and handed over. */
  await h.S.run('camera permission refused, manual garment tag, hand-over · fr · phone', async (t) => {
    const { page } = await openTill(h, t, 'caisse-pressing', 'fr', 'phone');
    t.watch(page);
    await view(page, 'retrait');
    await page.waitForSelector('#px-rt-q', wait);
    const target = await page.$$eval('.px-rt-card', (cards) => {
      const card = cards.find((c) => { const b = c.querySelector('[data-px-rt-give]'); return b && !b.disabled; });
      return card ? { no: card.querySelector('.px-rt-who b').textContent.split(' · ')[0].trim(), give: card.querySelector('[data-px-rt-give]').dataset.pxRtGive } : null;
    });
    assert.ok(target && /^\d{4}/.test(target.no), 'the demo queue holds a paid, ready ticket');

    t.step('the browser refuses the camera: a clear message, the manual field stays open');
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => { const e = new Error('Permission denied'); e.name = 'NotAllowedError'; throw e; };
    });
    await click(page, '#px-rt-scan');
    await click(page, '#px-scan-camera');
    await page.waitForFunction(() => /Caméra non ouverte/.test(document.body.innerText), { timeout: 8000 });
    assert.ok(await page.$eval('#px-scan-input', (el) => el.offsetParent !== null), 'the manual code field is still on screen after the refusal');

    t.step('typing the garment tag finds the same ticket');
    await page.type('#px-scan-input', target.no + '-1');
    await page.keyboard.press('Enter');
    await page.waitForFunction((no) => document.querySelector('#px-rt-q') && document.querySelector('#px-rt-q').value === no, { timeout: 8000 }, target.no);
    await page.waitForFunction(() => document.querySelectorAll('.px-rt-card').length === 1, { timeout: 8000 });
    assert.equal(await page.$eval('[data-px-rt-give]', (el) => el.dataset.pxRtGive), target.give, 'the garment tag resolves to the ticket that was ready');

    t.step('the hand-over works from that ticket');
    await click(page, '[data-px-rt-give]');
    await page.waitForFunction((no) => new RegExp(no + ' remis à').test(document.body.innerText), { timeout: 8000 }, target.no);
  });
} finally {
  await h.close();
  await h.S.finish();
}
