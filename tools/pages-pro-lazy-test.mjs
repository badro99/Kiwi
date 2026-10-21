import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
const root = path.resolve(import.meta.dirname, '..');
const puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json' };
const server = http.createServer((req,res) => {
  const p = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err,data) => { res.writeHead(err ? 404 : 200, {'Content-Type':mime[path.extname(p)] || 'application/octet-stream'}); res.end(err ? '' : data); });
});
await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
let browser;
try {
  browser = await puppeteer.launch({executablePath:bin,headless:true,args:['--no-sandbox']});
  const S = suite('pages-pro-lazy', {browser});
  await S.run('demo appointments first use', async t => {
    const page = t.watch(await browser.newPage());
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.setViewport({width:1366,height:1000});
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', r => {
      // The newer workspace intercepts Spa clicks before Kiwi.handlers. Isolate
      // the legacy route here, retaining every other dashboard wrapper/consumer.
      if (new URL(r.url()).pathname === '/assets/trade-workspaces.js') return r.respond({status:200,contentType:'text/javascript',body:'/* legacy Spa A pilot harness */'});
      if (r.url().startsWith(base + '/api/')) return r.respond({status:503,contentType:'application/json',body:'{"error":"offline"}'});
      return r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort();
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kiwiLang','fr');
      try { Object.defineProperty(navigator.serviceWorker,'register',{value:()=>new Promise(()=>{}),configurable:true}); } catch (_) {}
    });
    await page.goto(base + '/dashboard.html',{waitUntil:'load'});
    const count = () => page.evaluate(() => performance.getEntriesByType('resource').filter(r=>r.name.includes('/pages-pro/spa-appointments.js?')).length);
    assert.equal(await count(),0,'chunk absent at boot');
    await page.waitForSelector('[data-explore]', {visible:true});
    await page.click('[data-explore]');
    const skip = await page.$('[data-kiwi-skip]');
    if (skip && await skip.evaluate(e => !!e.offsetParent)) await skip.click();
    await page.keyboard.press('Escape');
    // Use the venue picker, then its sidebar destination.
    await page.click('[data-action="venue-toggle"]');
    await page.waitForSelector('[data-action="venue-pick"][data-venue="spaBahia"]',{visible:true});
    await page.click('[data-action="venue-pick"][data-venue="spaBahia"]');
    await page.waitForSelector('.sidebar [data-nav="appointments"]',{visible:true});
    await page.evaluate(() => {
      const prev = Kiwi.handlers['nav-appointments'];
      Kiwi.handlers['nav-appointments'] = function () { window.__spaWrapper = true; return prev.apply(this,arguments); };
      const appPage = Kiwi.appPage;
      Kiwi.appPage = function(name,opts) { if(name==='appointments') window.__spaOptions=JSON.stringify(opts); return appPage.apply(this,arguments); };
    });
    await page.click('.sidebar [data-nav="appointments"]');
    await page.waitForSelector('.s-cal-block',{visible:true});
    assert.equal(await count(),1);
    assert.equal(await page.evaluate(()=>window.__spaWrapper),true,'captured apply wrapper works');
    const rendered = await page.evaluate(()=>window.__spaOptions);
    const reference = JSON.parse(fs.readFileSync(path.join(root,'tools/pages-pro-spa-reference.json'),'utf8'));
    assert.equal(crypto.createHash('sha256').update(rendered).digest('hex'),reference.sha,'same appPage DOM input as unsplit file');
    await page.click('[data-action="appt-filter"]');
    assert.equal(await count(),1,'second spa handler reuses chunk');
    /* The toast lands asynchronously: wait for it rather than read the next line. */
    await page.waitForFunction(() => document.body.textContent.includes('Praticienne, service, statut'), {timeout:5000});
    // venues.js captures nav-accueil and calls origAccueil.apply(this, arguments).
    await page.click('.sidebar [data-nav="accueil"]');
    await page.waitForFunction(() => !document.body.classList.contains('page-appointments'));
    assert.equal(await count(),1);
  });
  /* Second chunk: Spa practitioners (assets/pages-pro/spa-practitioners.js). */
  await S.run('demo practitioners first use', async t => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.setViewport({width:1366,height:1000});
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (new URL(r.url()).pathname === '/assets/trade-workspaces.js') return r.respond({status:200,contentType:'text/javascript',body:'/* legacy Spa harness */'});
      if (r.url().startsWith(base + '/api/')) return r.respond({status:503,contentType:'application/json',body:'{"error":"offline"}'});
      return r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort();
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kiwiLang','fr');
      try { Object.defineProperty(navigator.serviceWorker,'register',{value:()=>new Promise(()=>{}),configurable:true}); } catch (_) {}
    });
    await page.goto(base + '/dashboard.html',{waitUntil:'load'});
    const count = () => page.evaluate(() => performance.getEntriesByType('resource').filter(r=>r.name.includes('/pages-pro/spa-practitioners.js?')).length);
    const printRef = process.env.KIWI_PRINT_REF === '1';
    if (!printRef) assert.equal(await count(),0,'practitioners chunk absent at boot');
    await page.waitForSelector('[data-explore]', {visible:true});
    await page.click('[data-explore]');
    const skip = await page.$('[data-kiwi-skip]');
    if (skip && await skip.evaluate(e => !!e.offsetParent)) await skip.click();
    await page.keyboard.press('Escape');
    await page.click('[data-action="venue-toggle"]');
    await page.waitForSelector('[data-action="venue-pick"][data-venue="spaBahia"]',{visible:true});
    await page.click('[data-action="venue-pick"][data-venue="spaBahia"]');
    await page.waitForSelector('.sidebar [data-nav="practitioners"]',{visible:true});
    await page.evaluate(() => {
      const appPage = Kiwi.appPage;
      Kiwi.appPage = function(name,opts) { if(name==='practitioners') window.__pracOptions=JSON.stringify(opts); return appPage.apply(this,arguments); };
    });
    await page.click('.sidebar [data-nav="practitioners"]');
    await page.waitForFunction(() => !!window.__pracOptions, {timeout:10000});
    const sha = crypto.createHash('sha256').update(await page.evaluate(()=>window.__pracOptions)).digest('hex');
    if (printRef) { console.log('PRACTITIONERS_REF ' + sha); return; }
    assert.equal(await count(),1,'chunk loaded on first use');
    const reference = JSON.parse(fs.readFileSync(path.join(root,'tools/pages-pro-spa-practitioners-reference.json'),'utf8'));
    assert.equal(sha,reference.sha,'same appPage input as the unsplit file');
    /* The page's own buttons work after a lazy load (local delegation)… */
    await page.click('.dash-genpage [data-action="prac-add"]');
    await page.waitForSelector('.kiwi-drawer-backdrop, .kiwi-backdrop', {visible:true, timeout:5000});
    /* …and another registered entry point reuses the loaded chunk. */
    await page.evaluate(() => window.Kiwi.handlers['practitioner-commission']());
    assert.equal(await count(),1,'second practitioners handler reuses the chunk');
  });
  /* Third chunk: Boutique promos / returns (assets/pages-pro/boutique-promos-returns.js). */
  await S.run('demo boutique returns first use', async t => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.setViewport({width:1366,height:1000});
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (r.url().startsWith(base + '/api/')) return r.respond({status:503,contentType:'application/json',body:'{"error":"offline"}'});
      return r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort();
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kiwiLang','fr');
      try { Object.defineProperty(navigator.serviceWorker,'register',{value:()=>new Promise(()=>{}),configurable:true}); } catch (_) {}
    });
    await page.goto(base + '/dashboard.html',{waitUntil:'load'});
    const count = () => page.evaluate(() => performance.getEntriesByType('resource').filter(r=>r.name.includes('/pages-pro/boutique-promos-returns.js?')).length);
    const printRef = process.env.KIWI_PRINT_REF === '1';
    if (!printRef) assert.equal(await count(),0,'returns chunk absent at boot');
    await page.waitForSelector('[data-explore]', {visible:true});
    await page.click('[data-explore]');
    const skip = await page.$('[data-kiwi-skip]');
    if (skip && await skip.evaluate(e => !!e.offsetParent)) await skip.click();
    await page.keyboard.press('Escape');
    await page.click('[data-action="venue-toggle"]');
    await page.waitForSelector('[data-action="venue-pick"][data-venue="maisonMansour"]',{visible:true});
    await page.click('[data-action="venue-pick"][data-venue="maisonMansour"]');
    await page.waitForSelector('.sidebar [data-nav="returns"]',{visible:true});
    /* Promotions belong to boutique-promos-dashboard.js, which replaces this
       section's nav-promos: opening it must not fetch the chunk. */
    if (!printRef) {
      await page.click('.sidebar [data-nav="promos"]');
      await page.waitForFunction(() => document.body.classList.contains('page-promos') || !!document.querySelector('.dash-genpage'), {timeout:10000});
      assert.equal(await count(),0,'promotions page does not load the returns chunk');
    }
    await page.evaluate(() => {
      const appPage = Kiwi.appPage;
      Kiwi.appPage = function(name,opts) { if(name==='returns') window.__retOptions=JSON.stringify(opts); return appPage.apply(this,arguments); };
    });
    await page.click('.sidebar [data-nav="returns"]');
    await page.waitForFunction(() => !!window.__retOptions, {timeout:10000});
    const sha = crypto.createHash('sha256').update(await page.evaluate(()=>window.__retOptions)).digest('hex');
    if (printRef) { console.log('RETURNS_REF ' + sha); return; }
    assert.equal(await count(),1,'chunk loaded on first use');
    const reference = JSON.parse(fs.readFileSync(path.join(root,'tools/pages-pro-boutique-returns-reference.json'),'utf8'));
    assert.equal(sha,reference.sha,'same appPage input as the unsplit file');
    /* The page's own button reaches a handler of the loaded chunk… */
    await page.click('.dash-genpage [data-action="ret-detail"]');
    await page.waitForFunction(() => document.body.textContent.includes('DEMANDE DE RETOUR'), {timeout:5000});
    /* The router passes (element, data-arg): the modal names the request, not the element. */
    const tag = await page.evaluate(() => document.body.textContent.match(/DEMANDE DE RETOUR · \S+/)?.[0] || '');
    assert.equal(tag, 'DEMANDE DE RETOUR · R-7821', 'return detail names its request');
    /* …and another registered entry point reuses it. A toast right after a
       click that opened a modal is swallowed on purpose: close it first. */
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.kiwi-modal-backdrop, .kiwi-backdrop') && performance.now() - (window.__kiwiClickTs || -1e9) > 1000, {timeout:5000});
    await page.evaluate(() => window.Kiwi.handlers['ret-refund-credit']());
    await page.waitForFunction(() => document.body.textContent.includes('Crédit boutique émis'), {timeout:5000});
    assert.equal(await count(),1,'second returns handler reuses the chunk');
  });
  /* Fourth chunk: restaurant prep stations, menu + kitchen display (assets/pages-pro/restaurant-stations.js). */
  await S.run('demo kitchen display first use', async t => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.setViewport({width:1366,height:1000});
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (r.url().startsWith(base + '/api/')) return r.respond({status:503,contentType:'application/json',body:'{"error":"offline"}'});
      return r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort();
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kiwiLang','fr');
      try { Object.defineProperty(navigator.serviceWorker,'register',{value:()=>new Promise(()=>{}),configurable:true}); } catch (_) {}
    });
    await page.goto(base + '/dashboard.html',{waitUntil:'load'});
    const count = () => page.evaluate(() => performance.getEntriesByType('resource').filter(r=>r.name.includes('/pages-pro/restaurant-stations.js?')).length);
    const printRef = process.env.KIWI_PRINT_REF === '1';
    if (!printRef) assert.equal(await count(),0,'stations chunk absent at boot');
    await page.waitForSelector('[data-explore]', {visible:true});
    await page.click('[data-explore]');
    const skip = await page.$('[data-kiwi-skip]');
    if (skip && await skip.evaluate(e => !!e.offsetParent)) await skip.click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.Kiwi.handlers['nav-kds']());
    await page.waitForFunction(() => document.querySelector('.kit-screen [data-kit-new] .kit-col-stack')?.children.length > 0, {timeout:10000});
    /* Painted queue, with clock readings masked (the screen ticks every second). */
    const painted = await page.evaluate(() => document.querySelector('.kit-screen').innerHTML.replace(/\d{1,2}:\d{2}/g, 'T'));
    const paintSha = crypto.createHash('sha256').update(painted).digest('hex');
    if (printRef) { console.log('KDS_REF ' + paintSha); return; }
    assert.equal(await count(),1,'chunk loaded on first use');
    const reference = JSON.parse(fs.readFileSync(path.join(root,'tools/pages-pro-restaurant-stations-reference.json'),'utf8'));
    assert.equal(paintSha,reference.paintSha,'same painted kitchen queue as the unsplit file');
    /* A station pill repaints the queue through the loaded code. */
    await page.click('.kit-screen [data-kit-st="boissons"]');
    await page.waitForFunction(() => document.querySelector('.kit-screen [data-kit-st="boissons"]')?.classList.contains('on'), {timeout:5000});
    assert.equal(await count(),1,'second use reuses the chunk');
  });
  process.exitCode = await S.finish({exit:false});
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(r=>server.close(r));
}
if (!process.exitCode) console.log('✓ pages-pro lazy browser');
