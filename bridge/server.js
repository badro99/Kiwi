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
 *                              → { ok, bytes, via, timing? } | 502 { ok:false, error }
 *   POST /kiwi/wake            { printerIp, port? }                 (probe & pre-warm socket)
 *   GET  /kiwi/relay           → { ok, paired, merchant, name, online, lastPollTs, lastError }
 *   POST /kiwi/relay/pair      { code }  → échange le code d'appairage contre un jeton (relais cloud)
 *   POST /kiwi/relay/unpair    → oublie le jeton
 *   GET  /                     → la petite page locale du pont (état + appairage du relais)
 *
 * Relais cloud (v1.4) : un iPad n'a ni pont local, ni Web Bluetooth, ni WebUSB.
 * Sa caisse dépose donc ses tickets sur kiwi-os.com (/api/print/jobs) et CE pont,
 * une fois appairé, vient les chercher toutes les secondes (sortant uniquement —
 * rien n'écoute sur le réseau de la boutique) et les pousse à l'imprimante
 * réseau ou système exactement comme un job local. Le jeton est gardé dans
 * ~/.kiwi-printer-bridge.json, jamais affiché.
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
const VERSION = '1.4.4';
const HOST = '127.0.0.1';
const PORT = Number(process.env.KIWI_BRIDGE_PORT) || 9110; // bridge's own port
const DEFAULT_PRINTER_PORT = 9100;                          // RAW/JetDirect
const PRINT_TIMEOUT_MS = 8000;

/* ── Relais cloud ─────────────────────────────────────────────────────────────
 * Le pont ne reçoit rien de l'extérieur : il INTERROGE kiwi-os.com avec son
 * jeton porteur et imprime ce qu'on lui rend. Zéro dépendance : http/https
 * natifs (pas de fetch — Node 18 l'annonce encore comme expérimental dans la
 * console du commerçant). */
const https = require('https');
const RELAY_URL = (process.env.KIWI_RELAY_URL || 'https://kiwi-os.com').replace(/\/+$/, '');
const RELAY_POLL_MS = 1000;
const RELAY_POLL_TIMEOUT_MS = 3000;
const RELAY_BACKOFF_MAX_MS = 3000;
const RELAY_HTTP_TIMEOUT_MS = 12000;
const CONFIG_PATH = process.env.KIWI_BRIDGE_CONFIG
  || path.join(os.homedir && os.homedir() ? os.homedir() : process.cwd(), '.kiwi-printer-bridge.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {}; } catch (_) { return {}; }
}
function writeConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 }); return true; }
  catch (e) { console.error('Impossible d\'écrire la configuration du pont :', (e && e.message) || e); return false; }
}

/* Une requête JSON minimale, http ou https selon l'URL (les tests pointent
 * KIWI_RELAY_URL sur un serveur local). Résout toujours { status, json }. */
function httpJson(method, url, headers, body, timeoutMs) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (_) { return resolve({ status: 0, json: null, error: 'bad-url' }); }
    const mod = u.protocol === 'https:' ? https : http;
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = mod.request({
      method, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: Object.assign({ 'Accept': 'application/json', 'User-Agent': NAME + '/' + VERSION },
        payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}, headers || {}),
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let j = null; try { j = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode || 0, json: j });
      });
    });
    req.setTimeout(Number(timeoutMs) || RELAY_HTTP_TIMEOUT_MS, () => { try { req.destroy(new Error('timeout')); } catch (_) {} });
    req.on('error', (e) => resolve({ status: 0, json: null, error: (e && e.message) || String(e) }));
    if (payload) req.write(payload);
    req.end();
  });
}

const relay = {
  cfg: readConfig(),
  timer: null,
  running: false,
  online: false,        // le dernier poll a répondu 200
  lastPollTs: 0,
  lastJobTs: 0,
  lastError: '',
  printed: 0,
  failed: 0,
};
function relayPaired() { return !!(relay.cfg && relay.cfg.relay && relay.cfg.relay.token); }
function relayStatus() {
  const r = (relay.cfg && relay.cfg.relay) || {};
  return {
    ok: true, paired: relayPaired(), merchant: r.merchant || '', name: r.name || '', bridgeId: r.bridgeId || '',
    url: RELAY_URL, online: relay.online, lastPollTs: relay.lastPollTs, lastJobTs: relay.lastJobTs,
    lastError: relay.lastError, printed: relay.printed, failed: relay.failed, version: VERSION,
    lastTiming: lastPrintTiming,
  };
}
function relayLog(msg) { console.log('[relais] ' + msg); }

/* Échange un code à 6 chiffres (émis dans Kiwi → Imprimantes → Relais) contre
 * le jeton de CE pont. Le nom affiché côté Kiwi est celui de la machine. */
async function relayPair(code, name) {
  code = String(code || '').replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) return { ok: false, error: 'code-invalide' };
  const r = await httpJson('POST', RELAY_URL + '/api/print/bridges', null, {
    action: 'redeem', code, name: name || os.hostname() || 'Pont d\'impression',
    platform: process.platform, version: VERSION,
  });
  if (r.status === 200 && r.json && r.json.ok && r.json.token) {
    const cfg = readConfig();
    cfg.relay = { token: r.json.token, merchant: r.json.merchant, name: r.json.name, bridgeId: r.json.bridgeId, at: Date.now() };
    if (writeConfig(cfg)) {
      relay.cfg = cfg;
      relayLog('associé à ' + r.json.merchant + ' (' + (r.json.bridgeId || 'nouveau') + ').');
      relayStart();
      return { ok: true, merchant: r.json.merchant };
    }
    return { ok: false, error: 'ecriture-config-impossible' };
  }
  return { ok: false, error: (r.json && r.json.error) || 'erreur-serveur' };
}
function relayUnpair() {
  const cfg = readConfig();
  delete cfg.relay;
  writeConfig(cfg);
  relay.cfg = cfg;
  relay.online = false;
  if (relay.timer) { clearTimeout(relay.timer); relay.timer = null; }
  relayLog('désappairé.');
}

async function relayPrintJob(job) {
  const t = job.target || {};
  if (job.kind === 'wake') {
    if (t.ip) {
      warmPrinterNow(String(t.ip), Number(t.port) || DEFAULT_PRINTER_PORT).catch(() => {});
    }
    return 0;
  }
  const buf = Buffer.from(String(job.dataB64 || ''), 'base64');
  if (!buf.length) throw new Error('ticket vide');
  if (t.osPrinter) return sendToOsPrinter(String(t.osPrinter), buf);
  if (t.ip) return sendToPrinter(String(t.ip), Number(t.port) || DEFAULT_PRINTER_PORT, buf);
  throw new Error('cible inconnue');
}

let relayBackoff = RELAY_POLL_MS;
async function relayTick() {
  relay.timer = null;
  if (!relayPaired() || relay.running) return;
  relay.running = true;
  let next = RELAY_POLL_MS;
  try {
    const auth = { Authorization: 'Bearer ' + relay.cfg.relay.token };
    /* A stalled idle poll must not block a newly queued ticket for the generic
     * 12 s API timeout. Pairing and acknowledgements keep that generous limit;
     * the one-second operational poll gets a tight recovery window. */
    const r = await httpJson('GET', RELAY_URL + '/api/print/jobs', auth, null, RELAY_POLL_TIMEOUT_MS);
    relay.lastPollTs = Date.now();
    if (r.status === 401) {
      /* Révoqué depuis Kiwi. Trois refus de suite avant d'oublier le jeton :
       * un seul 401 peut être un déploiement en cours, et un pont qui se
       * désappaire tout seul au fond du comptoir est une panne silencieuse. */
      relay.unauthorized = (relay.unauthorized || 0) + 1;
      relay.online = false; relay.lastError = 'jeton refusé par kiwi-os.com';
      if (relay.unauthorized >= 3) {
        relay.lastError = 'jeton révoqué · ré-appairez ce pont depuis Kiwi';
        relayLog(relay.lastError);
        relayUnpair();
        relay.running = false;
        return;
      }
      relay.running = false;
      relay.timer = setTimeout(relayTick, 2000);
      return;
    }
    relay.unauthorized = 0;
    if (r.status !== 200 || !r.json || !r.json.ok) {
      relay.online = false;
      relay.lastError = (r.json && r.json.error) || r.error || ('http-' + r.status);
      relayBackoff = Math.min(RELAY_BACKOFF_MAX_MS, Math.round(relayBackoff * 1.8));
      next = relayBackoff;
    } else {
      if (!relay.online) relayLog('connecté à ' + RELAY_URL + (relay.lastError ? ' (rétabli)' : ''));
      relay.online = true; relay.lastError = ''; relayBackoff = RELAY_POLL_MS;
      const jobs = Array.isArray(r.json.jobs) ? r.json.jobs : [];
      for (const job of jobs) {
        let ack;
        try {
          const bytes = await relayPrintJob(job);
          relay.printed++; relay.lastJobTs = Date.now();
          ack = Object.assign({ action: 'ack', id: job.id, ok: true, bytes }, lastPrintTiming ? { timing: lastPrintTiming } : {});
          relayLog('imprimé ' + (job.kind || 'ticket') + ' (' + bytes + ' o) → ' + (job.target && (job.target.ip || job.target.osPrinter)));
        } catch (e) {
          relay.failed++;
          ack = Object.assign({ action: 'ack', id: job.id, ok: false, error: String((e && e.message) || e).slice(0, 300) }, lastPrintTiming ? { timing: lastPrintTiming } : {});
          relayLog('échec ' + (job.kind || 'ticket') + ' : ' + ack.error);
        }
        await httpJson('POST', RELAY_URL + '/api/print/jobs', auth, ack);
      }
      next = Number(r.json.poll) > 0 ? Math.max(200, Math.min(5000, Number(r.json.poll))) : RELAY_POLL_MS;
    }
  } catch (e) {
    relay.online = false; relay.lastError = String((e && e.message) || e);
  }
  relay.running = false;
  if (relayPaired()) relay.timer = setTimeout(relayTick, next);
}
function relayStart() {
  if (!relayPaired() || relay.timer || relay.running) return;
  relay.timer = setTimeout(relayTick, 10);
}

/* La page locale du pont (http://127.0.0.1:9110/). Pas de framework, pas de
 * valeur dynamique injectée dans le HTML : la page lit /kiwi/relay en JSON. */
const LOCAL_PAGE = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kiwi Printer Bridge</title>
<style>
body{margin:0;font:15px/1.5 -apple-system,"Segoe UI",Inter,system-ui,sans-serif;background:#F7F5F0;color:#0A0F0D}
main{max-width:560px;margin:40px auto;padding:0 20px}
h1{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0 0 4px}
.sub{color:#5b6660;margin:0 0 22px}
.card{background:#fff;border:1px solid #e4e1da;border-radius:14px;padding:18px 20px;margin-bottom:14px}
.row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #f0ede6}.row:last-child{border-bottom:0}
.k{color:#5b6660}.v{font-weight:600;text-align:right}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#c9c4ba;margin-right:7px;vertical-align:middle}.on .dot{background:#0B6E4F;box-shadow:0 0 0 4px rgba(11,110,79,.15)}
input{font:inherit;font-size:22px;letter-spacing:.25em;width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d6d2c9;border-radius:10px;text-align:center}
button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:11px 16px;cursor:pointer}
.p{background:#0B6E4F;color:#F7F5F0}.g{background:#e9e6df;color:#0A0F0D;margin-left:8px}
.note{font-size:13px;color:#5b6660;margin:10px 0 0}.err{color:#9b2c2c}.ok{color:#0B6E4F}
code{background:#efece5;padding:1px 6px;border-radius:6px}
</style>
<main>
<h1>Kiwi Printer Bridge</h1>
<p class="sub">Ce pont relaie les impressions Kiwi vers votre imprimante. Laissez-le tourner.</p>
<div class="card" id="st">
 <div class="row"><span class="k">Pont local</span><span class="v"><span class="dot"></span><span id="v-local">actif</span></span></div>
 <div class="row"><span class="k">Relais cloud</span><span class="v" id="v-relay-wrap"><span class="dot"></span><span id="v-relay">·</span></span></div>
 <div class="row"><span class="k">Commerce</span><span class="v" id="v-merchant">·</span></div>
 <div class="row"><span class="k">Tickets imprimés</span><span class="v" id="v-printed">0</span></div>
 <div class="row"><span class="k">Dernier contact</span><span class="v" id="v-last">·</span></div>
 <p class="note err" id="v-err" hidden></p>
</div>
<div class="card" id="pairbox">
 <b>Imprimer depuis un iPad ou une tablette</b>
 <p class="note">Dans Kiwi, ouvrez <b>Imprimantes → Relais Kiwi → Associer un pont</b> : un code à 6 chiffres s’affiche. Tapez-le ici.</p>
 <form id="f"><input id="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" autocomplete="off" aria-label="Code d’appairage">
 <p style="margin:12px 0 0"><button class="p" type="submit">Associer ce pont</button><button class="g" type="button" id="unpair" hidden>Dissocier</button></p></form>
 <p class="note" id="msg"></p>
</div>
<p class="note">Imprimantes réseau ou déjà installées sur cet ordinateur. Version <span id="v-ver"></span> · <code id="v-url"></code></p>
</main>
<script>
(function(){
 var $=function(id){return document.getElementById(id)};
 function ago(ts){if(!ts)return'·';var s=Math.round((Date.now()-ts)/1000);return s<2?'à l’instant':s<60?'il y a '+s+' s':'il y a '+Math.round(s/60)+' min'}
 function paint(j){
  $('v-ver').textContent=j.version||'';$('v-url').textContent=j.url||'';
  $('v-merchant').textContent=j.merchant||'·';$('v-printed').textContent=String(j.printed||0);
  $('v-last').textContent=ago(j.lastPollTs);
  var w=$('v-relay-wrap');w.className='v'+(j.paired&&j.online?' on':'');
  $('v-relay').textContent=!j.paired?'non appairé':(j.online?'connecté':'en attente de kiwi-os.com…');
  $('v-err').hidden=!j.lastError;$('v-err').textContent=j.lastError||'';
  $('unpair').hidden=!j.paired;$('code').disabled=!!j.paired;
  $('f').querySelector('button.p').hidden=!!j.paired;
  $('st').className='card'+(j.paired&&j.online?' on':'');
 }
 function refresh(){fetch('/kiwi/relay',{cache:'no-store'}).then(function(r){return r.json()}).then(paint).catch(function(){})}
 $('f').addEventListener('submit',function(e){e.preventDefault();var c=$('code').value.replace(/\\D/g,'');if(c.length!==6){$('msg').textContent='Le code fait 6 chiffres.';return}
  $('msg').className='note';$('msg').textContent='Vérification…';
  fetch('/kiwi/relay/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:c})}).then(function(r){return r.json()}).then(function(j){
   if(j.ok){$('msg').className='note ok';$('msg').textContent='Pont associé au commerce « '+(j.merchant||'')+' ». Les tickets de l’iPad sortiront ici.';$('code').value=''}
   else{$('msg').className='note err';$('msg').textContent=j.error==='invalid_or_expired'?'Code invalide ou expiré · regénérez-le dans Kiwi.':j.error==='too_many_attempts'?'Trop d’essais · patientez quelques minutes.':j.error==='relay-not-provisioned'?'Le relais n’est pas encore activé côté Kiwi.':'Échec : '+(j.error||'inconnu')}
   refresh();
  }).catch(function(){$('msg').className='note err';$('msg').textContent='Le pont ne répond pas.'});
 });
 $('unpair').addEventListener('click',function(){if(!confirm('Dissocier ce pont du relais Kiwi ?'))return;fetch('/kiwi/relay/unpair',{method:'POST'}).then(refresh)});
 refresh();setInterval(refresh,2000);
})();
</script></html>`;

// Origins allowed to drive the bridge. '*' would also work for a loopback-only
// service, but echoing the specific Kiwi origins is tighter.
const ALLOW_ORIGINS = [
  'https://kiwi-maroc.pages.dev',
  'https://kiwi-os.com',
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

/* Keep the RAW channel alive after a real ticket. Several inexpensive network
 * printers put their interface to sleep as soon as the client closes port 9100;
 * the next connect can then take 15-20 seconds, while every following ticket is
 * instant. DLE EOT 1 (0x10 0x04 0x01) queries printer status in real time and
 * prompts an immediate 1-byte response without feeding paper, ensuring the Wi-Fi
 * radio and print engine stay active and giving a concrete readiness probe. */
const PRINTER_KEEPALIVE_MS = Number(process.env.KIWI_PRINTER_KEEPALIVE_MS)
  || Number(readConfig().printerKeepaliveMs)
  || 10000;
// Une journée couvrait la fermeture de nuit mais pas le jour de fermeture
// hebdomadaire ni un week-end prolongé : au retour, le premier ticket repayait
// le réveil. Sept jours couvrent toute fermeture réaliste ; au-delà, on cesse
// de sonder une imprimante vraisemblablement démontée.
const PRINTER_WARM_WINDOW_MS = Number(process.env.KIWI_PRINTER_WARM_WINDOW_MS)
  || Number(readConfig().printerWarmWindowMs)
  || 7 * 24 * 60 * 60 * 1000;
// Une imprimante éteinte fait échouer chaque sonde. Sur une fenêtre longue,
// insister toutes les 10 s ne réveille personne et coûte une connexion morte
// par cycle : on s'espace jusqu'à 5 min, et on revient à 10 s dès qu'elle répond.
const PRINTER_WARM_BACKOFF_MAX_MS = 5 * 60 * 1000;
const PRINTER_WAKE_BYTES = Buffer.from([0x1b, 0x40]);        // ESC @
const PRINTER_PROBE_BYTES = Buffer.from([0x10, 0x04, 0x01]); // DLE EOT 1: real-time status request
const PRINTER_PROBE_TIMEOUT_MS = 2500;
const printerChannels = new Map();
const printerWrites = new Map();
const printerWarmers = new Map();
let lastPrintTiming = null;

function printerKey(printerIp, port) { return String(printerIp) + ':' + Number(port); }

/* The warm loop above only exists once a real ticket has named a target: the
 * printer's address arrives with each job, it is never read from config. So a
 * bridge that just restarted — the Mac rebooted, the LaunchAgent recycled, the
 * Termux box was unplugged overnight — knows no printer, warms nothing, and the
 * first ticket of the service pays the full 15-20 s wake again. Remembering the
 * last raw target lets the loop resume at boot, before anyone orders.
 * Throttled: a busy till must not write the config file once per ticket. */
const PRINTER_WARM_PERSIST_MS = 5 * 60 * 1000;
let warmPersistedAt = 0;

function rememberWarmTarget(printerIp, port) {
  const now = Date.now();
  if (now - warmPersistedAt < PRINTER_WARM_PERSIST_MS) return;
  const cfg = readConfig();
  const saved = cfg.warmPrinter;
  if (saved && saved.ip === printerIp && Number(saved.port) === Number(port)
      && now - Number(saved.at || 0) < PRINTER_WARM_PERSIST_MS) return;
  cfg.warmPrinter = { ip: String(printerIp), port: Number(port), at: now };
  if (writeConfig(cfg)) warmPersistedAt = now;
}

function closePrinterChannel(key, channel) {
  if (printerChannels.get(key) === channel) printerChannels.delete(key);
  try { channel.socket.destroy(); } catch (_) {}
}

function probePrinterChannel(channel) {
  return new Promise((resolve) => {
    if (!channel || !channel.socket || channel.socket.destroyed || !channel.socket.writable) {
      return resolve(false);
    }
    let settled = false;
    const timer = setTimeout(() => finish(false), PRINTER_PROBE_TIMEOUT_MS);
    const onData = () => finish(true);
    const onEnd = () => finish(false);
    const onError = () => finish(false);
    function finish(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        channel.socket.removeListener('data', onData);
        channel.socket.removeListener('end', onEnd);
        channel.socket.removeListener('error', onError);
      } catch (_) {}
      if (!ok) {
        closePrinterChannel(channel.key, channel);
      } else {
        channel.lastWriteAt = Date.now();
      }
      resolve(ok);
    }
    channel.socket.once('data', onData);
    channel.socket.once('end', onEnd);
    channel.socket.once('error', onError);
    channel.socket.write(PRINTER_PROBE_BYTES, (err) => {
      if (err) finish(false);
    });
  });
}

function openPrinterChannel(printerIp, port) {
  const key = printerKey(printerIp, port);
  const current = printerChannels.get(key);
  if (current && current.socket && !current.socket.destroyed && current.socket.writable) {
    current.lastReused = true;
    current.lastConnectMs = 0;
    return Promise.resolve(current);
  }
  if (current) closePrinterChannel(key, current);
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const socket = new net.Socket();
    const channel = { key, printerIp, port, socket, lastReused: false, lastConnectMs: 0, lastWriteAt: 0 };
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch (_) {}
      reject(error);
    };
    socket.setTimeout(PRINT_TIMEOUT_MS);
    socket.once('timeout', () => fail(new Error('printer timeout')));
    socket.once('error', fail);
    socket.connect(port, printerIp, () => {
      if (settled) return;
      settled = true;
      channel.lastConnectMs = Date.now() - t0;
      channel.lastReused = false;
      socket.setTimeout(0);
      try { socket.setKeepAlive(true, PRINTER_KEEPALIVE_MS); } catch (_) {}
      socket.removeListener('error', fail);
      socket.on('error', () => closePrinterChannel(key, channel));
      socket.on('close', () => {
        if (printerChannels.get(key) === channel) printerChannels.delete(key);
      });
      printerChannels.set(key, channel);
      resolve(channel);
    });
  });
}

function writePrinterChannel(channel, buf) {
  return new Promise((resolve, reject) => {
    if (!channel.socket || channel.socket.destroyed || !channel.socket.writable) {
      reject(new Error('printer connection closed'));
      return;
    }
    const t0 = Date.now();
    let settled = false;
    const timer = setTimeout(() => finish(new Error('printer timeout')), PRINT_TIMEOUT_MS);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        closePrinterChannel(channel.key, channel);
        reject(error);
      } else {
        const writeMs = Date.now() - t0;
        const idleMs = channel.lastWriteAt ? (Date.now() - channel.lastWriteAt) : 0;
        channel.lastWriteAt = Date.now();
        lastPrintTiming = {
          connectMs: channel.lastConnectMs || 0,
          writeMs,
          reused: !!channel.lastReused,
          idleMs,
          totalMs: (channel.lastConnectMs || 0) + writeMs,
          target: channel.key,
          at: Date.now(),
        };
        resolve(buf.length);
      }
    };
    channel.socket.write(buf, (error) => finish(error || null));
  });
}

function warmPrinterNow(printerIp, port) {
  const key = printerKey(printerIp, port);
  const previous = printerWrites.get(key) || Promise.resolve();
  const task = previous.catch(() => {})
    .then(() => openPrinterChannel(printerIp, port))
    .then((channel) => probePrinterChannel(channel))
    .then((alive) => {
      if (alive) return true;
      // La sonde a échoué : on retente une ouverture franche. Réussir ici veut
      // dire que le canal était mort, pas l'imprimante.
      return openPrinterChannel(printerIp, port).then(() => true, () => false);
    });
  printerWrites.set(key, task.catch(() => {}));
  return task;
}

function schedulePrinterWarm(printerIp, port, realTicket) {
  const key = printerKey(printerIp, port);
  const state = printerWarmers.get(key) || { lastRealAt: 0, timer: null, misses: 0 };
  if (realTicket) { state.lastRealAt = Date.now(); state.misses = 0; rememberWarmTarget(printerIp, port); }
  if (state.timer) clearTimeout(state.timer);
  if (!state.lastRealAt || Date.now() - state.lastRealAt > PRINTER_WARM_WINDOW_MS) {
    printerWarmers.delete(key);
    return;
  }
  const delay = Math.min(PRINTER_KEEPALIVE_MS * Math.pow(2, state.misses || 0), PRINTER_WARM_BACKOFF_MAX_MS);
  state.timer = setTimeout(() => {
    state.timer = null;
    const record = (alive) => {
      const live = printerWarmers.get(key);
      if (live) live.misses = alive ? 0 : (live.misses || 0) + 1;
      schedulePrinterWarm(printerIp, port, false);
    };
    warmPrinterNow(printerIp, port).then(record, () => record(false));
  }, delay);
  printerWarmers.set(key, state);
}

function resumePrinterWarm() {
  const saved = readConfig().warmPrinter;
  if (!saved || !saved.ip) return;
  const at = Number(saved.at || 0);
  if (!at || Date.now() - at > PRINTER_WARM_WINDOW_MS) return;
  const port = Number(saved.port) || DEFAULT_PRINTER_PORT;
  printerWarmers.set(printerKey(saved.ip, port), { lastRealAt: at, timer: null, misses: 0 });
  warmPrinterNow(saved.ip, port)
    .then(() => {
      console.log('[imprimante] canal réchauffé au démarrage · ' + saved.ip + ':' + port);
      schedulePrinterWarm(saved.ip, port, false);
    })
    .catch(() => schedulePrinterWarm(saved.ip, port, false));
}

// Relay a buffer of ESC/POS bytes over one serialized, reusable RAW channel.
function sendToPrinter(printerIp, port, buf, heartbeat) {
  const key = printerKey(printerIp, port);
  const previous = printerWrites.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(() => openPrinterChannel(printerIp, port))
    .then((channel) => writePrinterChannel(channel, buf))
    .then((bytes) => {
      schedulePrinterWarm(printerIp, port, !heartbeat);
      return heartbeat ? 0 : bytes;
    });
  printerWrites.set(key, task.catch(() => {}));
  return task;
}

/* ── LAN printer discovery ────────────────────────────────────────────────────
 * The owner should not have to find their printer's IP on a config slip. On
 * demand (never on its own), the bridge sweeps the till's OWN private /24
 * subnet(s) for hosts answering on the RAW port 9100 — the same probe every
 * printer driver's "search for network printers" performs. Private (RFC1918)
 * ranges only, one sweep at a time, short per-host timeout. */
const SCAN_PROBE_MS = 450;
const SCAN_CONCURRENCY = 48;
const SCAN_MAX_HOSTS = 1024;
let scanBusy = false;

function probe9100(ip) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let settled = false;
    const done = (open) => { if (settled) return; settled = true; try { s.destroy(); } catch (_) {} resolve(open); };
    s.setTimeout(SCAN_PROBE_MS);
    s.on('timeout', () => done(false));
    s.on('error', () => done(false));
    s.connect(DEFAULT_PRINTER_PORT, ip, () => done(true));
  });
}

function isPrivateV4(ip) {
  const p = ip.split('.').map(Number);
  return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168);
}

function scanHosts() {
  const self = new Set();
  const bases = new Set();
  const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach((name) => {
    (ifs[name] || []).forEach((a) => {
      if (a.family !== 'IPv4' || a.internal || !isPrivateV4(a.address)) return;
      self.add(a.address);
      bases.add(a.address.split('.').slice(0, 3).join('.'));
    });
  });
  const hosts = [];
  for (const base of bases) {
    for (let h = 1; h <= 254 && hosts.length < SCAN_MAX_HOSTS; h++) {
      const ip = base + '.' + h;
      if (!self.has(ip)) hosts.push(ip);
    }
  }
  return hosts;
}

async function scanForPrinters() {
  const hosts = scanHosts();
  const found = [];
  let i = 0;
  async function worker() {
    while (i < hosts.length) {
      const ip = hosts[i++];
      if (await probe9100(ip)) found.push({ ip, port: DEFAULT_PRINTER_PORT });
    }
  }
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, hosts.length) }, worker));
  found.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
  return { printers: found, scanned: hosts.length };
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
    throw new Error('imprimante « ' + printerName + ' » introuvable · installées : ' + installed.join(', '));
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
    const rs = relayStatus();
    sendJson(res, 200, { ok: true, name: NAME, version: VERSION,
      lastTiming: lastPrintTiming,
      relay: { paired: rs.paired, online: rs.online, merchant: rs.merchant, name: rs.name, bridgeId: rs.bridgeId } }, origin);
    return;
  }

  // La page locale du pont et son état — même origine, aucun CORS en jeu.
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(LOCAL_PAGE);
    return;
  }
  if (req.method === 'GET' && url === '/kiwi/relay') {
    sendJson(res, 200, relayStatus(), origin);
    return;
  }
  if (req.method === 'POST' && url === '/kiwi/relay/pair') {
    let body;
    try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
    catch (_) { return sendJson(res, 400, { ok: false, error: 'bad-json' }, origin); }
    const r = await relayPair(body.code, body.name);
    sendJson(res, r.ok ? 200 : 422, r, origin);
    return;
  }
  if (req.method === 'POST' && url === '/kiwi/relay/unpair') {
    relayUnpair();
    sendJson(res, 200, { ok: true }, origin);
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

  if (req.method === 'GET' && url === '/kiwi/scan') {
    if (scanBusy) return sendJson(res, 429, { ok: false, error: 'scan-busy' }, origin);
    scanBusy = true;
    const t0 = Date.now();
    try {
      const r = await scanForPrinters();
      sendJson(res, 200, { ok: true, printers: r.printers, scanned: r.scanned, ms: Date.now() - t0 }, origin);
    } catch (e) {
      sendJson(res, 200, { ok: false, error: String((e && e.message) || e) }, origin);
    } finally {
      scanBusy = false;
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
      sendJson(res, 200, { ok: true, bytes, via: printerName ? 'os' : 'tcp', timing: lastPrintTiming }, origin);
    } catch (e) {
      sendJson(res, 502, { ok: false, error: String((e && e.message) || e) }, origin);
    }
    return;
  }

  if (req.method === 'POST' && url === '/kiwi/wake') {
    let body;
    try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
    catch (_) { return sendJson(res, 400, { ok: false, error: 'bad-json' }, origin); }

    const printerIp = String(body.printerIp || '').trim();
    const port = Number(body.port) || DEFAULT_PRINTER_PORT;
    if (!printerIp) {
      return sendJson(res, 400, { ok: false, error: 'printer-ip-required' }, origin);
    }
    warmPrinterNow(printerIp, port).catch(() => {});
    sendJson(res, 200, { ok: true, warm: true, waking: true, timing: lastPrintTiming }, origin);
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
      console.error(`Le port ${port} est déjà utilisé · le pont tourne peut-être déjà dans une autre fenêtre.`);
      /* L'app web ne cherche le pont que sur 9110–9114 : conseiller un port hors
       * de cette plage ferait tourner un pont que Kiwi ne trouvera jamais. */
      console.error('Fermez l\'autre fenêtre, ou lancez celle-ci sur un port libre ENTRE 9110 et 9114 :');
      console.error('    set KIWI_BRIDGE_PORT=9114 && kiwi-printer-bridge-win.exe');
    }
    holdOpen(1);
  };
  const onListening = () => {
    server.removeListener('error', onError);
    console.log(`${NAME} v${VERSION} listening on http://${HOST}:${port}`);
    console.log('Laissez cette fenêtre ouverte. Elle relaie les impressions Kiwi vers votre imprimante.');
    console.log(`Page du pont : http://${HOST}:${port}/`);
    resumePrinterWarm();
    if (relayPaired()) {
      relayLog('appairé au commerce « ' + relay.cfg.relay.merchant + ' » · connexion à ' + RELAY_URL + '…');
      relayStart();
    } else {
      relayLog('non appairé. Pour imprimer depuis un iPad/tablette : Kiwi → Imprimantes → Relais Kiwi → Associer un pont, puis tapez le code sur http://' + HOST + ':' + port + '/');
    }
    if (port !== PORT_CANDIDATES[0]) {
      console.log(`(Port ${PORT_CANDIDATES[0]} occupé · Kiwi cherche automatiquement jusqu'à ${PORT_CANDIDATES[PORT_CANDIDATES.length - 1]}.)`);
    }
  };

  server.once('error', onError);
  server.once('listening', onListening);
  server.listen(port, HOST);
}
/* Appairage sans interface : `kiwi-printer-bridge --pair 123456` ou la variable
 * KIWI_RELAY_CODE (installation par un technicien, service Windows, Raspberry
 * au fond du comptoir). Le pont démarre ensuite normalement. */
(function cliPair() {
  const i = process.argv.indexOf('--pair');
  const code = (i !== -1 && process.argv[i + 1]) || process.env.KIWI_RELAY_CODE || '';
  if (process.argv.indexOf('--unpair') !== -1) { relayUnpair(); }
  if (!code) return;
  relayPair(code).then((r) => {
    if (!r.ok) console.error('[relais] appairage refusé : ' + (r.error || 'inconnu'));
  });
})();
tryListen();

// A crash must not vanish the window either.
process.on('uncaughtException', (e) => {
  console.error('Erreur inattendue :', (e && e.stack) || e);
  holdOpen(1);
});
