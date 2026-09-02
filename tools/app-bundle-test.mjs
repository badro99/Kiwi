#!/usr/bin/env node
/* tools/app-bundle-test.mjs — le bundle embarqué dans l'app native est-il sain ?
 *
 * Wired dans tools/check.js (un fichier de test que check.js ne nomme pas ne
 * garde rien). Ce que ça tient, et pourquoi chaque garde existe :
 *
 *  · le build (tools/build-app-www.mjs) réussit dans un dossier jetable, et
 *    DEUX builds donnent la même empreinte — « même entrée → même bundle »
 *    (plan §5, critère 6) ;
 *  · chaque page embarquée charge assets/api-base.js AVANT tout autre script :
 *    un seul fetch('/api/…') lancé avant lui part vers capacitor://localhost/api
 *    et meurt en silence ;
 *  · aucune page n'emporte de <link rel="manifest"> (pas de PWA dans l'app) ;
 *  · aucun asset n'appelle kiwi-os.com en dur (api-base.js est la seule source
 *    de l'origine de l'API) ;
 *  · les quatre bootstraps PWA portent la garde isNativePlatform() ;
 *  · api-base.js, exécuté dans une fausse fenêtre : réécrit fetch, XHR,
 *    EventSource, WebSocket (ws://localhost/api → wss://kiwi-os.com/api, le cas
 *    de live-socket.js), sendBeacon ; laisse les URL d'assets ; no-op hors natif ;
 *  · functions/_middleware.js : préflight 204 + CORS réfléchi pour les origines
 *    de l'app sur /api et /auth, rien pour une origine tierce, 404 sur /app/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build, PAGES, API_BASE_TAG, NATIVE_RUNTIME_TAGS, transformPage, localRefs, ROOT } from './build-app-www.mjs';

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures++; console.log(`  ✗ ${m}`); };
const assert = (cond, msg) => (cond ? ok(msg) : bad(msg));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('app-bundle-test');

/* ── 1. build jetable, deux fois ───────────────────────────────────────── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-app-bundle-'));
let first, second;
try {
  first = build({ out: path.join(tmp, 'a'), quiet: true });
  second = build({ out: path.join(tmp, 'b'), quiet: true });
} catch (e) {
  bad(`build a levé : ${e.message}`);
}
if (first) {
  assert(first.errors.length === 0, `build sans erreur${first.errors.length ? ' — ' + first.errors.join(' ; ') : ''}`);
  assert(first.manifest.pages.length === PAGES.length, `les ${PAGES.length} pages sont embarquées`);
  assert(second && second.manifest.bundle === first.manifest.bundle, 'deux builds → même empreinte (déterministe)');
  assert(first.manifest.files.some((f) => f.path === 'assets/api-base.js'), 'assets/api-base.js est dans le bundle');
  assert(first.manifest.files.some((f) => f.path === 'index.html'), 'la coquille native (index.html) est dans le bundle');
  assert(first.manifest.files.some((f) => f.path === 'native-runtime.js'), 'le runtime natif partagé est dans le bundle');
  assert(first.manifest.files.filter((f) => f.path.startsWith('native-fonts/')).length === 4, 'Inter Tight et IBM Plex Sans Arabic sont embarquées localement');
  assert(!first.manifest.files.some((f) => / \d+\.[a-z]+$/i.test(f.path)), 'aucune copie de conflit iCloud « fichier 2.js » dans le bundle');
  assert(!first.manifest.files.some((f) => f.path.startsWith('assets/media/')), 'assets/media/ (marketing) n’est pas embarqué');

  for (const page of PAGES.concat(['index.html'])) {
    const html = fs.readFileSync(path.join(first.out, page), 'utf8');
    const firstScript = (html.match(/<script\b[^>]*>(?:<\/script>)?/i) || [''])[0];
    assert(firstScript === API_BASE_TAG, `${page} : api-base.js est le PREMIER <script>`);
    assert(html.includes(NATIVE_RUNTIME_TAGS), `${page} : charge le runtime natif partagé`);
    assert(!/rel=["']manifest["']/i.test(html), `${page} : aucun <link rel="manifest">`);
    assert(!/fonts\.(?:googleapis|gstatic)\.com/i.test(html), `${page} : aucune police réseau`);
  }
  // Chaque page embarquée rapporte ses plantages (POST /api/error via api-base) : la
  // cuisine et la coquille native ne le faisaient pas, un écran qui plantait au passe
  // ne laissait aucune trace.
  for (const page of PAGES.concat(['index.html'])) {
    const html = fs.readFileSync(path.join(first.out, page), 'utf8');
    assert(/<script src="assets\/err-reporter\.js(?:\?v=\d+)?"/.test(html), `${page} : charge assets/err-reporter.js`);
  }
  const runtime = fs.readFileSync(path.join(first.out, 'native-runtime.js'), 'utf8');
  assert(/window\.__KIWI_APP_VERSION = 'pro\/' \+ platform/.test(runtime) && /call\(app, 'getInfo'\)/.test(runtime), 'native-runtime : les rapports d’erreur portent plateforme et version de l’app (App.getInfo)');
  const shell = fs.readFileSync(path.join(first.out, 'index.html'), 'utf8');
  const nativeShell = fs.readFileSync(path.join(first.out, 'native-shell.js'), 'utf8');
  assert(/<meta name="kiwi-bundle" content="[0-9a-f]{64}"/.test(shell), 'index.html porte l’empreinte du bundle');
  assert(/params\.has\('setup'\)/.test(nativeShell) && /params\.has\('choose'\)/.test(nativeShell),
    'assistant : ?setup relance le parcours et ?choose conserve le lanceur manuel');
  assert(/state\.role !== 'equipe' && state\.account !== 'connected'/.test(nativeShell),
    'assistant : caisse, cuisine et dashboard exigent la session marchande; Équipe garde son code employé');
  assert(nativeShell.includes("fetch('/api/pair/create'") && nativeShell.includes("fetch('/api/pair/redeem'") && nativeShell.includes('window.KiwiPairingCommit.commit') && nativeShell.includes('terminalId:device'),
    'assistant : la session crée une liaison pour son magasin, la consomme, puis utilise le commit locataire partagé avec identité terminal');
  assert(shell.includes('id="store-list"') && !shell.includes('id="pair-code"') && nativeShell.includes('Array.isArray(me && me.stores)'),
    'assistant : choisit un établissement autorisé de /api/me au lieu de demander un code supprimé du dashboard');
  assert(nativeShell.includes("node.classList.toggle('skipped', skipped)") && nativeShell.includes("stageReady:'La configuration est enregistrée"),
    'assistant : les étapes non requises restent sautées et le rail de marque suit le contexte');
  assert(nativeShell.includes("marker.textContent = muted ? '—' : '✓'"),
    'assistant : le récapitulatif distingue une étape sautée d’une étape réellement validée');
  assert(nativeShell.includes('p.probe({host:values.host') && nativeShell.includes('window.KiwiEscPos.testSlip') && nativeShell.includes('p.send({host:values.host') && nativeShell.includes("var PRINTER_KEY = 'kiwiPrinterCfg'"),
    'assistant : le test sonde, imprime un ticket ESC/POS et enregistre le format déjà lu par la caisse');
  assert(!/fetch\(['"]\/api\/(?:sale|payment)/.test(nativeShell) && nativeShell.includes('aucune vente'),
    'assistant : le parcours de test ne crée aucune vente ni aucun paiement');

  // --api-base injecte la constante AVANT api-base.js
  const forced = transformPage('<html><head><title>x</title></head><body></body></html>', { apiBase: 'https://preview.example' });
  assert(forced.indexOf('window.KIWI_API_BASE="https://preview.example"') !== -1 && forced.indexOf('window.KIWI_API_BASE') < forced.indexOf(API_BASE_TAG), '--api-base force window.KIWI_API_BASE avant le shim');

  // localRefs : ignore les URL absolues, les gabarits JS et les ancres
  const refs = localRefs('<script src="assets/a.js?v=1"></script><img src="https://x/y.png"><img src="${t.u}"><link rel="icon" href="./assets/i.svg#f"><a href="page.html">');
  assert(JSON.stringify(refs) === JSON.stringify(['assets/a.js', 'assets/i.svg']), 'localRefs ne retient que les assets locaux');
}
fs.rmSync(tmp, { recursive: true, force: true });

/* ── 2. aucune origine d'API en dur dans les assets ────────────────────── */
{
  const dir = path.join(ROOT, 'assets');
  const hard = fs.readdirSync(dir).filter((f) => /\.js$/.test(f) && !/ \d+\.js$/.test(f))
    .filter((f) => /https:\/\/kiwi-os\.com\/(api|auth)\//.test(read(`assets/${f}`)));
  assert(hard.length === 0, `aucun asset n’appelle https://kiwi-os.com/api en dur${hard.length ? ' — ' + hard.join(', ') : ''}`);
  const src = read('assets/api-base.js');
  assert(/base = 'https:\/\/kiwi-os\.com'/.test(src), 'api-base.js : l’origine par défaut en natif est https://kiwi-os.com');
}

/* ── 3. les bootstraps PWA se taisent en natif ─────────────────────────── */
for (const f of ['assets/caisse-pwa.js', 'assets/dashboard-pwa.js', 'assets/employee-pwa.js']) {
  assert(/'use strict';\s*\n(?:\s*\/\/[^\n]*\n)*\s*if \(window\.Capacitor && typeof window\.Capacitor\.isNativePlatform === 'function' && window\.Capacitor\.isNativePlatform\(\)\) return;/.test(read(f)),
    `${f} : retourne immédiatement en natif`);
}
assert(/if \(!nativeApp && 'serviceWorker' in navigator/.test(read('assets/employee-live.js')), 'assets/employee-live.js : pas de service worker en natif');

/* ── 4. api-base.js dans une fausse fenêtre ────────────────────────────── */
function fakeWindow(native, apiBase) {
  const calls = { fetch: [], xhr: [], beacon: [], es: [], ws: [] };
  function XHR() {}
  XHR.prototype.open = function (m, u) { calls.xhr.push({ m, u, wc: this.withCredentials }); this.opened = u; };
  function ES(u, init) { calls.es.push({ u, init }); }
  ES.CONNECTING = 0; ES.OPEN = 1; ES.CLOSED = 2;
  function WS(u, p) { calls.ws.push({ u, p }); }
  WS.CONNECTING = 0; WS.OPEN = 1; WS.CLOSING = 2; WS.CLOSED = 3;
  const w = {
    calls,
    fetch: (input, init) => { calls.fetch.push({ input, init }); return Promise.resolve({ ok: true }); },
    XMLHttpRequest: XHR,
    EventSource: ES,
    WebSocket: WS,
    navigator: { sendBeacon: (u, d) => { calls.beacon.push(u); return true; } },
    document: { addEventListener() {} },
    location: { replace() {} },
    URL,
    Request: class { constructor(u, init) { this.url = String(u); this.init = init; } },
    Object,
  };
  if (native) w.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
  if (apiBase) w.KIWI_API_BASE = apiBase;
  w.window = w;
  return w;
}
function runApiBase(w) {
  const ctx = vm.createContext(w);
  vm.runInContext(read('assets/api-base.js'), ctx, { filename: 'api-base.js' });
  return w;
}
{
  const w = runApiBase(fakeWindow(true));
  assert(w.KiwiApiBase && w.KiwiApiBase.native === true && w.KiwiApiBase.base === 'https://kiwi-os.com', 'natif : KiwiApiBase.base = https://kiwi-os.com');
  w.fetch('/api/me', { headers: { Accept: 'application/json' } });
  w.fetch('/auth/login', { method: 'POST' });
  w.fetch('assets/venues.js');
  w.fetch('/apiary/x');
  w.fetch(new w.Request('/api/sale', { method: 'POST' }));
  const f = w.calls.fetch;
  assert(f[0].input === 'https://kiwi-os.com/api/me' && f[0].init.credentials === 'include' && f[0].init.headers.Accept === 'application/json', 'fetch("/api/me") → https://kiwi-os.com/api/me, credentials include, init conservé');
  assert(f[1].input === 'https://kiwi-os.com/auth/login' && f[1].init.method === 'POST', 'fetch("/auth/login") préfixé');
  assert(f[2].input === 'assets/venues.js' && f[2].init === undefined, 'fetch d’un asset relatif : intact');
  assert(f[3].input === '/apiary/x', '"/apiary" n’est pas "/api/"');
  assert(f[4].input && f[4].input.url === 'https://kiwi-os.com/api/sale', 'fetch(Request("/api/sale")) → Request réécrite');
  const x = new w.XMLHttpRequest(); x.open('POST', '/api/media?name=a.jpg');
  assert(w.calls.xhr[0].u === 'https://kiwi-os.com/api/media?name=a.jpg' && x.withCredentials === true, 'XHR.open("/api/media?…") préfixé, withCredentials');
  new w.EventSource('/api/live/feed');
  assert(w.calls.es[0].u === 'https://kiwi-os.com/api/live/feed' && w.calls.es[0].init.withCredentials === true, 'EventSource("/api/…") préfixé, withCredentials');
  new w.WebSocket('ws://localhost/api/live/socket?tenant=x');
  new w.WebSocket('wss://localhost:8443/api/live/socket', ['kiwi']);
  assert(w.calls.ws[0].u === 'wss://kiwi-os.com/api/live/socket?tenant=x', 'WebSocket ws://localhost/api/… (live-socket.js) → wss://kiwi-os.com/api/…');
  assert(w.calls.ws[1].u === 'wss://kiwi-os.com/api/live/socket' && w.calls.ws[1].p[0] === 'kiwi', 'WebSocket avec port et protocoles : réécrit, protocoles conservés');
  w.navigator.sendBeacon('/api/error', '{}');
  assert(w.calls.beacon[0] === 'https://kiwi-os.com/api/error', 'sendBeacon("/api/error") préfixé');
  assert(w.KiwiApiBase.url('capacitor://localhost/auth/logout') === 'https://kiwi-os.com/auth/logout', 'URL absolue capacitor://localhost/auth/… réécrite');
  assert(w.KiwiApiBase.url('https://kiwi-os.com/api/me') === 'https://kiwi-os.com/api/me', 'URL déjà absolue vers l’API : intacte');
}
{
  const w = fakeWindow(false);
  const origFetch = w.fetch, origWS = w.WebSocket;
  runApiBase(w);
  assert(w.KiwiApiBase.native === false && w.KiwiApiBase.base === '' && w.fetch === origFetch && w.WebSocket === origWS, 'web (non natif, pas de KIWI_API_BASE) : no-op absolu');
}
{
  const w = runApiBase(fakeWindow(false, 'https://kiwi-maroc.pages.dev/'));
  w.fetch('/api/me');
  assert(w.calls.fetch[0].input === 'https://kiwi-maroc.pages.dev/api/me', 'KIWI_API_BASE forcé (bundle testé au bureau) : préfixe sans double slash');
}

/* ── 5. functions/_middleware.js — origines de l'app ───────────────────── */
{
  const src = read('functions/_middleware.js');
  assert(/const APP_ORIGIN = \/\^\(\?:capacitor\|ionic\):\\\/\\\/localhost\$\|\^https\?:\\\/\\\/localhost\(\?::\\d\{2,5\}\)\?\$\//.test(src), '_middleware.js : APP_ORIGIN ne reflète que capacitor://, ionic:// et localhost');
  assert(/if \(path === '\/app' \|\| path\.startsWith\('\/app\/'\)\)/.test(src), '_middleware.js : /app/ (projet Capacitor) répond 404');
  let mw = null;
  try { mw = await import(pathToFileUrl(path.join(ROOT, 'functions', '_middleware.js'))); }
  catch (e) { bad(`import de _middleware.js : ${e.message}`); }
  if (mw) {
    const next = async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    const call = (url, init) => mw.onRequest({ request: new Request(url, init), env: {}, next, waitUntil() {} });
    const pre = await call('https://kiwi-os.com/api/me', { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'content-type' } });
    assert(pre.status === 204 && pre.headers.get('Access-Control-Allow-Origin') === 'capacitor://localhost' && pre.headers.get('Access-Control-Allow-Credentials') === 'true' && /content-type/i.test(pre.headers.get('Access-Control-Allow-Headers')), 'préflight OPTIONS /api/me depuis capacitor://localhost → 204 + CORS avec identifiants');
    const get = await call('https://kiwi-os.com/api/me', { headers: { Origin: 'https://localhost' } });
    assert(get.status === 200 && get.headers.get('Access-Control-Allow-Origin') === 'https://localhost' && get.headers.get('Access-Control-Allow-Credentials') === 'true' && /Origin/.test(get.headers.get('Vary') || ''), 'GET /api/me depuis https://localhost (Android) → CORS réfléchi + Vary: Origin');
    const auth = await call('https://kiwi-os.com/auth/login', { method: 'POST', headers: { Origin: 'capacitor://localhost', 'Content-Type': 'application/json' }, body: '{}' });
    assert(auth.headers.get('Access-Control-Allow-Origin') === 'capacitor://localhost', 'POST /auth/login depuis l’app → CORS réfléchi');
    const evil = await call('https://kiwi-os.com/api/me', { headers: { Origin: 'https://evil.example' } });
    assert(!evil.headers.get('Access-Control-Allow-Origin'), 'origine tierce : aucun en-tête CORS');
    const evilPre = await call('https://kiwi-os.com/api/me', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert(evilPre.status !== 204 || !evilPre.headers.get('Access-Control-Allow-Origin'), 'préflight d’une origine tierce : pas de 204 CORS');
    const page = await call('https://kiwi-os.com/dashboard', { headers: { Origin: 'capacitor://localhost' } });
    assert(!page.headers.get('Access-Control-Allow-Origin'), 'une page HTML depuis l’app : pas de CORS (seuls /api et /auth)');
    const app = await call('https://kiwi-os.com/app/ios/App/App.xcodeproj/project.pbxproj');
    assert(app.status === 404, 'GET /app/… → 404');
  }
}

function pathToFileUrl(p) { return new URL('file://' + p).href; }

console.log(failures ? `\napp-bundle-test : ${failures} échec(s)` : '\napp-bundle-test : tout passe');
process.exit(failures ? 1 : 0);
