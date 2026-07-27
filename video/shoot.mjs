#!/usr/bin/env node
/**
 * shoot.mjs — capture high-resolution stills of the real Kiwi surfaces.
 *
 * These become the product layers inside the film. A YC demo video has to show
 * the actual thing running, so the film embeds real captures rather than
 * lookalike recreations.
 *
 * Serve the repo first (preview_start "kiwi-static"), then:
 *   node video/shoot.mjs --base http://localhost:4178 --out video/stills
 *
 * Captures at deviceScaleFactor 2 so the film can push in on a screen without
 * it going soft.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* Surfaces to film. `settle` is how long to let entrance motion and any
 * fail-soft network probes finish before the shutter — the dashboard animates
 * its KPI band in, and catching it mid-flight looks like a broken layout. */
const ONLY = (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '').split(',').filter(Boolean);

const ALL_SHOTS = [
  { name: 'dashboard',    path: '/dashboard.html',    w: 1600, h: 1000, settle: 4000 },
  { name: 'caisse-lock',  path: '/kiwi-caisse.html',  w: 1600, h: 1000, settle: 4000, keepLock: true },
  { name: 'serveur',      path: '/kiwi-serveur.html', w: 430,  h: 932,  settle: 3500 },
  { name: 'order',        path: '/kiwi-order.html',   w: 430,  h: 932,  settle: 3500 },
  { name: 'landing',      path: '/index.html',        w: 1600, h: 1000, settle: 3500 },

  /* The "one app, many trades" montage. Booted through the public
   * KiwiPosDispatch.unlockById() API — the same entry point the pairing module
   * uses to open a paired store's register — rather than by typing demo PINs
   * into the access field. */
  { name: 'pos-pharmacie',   path: '/kiwi-caisse.html', w: 1600, h: 1000, settle: 2500, vertical: 'pharmacie' },
  { name: 'pos-boulangerie', path: '/kiwi-caisse.html', w: 1600, h: 1000, settle: 2500, vertical: 'boulangerie' },
  { name: 'pos-boutique',    path: '/kiwi-caisse.html', w: 1600, h: 1000, settle: 2500, vertical: 'boutique' },
  { name: 'pos-coiffure',    path: '/kiwi-caisse.html', w: 1600, h: 1000, settle: 2500, vertical: 'coiffure' },
  { name: 'pos-gym',         path: '/kiwi-caisse.html', w: 1600, h: 1000, settle: 2500, vertical: 'gym' },
  { name: 'pos-fleuriste',   path: '/kiwi-caisse.html', w: 1600, h: 1000, settle: 2500, vertical: 'fleuriste' },
  { name: 'pos-hotel',       path: '/kiwi-caisse.html', w: 1600, h: 1000, settle: 2500, vertical: 'hotel' },
  { name: 'pos-epicerie',    path: '/kiwi-caisse.html', w: 1600, h: 1000, settle: 2500, vertical: 'epicerie' },

  /* The assistant, answering for real. The question deliberately carries no
   * period, because the deterministic scenario replies for the last 30 days —
   * asking "this week" and being answered "30 days" is honest but reads as a
   * mismatch on camera. */
  {
    name: 'ai', path: '/dashboard.html', w: 1600, h: 1000, settle: 4000,
    ask: "Quel est mon chiffre d'affaires ?",
  },
];

function args(argv) {
  const o = { base: 'http://localhost:4178', out: 'video/stills' };
  for (let i = 2; i < argv.length; i += 2) { const k = argv[i].replace(/^--/, ''); if (k in o) o[k] = argv[i + 1]; }
  return o;
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      const p = m.id != null && this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => { this.pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  /* DevTools Runtime.evaluate — not JS eval(); all expressions are literals from this file. */
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  }
}

const SHOTS = ONLY.length ? ALL_SHOTS.filter((s) => ONLY.includes(s.name)) : ALL_SHOTS;

const o = args(process.argv);
await mkdir(o.out, { recursive: true });

const port = 9401;
const profile = `/tmp/kiwi-shoot-${process.pid}`;
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
  '--force-color-profile=srgb', '--font-render-hinting=none', 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (const deadline = Date.now() + 20000; Date.now() < deadline;) {
  try {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    target = list.find((t) => t.type === 'page');
    if (target?.webSocketDebuggerUrl) break;
  } catch {}
  await sleep(150);
}
if (!target) { chrome.kill('SIGKILL'); throw new Error('Chrome did not start'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await once(ws, 'open');
const cdp = new CDP(ws);

try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  for (const s of SHOTS) {
    const url = o.base + s.path;
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: s.w, height: s.h, deviceScaleFactor: 2, mobile: s.w < 600,
    });
    await cdp.send('Page.navigate', { url });

    // Two things bite a fresh profile here. The service worker will happily
    // serve stale JS on localhost, silently filming an old build. And the
    // first-run onboarding overlay ("On met tout en place ensemble") fades in a
    // few seconds after load, so a slower shot gets the wizard instead of the
    // product. Clear one, pre-answer the other, then load for real.
    await sleep(1200);
    await cdp.evaluate(`(async () => {
      if (navigator.serviceWorker) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map((r) => r.unregister()));
      }
      if (window.caches) {
        const ks = await caches.keys();
        await Promise.all(ks.map((k) => caches.delete(k)));
      }
      // kiwiSkipOnboard, NOT kiwiOnboarded. The latter marks the venue as fully
      // configured, which flips the app to a real empty establishment ("Mon
      // établissement") and throws away the Café Atlas demo data we came to
      // film. This one only suppresses the auto-launch — same effect as the
      // overlay's own "Explorer la démo d'abord" button.
      try { localStorage.setItem('kiwiSkipOnboard', '1'); } catch (e) {}
      return 1;
    })()`).catch(() => {});
    await cdp.send('Page.reload', { ignoreCache: true });

    await sleep(s.settle);

    /* Suppressing onboarding drops the dashboard on its PIN lock. The lock
     * carries an explicit no-code "Entrer dans la démo" bypass ([data-kiwi-skip])
     * — a demo affordance the app itself removes on real deployments — so use
     * that rather than entering any code. caisse-lock keeps its lock on purpose:
     * that screen is the shot. */
    if (!s.keepLock) {
      await cdp.evaluate(`(() => {
        const b = document.querySelector('[data-kiwi-skip]');
        if (b && b.offsetParent !== null) { b.click(); return 'skipped'; }
        return 'none';
      })()`).catch(() => 'none');
      await sleep(1800);
    }

    if (s.vertical) {
      const booted = await cdp.evaluate(
        `(() => { const d = window.KiwiPosDispatch;
          if (!d || typeof d.unlockById !== 'function') return 'no-dispatch';
          d.unlockById(${JSON.stringify(s.vertical)});
          return 'ok'; })()`
      );
      if (booted !== 'ok') { console.log(`  ! ${s.name}: dispatch unavailable (${booted})`); }

      /* The module lazy-loads, plays a welcome splash, then mounts the till —
       * measured at roughly six seconds for pharmacie. Rather than trust one
       * vertical's timing for all fourteen, wait for the DOM to stop growing:
       * three identical samples of a substantial body means the till has
       * settled. Shooting early gets you a beautiful photo of a splash screen. */
      let last = -1, stable = 0, waited = 0;
      while (waited < 20000) {
        await sleep(500); waited += 500;
        const len = await cdp.evaluate('(document.body ? document.body.innerText.length : 0)').catch(() => 0);
        // 700, not 1500: the leanest tills (gym check-in) legitimately render
        // under 900 characters, and a threshold above that just burns the full
        // 20s timeout on every one of them.
        stable = (len === last && len > 700) ? stable + 1 : 0;
        last = len;
        if (stable >= 3) break;
      }
      if (stable < 3) console.log(`  ! ${s.name}: never settled (last innerText ${last} chars)`);
    }

    if (s.ask) {
      const asked = await cdp.evaluate(`(async () => {
        const btn = document.querySelector('[data-action="open-assistant"]');
        if (!btn) return 'no-button';
        btn.click();
        await new Promise((r) => setTimeout(r, 1600));
        const ta = document.querySelector('textarea.fa-input');
        if (!ta) return 'no-input';
        const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        set.call(ta, ${JSON.stringify(s.ask)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        await new Promise((r) => setTimeout(r, 3800));
        return document.querySelector('.fa-msg.agent') ? 'ok' : 'no-answer';
      })()`);
      if (asked !== 'ok') console.log(`  ! ${s.name}: assistant did not answer (${asked})`);
    }

    await cdp.evaluate('document.fonts.ready.then(() => 1)').catch(() => {});

    const title = await cdp.evaluate('document.title').catch(() => '');
    const visibleText = await cdp.evaluate(
      'document.body ? document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 160) : ""'
    ).catch(() => '');

    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = `${o.out}/${s.name}.png`;
    await writeFile(file, Buffer.from(data, 'base64'));
    console.log(`✓ ${s.name.padEnd(10)} ${String(s.w).padStart(4)}×${s.h}  "${title}"`);
    console.log(`  ${visibleText.slice(0, 120)}`);
  }
} finally {
  try { ws.close(); } catch {}
  chrome.kill('SIGKILL');
}
