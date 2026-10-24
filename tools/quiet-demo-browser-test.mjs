import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
const root = process.cwd();
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'].find(fs.existsSync);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
  const tests = suite('quiet demo hour', { browser });
  for (const shell of ['dashboard.html', 'kiwi-caisse.html']) await tests.run(shell, async t => {
    const context = await browser.createBrowserContext(); t.defer(() => context.close());
    const page = t.watch(await context.newPage());
    await page.setRequestInterception(true);
    const requests = [];
    page.on('request', r => {
      if (['fetch', 'xhr', 'websocket', 'ping', 'eventsource'].includes(r.resourceType())) requests.push(r.url());
      (r.url().startsWith(base) || r.url().startsWith('data:') ? r.continue() : r.abort());
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kiwiDemos', '1');
      const nativeTimeout = window.setTimeout.bind(window), nativeInterval = window.setInterval.bind(window);
      const clear = window.clearTimeout.bind(window), realNow = Date.now.bind(Date);
      let fake = false, now = 0, seq = 100000000;
      const timers = new Map();
      function schedule(fn, ms, repeat, args) {
        const id = ++seq, delay = Math.max(1, Number(ms) || 0);
        const call = () => { if (!repeat) timers.delete(id); if (typeof fn === 'function') fn(...args); };
        const real = fake ? null : (repeat ? nativeInterval(call, delay) : nativeTimeout(call, delay));
        timers.set(id, { fn: call, delay, repeat, real, at: now + delay }); return id;
      }
      window.setTimeout = (fn, ms, ...args) => schedule(fn, ms, false, args);
      window.setInterval = (fn, ms, ...args) => schedule(fn, ms, true, args);
      window.clearTimeout = window.clearInterval = id => { const t = timers.get(id); if (t) { clear(t.real); timers.delete(id); } else clear(id); };
      window.quietHour = async () => {
        fake = true; const epoch = realNow(); Date.now = () => epoch + now;
        for (const t of timers.values()) clear(t.real);
        for (let count = 0; count < 200000; count++) {
          const next = [...timers.entries()].sort((a,b) => a[1].at - b[1].at)[0];
          if (!next || next[1].at > 3600000) { now = 3600000; return; }
          const [id, timer] = next; now = timer.at;
          if (timer.repeat) timer.at += timer.delay; else timers.delete(id);
          timer.fn(); for (let i = 0; i < 8; i++) await Promise.resolve();
        }
        throw new Error('Fake timer runaway');
      };
    });
    await page.goto(base + '/' + shell + '?demo=1', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.KiwiPoll);
    assert.equal(await page.evaluate(() => window.KiwiPoll.mode()), 'off');
    requests.length = 0;
    await page.evaluate(() => window.quietHour());
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(requests, [], 'no periodic fetch/XHR/socket requests during demo hour');
    console.log('✓ ' + shell + ': zero periodic network requests in simulated hour');
  });
  process.exitCode = await tests.finish({ exit: false });
} catch (error) {
  console.error(error.message); process.exitCode = browser ? 1 : 3;
} finally { await browser?.close(); await new Promise(r => server.close(r)); }
