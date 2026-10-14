#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * android-cls · the guest app's first-visit layout shift on Android Chrome
 * (design 2027 §6.1, P10; stage 3c). Android has no Arial, so the fallback
 * face "Inter Tight Fallback" is skipped there and Latin text sits in the
 * system face until Inter Tight arrives. §6.1 adds an Android fallback face
 * only if that swap costs more than 0.01. This is the measurement.
 *
 * Each load: a new tab, the HTTP cache and the origin's storage cleared,
 * throttled to Lighthouse's slow 4G (150 ms RTT, 1.6 Mbps down, 750 kbps up,
 * at 90 %), then every layout-shift entry until load + 15 s, with the node it
 * moved and the time each font face finished loading. The shipped page and the
 * 2027 skin, RUNS loads each (default 5), on OrderPro.html?s=demo&t=4, which
 * needs no server API. Not a check.js suite: it needs an emulator.
 *
 * The emulator (no Java needed). From Google's repository index
 * (dl.google.com/android/repository/repository2-3.xml and
 * sys-img/google_apis/sys-img2-3.xml), the stable emulator for macOS arm64 and
 * system-images;android-35;google_apis;arm64-v8a, unzipped into
 * $ANDROID_HOME/emulator and $ANDROID_HOME/system-images/android-35/google_apis.
 * An AVD written by hand (~/.android/avd/<name>.ini and <name>.avd/config.ini:
 * image.sysdir.1, abi.type arm64-v8a, 1080 x 2400 at 420 dpi). Then:
 *
 *   emulator -avd <name> -no-window -no-audio -no-snapshot -port 5580
 *   adb -s emulator-5580 root
 *   echo 'chrome --disable-fre --no-first-run' | adb shell 'cat > /data/local/tmp/chrome-command-line'
 *   adb shell am set-debug-app --persistent com.android.chrome
 *   adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main -d about:blank
 *   adb forward tcp:9333 localabstract:chrome_devtools_remote
 *   adb reverse tcp:8788 tcp:8788
 *   node tools/android-cls.mjs 9333        (from a checkout with app/node_modules)
 *
 * Measured 2026-10-14, Android 15 (API 35), Chrome 124, 10 loads per variant:
 * the Inter Tight swap moved nothing measurable; the shipped page 0.0004 to
 * 0.0005 (the greeting's reveal), the skin 0.0051 of which 0.0047 was its
 * language picker folding into the globe, fixed in assets/kit/ordering.css and
 * held by orderpro-parity-browser-test; after the fix, 0.0004.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || 9333);
const RUNS = Number(process.env.RUNS || 5);
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('puppeteer-core unavailable: run from a checkout with app/node_modules'); process.exit(2); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mov': 'video/quicktime' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep) || u.pathname === '/kiwi-sw.js') { res.writeHead(404); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(8788, '127.0.0.1', r));

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
const out = { browser: await browser.version(), at: new Date().toISOString(), runs: {} };
const variants = [
  ['shipped', 'http://localhost:8788/OrderPro.html?s=demo&t=4'],
  ['skin 2027', 'http://localhost:8788/OrderPro.html?s=demo&t=4&skin=2027'],
];
for (const [name, url] of variants) {
  out.runs[name] = [];
  for (let i = 0; i < RUNS; i++) {
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Storage.clearDataForOrigin', { origin: 'http://localhost:8788', storageTypes: 'all' });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8 * 0.9, uploadThroughput: 750 * 1024 / 8 * 0.9 });
    await page.evaluateOnNewDocument(() => {
      window.__shifts = []; window.__fontsAt = [];
      document.fonts.addEventListener('loadingdone', (e) => { for (const f of e.fontfaces) window.__fontsAt.push(f.family + ' ' + f.weight + ' @' + Math.round(performance.now())); });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.hadRecentInput) continue;
          window.__shifts.push({ v: e.value, t: Math.round(e.startTime), src: (e.sources || []).map((s) => {
            const el = s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement);
            return el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') : '?';
          }) });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await new Promise((r) => setTimeout(r, 15000));
    const r = await page.evaluate(() => ({
      cls: window.__shifts.reduce((s, e) => s + e.v, 0),
      shifts: window.__shifts,
      fontsAt: window.__fontsAt,
      fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0),
    }));
    out.runs[name].push(r);
    const swap = r.fontsAt.filter((x) => /^Inter Tight [456]00 /.test(x)).map((x) => x.split('@')[1]);
    console.log(`${name} #${i + 1}: CLS ${r.cls.toFixed(4)} · first paint ${r.fcp} ms · Inter Tight in at ${swap.length ? Math.max(...swap) + ' ms' : 'never'}`);
    for (const s of r.shifts) if (s.v >= 0.0005) console.log(`    ${s.v.toFixed(4)} @${s.t} ms  ${s.src.join(' | ')}`);
    await page.close();
  }
}
fs.mkdirSync(path.join(root, '.kiwi/results'), { recursive: true });
fs.writeFileSync(path.join(root, '.kiwi/results/android-cls.json'), JSON.stringify(out, null, 2));
console.log(out.browser + ' · .kiwi/results/android-cls.json');
await browser.disconnect();
server.close();
