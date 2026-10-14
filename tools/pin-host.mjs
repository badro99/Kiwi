/* pin-host · a page with the real <k-pin-pad> and KiwiPinFlow, for the stage-3a
 * gates (pin-announce, pin-focus, clock-expiry, pair-redeem-timeout).
 *
 *   const h = await pinHost('pin-announce');
 *   const page = await h.open({ lang });
 *   await mount(page, 'till', { replies: [...], ctx });
 *
 * In the page:
 *   __mount(use, opts)   a fresh pad in #stage, wired by KiwiPinFlow.attach.
 *                        opts.replies: the answers, in order ('network' or
 *                        {status, body}); opts.hold: send through the real
 *                        fetch instead (the test intercepts it); a reply
 *                        'hold' waits for __release(reply);
 *                        opts.scale: timers run this many times faster, and
 *                        the clock moves with them.
 *   __log                every write to a live region: { r: 'prog'|'pol'|'ass', text }
 *   __sent               every request the flow made
 *   __done               the identity handed on, once
 */
import { kitBrowser, settle } from './kit-browser.mjs';

const BUNDLES = ['kit', 'team'].flatMap((b) => ['en', 'fr', 'ar'].map((l) => `assets/kit/strings/${b}.${l}.js`));
const SCRIPTS = [...BUNDLES, 'assets/kit/strings.js', 'assets/kit/format.js', 'assets/kit/motion.js', 'assets/kit/haptics.js',
  'assets/kit/core.js', 'assets/kit/pin.js', 'assets/kit/pin-flow.js'];

export const HOST = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/kit/tokens-2027.css"><link rel="stylesheet" href="/assets/kit/kit.css">
<style>body{margin:0;background:var(--k-surface-1)}#stage{display:flex;justify-content:center;padding:24px}</style></head>
<body><div id="stage"></div>
${SCRIPTS.map((s) => `<script src="/${s}"></script>`).join('\n')}
<script>
  window.__log = []; window.__sent = []; window.__done = null; window.__flow = null;
  window.__mount = function (use, o) {
    o = o || {};
    if (window.__flow) window.__flow.destroy();
    var stage = document.getElementById('stage'); stage.innerHTML = '';
    var pad = document.createElement('k-pin-pad'); pad.id = 'pad';
    if (o.size) pad.setAttribute('size', o.size);
    stage.appendChild(pad);
    window.__log = []; window.__sent = []; window.__done = null;
    var scale = o.scale || 1, born = Date.now();
    var now = function () { return born + (Date.now() - born) * scale; };
    var replies = window.__replies = (o.replies || []).slice();
    var opts = Object.assign({}, o.ctx || {}, {
      use: use,
      roles: { opensTill: function (r) { return /caisse|cashier|manager|owner|propri/i.test(r || ''); } },
      now: now,
      setTimeout: function (f, ms) { return setTimeout(f, (ms || 0) / scale); },
      clearTimeout: function (id) { clearTimeout(id); },
      onSuccess: function (who) { window.__done = who; },
      isOffline: function () { return !!o.offline; }
    });
    if (o.rows) opts.offline = { verify: function () { return Promise.resolve(o.rows.shift() || null); } };
    if (!o.hold) opts.request = function (code) {
      window.__sent.push(code);
      var r = replies.length ? replies.shift() : 'network';
      if (r === 'network') return Promise.resolve({ kind: 'network' });
      if (r === 'hold') return new Promise(function (res) {
        window.__release = function (x) { res(x === 'network' ? { kind: 'network' } : { kind: 'answer', status: x.status, body: x.body || {}, json: true }); };
      });
      return Promise.resolve({ kind: 'answer', status: r.status, body: r.body === null ? null : (r.body || {}), json: r.body !== null });
    };
    else opts.fetch = function (u, init) { window.__sent.push(JSON.parse(init.body).code || JSON.parse(init.body).pin); return fetch(u, init); };
    return new Promise(function (res) {
      requestAnimationFrame(function () {
        ['#prog', '.pol', '.ass'].forEach(function (sel) {
          var el = pad.shadowRoot.querySelector(sel);
          new MutationObserver(function () {
            if (el.textContent) window.__log.push({ r: sel === '#prog' ? 'prog' : sel.slice(1), text: el.textContent, at: Date.now() });
          }).observe(el, { childList: true, characterData: true, subtree: true });
        });
        window.__flow = KiwiPinFlow.attach(pad, opts);
        res(true);
      });
    });
  };
  document.body.setAttribute('data-ready', '');
</script></body></html>`;

export async function pinHost(name) {
  const kb = await kitBrowser(name, { '/pin-host.html': HOST });
  return {
    kb, browser: kb.browser,
    async open(o = {}) {
      const page = await kb.open('/pin-host.html', { width: o.width || 600, height: o.height || 900, lang: o.lang, reduced: o.reduced });
      return page;
    },
    close: () => kb.close(),
  };
}

export const mount = (page, use, o) => page.evaluate((u, x) => window.__mount(u, x), use, o || {});

/* A real click on a key inside the pad. */
export async function key(page, k) {
  const h = await page.evaluateHandle((x) => document.getElementById('pad').shadowRoot.querySelector('[data-key="' + x + '"]'), String(k));
  const box = await h.asElement().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
export async function type(page, code) { for (const d of String(code)) await key(page, d); }
export async function action(page) {
  const h = await page.evaluateHandle(() => document.getElementById('pad').shadowRoot.querySelector('[data-act]'));
  const box = await h.asElement().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
export const log = (page) => page.evaluate(() => window.__log.slice());
export const clearLog = (page) => page.evaluate(() => { window.__log = []; });
export const sent = (page) => page.evaluate(() => window.__sent.slice());
/* The copy as it reads in the DOM: t() isolates each argument with FSI/PDI,
   which the kit turns into <bdi> before it paints (§9.6), so textContent has none. */
export const t = (page, k, a) => page.evaluate((key, args) => String(KiwiStrings.t(key, args)).replace(/[\u2066-\u2069]/g, ''), k, a || {});
export { settle };
