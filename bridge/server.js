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
 * It also prints to a printer the computer ALREADY has installed (see the OS
 * spooler section below) — the case where the app's own transports cannot help,
 * because Windows owns the USB device and a USB printer has no IP.
 *
 * HTTP API (all JSON, CORS-open to the Kiwi origins):
 *   GET  /kiwi/ping            → { ok, name, version }              (detection)
 *   GET  /kiwi/printers        → { ok, platform, printers[], default }
 *   POST /kiwi/print           { printerIp, port?, dataB64 }        (raw ESC/POS over TCP)
 *                              { printerName, dataB64 }             (raw ESC/POS via the OS spooler)
 *                              → { ok, bytes, via } | 502 { ok:false, error }
 *
 * Security: binds to loopback (127.0.0.1) so nothing on the LAN can reach it; it
 * only ever *sends* to the printer IP the app hands it. Browsers treat
 * http://127.0.0.1 as a secure context, so an HTTPS page (kiwi-maroc.pages.dev)
 * may call it without mixed-content errors.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const http = require('http');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const NAME = 'kiwi-printer-bridge';
const VERSION = '1.2.0';
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

/* ── printing through the OS spooler (the printer Windows already owns) ───────
 *
 * Why this exists. The three transports in the app (Bluetooth, WebUSB, and this
 * bridge over TCP) all need Kiwi to reach the printer itself. On the commonest
 * setup in a Moroccan shop — a USB thermal printer on a Windows till, installed
 * the normal way — every one of them fails: `usbprint.sys` owns the device so
 * Chrome is refused the WebUSB claim, there is no Bluetooth, and a USB printer
 * has no IP for the TCP path above. The printer works perfectly for the rest of
 * Windows, and not at all for Kiwi.
 *
 * So we stop fighting the OS and hand the bytes to it. Both platforms have a
 * RAW passthrough that sends bytes to the printer untouched — no rendering, no
 * driver reinterpretation — which is exactly what ESC/POS needs: the cutter
 * still cuts and the cash drawer still kicks, unlike a browser print dialog.
 *
 *   Windows  winspool.drv OpenPrinter/StartDocPrinter(datatype "RAW")/WritePrinter,
 *            reached from PowerShell via Add-Type. This is Microsoft's own
 *            RawPrinterHelper recipe. PowerShell ships with Windows, so the
 *            bridge keeps its zero-dependency promise and still packages into a
 *            single binary — a native npm module would have broken both.
 *   macOS /   `lp -o raw`, i.e. CUPS' own passthrough.
 *   Linux
 *
 * Injection: the printer name comes from the browser, so it is never pasted into
 * a shell string. There is no shell at all (execFile/spawn with an argv array),
 * the name reaches PowerShell as an environment variable rather than as script
 * text, and it is checked against the real installed list before any of that. */

const OS_PRINT_TIMEOUT_MS = 15000;
const IS_WINDOWS = process.platform === 'win32';

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    execFile(cmd, args, Object.assign({ timeout: OS_PRINT_TIMEOUT_MS, windowsHide: true }, opts || {}),
      (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

/* Every installed printer, newest API first. Get-Printer is absent on older
 * boxes and Win32_Printer is absent on some hardened ones, so we try in order
 * and take the first that answers rather than assuming either exists. */
async function listPrinters() {
  if (IS_WINDOWS) {
    const ps = (script) => run('powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
    const attempts = [
      'Get-Printer | ForEach-Object { $_.Name }',
      'Get-CimInstance -ClassName Win32_Printer | ForEach-Object { $_.Name }',
      'Get-WmiObject -Class Win32_Printer | ForEach-Object { $_.Name }',
    ];
    for (const a of attempts) {
      const r = await ps(a);
      const names = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      if (names.length) return names;
    }
    return [];
  }
  // CUPS: "printer NAME is idle. enabled since…" — the queue name is field 2.
  const r = await run('lpstat', ['-p']);
  return r.stdout.split(/\r?\n/)
    .map((l) => (l.match(/^printer\s+(\S+)/) || [])[1])
    .filter(Boolean);
}

async function defaultPrinter() {
  if (IS_WINDOWS) {
    const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-Command', '(Get-CimInstance -ClassName Win32_Printer -Filter "Default=True").Name']);
    return r.stdout.trim() || '';
  }
  const r = await run('lpstat', ['-d']);           // "system default destination: NAME"
  return (r.stdout.match(/:\s*(\S+)/) || [])[1] || '';
}

// Microsoft's RawPrinterHelper, inlined. Reads the job off disk and hands it to
// the spooler with datatype RAW so the driver passes ESC/POS through untouched.
const WIN_RAW_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class KiwiRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);

  public static int Send(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("OpenPrinter: " + Marshal.GetLastWin32Error());
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "Kiwi"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di))
        throw new Exception("StartDocPrinter: " + Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(h))
          throw new Exception("StartPagePrinter: " + Marshal.GetLastWin32Error());
        IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
        int written = 0;
        try {
          Marshal.Copy(bytes, 0, p, bytes.Length);
          if (!WritePrinter(h, p, bytes.Length, out written))
            throw new Exception("WritePrinter: " + Marshal.GetLastWin32Error());
        } finally { Marshal.FreeCoTaskMem(p); }
        EndPagePrinter(h);
        return written;
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
$bytes = [System.IO.File]::ReadAllBytes($env:KIWI_DATA)
$n = [KiwiRaw]::Send($env:KIWI_PRINTER, $bytes)
Write-Output "KIWI_WROTE=$n"
`;

function winRawPrint(printerName, filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
      { windowsHide: true, env: Object.assign({}, process.env,
        // Never interpolated into the script text — PowerShell reads them as data.
        { KIWI_PRINTER: printerName, KIWI_DATA: filePath }) });
    let out = '', errOut = '', done = false;
    const timer = setTimeout(() => { if (!done) { try { child.kill(); } catch (_) {} } }, OS_PRINT_TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { errOut += d; });
    child.on('error', (e) => { if (done) return; done = true; clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      if (done) return; done = true; clearTimeout(timer);
      if (code === 0) return resolve(Number((out.match(/KIWI_WROTE=(\d+)/) || [])[1]) || 0);
      reject(new Error((errOut.trim() || out.trim() || ('powershell exited ' + code)).split(/\r?\n/)[0]));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(WIN_RAW_PS);
  });
}

/* Send the job to a printer the OS already has installed. Resolves with the
 * byte count; rejects with a message the panel can show as-is. */
async function sendToOsPrinter(printerName, buf) {
  /* Check against the live list first. It blocks a crafted name from ever
   * reaching PowerShell or lp, and it turns the ordinary failure — the queue was
   * renamed or deleted — into a sentence instead of a spooler error code. */
  const installed = await listPrinters();
  if (!installed.length) throw new Error('aucune imprimante installée sur cet ordinateur');
  if (installed.indexOf(printerName) === -1) {
    throw new Error('imprimante « ' + printerName + ' » introuvable — installées : ' + installed.join(', '));
  }

  /* The job goes via a file because that is what the spooler side reads. If the
   * temp folder isn't writable — TEMP unset under a service account, a locked-down
   * till — os.tmpdir() still returns a path, and the raw ENOENT that follows
   * ("undefined\\temp\\kiwi-….bin") tells the shop owner nothing. Fall back to the
   * bridge's own folder, and if that fails too, say the actual problem. */
  const stamp = 'kiwi-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.bin';
  let file = null;
  for (const dir of [os.tmpdir(), __dirname, process.cwd()]) {
    if (!dir || typeof dir !== 'string' || dir.indexOf('undefined') === 0) continue;
    try {
      const candidate = path.join(dir, stamp);
      await fs.promises.writeFile(candidate, buf);
      file = candidate;
      break;
    } catch (_) { /* try the next one */ }
  }
  if (!file) throw new Error('impossible d\'écrire le ticket dans un dossier temporaire sur cet ordinateur');
  try {
    if (IS_WINDOWS) return await winRawPrint(printerName, file);
    // CUPS: -o raw stops the driver from re-rendering the ESC/POS as text.
    const r = await run('lp', ['-d', printerName, '-o', 'raw', file]);
    if (r.err) throw new Error((r.stderr.trim() || r.err.message).split('\n')[0]);
    return buf.length;
  } finally {
    fs.promises.unlink(file).catch(() => {});   // never let a ticket linger in temp
  }
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

  /* The printers this computer already has. The app calls it to offer a list
   * instead of asking the owner to type a Windows queue name by hand — a name
   * they'd get subtly wrong ("EPSON TM-T20III Receipt" vs "…Receipt5") with no
   * way to tell why nothing printed. */
  if (req.method === 'GET' && url === '/kiwi/printers') {
    try {
      const [printers, def] = await Promise.all([listPrinters(), defaultPrinter()]);
      sendJson(res, 200, { ok: true, platform: process.platform, printers, default: def }, origin);
    } catch (e) {
      sendJson(res, 200, { ok: true, platform: process.platform, printers: [], default: '',
                           error: String((e && e.message) || e) }, origin);
    }
    return;
  }

  if (req.method === 'POST' && url === '/kiwi/print') {
    let body;
    try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
    catch (_) { return sendJson(res, 400, { ok: false, error: 'bad-json' }, origin); }

    const printerIp = String(body.printerIp || '').trim();
    const printerName = String(body.printerName || '').trim();
    const port = Number(body.port) || DEFAULT_PRINTER_PORT;
    const dataB64 = String(body.dataB64 || '');
    // One target or the other. Named printer wins when both are sent, because it
    // is the deliberate choice — an IP can linger in saved config from an
    // earlier setup and would silently outrank a printer picked just now.
    if (!printerIp && !printerName) {
      return sendJson(res, 400, { ok: false, error: 'printer-ip-or-name-required' }, origin);
    }
    if (!dataB64) return sendJson(res, 400, { ok: false, error: 'data-required' }, origin);

    let buf;
    try { buf = Buffer.from(dataB64, 'base64'); }
    catch (_) { return sendJson(res, 400, { ok: false, error: 'bad-base64' }, origin); }

    try {
      const bytes = printerName
        ? await sendToOsPrinter(printerName, buf)
        : await sendToPrinter(printerIp, port, buf);
      sendJson(res, 200, { ok: true, bytes, via: printerName ? 'os' : 'tcp' }, origin);
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
