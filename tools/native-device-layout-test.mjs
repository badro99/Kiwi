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
const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') + '\n' + read('app/src/native-runtime.css');
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
    const pinLayout = await page.evaluate((html) => {
      document.getElementById('clockin-screen').remove();
      const pin = new DOMParser().parseFromString(html, 'text/html').getElementById('pin-screen');
      pin.style.animation = 'none'; document.body.append(document.importNode(pin, true));
      const screen = document.getElementById('pin-screen');
      const top = screen.querySelector('.pin-card').getBoundingClientRect().top;
      const exit = screen.querySelector('.pin-switch'); exit.scrollIntoView({ block: 'end' });
      const rect = exit.getBoundingClientRect();
      return { top, horizontal: screen.scrollWidth > screen.clientWidth + 1, reachable: rect.top >= 0 && rect.bottom <= innerHeight };
    }, source);
    assert.ok(pinLayout.top >= 24 && !pinLayout.horizontal && pinLayout.reachable, `${name}: PIN card and account-switch link must remain reachable: ${JSON.stringify(pinLayout)}`); checks++;
  }
  await page.setViewport({ width: 390, height: 844, isMobile: false, hasTouch: true });
  await page.evaluate(() => {
    document.getElementById('pin-screen').remove();
    document.body.innerHTML = '<div class="menu-grid"><div class="menu-item"><button class="menu-item-add">Ajouter</button><button class="qty-btn">+</button></div></div>';
  });
  const targets = await page.evaluate(() => Array.from(document.querySelectorAll('button'), button => ({ height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width })));
  assert.ok(targets.every(target => target.height >= 44 && target.width >= 44), 'native product and quantity controls must measure at least 44px'); checks++;
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.activeElement).outlineWidth) >= 3), 'keyboard navigation must have a visible focus indicator'); checks++;
  console.log(`native-device-layout-test: ${checks} controls passed; screenshots: ${shots}`);
} finally { await browser.close(); }
