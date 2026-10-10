#!/usr/bin/env node
/* Opening screen v2 and Face ID login on the native owner lock.
 * Local bundled build, stubbed native plugins. No code is ever typed, no
 * credential leaves the page: the Keychain record is a fixture.
 *
 *   node tools/native-face-entry-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from './build-app-www.mjs';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-face-'));
const www = path.join(work, 'www');
build({ out:www, quiet:true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.png':'image/png' };
const server = http.createServer((req, res) => {
  const p = path.resolve(www, '.' + new URL(req.url,'http://local').pathname);
  if (!p.startsWith(www + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, {'Content-Type':mime[path.extname(p)] || 'application/octet-stream'}); res.end(err ? '' : data); });
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({executablePath:bin,headless:true,args:['--no-sandbox']});
const sleep = ms => new Promise(r => setTimeout(r,ms));
let checks = 0;
const check = (value,label) => { assert.ok(value,label); checks++; console.log('  ✓ ' + label); };
const shots = process.env.KIWI_FACE_SHOTS || work;

async function phone({lang='en', record=null, authenticated=true, motion='reduce', onboarded=true}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({width:402,height:874,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:motion}]);
  await page.setRequestInterception(true);
  let verificationRequests = 0;
  page.on('request', r => {
    if (/\/api\/pin\/verify/.test(r.url())) verificationRequests++;
    if (!r.url().startsWith(base) && !r.url().startsWith('data:')) r.abort(); else r.continue();
  });
  await page.evaluateOnNewDocument((lang, record, authenticated, onboarded) => {
    localStorage.setItem('kiwiNativeLocale', lang);
    if (record) localStorage.setItem('kiwiAccountKey', record.account);
    if (record && onboarded) localStorage.setItem('kiwiOnboarded', '1');
    window.__native = { prompts: 0, stored: null };
    const store = { 'face-unlock-v1': record ? JSON.stringify(record) : null };
    const socket = {
      checkBiometrics: () => Promise.resolve({ isAvailable: true, biometryType: 'faceId' }),
      authenticateBiometric: () => { window.__native.prompts++; return Promise.resolve({ authenticated }); },
      secureGet: ({ key }) => Promise.resolve({ value: store[key] }),
      secureSet: ({ key, value }) => { store[key] = value; window.__native.stored = value; return Promise.resolve({}); },
      secureRemove: ({ key }) => { store[key] = null; window.__native.stored = null; return Promise.resolve({}); },
    };
    const noop = () => Promise.resolve({});
    const plug = new Proxy({}, {get:(_,k)=> k === 'addListener' ? () => ({remove(){}}) : (socket[k] || noop)});
    window.Capacitor = {isNativePlatform:()=>true,getPlatform:()=>'ios',Plugins:new Proxy({}, {get:()=>plug})};
    window.webkit = {messageHandlers:{kiwiShell:{postMessage(){}}}};
    document.addEventListener('DOMContentLoaded',()=> {
      const s = document.documentElement.style;
      s.setProperty('--kiwi-host-safe-top','62px'); s.setProperty('--kiwi-host-safe-bottom','34px');
    });
  }, lang, record, authenticated, onboarded);
  return {page, context, verificationRequests:()=>verificationRequests};
}
async function toLock(page) {
  await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
  await sleep(1600);
  await page.evaluate(()=>document.querySelector('.kob-root [data-explore]')?.click());
  await sleep(1200);
}

const read = p => fs.readFileSync(path.join(root, p), 'utf8');
{
  const dash = read('dashboard.html'), mc = read('assets/merchant-config.js'), rt = read('app/src/native-runtime.js');
  check(/unlockAs\(identity\) \{\n\s+const access = identity && identity\.access;\n\s+if \(unlocked \|\| !\/\^\(owner\|manager\|staff\)\$\/\.test/.test(dash), 'unlockAs accepts only a known access tier, once');
  check(/if \(!reserved && hit && matched && val\)[^\n]*\n?[^\n]*kiwi:code-unlocked/.test(dash) || /kiwi:code-unlocked', \{ detail: \{ access: role, name: hit\.name \|\| '' \} \}/.test(dash), 'only a real code announces itself, without the code');
  check(/function isPreviewCode[\s\S]{0,400}classList\.contains\('kiwi-native'\)\) return false;/.test(dash), 'the native app accepts no preview code');
  check(/adoptTillCutoff\(cfg\.businessCutoff\);/.test(mc) && /if \(R\.cutoff\(slug\) !== serverCutoff\) R\.setCutoff\(serverCutoff, slug\);/.test(mc) && /\/caisse\/i\.test\(location\.pathname\)/.test(mc), 'the dashboard adopts the cutoff the till published, the till keeps its own');
  check(/revokeIdentity[\s\S]{0,600}secureSet\('face-unlock-v1', null\)/.test(rt) && /a\[href="\/auth\/logout"\][\s\S]{0,80}forgetFaceUnlock\(\)/.test(rt), 'signing out or revoking forgets Face ID on this device');
  check(!/—/.test(rt.slice(rt.indexOf('function entryCopy'), rt.indexOf('function entryAccount'))), 'opening screen copy has no em dash');
  const story = read('app/ios/App/App/Base.lproj/LaunchScreen.storyboard'), shellCss = read('app/src/native-shell.css'), swift = read('app/ios/App/App/KiwiNativeShell.swift');
  check(/firstItem="kiwi-launch-mark" firstAttribute="top" secondItem="launch-safe" secondAttribute="top" constant="20"/.test(story) && !/mark-middle/.test(story), 'launch screen: the mark sits 20 pt under the safe area, never centred');
  check(/\.boot-inner \{[^}]*padding-top: calc\(var\(--kiwi-safe-top[^)]*\)\) \+ 20px\)/.test(shellCss), 'web boot stage: same place as the launch screen');
  check(/VStack \{ KiwiMark\(size: 88\); Spacer\(minLength: 0\) \}\s*\.frame\(maxWidth: \.infinity\)\.padding\(\.top, 20\)/.test(swift), 'native host launch state: same place as the launch screen');
  check(/KiwiMark\(size: 88\)\.frame\(maxWidth: \.infinity\)\n\s*progress\.modifier\(KiwiArrive/.test(swift) && (swift.match(/\.modifier\(KiwiArrive\(/g) || []).length === 4 && !/setup\.transition\(/.test(swift), 'native setup: text and controls fade in, the mark is never faded');
}

try {
  // 1 · No Face ID record: the new layout, the keypad and no face key.
  {
    const {page,context,verificationRequests} = await phone({});
    await toLock(page);
    const s = await page.evaluate(()=> {
      const q = s => document.querySelector(s), r = el => el && el.getBoundingClientRect();
      const brand = r(q('[data-kiwi-lock] .kiwi-lock-brand')), title = q('[data-kiwi-lock] .kiwi-lock-title');
      const keys = [...document.querySelectorAll('.kiwi-native-owner-keypad button')].map(b=>r(b));
      return {
        v2: document.documentElement.classList.contains('kiwi-entry-v2'),
        entered: q('[data-kiwi-lock]').classList.contains('kiwi-entry-in'),
        brand: brand && {w:brand.width, top:brand.top},
        safeTop: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kiwi-host-safe-top')),
        title: title.textContent.trim(), titleSize: parseFloat(getComputedStyle(title).fontSize),
        italic: getComputedStyle(title).fontStyle,
        keys: keys.length, minKey: Math.min(...keys.map(k=>Math.min(k.width,k.height))),
        face: !!q('[data-face-unlock]'),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    await page.screenshot({path:path.join(shots,'entry-plain.png')});
    check(s.v2 && s.entered, 'opening screen v2 is on and the lock has entered');
    check(s.brand && s.brand.w === 88 && Math.abs(s.brand.top - (s.safeTop + 20)) <= 1, 'the mark is exactly where the launch screen draws it: 88 pt, safe area + 20 '+JSON.stringify(s.brand));
    check(s.title.length > 0 && s.titleSize >= 24 && s.italic === 'normal', 'large upright greeting: '+s.title);
    check(s.keys === 11 && s.minKey >= 60, 'eleven borderless keys, each at least 60 pt');
    check(!s.face, 'no Face ID key without a stored Face ID record');
    check(s.overflow <= 0, 'no horizontal overflow');
    check(verificationRequests() === 0, 'nothing is verified on load');
    await context.close();
  }
  // 1b · Real motion: the mark settles in place, it never travels across the screen.
  {
    const {page,context} = await phone({motion:'no-preference'});
    await page.goto(base+'/dashboard.html',{waitUntil:'networkidle2'});
    await sleep(1600);
    await page.evaluate(()=>document.querySelector('.kob-root [data-explore]')?.click());
    const frames = await page.evaluate(()=>new Promise(resolve=>{
      const brand=document.querySelector('[data-kiwi-lock] .kiwi-lock-brand'), out=[], t0=performance.now();
      (function tick(){
        const r=brand.getBoundingClientRect();
        out.push({t:Math.round(performance.now()-t0), cy:r.top+r.height/2, o:Number(getComputedStyle(brand).opacity)});
        if (performance.now()-t0<1600) requestAnimationFrame(tick); else resolve(out);
      })();
    }));
    const travel = Math.max(...frames.map(f=>f.cy)) - Math.min(...frames.map(f=>f.cy));
    check(frames.every(f => f.o === 1), 'the mark is fully shown from the first frame, like the launch screen');
    check(travel <= 1, 'the mark never moves: ' + travel.toFixed(1) + ' px');
    check(await page.$eval('[data-kiwi-lock] .kiwi-lock-brand', el => !el.getAttribute('style')), 'no inline transform is written to the mark');
    await context.close();
  }
  // 2 · A stored record for this account: Face ID prompts once and opens the dashboard.
  {
    const record = {account:'face.fixture@kiwi.test', access:'owner', name:'Salma Fixture', at:1};
    const {page,context,verificationRequests} = await phone({record});
    await toLock(page);
    await sleep(600);
    const s = await page.evaluate(()=>({
      prompts: window.__native.prompts,
      locked: !!document.querySelector('[data-kiwi-lock]') && getComputedStyle(document.querySelector('[data-kiwi-lock]')).display !== 'none' && !document.querySelector('[data-kiwi-lock]').classList.contains('is-unlocking'),
      title: document.querySelector('[data-kiwi-lock] .kiwi-lock-title')?.textContent || '',
    }));
    check(s.prompts === 1, 'Face ID asks once, on its own');
    check(!s.locked, 'a recognised face opens the dashboard without a code');
    check(verificationRequests() === 0, 'Face ID sends no code to the server');
    await context.close();
  }
  // 3 · A refused face leaves the lock and shows the Face ID key next to the keypad.
  {
    const record = {account:'face.fixture@kiwi.test', access:'owner', name:'Salma Fixture', at:1};
    const {page,context} = await phone({record, authenticated:false});
    await toLock(page);
    await sleep(600);
    const s = await page.evaluate(()=> {
      const key = document.querySelector('.kiwi-native-owner-keypad [data-face-unlock]');
      const r = key && key.getBoundingClientRect();
      return { title: document.querySelector('[data-kiwi-lock] .kiwi-lock-title')?.textContent || '', key: !!key, label: key?.getAttribute('aria-label'), size: r && Math.min(r.width,r.height), buttons: document.querySelectorAll('.kiwi-native-owner-keypad button').length,
        locked: getComputedStyle(document.querySelector('[data-kiwi-lock]')).display !== 'none' };
    });
    await page.screenshot({path:path.join(shots,'entry-face-key.png')});
    check(s.locked, 'a refused face keeps the lock');
    check(/, Salma$/.test(s.title), 'the lock greets the owner by first name: '+s.title);
    check(s.key && s.buttons === 12 && s.size >= 60, 'the Face ID key takes the empty keypad slot');
    check(s.label === 'Unlock with Face ID', 'the key is labelled for VoiceOver');
    await page.click('.kiwi-native-owner-keypad [data-face-unlock]');
    await sleep(300);
    check(await page.evaluate(()=>window.__native.prompts) === 2, 'tapping the key asks Face ID again');
    await context.close();
  }
  // 3b · Onboarding drawn over the lock: Face ID never asks from behind it.
  {
    const {page,context} = await phone({record:{account:'face.fixture@kiwi.test', access:'owner', name:'X', at:1}, onboarded:false});
    await toLock(page);
    await sleep(600);
    const ob = await page.evaluate(()=>({kob:!!document.querySelector('.kob-root'), prompts:window.__native.prompts}));
    check(ob.kob && ob.prompts === 0, 'Face ID waits while the onboarding covers the lock');
    await context.close();
  }
  // 4 · A record for another account is ignored.
  {
    const {page,context} = await phone({record:{account:'face.fixture@kiwi.test', access:'owner', name:'X', at:1}});
    await page.evaluateOnNewDocument(()=>localStorage.setItem('kiwiAccountKey','someone.else@kiwi.test'));
    await toLock(page);
    await sleep(600);
    check(await page.evaluate(()=>window.__native.prompts === 0 && !document.querySelector('[data-face-unlock]')), 'a Face ID record from another account never unlocks');
    await context.close();
  }
  // 5 · The offer sheet after a real code, and its choices.
  {
    const {page,context} = await phone({lang:'en'});
    await toLock(page);
    await page.evaluate(()=>{
      localStorage.setItem('kiwiAccountKey','face.fixture@kiwi.test');
      window.KiwiEnv = Object.assign(window.KiwiEnv || {}, { isReal: () => true });
      try { window.__kiwiLock.hide(); } catch (_) {}
      window.dispatchEvent(new CustomEvent('kiwi:code-unlocked',{detail:{access:'manager',name:'Ali'}}));
    });
    await sleep(2500);
    const sheet = await page.evaluate(()=>{
      const s = document.querySelector('.kiwi-face-offer');
      return s && { open: s.classList.contains('is-open'), title: s.querySelector('h2').textContent, yes: s.querySelector('.kiwi-face-offer-yes').textContent };
    });
    await page.screenshot({path:path.join(shots,'entry-offer.png')});
    check(sheet && sheet.open && sheet.title === 'Open Kiwi with Face ID?' && sheet.yes === 'Turn on Face ID', 'a real code offers Face ID once');
    const bg = await page.$eval('.kiwi-face-offer-panel', el => getComputedStyle(el).backgroundColor);
    const alpha = /rgba\(/.test(bg) ? Number(bg.split(',')[3].replace(')','')) : 1;
    check(alpha === 1, 'the offer sheet is solid, never the glass --surface: ' + bg);
    await page.click('.kiwi-face-offer-yes');
    await sleep(500);
    const stored = JSON.parse(await page.evaluate(()=>window.__native.stored) || 'null');
    check(stored && stored.account === 'face.fixture@kiwi.test' && stored.access === 'manager' && !('pin' in stored) && !('code' in stored), 'turning it on stores the identity, never a code');
    check(await page.evaluate(()=>!document.querySelector('.kiwi-face-offer')), 'the sheet closes');
    await context.close();
  }
  // 6 · The demo never offers Face ID.
  {
    const {page,context} = await phone({lang:'en'});
    await toLock(page);
    await page.evaluate(()=>{
      window.KiwiEnv = Object.assign(window.KiwiEnv || {}, { isReal: () => false });
      window.dispatchEvent(new CustomEvent('kiwi:code-unlocked',{detail:{access:'owner',name:'Demo'}}));
    });
    await sleep(2500);
    check(await page.evaluate(()=>!document.querySelector('.kiwi-face-offer')), 'the demo never offers Face ID');
    await context.close();
  }
  console.log(`\nnative-face-entry: ${checks} checks passed`);
} finally {
  await browser.close();
  server.close();
}
