#!/usr/bin/env node
// #0156 / #0160: render the real boutique sheets with the real caisse palette.
// Browser regression only, not native touch proof or production merchant proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { decodeScreenshot, paintedActionColours } from './painted-png.mjs';
import { releaseExitedBrowserStreams } from './browser-test-lifecycle.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required');
const fixture = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-dark-sheets-'));
let browser, checks = 0, expectsDark = true, originalCases = 0, variantSplitCases = 0;
const focusReadings = [];
const failures = [];
function check(value, label) {
  checks++;
  if (!value) { failures.push(label); console.error('✗ ' + label); }
}
function rgb(css) {
  const parts = css.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)?.map(Number);
  assert.ok(parts?.length >= 3, 'Expected computed RGB: ' + css);
  // Chromium preserves color-mix() as color(srgb ...), whose channels are
  // normalized to 0..1. rgb()/rgba() channels are already in 0..255.
  const scale = /^color\(srgb\s/.test(css) ? 255 : 1;
  return [...parts.slice(0, 3).map(channel => channel * scale), parts[3] ?? 1];
}
assert.deepEqual(rgb('rgb(10, 15, 13)'), [10, 15, 13, 1]);
assert.deepEqual(rgb('rgba(10, 15, 13, 0.6)'), [10, 15, 13, .6]);
assert.deepEqual(rgb('color(srgb 1 0.5 0 / 0.6)'), [255, 127.5, 0, .6]);
function over(a, b) { return a.slice(0, 3).map((c, i) => c * a[3] + b[i] * (1 - a[3])); }
function luminance(a) {
  const f = a.slice(0, 3).map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return .2126 * f[0] + .7152 * f[1] + .0722 * f[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
async function inspect(page, selector, label, { action = false, painted = false, control = false, darkSurface = expectsDark, frameSample = false } = {}) {
  await page.waitForSelector(selector, { visible: true });
  // Sample the settled surface, not an intermediate opacity in a 300 ms card
  // entrance. Do not disable animations or change the application stylesheet.
  await page.waitForFunction(selector => {
    for (let el = document.querySelector(selector); el; el = el.parentElement) {
      if (el.getAnimations().some(a => a.playState === 'running' && Number.isFinite(a.effect.getTiming().iterations))) return false;
    }
    return true;
  }, {}, selector);
  const paint = await page.$eval(selector, (el) => {
    const css = getComputedStyle(el), layers = [];
    for (let p = el; p; p = p.parentElement) layers.push(getComputedStyle(p).backgroundColor);
    return { foreground: css.color, layers, border: css.borderTopColor, borderWidth: parseFloat(css.borderTopWidth),
      gradient: css.backgroundImage, visible: el.getClientRects().length > 0, opacity: css.opacity,
      forest: css.getPropertyValue('--forest'), actionFill: css.getPropertyValue('--caisse-action-fill') };
  });
  let bg = [247, 245, 240];
  for (const color of paint.layers.reverse()) bg = over(rgb(color), bg);
  const foreground = over(rgb(paint.foreground), bg);
  const ratio = contrast(foreground, bg);
  // A primary action is deliberately a bright brand plate, so test its actual
  // ink/fill instead of requiring the action itself to have a dark background.
  if (!action) check(paint.visible && (darkSurface ? luminance(bg) < .12 : luminance(bg) > .7),
    label + ': ' + (darkSurface ? 'dark' : 'warm light') + ' surface, got ' + JSON.stringify(bg));
  check(ratio >= 4.5, label + ': text contrast ' + ratio.toFixed(2) + ':1 (' + paint.foreground + ')' +
    (ratio < 4.5 ? ' styles=' + JSON.stringify(paint) : ''));
  if (action || painted) {
    const element = await page.$(selector);
    // Element screenshots can scroll a fixed popover and move its anchor
    // between the style read and capture. Sample that action from the original
    // full frame, without asking the renderer to scroll or crop the element.
    const shotPath = path.join(shots, label.replace(/[^a-z0-9-]+/gi, '-') + '.png');
    const cssBounds = frameSample ? await element.boundingBox() : null;
    const scale = page.viewport()?.deviceScaleFactor || 1;
    const bounds = cssBounds ? Object.fromEntries(Object.entries(cssBounds).map(([key, value]) => [key, value * scale])) : null;
    const bytes = frameSample ? await page.screenshot({ type: 'png', path: shotPath, captureBeyondViewport: false })
      : await element.screenshot({ type: 'png', path: shotPath });
    const colours = paintedActionColours(bytes, foreground, bounds);
    const paintedRatio = contrast(colours.foreground, colours.background);
    check(paintedRatio >= 4.5, label + ': PAINTED text contrast ' + paintedRatio.toFixed(2) + ':1 ' + JSON.stringify(colours));
    if (action) {
      let parent = [247, 245, 240];
      for (const color of paint.layers.slice(0, -1)) parent = over(rgb(color), parent);
      check(contrast(colours.background, parent) >= 3, label + ': action boundary must clear 3:1');
    }
  }
  if (control) {
    const edge = paint.borderWidth ? over(rgb(paint.border), bg) : bg;
    check(contrast(edge, bg) >= 3, label + ': control edge contrast ' + contrast(edge, bg).toFixed(2) + ':1');
    const placeholder = await page.$eval(selector, el => {
      if (!el.matches('input,textarea') || !el.placeholder) return null;
      const style = getComputedStyle(el, '::placeholder');
      return { foreground: style.color, opacity: Number(style.opacity) };
    });
    if (placeholder) {
      const colour = rgb(placeholder.foreground); colour[3] *= placeholder.opacity;
      const placeholderRatio = contrast(over(colour, bg), bg);
      check(placeholderRatio >= 4.5, label + ': placeholder contrast ' + placeholderRatio.toFixed(2) + ':1');
    }
  }
  if (!action) {
    const runs = await page.$eval(selector, root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), out = [];
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const el = node.parentElement;
        if (el.closest('svg,script,style,:disabled,[aria-hidden="true"]') || !el.getClientRects().length) continue;
        const css = getComputedStyle(el), layers = [];
        if (css.visibility !== 'visible') continue;
        for (let p = el; p; p = p.parentElement) layers.push(getComputedStyle(p).backgroundColor);
        out.push({ text: node.textContent.trim().slice(0, 50), foreground: css.color, layers,
          large: parseFloat(css.fontSize) >= (parseInt(css.fontWeight) >= 700 ? 18.66 : 24) });
      }
      return out;
    });
    for (const run of runs) {
      let surface = [247, 245, 240];
      for (const color of run.layers.reverse()) surface = over(rgb(color), surface);
      const ratio = contrast(over(rgb(run.foreground), surface), surface);
      check(ratio >= (run.large ? 3 : 4.5), label + ': label "' + run.text + '" contrast ' + ratio.toFixed(2) + ':1');
    }
  }
  return { bg, ratio, paint };
}
async function inspectNativeFocus(page, selector, label, wrapper = false, allEdges = false) {
  await page.click(selector);
  await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), {}, selector);
  await page.waitForFunction(selector => {
    for(let el=document.querySelector(selector);el;el=el.parentElement)
      if(el.getAnimations().some(a=>a.playState==='running' && Number.isFinite(a.effect.getTiming().iterations)))return false;
    return true;
  },{},selector);
  const state = await page.$eval(selector, (input, wrapper) => {
    const el = wrapper ? input.parentElement : input, css = getComputedStyle(el), rect = el.getBoundingClientRect();
    return { focused: input.matches(':focus-visible'), empty: input.value === '', inner: getComputedStyle(input).outlineStyle,
      outline: css.outlineStyle, width: parseFloat(css.outlineWidth), offset: parseFloat(css.outlineOffset), radius: parseFloat(css.borderRadius),
      color: css.outlineColor, shadow: css.boxShadow, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  }, wrapper);
  check(state.focused && state.empty, label + ': actual empty editable input owns focus');
  check(!wrapper || state.inner === 'none', label + ': wrapper has no square inner input outline');
  const validRing = state.outline === 'solid' && state.width >= 3 && state.radius >= 10 && (!wrapper || state.shadow === 'none');
  check(validRing, label + ': one rounded outer ring ' + JSON.stringify(state));
  if (!validRing) return; // A missing old wrapper ring is a recorded failure, not invented pixels.
  const scale = page.viewport().deviceScaleFactor, r = Object.fromEntries(Object.entries(state.bounds).map(([k,v]) => [k,v*scale]));
  // CSS clamps pill radii (999px) to half the actual box. Use that painted
  // geometry, not the unbounded declared radius, for the new split field.
  const extent = (state.offset + state.width)*scale, radius = Math.min(state.radius*scale,r.width/2,r.height/2);
  const insideFrame = r.x-extent-3>=0 && r.y-extent-3>=0 && r.x+r.width+extent+3<page.viewport().width*scale && r.y+r.height+extent+3<page.viewport().height*scale;
  check(insideFrame, label + ': whole visible ring fits the original frame');
  if (!insideFrame) return;
  const bytes = await page.screenshot({ type:'png', path:path.join(shots,label.replace(/[^a-z0-9-]+/gi,'-')+'.png'), captureBeyondViewport:false });
  const png = decodeScreenshot(bytes), expected = rgb(state.color).slice(0,3), point = (x,y) => {
    const offset=(Math.round(y)*png.width+Math.round(x))*png.channels;
    assert.ok(png.channels===3 || png.pixels[offset+3]===255,'Original opaque ring pixels required');
    return [...png.pixels.subarray(offset,offset+3)];
  };
  let count=0;
  for(let y=Math.floor(r.y-extent);y<Math.ceil(r.y+r.height+extent);y++) for(let x=Math.floor(r.x-extent);x<Math.ceil(r.x+r.width+extent);x++) {
    if(x>=r.x && x<=r.x+r.width && y>=r.y && y<=r.y+r.height)continue;
    if(point(x,y).every((value,i)=>Math.abs(value-expected[i])<=1))count++;
  }
  check(count>=40,label+': at least 40 actual opaque ring pixels, got '+count);
  for(const edge of (allEdges ? ['left','right','top','bottom'] : ['left','right','top'])) {
    const readings=[];
    for(const fraction of [.25,.5,.75]) {
      const length=edge==='top'||edge==='bottom'?r.width:r.height, along=radius+(length-2*radius)*fraction;
      const at=outward=>edge==='left'?[r.x-outward,r.y+along]:edge==='right'?[r.x+r.width+outward,r.y+along]:edge==='bottom'?[r.x+along,r.y+r.height+outward]:[r.x+along,r.y-outward];
      let foreground;
      for(let outward=state.offset*scale+1;outward<extent;outward++) {
        const ink=point(...at(outward));
        if(ink.every((value,i)=>Math.abs(value-expected[i])<=1)){foreground=ink;break;}
      }
      if(!foreground)continue;
      // Three CSS pixels inside the field, beyond its one-CSS-pixel neutral
      // border. Sampling three physical pixels at DPR3 would hit that border.
      const background=point(...at(extent+2)), inner=point(...at(-3*scale));
      readings.push({foreground,background,inner,outerRatio:contrast(foreground,background),innerRatio:contrast(foreground,inner)});
    }
    const worst=readings.reduce((a,b)=>!a || b.outerRatio<a.outerRatio?b:a,null);
    check(readings.length===3,label+': '+edge+' full-coverage ring samples present');
    check(worst && worst.outerRatio>=3 && readings.every(r=>r.innerRatio>=3),label+': PAINTED '+edge+' ring >=3 against immediate outside and inside '+JSON.stringify(worst));
    focusReadings.push({label,edge,frame:{width:png.width,height:png.height},scale,count,...worst});
  }
}
async function inspectManualRecord(page,label) {
  await page.mouse.move(2,2);
  await inspect(page,'#kcb-rec',label,{action:true,frameSample:true});
  const glyph=await page.$eval('#kcb-rec',el=>{
    const rect=el.getBoundingClientRect(),walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),bounds=[];
    let node;
    while((node=walker.nextNode())) {
      if(!node.textContent.trim() || node.parentElement.closest('svg,[aria-hidden="true"]'))continue;
      const range=document.createRange();range.selectNodeContents(node);
      bounds.push(...[...range.getClientRects()].map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})));
    }
    return {color:getComputedStyle(el).color,button:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},bounds};
  });
  const view=page.viewport(),inside=glyph.bounds.length>0 && [glyph.button,...glyph.bounds].every(r=>r.x>=0 && r.y>=0 && r.x+r.width<=view.width && r.y+r.height<=view.height);
  check(inside,label+': complete visible button and text-node glyph bounds fit original viewport');
  if(!inside)return;
  const bytes=await page.screenshot({type:'png',captureBeyondViewport:false}),png=decodeScreenshot(bytes),expected=rgb(glyph.color).slice(0,3),scale=view.deviceScaleFactor;
  let pixels=0;
  for(const bounds of glyph.bounds)for(let y=Math.floor(bounds.y*scale);y<Math.ceil((bounds.y+bounds.height)*scale);y++)for(let x=Math.floor(bounds.x*scale);x<Math.ceil((bounds.x+bounds.width)*scale);x++) {
    const offset=(y*png.width+x)*png.channels;
    if((png.channels===3 || png.pixels[offset+3]===255) && [...png.pixels.subarray(offset,offset+3)].every((value,i)=>Math.abs(value-expected[i])<=1))pixels++;
  }
  check(pixels>=40,label+': actual full-coverage text glyph pixels >=40 (not SVG or one AA pixel), got '+pixels);
}
async function navigateNative(page,destination) {
  await page.click('.vx-burger');
  await page.waitForFunction(()=>document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
  const selector='button[data-bq-view="'+destination+'"]';
  await page.waitForFunction(selector=>{
    const el=document.querySelector(selector),rect=el.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    for(let p=el;p;p=p.parentElement)if(p.getAnimations().some(a=>a.playState==='running' && Number.isFinite(a.effect.getTiming().iterations)))return false;
    return rect.width>0 && rect.height>0 && rect.x>=0 && rect.y>=0 && rect.right<=innerWidth && rect.bottom<=innerHeight && (hit===el || el.contains(hit));
  },{},selector);
  await page.click(selector);
  await page.waitForFunction(()=>!document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
  await page.waitForFunction(()=>{
    const screen=document.querySelector('.vx-screen.is-on'),scrim=screen.querySelector('.vx-scrim'),style=getComputedStyle(scrim);
    return style.opacity==='0' && style.pointerEvents==='none' && [scrim,screen.querySelector('.kiwi-dna-rail')].every(el=>!el.getAnimations().some(a=>a.playState==='running' && Number.isFinite(a.effect.getTiming().iterations)));
  });
}
try {
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error('Fixture timeout: ' + errors)), 15000);
    fixture.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);
      if (match) { clearTimeout(timer); resolve(JSON.parse(match[1]).base); }
    });
    fixture.stderr.on('data', chunk => { errors += chunk; });
    fixture.once('exit', code => { clearTimeout(timer); reject(new Error('Fixture exited ' + code + ': ' + errors)); });
  });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const [name, attrs] of [
    ['light', {}],
    ['caisse', { 'data-caisse-theme': 'dark' }],
    ['legacy', { 'data-theme': 'dark' }],
    ['vexel', { 'data-vexel-mode': 'dark' }],
    ['legacy-with-light-flags', { 'data-theme': 'dark', 'data-caisse-theme': 'light', 'data-vexel-mode': 'light' }],
  ]) {
    originalCases++;
    expectsDark = Object.values(attrs).includes('dark');
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET' && request.method() !== 'HEAD') writes.push(request.url()); });
    await page.setViewport({ width: 1280, height: 860 });
    // Demo sales are seeded 24–170 minutes before Date.now(). At midnight
    // they correctly belong to Yesterday, not the default Today filter.
    // Freeze only this synthetic fixture's wall clock at local noon; leave
    // real timers, transitions, date filters and production data untouched.
    await page.evaluateOnNewDocument(() => {
      const RealDate = Date, noon = new RealDate(2026, 9, 2, 12).getTime();
      globalThis.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [noon])); }
        static now() { return noon; }
      };
      // Isolated pre-boot customer for the real manual-record renderer. No
      // original five-sale seed or existing assertion changes; never save it.
      localStorage.setItem('kiwi:clients:v1:synthetic-retail-acompte',JSON.stringify({seq:1,list:[{id:'form-paint',name:'Form paint fixture',phone:'+212600000001',points:0,visits:0,spend:0,history:[]}]}));
      localStorage.setItem('kiwi:fidelity:v1:synthetic-retail-acompte',JSON.stringify({model:'amount',amount:{perMad:1,threshold:100,reward:'Fixture reward'},visit:{target:10,reward:'Fixture visit'},product:{target:10,item:'Fixture item',reward:'Fixture item reward'}}));
    });
    await page.evaluateOnNewDocument(flags => document.addEventListener('DOMContentLoaded', () => {
      for (const [key, value] of Object.entries(flags)) document.documentElement.setAttribute(key, value);
    }), attrs);
    await page.goto(base + '/boutique.html', { waitUntil: 'load' });
    await page.addScriptTag({path:path.join(ROOT,'assets/lucide.min.js')});
    const forest = await page.$eval('html', el => getComputedStyle(el).getPropertyValue('--forest').trim());
    check(forest === (expectsDark ? '#17B98A' : '#0B6E4F'),
      name + ': the fixture loads the actual inline caisse palette, not missing/default tokens');
    await inspect(page, '.kiwi-dna-nav-label', name + ' invariant Ink rail label', { darkSurface: true });
    await page.waitForSelector('#bq-tk-client', { visible: true });
    await page.click('#bq-tk-client');
    await inspect(page, '#bq-clientm', name + ' client search');
    await inspect(page, '#bq-clientm .modal-subtle', name + ' search help');
    await page.type('#bq-cl-q', "Personne d'atelier");
    await inspect(page, '#bq-clientm .bq-empty', name + ' client empty');
    await page.click('#bq-cl-new');
    await inspect(page, '#bq-cl-name', name + ' client name field', { control: true });
    await inspect(page, '#bq-cl-create', name + ' client create action', { action: true });
    await page.click('#bq-cl-name', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.click('#bq-cl-create');
    await inspect(page, '#toast-stack .toast', name + ' missing name notification');
    await inspect(page, '#toast-stack .toast-title', name + ' notification label');
    await page.click('#bq-clientm [data-bq-close]');
    await page.click('#bq-tk-reset');
    await page.click('[data-bq-item="prod_2"]');
    await inspect(page, '#bq-sheetm', name + ' product sheet');
    await inspect(page, '#bq-sheet-add', name + ' product action', { action: true });
    await page.click('[data-bq-rem="5"]');
    await inspect(page, '#bq-approvem', name + ' discount approval');
    await page.click('#bq-approvem [data-bq-close]');
    await page.click('#bq-sheet-add');
    await page.click('#bq-validate');
    await page.waitForSelector('[data-bq-m="especes"]', { visible: true });
    await inspect(page, '#bq-paym', name + ' payment methods');
    await page.click('[data-bq-m="especes"]');
    await inspect(page, '#bq-paym .cash-input-label', name + ' cash label');
    await inspect(page, '#bq-cash-ok', name + ' cash action', { action: true });
    await page.click('#bq-paym [data-bq-close]');
    await page.click('#bq-validate');
    await page.waitForSelector('[data-bq-m="carte"]', { visible: true });
    await page.click('[data-bq-m="carte"]');
    await inspect(page, '#bq-paym', name + ' card sheet');
    await inspect(page, '#bq-card-ok', name + ' card action', { action: true });
    await inspect(page, '#bq-reader-status.is-success', name + ' card ready status', {painted:true,frameSample:true});
    await page.click('#bq-paym [data-bq-close]');
    await page.click('[data-bq-view="echanges"]');
    await page.waitForSelector('[data-bq-pick]', { visible: true });
    await page.click('[data-bq-pick]');
    await inspect(page, '[data-bq-do-avoir]', name + ' return action', { action: true });
    await page.click('[data-bq-view="inventaire"]');
    await inspect(page, '#bqi-count', name + ' inventory action', { action: true });
    await page.click('#bqi-intake');
    await inspect(page, '#bq-invmm', name + ' stock intake');
    await page.click('#bqx-done');
    await page.click('[data-bq-view="scan"]');
    await page.click('#bq-scan-diag');
    await inspect(page, '#bq-invmm', name + ' scan diagnostic');
    await page.click('#bq-invmm button[data-inv-x]');
    await page.click('[data-bq-view="clientes"]');
    await inspect(page, '#kcb-add', name + ' customer book create action', { action: true });
    await page.click('#kcb-add');
    await inspect(page, '#kcb-sheet .kcb-card', name + ' customer book form');
    for (const field of ['name', 'phone', 'email', 'bday', 'gender', 'city', 'address', 'notes']) {
      await inspect(page, '#kcb-f-' + field + (field === 'gender' ? ' + .kiwi-select .kiwi-select-trigger' : ''),
        name + ' customer book ' + field, { control: true });
    }
    const birthday = await page.$eval('#kcb-f-bday', el => {
      const style = getComputedStyle(el), box = el.getBoundingClientRect(), parent = el.parentElement.getBoundingClientRect();
      return { minWidth: style.minWidth, appearance: style.appearance, minHeight: style.minHeight, height: box.height,
        fits: box.left >= parent.left - 1 && box.right <= parent.right + 1 };
    });
    check(birthday.minWidth === '0px' && birthday.appearance === 'none' && birthday.fits,
      name + ': birthday field cannot use the iOS intrinsic width to overflow its column');
    check(birthday.minHeight === '48px' && birthday.height >= 48,
      name + ': an empty iOS birthday field keeps the full-height touch target');
    const dropdown = await page.$eval('#kcb-f-gender', el => {
      const trigger = el.nextElementSibling?.querySelector('.kiwi-select-trigger');
      return { hiddenNative: el.classList.contains('kiwi-select-native'),
        height: trigger?.getBoundingClientRect().height,
        iconCount: trigger?.querySelectorAll('.kiwi-select-chevron svg').length,
        labelled: trigger?.getAttribute('aria-label').startsWith(el.labels[0]?.textContent + ':'),
        duplicateIcon: getComputedStyle(el.parentElement, '::after').content !== 'none' };
    });
    check(dropdown.hiddenNative && dropdown.height >= 48,
      name + ': the ACTUAL visible Kiwi dropdown stays a full-height touch target');
    check(dropdown.iconCount === 1 && !dropdown.duplicateIcon,
      name + ': the visible dropdown has exactly one Material chevron');
    check(dropdown.labelled, name + ': the dropdown is labelled by its field, not generic Choose');
    await inspect(page, '#kcb-f-save', name + ' customer book save action', { action: true });
    await page.click('#kcb-f-save');
    const validation = await page.$eval('#toast-stack .toast:last-child', el => ({
      warning: el.classList.contains('is-warn'), role: el.getAttribute('role')
    }));
    check(validation.warning && validation.role === 'alert',
      name + ': blank customer validation is an announced warning, never a success checkmark');
    // The desktop backdrop is display:none; the phone stylesheet enables it.
    // Keep this a real pointer journey at the SE width, not value-only proof.
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
    await page.click('#kcb-f-gender + .kiwi-select .kiwi-select-trigger');
    await inspect(page, '.kiwi-select-popover', name + ' actual dropdown options');
    await inspect(page, '.kiwi-select-option[aria-selected="true"]', name + ' selected dropdown action', { action: true, frameSample: true });
    await page.click('.kiwi-select-option[data-option-index="1"]');
    check(await page.$eval('#kcb-f-gender', el => el.value) === 'Femme',
      name + ': an actual option tap updates the original form value');
    await page.click('#kcb-f-cancel');
    check(await page.$eval('#kcb-sheet', el => getComputedStyle(el).display === 'none'),
      name + ': a REAL Cancel tap must close the form after dropdown selection; an invisible backdrop cannot swallow it');
    // Additional native-style stage, AFTER every original case assertion.
    // Only the existing case's theme flags are present; caisse-only must never
    // be accidentally rescued by data-theme/data-vexel-mode dark.
    await page.setViewport({width:402,height:874,deviceScaleFactor:3,isMobile:true,hasTouch:true});
    await page.addStyleTag({path:path.join(ROOT,'assets/pos-mobile.css')});
    await page.addStyleTag({path:path.join(ROOT,'app/src/native-runtime.css')});
    await page.addScriptTag({path:path.join(ROOT,'assets/lucide.min.js')});
    await page.evaluate(attrs=>{
      document.documentElement.classList.add('kiwi-native');
      for(const key of ['data-theme','data-vexel-mode','data-caisse-theme'])document.documentElement.removeAttribute(key);
      for(const [key,value] of Object.entries(attrs))document.documentElement.setAttribute(key,value);
    },attrs);
    await page.addScriptTag({path:path.join(ROOT,'assets/pos-mobile.js')});
    const flags=await page.$eval('html',el=>Object.fromEntries(['data-theme','data-vexel-mode','data-caisse-theme'].map(key=>[key,el.getAttribute(key)])));
    check(Object.entries(attrs).every(([key,value])=>flags[key]===value) && Object.entries(flags).every(([key,value])=>key in attrs || value===null),name+': exact native theme authority, no hidden extra dark flags '+JSON.stringify(flags));
    // Switching real Chromium mobile emulation reloads the page; reopen the
    // book through its actual navigation after that boundary, not DOM edits.
    await navigateNative(page,'clientes');
    await page.waitForSelector('#kcb-add',{visible:true});
    const untouchedBook=await page.evaluate(()=>localStorage.getItem('kiwi:clients:v1:synthetic-retail-acompte'));
    for(const lang of ['fr','en','ar']) {
      await page.evaluate(lang=>window.KiwiCaisseLang.set(lang),lang);
      await page.click('#kcb-add');
      for(const field of ['name','phone','email'])await inspectNativeFocus(page,'#kcb-f-'+field,name+' '+lang+' native new-client '+field);
      await page.click('#kcb-f-cancel');
      await page.click('.kcb-row[data-id="form-paint"]');
      await inspectManualRecord(page,name+' '+lang+' native manual-record Confirm');
      await page.click('#kcb-d-close');
      await page.click('#kcb-back');
      await navigateNative(page,'echanges');
      await page.waitForSelector('#bq-ret-q',{visible:true});
      await inspectNativeFocus(page,'#bq-ret-q',name+' '+lang+' native Returns search',true);
      const expected={fr:'N° de ticket ou téléphone…',en:'Receipt number or phone…',ar:'رقم الإيصال أو الهاتف…'}[lang];
      check(await page.$eval('#bq-ret-q',el=>el.placeholder)===expected,name+' '+lang+': real Returns search placeholder');
      await navigateNative(page,'clientes');
      await page.waitForSelector('#kcb-add',{visible:true});
      // Additional six FR/EN/AR x light/caisse-dark contexts. Every original
      // five-theme/15-locale assertion above remains unconditional and intact.
      if(name==='light' || name==='caisse') {
        await navigateNative(page,'vente');
        await page.click('.vx-burger');
        await page.waitForFunction(()=>document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
        await page.click('.vx-screen.is-on [data-kcl="'+lang+'"]');
        await page.waitForFunction(lang=>document.documentElement.lang===lang,{},lang);
        await page.click('button[data-bq-view="vente"]');
        await page.waitForFunction(()=>!document.querySelector('.vx-screen.is-on').classList.contains('vx-nav-open'));
        // The real demo mount seeds TWO lines after mobile emulation reload.
        // Remove only that isolated unsold draft through ordinary controls;
        // never assume the original desktop one-line draft survived reload.
        await page.click('.vx-peek');
        await page.waitForFunction(()=>document.querySelector('.vx-screen.is-on').classList.contains('vx-ticket-open'));
        const setupLines=await page.$$eval('#bq-tk-lines [data-bq-minus]',nodes=>nodes.length);
        console.log('variant-split-fixture-draft: '+JSON.stringify({name,lang,setupLines}));
        check(setupLines<=2,name+' '+lang+': only normal demo mount lines are present');
        if(setupLines)await page.click('#bq-tk-reset');
        check(await page.$$eval('#bq-tk-lines [data-bq-minus]',nodes=>nodes.length)===0,name+' '+lang+': ordinary fixture Reset leaves the unsold cart empty');
        await page.click('.vx-peek');
        await page.waitForFunction(()=>!document.querySelector('.vx-screen.is-on').classList.contains('vx-ticket-open'));
        // prod_2's first-color variants legitimately hold only one each. Read
        // public synthetic catalog projection, then choose an actually stocked
        // default variant through the ordinary category/product buttons.
        const stocked=await page.evaluate(()=>{
          const catalog=window.KiwiBoutiqueCatalog,projection=catalog.compat();
          for(const p of Object.values(projection.P)) {
            const firstColor=p.colors[0],sizes=Object.keys(p.sizes);
            const bySize=size=>p._variants.filter(v=>String(v.size)===size && (v.colorId===firstColor || catalog.colorFamily(v)===firstColor)).reduce((n,v)=>n+v.stock,0);
            const defaultSize=sizes.find(size=>bySize(size)>0);
            if(defaultSize && bySize(defaultSize)>=2)return{id:p.id,category:p.rayon,size:defaultSize,available:bySize(defaultSize)};
          }
          return null;
        });
        assert.ok(stocked,'ordinary seeded catalog has a default variant with at least two in stock');
        check(stocked.available>=2,name+' '+lang+': quantity refresh fixture uses actual stock, not an invented availability');
        await page.click('[data-bq-cat="'+stocked.category+'"]');
        await page.click('[data-bq-item="'+stocked.id+'"]');
        const expectedVariant={fr:['accord gérante','Ajouter au ticket'],en:['manager approval','Add to the sale'],ar:['بموافقة المسؤولة','أضف إلى التذكرة']}[lang];
        await page.waitForFunction(expected=>{
          const nodes=[...document.querySelectorAll('#bq-sheetm [data-caisse-copy]')];
          return expected.every(text=>nodes.some(el=>el.textContent===text));
        },{},expectedVariant);
        check(await page.$eval('#bq-sheetm .opt [data-caisse-copy]',el=>el.textContent)===expectedVariant[0],name+' '+lang+': actual variant manager label, not leading-dot French fallback');
        check(await page.$eval('#bq-sheet-add [data-caisse-copy]',el=>el.textContent)===expectedVariant[1],name+' '+lang+': actual Add label immediately localized apart from amount');
        const catalog=await page.$eval('#bq-sheetm',el=>({name:el.querySelector('.bq-sheet-title h3').textContent,code:el.querySelector('.bq-sheet-title .sub').textContent,price:el.querySelector('#bq-sheet-total').textContent}));
        const quantity=await page.$eval('#bq-qty-val',el=>Number(el.textContent));
        await page.click('#bq-qty-plus');
        check(await page.$eval('#bq-qty-val',el=>Number(el.textContent))===quantity+1,name+' '+lang+': actual quantity plus invokes price refresh');
        await page.click('#bq-qty-minus');
        const after=await page.$eval('#bq-sheetm',el=>({name:el.querySelector('.bq-sheet-title h3').textContent,code:el.querySelector('.bq-sheet-title .sub').textContent,price:el.querySelector('#bq-sheet-total').textContent}));
        check(JSON.stringify(catalog)===JSON.stringify(after),name+' '+lang+': actual quantity round-trip preserves catalog name/code/price');
        await page.click('#bq-sheetm [data-bq-close]');
        check(await page.$$eval('#bq-tk-lines [data-bq-minus]',nodes=>nodes.length)===0,name+' '+lang+': actual variant Cancel creates no line');
        await page.click('[data-bq-item="'+stocked.id+'"]');
        await page.click('#bq-sheet-add');
        await page.click('.vx-peek');
        await page.waitForFunction(()=>document.querySelector('.vx-screen.is-on').classList.contains('vx-ticket-open'));
        check(await page.$$eval('#bq-tk-lines [data-bq-minus]',nodes=>nodes.length)===1,name+' '+lang+': exactly one ordinary unsold fixture line');
        await page.click('#bq-validate');
        await page.waitForSelector('[data-bq-share="x"]',{visible:true});
        await page.click('[data-bq-share="x"]');
        await inspectNativeFocus(page,'#bq-split-in',name+' '+lang+' native split amount',false,true);
        const splitPaint=await inspect(page,'#bq-split-in',name+' '+lang+' split input');
        const splitPlaceholder=await page.$eval('#bq-split-in',input=>{
          const css=getComputedStyle(input,'::placeholder');return{color:css.color,opacity:Number(css.opacity),text:input.placeholder};
        });
        const placeholderInk=rgb(splitPlaceholder.color);placeholderInk[3]*=splitPlaceholder.opacity;
        check(splitPlaceholder.text==='MAD' && contrast(over(placeholderInk,splitPaint.bg),splitPaint.bg)>=4.5,name+' '+lang+': actual split placeholder remains MAD with >=4.5 contrast');
        const gap=await page.$eval('#bq-split-in',input=>{
          const box=input.getBoundingClientRect(),css=getComputedStyle(input),extent=parseFloat(css.outlineWidth)+parseFloat(css.outlineOffset);
          const above=[...input.parentElement.querySelectorAll('button')].map(el=>el.getBoundingClientRect()).filter(r=>r.bottom<=box.top && r.left<box.right && r.right>box.left);
          return {rowGap:getComputedStyle(input.parentElement).rowGap,clearance:above.length?Math.min(...above.map(r=>box.top-extent-r.bottom)):null};
        });
        check(gap.rowGap==='12px' && (gap.clearance===null || gap.clearance>=3),name+' '+lang+': wrapped field rim has real clearance from overlapping preceding chip '+JSON.stringify(gap));
        // Browser viewport shrink only; this is not a native keyboard claim.
        await page.setViewport({width:402,height:590,deviceScaleFactor:3,isMobile:true,hasTouch:true});
        await inspectNativeFocus(page,'#bq-split-in',name+' '+lang+' keyboard-height split amount',false,true);
        await page.click('#bq-paym [data-bq-close]');
        await page.setViewport({width:402,height:874,deviceScaleFactor:3,isMobile:true,hasTouch:true});
        await page.click('#bq-tk-lines [data-bq-minus]');
        check(await page.$$eval('#bq-tk-lines [data-bq-minus]',nodes=>nodes.length)===0,name+' '+lang+': SAME unsold fixture line removed before next context');
        // The open ticket disables the burger by design. Collapse it with its
        // actual peek before attempting the following normal drawer route.
        await page.click('.vx-peek');
        await page.waitForFunction(()=>!document.querySelector('.vx-screen.is-on').classList.contains('vx-ticket-open'));
        await navigateNative(page,'clientes');
        await page.waitForSelector('#kcb-add',{visible:true});
        variantSplitCases++;
      }
    }
    check(await page.evaluate(()=>localStorage.getItem('kiwi:clients:v1:synthetic-retail-acompte'))===untouchedBook,name+': focus/Confirm inspection/cancel never changes customer or purchase data');
    check(errors.length === 0, name + ': no page errors: ' + errors.join(' | '));
    check(writes.length === 0, name + ': read-only UI pass');
    await context.close();
  }
  check(originalCases===5,'all five original sheet theme cases completed');
  check(variantSplitCases===6,'all six variant/split FR/EN/AR light/dark contexts completed');
  console.log('native-form-focus-painted-readings: '+JSON.stringify(focusReadings));
  console.log('Screenshot checks: ' + shots);
  assert.equal(failures.length, 0, failures.length + ' rendered sheet contrast regressions');
  console.log('✓ Caisse sheets · ' + checks + ' rendered checks in light and all three dark theme systems');
} finally {
  try {
    if (browser) { await browser.close();releaseExitedBrowserStreams(browser.process());assert.ok(browser.process().stdio.every(s=>!s || s.destroyed),'owned browser exited and all streams released'); }
  } finally {
    if(fixture.exitCode===null && fixture.signalCode===null){const exited=once(fixture,'exit');fixture.kill('SIGTERM');await exited;}
  }
}
