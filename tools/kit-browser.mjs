/* Kiwi · kit-browser.mjs · what every stage-2 kit suite needs to open a page.
 *
 *   const kb = await kitBrowser('kit-gallery');   // null when there is no Chromium
 *   const page = await kb.open('/kit.html', { theme, lang, reduced, width, height, query });
 *   ...
 *   await kb.close();
 *
 * A static server over the working tree (only GET, no /api, no /auth), so the
 * gallery runs exactly the files this commit ships; puppeteer-core from
 * app/node_modules and the machine's Chromium, as the other browser suites
 * find them. With neither, `kitBrowser` prints the shared skip line and the
 * suite exits 0 locally and 1 in CI (check.js shows the skip as a warning). */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };

export function chromium() {
  let puppeteer;
  try { puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core'); } catch { return null; }
  const bin = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
  return bin ? { puppeteer, bin } : null;
}

export async function kitBrowser(name, extraPages = {}) {
  const c = chromium();
  if (!c) { console.log('○ skip: Chromium or puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (extraPages[u.pathname]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(extraPages[u.pathname]); return; }
    if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
    const file = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await c.puppeteer.launch({ executablePath: c.bin, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars'] });
  const pages = [];
  return {
    browser, base, name,
    async open(p, o = {}) {
      const page = await browser.newPage();
      pages.push(page);
      page.__errors = [];
      page.on('pageerror', (e) => page.__errors.push(String(e && e.message || e)));
      page.on('console', (m) => { if (m.type() === 'error') page.__errors.push(m.text()); });
      await page.setViewport({ width: o.width || 1280, height: o.height || 900, deviceScaleFactor: 1 });
      const media = [{ name: 'prefers-reduced-motion', value: o.reduced ? 'reduce' : 'no-preference' }];
      media.push({ name: 'prefers-color-scheme', value: o.scheme || 'light' });
      await page.emulateMediaFeatures(media);
      const q = o.query ? (p.includes('?') ? '&' : '?') + o.query : '';
      await page.goto(base + p + q, { waitUntil: 'load', timeout: 30000 });
      if (o.ready !== false) await page.waitForSelector('body[data-ready]', { timeout: 15000 }).catch(() => {});
      if (o.lang && o.lang !== 'en') await page.evaluate((l) => {
        document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
        KiwiStrings.setLocale(l); KiwiFormat.setLang(l); window.dispatchEvent(new CustomEvent('kiwi:langchange'));
      }, o.lang);
      if (o.theme) await page.evaluate((v) => document.documentElement.setAttribute('data-theme', v), o.theme);
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await settle(page);
      return page;
    },
    async close() {
      for (const p of pages) { try { await p.close(); } catch {} }
      try { await browser.close(); } catch {}
      server.close();
    },
  };
}

/* Two frames and a pause: lens placements, raf renders and transitions end. */
export async function settle(page, ms = 450) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await new Promise((r) => setTimeout(r, ms));
}

/* Inside a kit root: page.evaluate with a resolver for 'host >>> selector'. */
export function deep(page, hostSel, innerSel) {
  return page.evaluateHandle((h, s) => {
    const host = document.querySelector(h);
    return host && host.shadowRoot ? host.shadowRoot.querySelector(s) : null;
  }, hostSel, innerSel);
}

export async function tapDeep(page, hostSel, innerSel) {
  const el = await deep(page, hostSel, innerSel);
  const node = el && el.asElement();
  if (node) { await node.evaluate((n) => n.scrollIntoView({ block: 'center' })); await settle(page, 60); }
  const box = node && await node.boundingBox();
  if (!box) throw new Error(`nothing to tap: ${hostSel} >>> ${innerSel}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return box;
}
