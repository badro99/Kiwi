#!/usr/bin/env node
// #0147: painted native-runtime logo compositing guard, not simulator proof.
// Script-free gate markup contains no PINs, pairing codes or merchant data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { decodeScreenshot } from './painted-png.mjs';
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const image = fs.readFileSync(path.join(root, 'app/ios/App/App/Assets.xcassets/KiwiBrandIcon.imageset/kiwi-brand@2x.png')).toString('base64');
const inline = [...read('kiwi-caisse.html').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const css = (inline + '\n' + read('app/src/native-runtime.css')).replaceAll('url(native-brand.png)', 'url(data:image/png;base64,' + image + ')');
const runtime = read('app/src/native-runtime.js');
const alphaStart = runtime.indexOf('  function initNativeBrandAlpha()');
const alphaEnd = runtime.indexOf('\n  if (document.readyState', alphaStart);
assert.ok(alphaStart >= 0 && alphaEnd > alphaStart, 'actual native alpha renderer exists');
const installAlpha = runtime.slice(alphaStart, alphaEnd) + '\ninitNativeBrandAlpha();';
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-native-logo-'));
let checks = 0;
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true); page.on('request', r => r.url().startsWith('data:') ? r.continue() : r.abort());
  for (const [device, width, height] of [['se', 375, 667], ['17pro', 402, 874]]) {
    await page.setViewport({ width, height });
    for (const [gate, selector, markup] of [
      ['owner', '.kiwi-lock-brand', '<section class="kiwi-lock"><div class="kiwi-lock-brand"></div></section>'],
      ['pin', '.pin-brand', '<section id="pin-screen" class="pin-screen"><div class="pin-card"><div class="pin-brand"></div><div class="pin-foot">Public demo legend</div></div></section>'],
      ['pair', '#pair .kw', '<section id="pair"><div class="kw"></div></section>'],
    ]) {
      await page.setContent('<!doctype html><html class="kiwi-native"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body class="kiwi-native-owner" style="background:#0A1612">' + markup + '</body></html>');
      await page.addScriptTag({ content: installAlpha });
      await page.evaluate(async () => {
        const entering = document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime));
        await Promise.all(entering.map(a => a.finished.catch(() => {})));
      });
      const logo = await page.$(selector); assert.ok(logo, gate + ': real native logo target');
      const bytes = await logo.screenshot({ path: path.join(out, device + '-' + gate + '.png') });
      const rect = await logo.boundingBox();
      const canvas = decodeScreenshot(await page.screenshot({ type: 'png' }));
      const png = decodeScreenshot(bytes), corners = [];
      for (const [x,y] of [[2,2],[png.width-3,2],[2,png.height-3],[png.width-3,png.height-3]]) {
        const i=(y*png.width+x)*png.channels; corners.push([...png.pixels.subarray(i,i+3)]);
      }
      const outside = [[rect.x-2,rect.y+2],[rect.x+rect.width+1,rect.y+2],
        [rect.x-2,rect.y+rect.height-3],[rect.x+rect.width+1,rect.y+rect.height-3]]
        .map(([x,y]) => { const i=(Math.max(0,Math.min(canvas.height-1,Math.round(y)))*canvas.width+Math.max(0,Math.min(canvas.width-1,Math.round(x))))*canvas.channels; return [...canvas.pixels.subarray(i,i+3)]; });
      assert.ok(corners.every((c,j) => c.every((v,i) => Math.abs(v-outside[j][i]) <= 5)), device + ' ' + gate + ': raster corners blend into the actual neighbouring backdrop ' + JSON.stringify({ corners, outside })); checks++;
      if (gate === 'pin') { assert.equal(await page.$eval('.pin-foot', e => getComputedStyle(e).display), 'none', 'native local gate omits the public code legend'); checks++; }
    }
  }
  const swift = read('app/ios/App/App/KiwiNativeShell.swift');
  assert.ok(swift.includes('CIVector(x: 0, y: 6.375, z: 0, w: 0)') && swift.includes('CIVector(x: -0.8, y: -0.8, z: -0.8, w: 0)'), 'Swift setup mask uses the same backdrop coverage key'); checks++;
  assert.ok(swift.includes('CIFilter(name: "CIBlendWithMask")') && swift.includes('blend.setValue(input, forKey: kCIInputImageKey)') && swift.includes('blend.setValue(clamp.outputImage, forKey: kCIInputMaskImageKey)'), 'premultiplied mask compositing keeps approved RGB intact'); checks++;
  console.log(`✓ Native logo compositing · ${checks} checks; screenshots: ${out}`);
} finally { await browser.close(); }
