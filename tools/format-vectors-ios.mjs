#!/usr/bin/env node
/* format-vectors-ios · the WebKit half of format-vectors-test (direction 2027 §6.3).
 *
 * The tills are iPads, and what must hold is Apple's WebKit with Apple's ICU.
 * The iOS Simulator runs the same WebKit and ICU as the iOS it emulates, with
 * no package: Node built-ins and `xcrun simctl` only.
 *
 *   node tools/format-vectors-ios.mjs                run on the booted simulator
 *   node tools/format-vectors-ios.mjs --require 15.5 fail unless ios.json holds a
 *                                                    pass for the current hash on
 *                                                    iOS 15.5 and the newest runtime
 *   KIWI_FORMAT_IOS_BOOT=1 node tools/format-vectors-ios.mjs
 *                                                    boot one iPhone simulator for
 *                                                    the run, then shut it down
 *
 * It serves assets/kit/business-day.js, assets/kit/format.js and
 * tools/format-vectors.json from a local http server on 127.0.0.1, opens a page
 * in the simulator's Safari (`xcrun simctl openurl`), waits for the page to POST
 * its outputs back, compares them character for character, and records the
 * result with the simulator's iOS version in
 * .kiwi/results/format-vectors/ios.json.
 *
 * NOT RUN is never PASSED. With no Xcode, no simulator, or no booted simulator
 * (and no KIWI_FORMAT_IOS_BOOT) it prints "not run: <reason>" and exits 0,
 * leaving ios.json as it was. Only `--require` turns a missing pass into a
 * failure (the release path, tools/app-archive.sh, is its caller).
 *
 * Exit: 0 pass or not run, 1 a vector differs (or --require unmet), 3 the
 * environment (the simulator never answered). */
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* The floor this spec proposes (section 4.2): the oldest ICU the tills run. */
const IOS_FLOOR = '15.5';
const FILES = {
  '/assets/kit/business-day.js': 'text/javascript',
  '/assets/kit/format.js': 'text/javascript',
  '/tools/format-vectors.json': 'application/json',
};
const OUT_DIR = path.join(process.env.KIWI_RESULTS_DIR || path.join(root, '.kiwi', 'results'), 'format-vectors');
const OUT = path.join(OUT_DIR, 'ios.json');
const args = process.argv.slice(2);
const requireIdx = args.indexOf('--require');
const required = requireIdx >= 0 ? (args[requireIdx + 1] || IOS_FLOOR) : '';

const hash = () => {
  const h = crypto.createHash('sha256');
  for (const f of ['assets/kit/format.js', 'tools/format-vectors.json']) h.update(fs.readFileSync(path.join(root, f)));
  return h.digest('hex').slice(0, 16);
};
const read = () => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return { runs: {} }; } };
const simctl = (...a) => { try { return execFileSync('xcrun', ['simctl', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return null; } };
const json = (...a) => { const out = simctl(...a); try { return out ? JSON.parse(out) : null; } catch { return null; } };
const notRun = (why) => { console.log(`○ format-vectors-ios not run: ${why} (not counted as passed)`); process.exit(0); };
const version = (runtime) => String(runtime || '').replace(/^.*iOS[- ]?/, '').replace(/-/g, '.');

/* The newest iOS runtime installed, as "26.5". */
function runtimes() {
  const r = json('list', 'runtimes', '-j');
  return ((r && r.runtimes) || []).filter((x) => /iOS/.test(x.name || x.identifier) && x.isAvailable !== false).map((x) => ({ id: x.identifier, version: x.version || version(x.identifier) }));
}
const newest = (list) => list.map((x) => x.version).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();

if (required) {
  const want = [required, newest(runtimes())].filter(Boolean);
  const data = read(), current = hash();
  const missing = want.filter((v) => !Object.entries(data.runs || {}).some(([ver, run]) => ver.startsWith(v) && run.pass === true && run.hash === current));
  if (missing.length) {
    console.error(`✗ format-vectors-ios: no pass for hash ${current} on iOS ${missing.join(' and ')}. Run it on a simulator of that runtime (Xcode > Settings > Platforms installs one).`);
    process.exit(1);
  }
  console.log(`✓ format-vectors-ios: pass recorded for hash ${current} on iOS ${want.join(' and ')}`);
  process.exit(0);
}

if (process.platform !== 'darwin' || !simctl('help')) notRun('no `xcrun simctl` (Xcode is not installed)');

/* A booted simulator, or one we boot ourselves on request. */
let booted = json('list', 'devices', 'booted', '-j');
let devices = Object.entries((booted && booted.devices) || {}).flatMap(([rt, list]) => list.filter((d) => d.state === 'Booted').map((d) => ({ ...d, runtime: rt })));
let weBooted = '';
if (!devices.length) {
  if (process.env.KIWI_FORMAT_IOS_BOOT !== '1') notRun('no booted simulator (set KIWI_FORMAT_IOS_BOOT=1 to boot one for the run)');
  const all = json('list', 'devices', 'available', '-j');
  const pick = Object.entries((all && all.devices) || {}).flatMap(([rt, list]) => list.map((d) => ({ ...d, runtime: rt })))
    .filter((d) => /iOS/.test(d.runtime) && /^iPhone/.test(d.name) && !/^Kiwi/.test(d.name))
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!pick) notRun('no iPhone simulator is installed');
  if (simctl('boot', pick.udid) === null) notRun(`could not boot ${pick.name}`);
  weBooted = pick.udid;
  spawnSync('xcrun', ['simctl', 'bootstatus', pick.udid, '-b'], { stdio: 'ignore', timeout: 120000 });
  devices = [{ ...pick, state: 'Booted' }];
}
const device = devices[0];
const iosVersion = version(device.runtime);

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>format vectors</title><script src="/assets/kit/business-day.js"></script><script src="/assets/kit/format.js"></script></head>
<body><pre id="o">running</pre><script>
(async function () {
  var out = { rows: [], ua: navigator.userAgent, deviceZone: '' };
  try { out.deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
  try {
    var table = await (await fetch('/tools/format-vectors.json')).json();
    table.vectors.forEach(function (v) {
      ['en', 'fr', 'ar'].forEach(function (l) {
        KiwiFormat.configure({ zone: v.zone || KiwiBusinessDay.DEFAULT_ZONE });
        var got;
        try { got = KiwiFormat.for(l)[v.call].apply(null, v.args); } catch (e) { got = 'THROW ' + e.message; }
        out.rows.push({ id: v.id, lang: l, got: got });
      });
    });
  } catch (e) { out.error = String(e && e.message || e); }
  document.getElementById('o').textContent = out.error || 'done';
  await fetch('/result', { method: 'POST', body: JSON.stringify(out) });
})();
</script></body></html>`;

let finish;
const result = new Promise((r) => { finish = r; });
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://local').pathname;
  if (req.method === 'POST' && p === '/result') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { res.writeHead(204); res.end(); try { finish(JSON.parse(body)); } catch { finish({ error: 'unreadable result' }); } });
    return;
  }
  if (p === '/run.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(PAGE); return; }
  if (!FILES[p]) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': FILES[p] + '; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(root, p)));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/run.html`;

let code = 0;
try {
  console.log(`format-vectors-ios · ${device.name} · iOS ${iosVersion}`);
  if (simctl('openurl', device.udid, url) === null) throw Object.assign(new Error('simctl openurl failed'), { env: true });
  const got = await Promise.race([result, new Promise((r) => setTimeout(() => r(null), 90000))]);
  if (!got) throw Object.assign(new Error('the simulator never posted a result in 90 s'), { env: true });
  if (got.error) throw new Error('the page failed: ' + got.error);

  const table = JSON.parse(fs.readFileSync(path.join(root, 'tools/format-vectors.json'), 'utf8')).vectors;
  const want = new Map(table.map((v) => [v.id, v]));
  const failures = got.rows.filter((r) => r.got !== want.get(r.id)[r.lang]).map((r) => ({ id: r.id, lang: r.lang, got: r.got, want: want.get(r.id)[r.lang] }));
  const cp = (s) => [...String(s)].map((c) => (c.charCodeAt(0) > 126 || c.charCodeAt(0) < 32 ? 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') : c)).join(' ');
  failures.forEach((f) => console.log(`  ✗ ${f.id}/${f.lang}: got ${cp(f.got)}, want ${cp(f.want)}`));
  const pass = failures.length === 0 && got.rows.length === table.length * 3;
  console.log(pass ? `  ✓ ${got.rows.length} outputs match (device zone ${got.deviceZone})` : `  ✗ ${failures.length} of ${got.rows.length} outputs differ`);

  const data = read();
  data.runs = data.runs || {};
  data.runs[iosVersion] = { pass, hash: hash(), device: device.name, ua: got.ua, deviceZone: got.deviceZone, rows: got.rows.length, failures: failures.slice(0, 20), at: new Date().toISOString() };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log(`  recorded in ${path.relative(process.cwd(), OUT)}`);
  code = pass ? 0 : 1;
} catch (e) {
  console.log(`✗ format-vectors-ios: ${e.message}`);
  code = e.env ? 3 : 1;
} finally {
  server.close();
  if (weBooted) simctl('shutdown', weBooted);
}
process.exit(code);
