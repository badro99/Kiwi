#!/usr/bin/env node
/**
 * render.mjs — deterministic frame renderer for the Kiwi film.
 *
 * Drives the system Chrome over the DevTools Protocol, steps a page's global
 * `seek(t)` one frame at a time, and pipes each PNG straight into ffmpeg's
 * stdin. Nothing touches the disk except the finished MP4.
 *
 * Deliberately dependency-free: Node 24 ships a global WebSocket, so this needs
 * no npm install and no build step — same bargain the rest of the repo makes.
 *
 *   node video/render.mjs --url file://…/film.html --out video/out/kiwi.mp4
 *
 * Determinism is the whole game here: the page must compute every visual from
 * the `t` it is handed, never from Date.now() or requestAnimationFrame. A page
 * that animates itself will tear across frames because capture is slower than
 * real time.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* ---------- args ---------- */

function args(argv) {
  const o = {
    url: null,
    out: 'video/out/kiwi.mp4',
    duration: 180,
    fps: 30,
    width: 1920,
    height: 1080,
    crf: 17,
    format: 'png',
    quality: 92,
    start: 0,
  };
  for (let i = 2; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in o)) throw new Error(`unknown flag --${k}`);
    const v = argv[i + 1];
    o[k] = typeof o[k] === 'number' ? Number(v) : v;
  }
  if (!o.url) throw new Error('--url is required');
  return o;
}

/* ---------- a very small CDP client ---------- */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const p = msg.id != null && this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else p.resolve(msg.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Run an expression inside the page via the DevTools `Runtime.evaluate`
   * command. This is not JavaScript's eval(): it crosses a socket into a
   * throwaway headless browser, and every caller below passes a string literal
   * written in this file. The only interpolated value in the whole renderer is
   * the frame timestamp, which comes from `Number.toFixed`. No caller-supplied
   * or file-sourced text ever reaches here.
   */
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`page threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    }
    return r.result?.value;
  }
}

/* ---------- chrome lifecycle ---------- */

async function launchChrome({ width, height }) {
  const port = 9500 + Math.floor(process.pid % 400);
  const profile = `/tmp/kiwi-film-profile-${process.pid}`;
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let stderr = '';
  chrome.stderr.on('data', (d) => { stderr += d.toString().slice(0, 2000); });

  // Wait for the debugging endpoint to answer.
  const deadline = Date.now() + 20000;
  let target = null;
  while (Date.now() < deadline) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === 'page');
      if (target?.webSocketDebuggerUrl) break;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  if (!target) {
    chrome.kill('SIGKILL');
    throw new Error(`Chrome never exposed a page target on :${port}\n${stderr}`);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await once(ws, 'open');
  return { chrome, ws, profile, cdp: new CDP(ws) };
}

/* ---------- main ---------- */

const o = args(process.argv);
const totalFrames = Math.round(o.duration * o.fps);

console.log(`▸ film   ${o.url}`);
console.log(`▸ output ${o.out}`);
console.log(`▸ ${o.width}×${o.height} · ${o.fps}fps · ${o.duration}s · ${totalFrames} frames · ${o.format}`);

await mkdir(dirname(o.out), { recursive: true });

const { chrome, ws, profile, cdp } = await launchChrome(o);

try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // Pin the viewport exactly, independent of the OS window we happened to get.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: o.width, height: o.height, deviceScaleFactor: 1, mobile: false,
  });

  // Force the page to count as active. A backgrounded page throttles timers,
  // stops serving animation frames, and never settles img.decode() — which
  // silently stalls readiness and can blank images mid-render.
  await cdp.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});

  await cdp.send('Page.navigate', { url: o.url });

  // Wait for load, webfonts, and the film's own ready flag. Fonts matter a lot:
  // capturing before they resolve bakes a fallback-font frame into the master.
  const ready = Date.now() + 45000;
  for (;;) {
    const state = await cdp.evaluate(
      `(async () => { await document.fonts.ready;
        return document.readyState + '|' + (window.__filmReady === true) + '|' + (window.__filmDuration || 0); })()`
    );
    const [doc, flag, dur] = String(state).split('|');
    if (doc === 'complete' && flag === 'true') {
      const declared = Number(dur);
      if (declared && Math.abs(declared - o.duration) > 0.5) {
        console.log(`▸ note: film declares ${declared}s, rendering ${o.duration}s as asked`);
      }
      break;
    }
    if (Date.now() > ready) throw new Error(`film never signalled __filmReady (readyState=${doc})`);
    await sleep(200);
  }

  if (await cdp.evaluate('typeof window.seek') !== 'function') {
    throw new Error('page does not expose a global seek(t) — cannot render deterministically');
  }

  /* ---------- ffmpeg ---------- */

  const decoder = o.format === 'png' ? 'png' : 'mjpeg';
  const ff = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', decoder,
    '-framerate', String(o.fps),
    '-i', '-',
    // A silent stereo track. The master is deliberately mute so the founders
    // can record over it, but a file with no audio stream at all confuses some
    // players and upload pipelines, and gives their voiceover nothing to
    // replace. `-shortest` keeps it exactly as long as the picture.
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', String(o.crf),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    '-r', String(o.fps),
    o.out,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });

  let ffErr = '';
  ff.stderr.on('data', (d) => { ffErr += d.toString(); if (ffErr.length > 40000) ffErr = ffErr.slice(-20000); });
  const ffDone = once(ff, 'close');
  ff.stdin.on('error', () => { /* reported via close code */ });

  /* ---------- the frame loop ---------- */

  const shotOpts = o.format === 'png'
    ? { format: 'png', captureBeyondViewport: false }
    : { format: 'jpeg', quality: o.quality, captureBeyondViewport: false };

  const t0 = Date.now();
  let bytes = 0;

  for (let f = 0; f < totalFrames; f++) {
    const t = o.start + f / o.fps;
    await cdp.evaluate(`(async () => { const r = window.seek(${t.toFixed(6)}); if (r && r.then) await r; return 1; })()`);

    const { data } = await cdp.send('Page.captureScreenshot', shotOpts);
    const buf = Buffer.from(data, 'base64');
    bytes += buf.length;

    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');

    if (f % 60 === 0 || f === totalFrames - 1) {
      const done = f + 1;
      const el = (Date.now() - t0) / 1000;
      const rate = done / el;
      const eta = Math.max(0, Math.round((totalFrames - done) / (rate || 1)));
      process.stdout.write(
        `\r  ${String(done).padStart(5)}/${totalFrames}  ${(100 * done / totalFrames).toFixed(1).padStart(5)}%  ` +
        `${rate.toFixed(1)} fps  eta ${Math.floor(eta / 60)}m${String(eta % 60).padStart(2, '0')}s   `
      );
    }
  }

  ff.stdin.end();
  const [code] = await ffDone;
  process.stdout.write('\n');
  if (code !== 0) throw new Error(`ffmpeg exited ${code}\n${ffErr.slice(-3000)}`);

  const secs = (Date.now() - t0) / 1000;
  console.log(`✓ ${o.out} — ${totalFrames} frames in ${Math.floor(secs / 60)}m${String(Math.round(secs % 60)).padStart(2, '0')}s ` +
              `(${(bytes / 1e6).toFixed(0)} MB piped)`);
} finally {
  try { ws.close(); } catch {}
  chrome.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
