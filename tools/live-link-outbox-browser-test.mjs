import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../app/package.json', import.meta.url));
let puppeteer;
const bin = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
try { puppeteer = require('puppeteer-core'); } catch (_) {}
if (!puppeteer || !fs.existsSync(bin)) {
  console.log('Browser outbox test SKIPPED: Chromium or puppeteer-core unavailable');
  process.exit(process.env.CI ? 1 : 0);
}
const allowed = new Map([
  ['/test', new URL('./live-link-outbox-browser-test.html', import.meta.url)],
  ['/assets/vendor/dexie.min.js', new URL('../assets/vendor/dexie.min.js', import.meta.url)],
  ['/assets/offline-db.js', new URL('../assets/offline-db.js', import.meta.url)],
  ['/assets/live-link.js', new URL('../assets/live-link.js', import.meta.url)],
]);
const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname, file = allowed.get(path);
  if (!file) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', path === '/test' ? 'text/html' : 'application/javascript');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await puppeteer.launch({ executablePath: bin, headless: true });
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(origin + '/') ? req.continue() : req.abort());
  await page.goto(origin + '/test');
  await page.click('#run');
  await page.waitForFunction(() => document.querySelector('#result').dataset.status, { timeout: 20000 });
  const result = await page.$eval('#result', el => ({ status: el.dataset.status, text: el.textContent }));
  console.log(result.text);
  if (result.status !== 'passed') process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
