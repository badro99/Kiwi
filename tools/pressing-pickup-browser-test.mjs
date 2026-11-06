#!/usr/bin/env node
// Pressing pickup, demo store:
//  - a camera granted but whose video refuses to play is released (no track left live);
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
    // coverage: surface=caisse-pressing locale=fr viewport=tablet
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
} finally {
  await h.close();
  await h.S.finish();
}
