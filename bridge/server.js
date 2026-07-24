#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Printer Bridge — the local helper that lets the Kiwi web app print to a
 * networked thermal printer.
 *
 * The browser cannot open a raw TCP socket to a printer at 192.168.x.x:9100, so
 * this tiny service runs on the counter computer, listens on 127.0.0.1 only, and
 * relays ESC/POS jobs it receives from the Kiwi app to the printer over TCP.
 *
 * Zero dependencies — Node's built-in `http` + `net` only, so it packages into a
 * single self-contained binary (see package.json → `pkg`) with no npm install.
 *
 * HTTP API (all JSON, CORS-open to the Kiwi origins):
 *   GET  /kiwi/ping            → { ok, name, version }              (detection)
 *   POST /kiwi/print           { printerIp, port?, dataB64 }        (raw ESC/POS)
 *                              → { ok, bytes } | 502 { ok:false, error }
 *
 * Security: binds to loopback (127.0.0.1) so nothing on the LAN can reach it; it
 * only ever *sends* to the printer IP the app hands it. Browsers treat
 * http://127.0.0.1 as a secure context, so an HTTPS page (kiwi-maroc.pages.dev)
 * may call it without mixed-content errors.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const http = require('http');
const net = require('net');

const NAME = 'kiwi-printer-bridge';
const VERSION = '1.1.0';
const HOST = '127.0.0.1';
const PORT = Number(process.env.KIWI_BRIDGE_PORT) || 9110; // bridge's own port
const DEFAULT_PRINTER_PORT = 9100;                          // RAW/JetDirect
const PRINT_TIMEOUT_MS = 8000;

// Origins allowed to drive the bridge. '*' would also work for a loopback-only
// service, but echoing the specific Kiwi origins is tighter.
const ALLOW_ORIGINS = [
  'https://kiwi-maroc.pages.dev',
  'https://app.kiwi.ma',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

function corsHeaders(origin) {
  const allow = ALLOW_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOW_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // Chrome Private Network Access: a public HTTPS page → loopback needs this.
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  };
}

function sendJson(res, status, obj, origin) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign(
    { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    corsHeaders(origin)
  ));
  res.end(body);
}

// Relay a buffer of ESC/POS bytes to printerIp:port over a raw TCP socket.
function sendToPrinter(printerIp, port, buf) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (err) => {
      if (settled) return; settled = true;
      try { socket.destroy(); } catch (_) {}
      err ? reject(err) : resolve(buf.length);
    };
    socket.setTimeout(PRINT_TIMEOUT_MS);
    socket.on('timeout', () => finish(new Error('printer timeout')));
    socket.on('error', (e) => finish(e));
    socket.connect(port, printerIp, () => {
      socket.write(buf, () => {
        // Give the printer a beat to drain, then close cleanly.
        socket.end(() => finish(null));
      });
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const url = (req.url || '').split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (req.method === 'GET' && url === '/kiwi/ping') {
    sendJson(res, 200, { ok: true, name: NAME, version: VERSION }, origin);
    return;
  }

  if (req.method === 'POST' && url === '/kiwi/print') {
    let body;
    try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
    catch (_) { return sendJson(res, 400, { ok: false, error: 'bad-json' }, origin); }

    const printerIp = String(body.printerIp || '').trim();
    const port = Number(body.port) || DEFAULT_PRINTER_PORT;
    const dataB64 = String(body.dataB64 || '');
    if (!printerIp) return sendJson(res, 400, { ok: false, error: 'printer-ip-required' }, origin);
    if (!dataB64) return sendJson(res, 400, { ok: false, error: 'data-required' }, origin);

    let buf;
    try { buf = Buffer.from(dataB64, 'base64'); }
    catch (_) { return sendJson(res, 400, { ok: false, error: 'bad-base64' }, origin); }

    try {
      const bytes = await sendToPrinter(printerIp, port, buf);
      sendJson(res, 200, { ok: true, bytes }, origin);
    } catch (e) {
      sendJson(res, 502, { ok: false, error: String((e && e.message) || e) }, origin);
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'not-found' }, origin);
});

/* On a shop's Windows till this is launched by double-click, so a process that
 * exits takes its console window with it — the owner sees a flash and nothing
 * else, and the app just says "pont non détecté". Two rules follow:
 *   1. never die on a busy port; walk up the range the app already scans;
 *   2. never exit silently — if we truly cannot start, hold the window open so
 *      the reason stays readable.
 * An explicit KIWI_BRIDGE_PORT is honoured exactly, with no fallback: if the
 * shop pinned a port, moving to another one would just hide a problem. */
const PORT_CANDIDATES = process.env.KIWI_BRIDGE_PORT
  ? [PORT]
  : [9110, 9111, 9112, 9113, 9114];

// Keep the console readable when started by double-click; exit at once when it
// isn't a terminal (Startup folder, service wrapper) so nothing hangs forever.
function holdOpen(code) {
  if (process.stdin.isTTY) {
    console.error('\nAppuyez sur une touche pour fermer cette fenêtre…');
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', () => process.exit(code));
      return;
    } catch (_) { /* fall through to a plain exit */ }
  }
  process.exit(code);
}

let attempt = 0;
function tryListen() {
  const port = PORT_CANDIDATES[attempt];

  /* Both handlers are removed as soon as one of them wins. Without that, each
   * failed attempt leaves its 'listening' callback attached, and when a later
   * port finally binds EVERY stale callback fires too — so the window announced
   * the FIRST port tried while actually serving on another. A shop owner reading
   * "listening on 9110" while Kiwi talks to 9112 is a support call we don't want. */
  const onError = (e) => {
    server.removeListener('listening', onListening);
    if (e && e.code === 'EADDRINUSE' && attempt < PORT_CANDIDATES.length - 1) {
      console.log(`Port ${port} occupé, essai sur ${PORT_CANDIDATES[attempt + 1]}…`);
      attempt++;
      setImmediate(tryListen);
      return;
    }
    console.error('Le pont n\'a pas pu démarrer :', (e && e.message) || e);
    if (e && e.code === 'EADDRINUSE') {
      console.error(`Le port ${port} est déjà utilisé — le pont tourne peut-être déjà dans une autre fenêtre.`);
      console.error('Fermez l\'autre fenêtre, ou lancez celle-ci avec un autre port :');
      console.error('    set KIWI_BRIDGE_PORT=9115 && kiwi-printer-bridge-win.exe');
    }
    holdOpen(1);
  };
  const onListening = () => {
    server.removeListener('error', onError);
    console.log(`${NAME} v${VERSION} listening on http://${HOST}:${port}`);
    console.log('Laissez cette fenêtre ouverte. Elle relaie les impressions Kiwi vers votre imprimante.');
    if (port !== PORT_CANDIDATES[0]) {
      console.log(`(Port ${PORT_CANDIDATES[0]} occupé — Kiwi cherche automatiquement jusqu'à ${PORT_CANDIDATES[PORT_CANDIDATES.length - 1]}.)`);
    }
  };

  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(port, HOST);
}
tryListen();

// A crash must not vanish the window either.
process.on('uncaughtException', (e) => {
  console.error('Erreur inattendue :', (e && e.stack) || e);
  holdOpen(1);
});
