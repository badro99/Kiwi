#!/usr/bin/env node
'use strict';

// Interactive ticket QA against an isolated, synthetic Kiwi merchant. The
// browser can only reach the fixture's loopback origin. No live merchant PIN,
// cookie, token, or API endpoint is exposed to an agent.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '../..');
const PROTOCOL = '2024-11-05';
let session = null;
let input = '';
let pending = 0;
let stdinEnded = false;

const TOOLS = [
  { name: 'start_hotel_fixture', description: 'Start a fresh real dashboard + real hotel API/SQLite on a synthetic merchant. Opens Chromium, enters only the fixture PIN, and returns visible UI. Never touches production.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ui_snapshot', description: 'Compact visible text and interactive controls with temporary q-refs; no screenshot tokens. Call again after navigation.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ui_click', description: 'Click a visible control through Chromium, not a JS handler or API. Use a q-ref from ui_snapshot.', inputSchema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } },
  { name: 'ui_fill', description: 'Fill a visible input through the rendered control. Use a q-ref from ui_snapshot.', inputSchema: { type: 'object', properties: { ref: { type: 'string' }, value: { type: 'string' } }, required: ['ref', 'value'] } },
  { name: 'ui_select', description: 'Choose a visible native select option by its HTML value. Use a q-ref from ui_snapshot.', inputSchema: { type: 'object', properties: { ref: { type: 'string' }, value: { type: 'string' } }, required: ['ref', 'value'] } },
  { name: 'ui_scroll', description: 'Wheel-scroll the actual page or a scrollable modal; then rescan visible controls. Use selector to target a modal/form.', inputSchema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] }, pixels: { type: 'number' }, selector: { type: 'string' } }, required: ['direction'] } },
  { name: 'ui_viewport', description: 'Set a real responsive browser viewport (mobile, tablet, desktop), then rescan visible UI. UI proof records the final dimensions.', inputSchema: { type: 'object', properties: { width: { type: 'number' }, height: { type: 'number' } }, required: ['width', 'height'] } },
  { name: 'ui_reload', description: 'Reload the actual page to verify persistence and reachability. The synthetic session is retained.', inputSchema: { type: 'object', properties: {} } },
  { name: 'ui_assert', description: 'Assert rendered UI state, optionally waiting up to 15s for an async outcome. selector is CSS, or use a current q-ref. Conditions: visible, hidden, absent, text_contains, value_equals. A successful specific assertion is needed for proof.', inputSchema: { type: 'object', properties: { ref: { type: 'string' }, selector: { type: 'string' }, condition: { type: 'string', enum: ['visible', 'hidden', 'absent', 'text_contains', 'value_equals'] }, expected: { type: 'string' }, description: { type: 'string' }, timeoutMs: { type: 'number', description: 'Wait for rendered result, 0–15000ms (default 0).' } }, required: ['condition', 'description'] } },
  { name: 'ui_screenshot', description: 'Return the current synthetic Kiwi screen as pixels, on demand. Also saves the image to an OS temporary directory.', inputSchema: { type: 'object', properties: {} } },
  { name: 'finish_ui_proof', description: 'Save an auditable screenshot and action/assertion manifest for a ticket. Requires a real user-facing click and passing specific UI assertion. Does not move or close the ticket.', inputSchema: { type: 'object', properties: { ticketId: { type: 'number' }, expectedOutcome: { type: 'string' } }, required: ['ticketId', 'expectedOutcome'] } },
  { name: 'close_session', description: 'Close Chromium and the synthetic fixture. Does not alter any ticket or production data.', inputSchema: { type: 'object', properties: {} } },
];

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  let i;
  while ((i = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, i).trim();
    input = input.slice(i + 1);
    if (line) { pending++; void handle(line).finally(() => { pending--; maybeExit(); }); }
  }
});
process.stdin.on('end', () => { stdinEnded = true; maybeExit(); });
process.once('SIGINT', () => { void closeSession().then(() => process.exit(0)); });
process.once('SIGTERM', () => { void closeSession().then(() => process.exit(0)); });

function maybeExit() { if (stdinEnded && !pending) void closeSession().then(() => process.exit(0)); }
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function text(value) { return { content: [{ type: 'text', text: String(value) }] }; }
function error(value) { return { content: [{ type: 'text', text: String(value) }], isError: true }; }
async function handle(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params = {} } = msg;
  if (id === undefined || id === null) return;
  try {
    let result;
    if (method === 'initialize') result = { protocolVersion: params.protocolVersion || PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'kiwi-ui-qa', version: '1.0.0' } };
    else if (method === 'ping') result = {};
    else if (method === 'tools/list') result = { tools: TOOLS };
    else if (method === 'tools/call') result = await call(params.name, params.arguments || {});
    else throw new Error('Method not found: ' + method);
    send({ jsonrpc: '2.0', id, result });
  } catch (e) { send({ jsonrpc: '2.0', id, result: error(e.message || e) }); }
}

async function call(name, args) {
  switch (name) {
    case 'start_hotel_fixture': return text(await startHotelFixture());
    case 'ui_snapshot': return text(await snapshot());
    case 'ui_click': return text(await interact('click', args));
    case 'ui_fill': return text(await interact('fill', args));
    case 'ui_select': return text(await interact('select', args));
    case 'ui_scroll': return text(await scroll(args));
    case 'ui_viewport': return text(await viewport(args));
    case 'ui_reload': return text(await reload());
    case 'ui_assert': return text(await assertUI(args));
    case 'ui_screenshot': return screenshotResult();
    case 'finish_ui_proof': return text(await finishProof(args));
    case 'close_session': await closeSession(); return text('Synthetic browser and fixture closed.');
    default: throw new Error('Unknown tool: ' + name);
  }
}

function chromiumBinary() {
  const requested = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN;
  if (requested && fs.existsSync(requested)) return requested;
  const options = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  ];
  try {
    for (const v of fs.readdirSync(path.join(os.homedir(), '.cache/puppeteer/chrome'))) {
      options.unshift(path.join(os.homedir(), '.cache/puppeteer/chrome', v, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'));
      options.unshift(path.join(os.homedir(), '.cache/puppeteer/chrome', v, 'chrome-linux64/chrome'));
    }
  } catch (_) {}
  return options.find(p => fs.existsSync(p)) || '';
}

async function hittable(handle) {
  if (!handle || !(await handle.isVisible())) return false;
  return handle.evaluate(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
}

function fixtureProcess() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools/hotel-direct-booking-browser-test.mjs'), '--serve-ui-qa'], {
      cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '', done = false;
    const timer = setTimeout(() => finish(new Error('Hotel fixture did not start within 20 seconds')), 20000);
    function finish(err, value) {
      if (done) return;
      done = true; clearTimeout(timer);
      if (err) { child.kill('SIGTERM'); reject(err); } else resolve({ child, ...value });
    }
    child.stdout.on('data', buf => {
      stdout += buf.toString();
      let i;
      while ((i = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, i); stdout = stdout.slice(i + 1);
        if (line.startsWith('KIWI_UI_QA_READY ')) {
          try { finish(null, JSON.parse(line.slice(17))); } catch (e) { finish(e); }
        }
      }
      if (stdout.length > 100000) stdout = stdout.slice(-10000);
    });
    child.stderr.on('data', buf => { stderr = (stderr + buf.toString()).slice(-2000); });
    child.once('exit', code => finish(new Error(`Hotel fixture exited ${code}: ${stderr}`)));
  });
}

async function startHotelFixture() {
  await closeSession();
  const bin = chromiumBinary();
  if (!bin) throw new Error('Chromium not found; set KIWI_CHROMIUM_BIN. UI proof cannot be skipped.');
  const puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core');
  const fixture = await fixtureProcess();
  let browser;
  let stage = 'launch';
  try {
    const origin = new URL(fixture.base);
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1') throw new Error('Fixture returned a non-loopback origin');
    browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost'], defaultViewport: { width: 1365, height: 900 } });
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    context.on('targetcreated', target => { if (target.type() === 'page') void target.page().then(p => { if (p && p !== page) return p.close(); }).catch(() => {}); });
    await page.setRequestInterception(true);
    page.on('request', req => {
      const u = req.url();
      if (u.startsWith(fixture.base + '/') || u.startsWith('data:') || u.startsWith('blob:')) req.continue().catch(() => {});
      else req.abort().catch(() => {});
    });
    await page.setCookie({ name: 'kiwi_sess', value: fixture.sessionValue, url: fixture.base, httpOnly: true, sameSite: 'Lax' });
    stage = 'load dashboard';
    await page.goto(fixture.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    const venue = await page.evaluate(() => window.KiwiVenue?.getVenue?.() || 'hx-venue');
    await page.evaluate(({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)), { key: `kiwi:hotel-rooms:v2:${venue}`, doc: fixture.roomsDoc });
    await page.evaluate(({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)), { key: `kiwi:hotel-rooms:v2:v-${fixture.merchant}`, doc: fixture.roomsDoc });
    stage = 'unlock synthetic PIN';
    await page.waitForSelector('[data-kiwi-pin-input]', { timeout: 20000 });
    const lock = await page.$('[data-kiwi-lock]');
    if (lock && await lock.isVisible()) {
      await page.focus('[data-kiwi-pin-input]');
      await page.keyboard.type('1234', { delay: 60 }); // synthetic fixture PIN only
      await page.waitForFunction(() => { const el = document.querySelector('[data-kiwi-lock]'); return !el || getComputedStyle(el).display === 'none'; }, { timeout: 15000 });
    }
    stage = 'select synthetic venue';
    // Unlock plays a greeting overlay. DOM .click() would bypass that overlay
    // and falsely claim a customer can reach the control; wait for a real
    // pointer target instead.
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-action="venue-toggle"]'), r = el?.getBoundingClientRect();
      if (!r) return false;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit && (hit === el || el.contains(hit));
    }, { timeout: 15000 });
    const pickSelector = '[data-action="venue-pick"][data-venue^="v-"]';
    let pick = await page.$(pickSelector);
    if (!(await hittable(pick))) {
      const toggle = await page.$('[data-action="venue-toggle"]');
      if (!(await hittable(toggle))) {
        const detail = await page.evaluate(() => {
          const el = document.querySelector('[data-action="venue-toggle"]'), r = el?.getBoundingClientRect();
          return { rect: r ? [r.x, r.y, r.width, r.height] : null, hit: r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 250) : '' };
        });
        throw new Error('Venue switcher is not reachable by pointer: ' + JSON.stringify(detail));
      }
      await toggle.click();
      await page.waitForFunction(sel => {
        const el = document.querySelector(sel), r = el?.getBoundingClientRect();
        if (!r) return false;
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !!hit && (hit === el || el.contains(hit));
      }, { timeout: 10000 }, pickSelector);
      pick = await page.$(pickSelector);
    }
    const wantedVenue = await pick.evaluate(el => el.getAttribute('data-venue'));
    await pick.click();
    await page.waitForFunction(want => window.KiwiVenue?.getVenue?.() === want, { timeout: 10000 }, wantedVenue).catch(async () => {
      const hit = await page.evaluate(sel => {
        const el = document.querySelector(sel), r = el?.getBoundingClientRect();
        return { current: window.KiwiVenue?.getVenue?.(), target: el?.getAttribute('data-venue'), hit: r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 300) : '' };
      }, pickSelector);
      throw new Error('Visible venue click had no effect: ' + JSON.stringify(hit));
    });
    const linked = await page.evaluate(() => {
      const id = window.KiwiVenue?.getVenue?.() || '';
      return { id, slug: window.KiwiStore?.slugFor?.(id) || window.KiwiVenue?.getCurrentVenueData?.()?.slug || window.KiwiMe?.merchant || '', me: window.KiwiMe?.merchant || '', venue: window.KiwiVenue?.getCurrentVenueData?.()?.slug || '', picks: [...document.querySelectorAll('[data-action="venue-pick"]')].map(el => el.getAttribute('data-venue')).slice(0, 8) };
    });
    if (linked.slug !== fixture.merchant) throw new Error(`Synthetic venue not linked (${JSON.stringify(linked)}, expected=${fixture.merchant})`);
    await page.waitForFunction(() => {
      const el = document.querySelector('a[data-nav="reception"]');
      const r = el?.getBoundingClientRect();
      if (!r) return false;
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === el || el.contains(hit);
    }, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 350));
    session = { ...fixture, browser, context, page, actions: [], assertions: [], refs: new Set(), startedAt: Date.now() };
    return `Synthetic hotel dashboard ready at ${origin.origin}; no live merchant access.\n${await snapshot()}`;
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    fixture.child.kill('SIGTERM');
    throw new Error(`${stage}: ${e.message || e}`);
  }
}

function active() { if (!session || !session.page || session.page.isClosed()) throw new Error('Start a synthetic fixture first.'); return session; }
function validRef(ref) { if (!/^q[1-9]\d*$/.test(String(ref || ''))) throw new Error('Use a q-ref from the latest ui_snapshot.'); return String(ref); }
function cssFrom(args) {
  if (args.ref) return `[data-kiwi-qa-ref="${validRef(args.ref)}"]`;
  const selector = String(args.selector || '');
  if (!selector || selector.length > 300) throw new Error('Provide a current q-ref or a CSS selector under 300 chars.');
  return selector;
}
async function snapshot() {
  const s = active();
  const found = await s.page.evaluate(() => {
    document.querySelectorAll('[data-kiwi-qa-ref]').forEach(el => el.removeAttribute('data-kiwi-qa-ref'));
    const visible = el => {
      const st = getComputedStyle(el), r = el.getBoundingClientRect();
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) <= 0 || r.width <= 0 || r.height <= 0 || el.closest('[hidden],[aria-hidden="true"]')) return false;
      if (el.matches('button,a[href],input,select,textarea,[role="button"],[data-action]')) {
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !!hit && (hit === el || el.contains(hit));
      }
      return true;
    };
    const out = [];
    const selectors = 'h1,h2,h3,button,a[href],input,select,textarea,[role="button"],[data-action]';
    for (const el of document.querySelectorAll(selectors)) {
      if (!visible(el) || out.length >= 100) continue;
      const tag = el.tagName.toLowerCase();
      if (el.closest('button,a[href],[role="button"]') && !el.matches('button,a[href],[role="button"]')) continue;
      const ref = 'q' + (out.length + 1);
      el.setAttribute('data-kiwi-qa-ref', ref);
      const name = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 110);
      const value = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? String(el.value || '').slice(0, 65) : '';
      out.push({ ref, tag, name, value, type: el.getAttribute('type') || '', action: el.getAttribute('data-action') || '' });
    }
    return { title: document.title, path: location.pathname, text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 450), controls: out };
  });
  s.refs = new Set(found.controls.map(x => x.ref));
  return `${found.title} ${found.path}\n${found.text}\n` + found.controls.map(x => `${x.ref} ${x.tag}${x.type ? '/' + x.type : ''}${x.action ? ' [' + x.action + ']' : ''} ${x.name}${x.value ? ' = ' + x.value : ''}`).join('\n');
}
async function visibleHandle(ref) {
  const s = active(), q = validRef(ref);
  if (!s.refs.has(q)) throw new Error('Stale q-ref; call ui_snapshot again.');
  const h = await s.page.$(`[data-kiwi-qa-ref="${q}"]`);
  if (!(await hittable(h))) throw new Error('Control is hidden or covered; call ui_snapshot again.');
  return h;
}
async function interact(kind, args) {
  const s = active(), h = await visibleHandle(args.ref);
  const label = await h.evaluate(el => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 90));
  if (kind === 'click') {
    const href = await h.evaluate(el => el.closest('a[href]')?.href || '');
    if (href && !href.startsWith(s.base + '/') && !href.startsWith('#')) throw new Error('External navigation is disabled in synthetic UI QA.');
    await h.click();
  }
  else if (kind === 'fill') {
    if (typeof args.value !== 'string' || args.value.length > 2000) throw new Error('value must be a string under 2000 chars.');
    const tag = await h.evaluate(el => el.tagName);
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') throw new Error('ui_fill targets an input or textarea only.');
    await h.click({ clickCount: 3 });
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await s.page.keyboard.down(modifier);
    await s.page.keyboard.press('A');
    await s.page.keyboard.up(modifier);
    await s.page.keyboard.type(args.value);
  } else if (kind === 'select') {
    if (typeof args.value !== 'string') throw new Error('select value must be a string.');
    const tag = await h.evaluate(el => el.tagName);
    if (tag !== 'SELECT') throw new Error('ui_select targets a native select only.');
    const got = await h.select(args.value);
    if (!got.includes(args.value)) throw new Error('Option not present: ' + args.value);
  }
  s.actions.push({ kind, label, at: new Date().toISOString() });
  await new Promise(r => setTimeout(r, 250));
  return `${kind} ${label}\n${await snapshot()}`;
}
async function reload() {
  const s = active();
  await s.page.reload({ waitUntil: 'load', timeout: 60000 });
  await s.page.waitForSelector('[data-kiwi-pin-input]', { timeout: 20000 });
  const lock = await s.page.$('[data-kiwi-lock]');
  if (lock && await lock.isVisible()) {
    await s.page.focus('[data-kiwi-pin-input]');
    await s.page.keyboard.type('1234', { delay: 60 }); // synthetic fixture PIN only
    await s.page.waitForFunction(() => { const el = document.querySelector('[data-kiwi-lock]'); return !el || getComputedStyle(el).display === 'none'; }, { timeout: 15000 });
  }
  await s.page.waitForFunction(() => {
    const el = document.querySelector('a[data-nav="reception"]'), r = el?.getBoundingClientRect();
    if (!r) return false;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit === el || el.contains(hit);
  }, { timeout: 15000 });
  s.actions.push({ kind: 'reload', at: new Date().toISOString() });
  return snapshot();
}
async function scroll(args) {
  const s = active();
  if (!['up', 'down'].includes(args.direction)) throw new Error('direction must be up or down.');
  const px = Math.max(100, Math.min(1500, Math.round(Number(args.pixels) || 500)));
  const selector = args.selector ? cssFrom({ selector: args.selector }) : '';
  const point = await s.page.evaluate(sel => {
    let el = sel ? document.querySelector(sel) : document.body;
    if (!el) return null;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (p.scrollHeight > p.clientHeight + 8 && /auto|scroll/.test(st.overflowY)) { el = p; break; }
    }
    const r = el.getBoundingClientRect();
    return { x: Math.max(10, Math.min(innerWidth - 10, r.x + r.width / 2)), y: Math.max(10, Math.min(innerHeight - 10, r.y + Math.min(r.height / 2, innerHeight * 0.65))) };
  }, selector);
  if (!point) throw new Error('Scroll target not found.');
  await s.page.mouse.move(point.x, point.y);
  await s.page.mouse.wheel({ deltaY: args.direction === 'down' ? px : -px });
  await new Promise(r => setTimeout(r, 250));
  s.actions.push({ kind: 'scroll', direction: args.direction, pixels: px, at: new Date().toISOString() });
  return snapshot();
}
async function viewport(args) {
  const s = active(), width = Number(args.width), height = Number(args.height);
  if (!Number.isInteger(width) || width < 320 || width > 1920 || !Number.isInteger(height) || height < 480 || height > 1400) throw new Error('Viewport must be 320–1920px wide and 480–1400px high.');
  await s.page.setViewport({ width, height, deviceScaleFactor: width < 768 ? 2 : 1, isMobile: width < 768, hasTouch: width < 768 });
  // Chromium reloads when mobile/touch emulation changes. The fixture gate is
  // typed through again, so viewport QA never works around the visible lock.
  await s.page.waitForSelector('[data-kiwi-pin-input]', { timeout: 20000 });
  const lock = await s.page.$('[data-kiwi-lock]');
  if (lock && await lock.isVisible()) {
    await s.page.focus('[data-kiwi-pin-input]');
    await s.page.keyboard.type('1234', { delay: 60 }); // synthetic fixture PIN only
    await s.page.waitForFunction(() => { const el = document.querySelector('[data-kiwi-lock]'); return !el || getComputedStyle(el).display === 'none'; }, { timeout: 15000 });
  }
  if (width >= 768) await s.page.waitForFunction(() => {
    const el = document.querySelector('a[data-nav="reception"]'), r = el?.getBoundingClientRect();
    if (!r) return false;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit === el || el.contains(hit);
  }, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 350));
  s.actions.push({ kind: 'viewport', width, height, at: new Date().toISOString() });
  return snapshot();
}
async function assertUI(args) {
  const s = active();
  if (typeof args.description !== 'string' || args.description.trim().length < 8) throw new Error('Describe the ticket-specific UI outcome (at least 8 characters).');
  const selector = cssFrom(args);
  const condition = String(args.condition || '');
  if (condition === 'text_contains' && (!String(args.expected || '').trim() || String(args.expected).length > 300)) throw new Error('text_contains needs a nonempty expected phrase under 300 chars.');
  const timeoutMs = Math.max(0, Math.min(15000, Math.round(Number(args.timeoutMs) || 0)));
  const end = Date.now() + timeoutMs;
  let result;
  do {
  result = await s.page.evaluate(({ selector, condition, expected }) => {
    let el;
    try { el = document.querySelector(selector); } catch (_) { return { pass: false, actual: 'invalid selector' }; }
    const st = el ? getComputedStyle(el) : null;
    const rect = el ? el.getBoundingClientRect() : null;
    const visible = !!el && st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0 && rect.width > 0 && rect.height > 0 && !el.closest('[hidden],[aria-hidden="true"]');
    const fullText = el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const pos = expected ? fullText.indexOf(expected) : -1;
    const actual = el ? { visible, text: pos >= 0 ? fullText.slice(Math.max(0, pos - 100), pos + expected.length + 100) : fullText.slice(0, 500), value: 'value' in el ? String(el.value) : null } : null;
    if (condition === 'absent') return { pass: !el, actual };
    if (condition === 'visible') return { pass: visible, actual };
    if (condition === 'hidden') return { pass: !visible, actual };
    if (condition === 'text_contains') return { pass: visible && fullText.includes(expected), actual };
    if (condition === 'value_equals') return { pass: visible && actual.value === expected, actual };
    return { pass: false, actual: 'unknown condition' };
  }, { selector, condition, expected: String(args.expected || '') });
    if (result.pass || Date.now() >= end) break;
    await new Promise(r => setTimeout(r, 150));
  } while (true);
  if (!result.pass) throw new Error(`UI assertion failed: ${args.description}; actual=${JSON.stringify(result.actual)}`);
  s.assertions.push({ description: args.description.trim(), selector, condition, expected: String(args.expected || ''), actual: result.actual, at: new Date().toISOString() });
  return `PASS: ${args.description}; actual=${JSON.stringify(result.actual)}`;
}
function proofDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-ui-proof-')); }
async function screenshotResult() {
  const s = active(), dir = proofDirectory(), file = path.join(dir, 'screen.png');
  await s.page.screenshot({ path: file, type: 'png', fullPage: false });
  return { content: [{ type: 'text', text: `Synthetic UI screenshot: ${file}` }, { type: 'image', mimeType: 'image/png', data: fs.readFileSync(file).toString('base64') }] };
}
async function finishProof(args) {
  const s = active();
  if (!s.page.url().startsWith(s.base + '/')) throw new Error('UI proof must be captured on the synthetic fixture origin.');
  const ticketId = Number(args.ticketId);
  if (!Number.isInteger(ticketId) || ticketId < 1) throw new Error('ticketId must be a positive integer.');
  if (typeof args.expectedOutcome !== 'string' || args.expectedOutcome.trim().length < 15) throw new Error('Describe the ticket-specific expected outcome (at least 15 characters).');
  if (!s.actions.some(x => x.kind === 'click')) throw new Error('A real visible UI click is required; source/API assertions alone are not UI proof.');
  if (!s.assertions.some(x => !['visible', 'hidden', 'absent'].includes(x.condition))) throw new Error('A specific rendered text/value assertion is required.');
  if (Date.parse(s.assertions.at(-1)?.at || '') < Date.parse(s.actions.at(-1)?.at || '')) throw new Error('Assert the final rendered state after your last UI action before saving proof.');
  const dir = proofDirectory(), image = path.join(dir, 'screen.png');
  await s.page.screenshot({ path: image, type: 'png', fullPage: false });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const manifest = {
    schema: 'kiwi-ui-proof-v1', passed: true, ticketId, expectedOutcome: args.expectedOutcome.trim(),
    environment: 'synthetic-hotel-dashboard', merchant: s.merchant, origin: s.base,
    path: new URL(s.page.url()).pathname, viewport: s.page.viewport(), startedAt: new Date(s.startedAt).toISOString(),
    finishedAt: new Date().toISOString(), gitHead: head, gitDirty: !!dirty,
    actions: s.actions, assertions: s.assertions, screenshot: image,
  };
  const file = path.join(dir, 'proof.json');
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return `UI proof saved: ${file}\nScreenshot: ${image}\n${s.actions.length} actual UI actions, ${s.assertions.length} passing rendered assertions. Synthetic only; ticket status unchanged. Review this against ticket #${ticketId} before submitting. ${dirty ? 'WARNING: git worktree was dirty when captured.' : ''}`;
}
async function closeSession() {
  const s = session; session = null;
  if (!s) return;
  await s.browser.close().catch(() => {});
  s.child.kill('SIGTERM');
  await new Promise(resolve => {
    if (s.child.exitCode !== null || s.child.signalCode !== null) return resolve();
    const timer = setTimeout(() => { s.child.kill('SIGKILL'); resolve(); }, 2000);
    s.child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}
