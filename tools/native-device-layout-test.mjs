#!/usr/bin/env node
// Real shipped overlay markup and CSS, isolated from merchant APIs and scripts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const require = createRequire(new URL('app/package.json', root));
const puppeteer = require('puppeteer-core');
const binary = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!binary) throw new Error('Chromium required for native device layout verification');
const browser = await puppeteer.launch({ executablePath: binary, headless: true, args: ['--no-sandbox'] });
const source = read('kiwi-caisse.html');
const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') + '\n' + read('assets/caisse-skin.css') + '\n' + read('app/src/native-runtime.css');
let checks = 0;
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-native-devices-'));
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => request.abort());
  for (const [name, width, height] of [['small-phone',320,568],['phone-landscape',844,390],['ipad-split',507,768],['ipad-portrait',820,1180],['ipad-landscape',1180,820]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: true });
    await page.setContent('<!doctype html><html class="kiwi-native kiwi-native-ios"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + styles + '</style></head><body class="kiwi-native-till"></body></html>');
    await page.evaluate((html) => {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const overlay = parsed.getElementById('clockin-screen');
      overlay.classList.add('is-visible'); overlay.setAttribute('aria-hidden', 'false'); overlay.style.animation = 'none';
      document.body.append(document.importNode(overlay, true));
      document.documentElement.style.setProperty('--kiwi-host-safe-top', '24px');
      document.documentElement.style.setProperty('--kiwi-host-safe-bottom', '20px');
    }, source);
    const result = await page.evaluate(() => {
      const overlay = document.getElementById('clockin-screen');
      const top = overlay.querySelector('.clockin-top').getBoundingClientRect().top;
      const button = overlay.querySelector('.clockin-btn');
      button.scrollIntoView({ block: 'end' });
      const rect = button.getBoundingClientRect();
      return { top, horizontal: overlay.scrollWidth > overlay.clientWidth + 1, reachable: rect.top >= 0 && rect.bottom <= innerHeight, height: rect.height };
    });
    assert.ok(result.top >= 24 && !result.horizontal && result.reachable && result.height >= 44, `${name}: opening shift must remain visible, scrollable, and tappable: ${JSON.stringify(result)}`);
    checks++;
    console.log('  ✓ opening shift remains reachable: ' + name);
    await page.screenshot({ path: path.join(shots, name + '.png') });
    await page.evaluate(() => { document.documentElement.style.setProperty('--type-scale', '1.35'); });
    const accessible = await page.evaluate(() => {
      const screen = document.getElementById('clockin-screen');
      const button = screen.querySelector('.clockin-btn'); button.scrollIntoView({ block: 'end' });
      const rect = button.getBoundingClientRect();
      return { horizontal: screen.scrollWidth > screen.clientWidth + 1, reachable: rect.top >= 0 && rect.bottom <= innerHeight + 1, height: rect.height };
    });
    assert.ok(!accessible.horizontal && accessible.reachable && accessible.height >= 44, `${name}: AX5 opening shift stays reachable: ${JSON.stringify(accessible)}`); checks++;
    const pinLayout = await page.evaluate((html) => {
      document.getElementById('clockin-screen').remove();
      const pin = new DOMParser().parseFromString(html, 'text/html').getElementById('pin-screen');
      pin.style.animation = 'none'; document.body.append(document.importNode(pin, true));
      const screen = document.getElementById('pin-screen');
      const top = screen.querySelector('.pin-card').getBoundingClientRect().top;
      const exit = screen.querySelector('.pin-switch'); exit.scrollIntoView({ block: 'end', behavior: 'instant' });
      const rect = exit.getBoundingClientRect();
      return { top, horizontal: screen.scrollWidth > screen.clientWidth + 1, reachable: rect.top >= 0 && rect.bottom <= innerHeight + 1, rect: { top: rect.top, bottom: rect.bottom }, viewport: innerHeight };
    }, source);
    assert.ok(pinLayout.top >= 24 && !pinLayout.horizontal && pinLayout.reachable, `${name}: PIN card and account-switch link must remain reachable: ${JSON.stringify(pinLayout)}`); checks++;
  }
  await page.setViewport({ width: 390, height: 844, isMobile: false, hasTouch: true });
  await page.evaluate(() => {
    document.getElementById('pin-screen').remove();
    /* kiwi-caisse.html styles the row by id; without it this check passed while the real till wrapped. */
    const pageRule = document.createElement('style'); pageRule.textContent = '#cat-pills{display:flex;flex-wrap:wrap;overflow:visible}'; document.head.appendChild(pageRule);
    document.body.innerHTML = '<div class="cat-pills" id="cat-pills" style="width:300px">' + Array.from({length:8}, (_,i) => '<button class="cat-pill">Category '+i+'</button>').join('') + '</div><div class="menu-grid" style="width:370px;height:490px">' + Array.from({length:8}, (_,i) => '<div class="menu-item" role="button" tabindex="0"><span class="menu-item-name">Product '+i+'</span><span class="menu-item-foot"><span class="menu-item-price">45 MAD</span></span></div>').join('') + '</div><aside class="rightpanel"><button class="rp-peek"><span>1 article</span><span>45 MAD</span></button><div class="rp-below-peek" style="height:320px">Takeaway · 1 item</div></aside>';
    document.documentElement.style.setProperty('--kiwi-host-tab-height', '100px');
  });
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.menu-item')].map(node => node.getBoundingClientRect());
    const pills = document.querySelector('.cat-pills'), peek = document.querySelector('.rp-peek').getBoundingClientRect();
    const under = document.elementFromPoint(195, 844 - 50);
    return { cards:cards.map(({top,bottom,height,width}) => ({top,bottom,height,width})), chipHeight:pills.getBoundingClientRect().height, chipScroll:pills.scrollWidth > pills.clientWidth, peekBottom:peek.bottom, sheetUnderCapsule: !!(under && under.closest('.rightpanel')) };
  });
  assert.ok(layout.cards.length === 8 && layout.cards.every(card => card.height >= 44 && card.width >= 44 && card.bottom <= layout.cards[0].top + 490), 'eight entire product cards remain tappable in the phone viewport'); checks++;
  assert.ok(layout.chipScroll && layout.chipHeight <= 48, 'category chips remain in one horizontally scrolling row'); checks++;
  assert.ok(layout.peekBottom <= 844 - 100, 'collapsed bill stays above the published native capsule inset'); checks++;
  assert.ok(!layout.sheetUnderCapsule, 'nothing of the collapsed bill paints or catches taps under the native capsule'); checks++;
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 3), 'keyboard navigation must have a visible focus indicator'); checks++;
  await page.setViewport({ width: 1032, height: 1376, isMobile: false, hasTouch: true });
  await page.setContent('<!doctype html><html class="kiwi-native"><head><style>' + styles + '</style></head><body class="kiwi-native-till kiwi-native-cart-empty"><div class="shell"><aside class="sidebar"></aside><main class="main"><div class="menu-grid">' + Array.from({length:8}, (_,i) => '<div class="menu-item">Product '+i+'</div>').join('') + '</div></main><aside class="rightpanel"></aside></div></body></html>');
  const ipad = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.menu-item')].map(node => node.getBoundingClientRect());
    return { bill: getComputedStyle(document.querySelector('.rightpanel')).display, firstRow: cards.filter(rect => Math.abs(rect.top - cards[0].top) < 1).length };
  });
  assert.ok(ipad.bill === 'none' && ipad.firstRow >= 4, `empty iPad bill yields room for at least four product columns: ${JSON.stringify(ipad)}`); checks++;
  console.log(`native-device-layout-test: ${checks} controls passed; screenshots: ${shots}`);
} finally { await browser.close(); }
