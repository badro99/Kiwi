#!/usr/bin/env node
/* Pont d'impression · la page de téléchargement ne ment pas et ne se trompe pas d'OS.
 *
 * 2026-10-12 (audit design, cluster access). Trois défauts :
 *   1. detectOS() prenait un iPhone/iPad (« Mac OS X » dans l'UA, ou « MacIntel »
 *      en mode ordinateur d'iPadOS) pour un Mac et proposait le .zip macOS.
 *   2. Le premier état était une alarme rouge « Pont non détecté », alors que
 *      « pas encore installé » est l'état normal avant le premier téléchargement.
 *   3. Le mode d'emploi macOS disait « l'app est sûre » en faisant contourner
 *      Gatekeeper, alors que le build n'est pas notarié.
 *
 * Exécute le vrai script de printer.html dans un DOM minimal.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(path.join(ROOT, 'printer.html'), 'utf8');
const SCRIPT = HTML.slice(HTML.lastIndexOf('<script>') + 8, HTML.lastIndexOf('</script>'));

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

function stub() {
  const classes = new Set();
  return {
    href: '#', textContent: '', innerHTML: '', className: '', attrs: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] || ''; },
    addEventListener() {}, appendChild() {},
  };
}
function run(nav) {
  const els = {};
  const get = (k) => (els[k] || (els[k] = stub()));
  const fetched = [];
  const body = stub();
  const ctx = vm.createContext({
    navigator: nav, location: { search: '' }, URLSearchParams,
    document: {
      body, documentElement: {}, createElement: () => stub(),
      getElementById: (id) => get('#' + id),
      querySelector: (sel) => get(sel),
      querySelectorAll: () => [],
    },
    fetch: (url) => { fetched.push(String(url)); return Promise.reject(new Error('offline')); },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    Array, console,
  });
  const i18n = HTML.match(/<script id="printer-i18n">([\s\S]*?)<\/script>/);
  if (i18n) vm.runInContext(i18n[1], ctx);
  /* Read the detected OS out of the IIFE without changing what ships. */
  vm.runInContext(SCRIPT.replace('var os = detectOS();', 'var os = globalThis.__os = detectOS();'), ctx);
  return { els, body, fetched, prim: get('#dl-primary'), os: ctx.__os };
}

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
};

console.log('■ Pont d’impression · détection du système');

for (const [name, nav, expected] of [
  ['iPhone', { userAgent: UA.iphone, platform: 'iPhone', maxTouchPoints: 5 }, 'ios'],
  ['iPad (UA mobile)', { userAgent: UA.ipad, platform: 'iPad', maxTouchPoints: 5 }, 'ios'],
  ['iPad en mode ordinateur (MacIntel + écran tactile)', { userAgent: UA.ipadDesktop, platform: 'MacIntel', maxTouchPoints: 5 }, 'ios'],
  ['Mac', { userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 0 }, 'mac'],
  ['Mac sans maxTouchPoints', { userAgent: UA.mac, platform: 'MacIntel' }, 'mac'],
  ['Windows', { userAgent: UA.win, platform: 'Win32', maxTouchPoints: 0 }, 'win'],
  ['tablette Android', { userAgent: UA.android, platform: 'Linux armv81', maxTouchPoints: 5 }, 'android'],
  ['Linux', { userAgent: UA.linux, platform: 'Linux x86_64', maxTouchPoints: 0 }, 'linux'],
]) {
  const r = run(nav);
  check(r.os === expected, `${name} est reconnu comme « ${expected} »`);
}

const ipad = run({ userAgent: UA.ipadDesktop, platform: 'MacIntel', maxTouchPoints: 5 });
check(ipad.body.classList.contains('is-ios'), 'un iPad affiche l’explication à la place du téléchargement');
check(!/macos|\.zip/i.test(ipad.prim.href), 'un iPad ne se voit proposer aucun téléchargement macOS');
check(ipad.fetched.length === 0, 'et la page ne cherche pas un pont sur 127.0.0.1 depuis un iPad');
const mac = run({ userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 0 });
check(/kiwi-printer-bridge-macos\.zip$/.test(mac.prim.href) && !mac.body.classList.contains('is-ios'), 'un vrai Mac reçoit toujours le téléchargement macOS');
check(mac.fetched.some((u) => u.includes('127.0.0.1:9110')), 'et la détection du pont reste active sur un ordinateur');
const win = run({ userAgent: UA.win, platform: 'Win32', maxTouchPoints: 0 });
check(/kiwi-printer-bridge-win\.exe$/.test(win.prim.href), 'Windows reçoit le .exe');
const droid = run({ userAgent: UA.android, platform: 'Linux armv81', maxTouchPoints: 5 });
check(droid.prim.href === '/downloads/kiwi-print-bridge.apk', 'une tablette Android reçoit l’APK');

console.log('■ Pont d’impression · explication pour iPhone et iPad');
const ios = HTML.slice(HTML.indexOf('id="ios-card"'), HTML.indexOf('class="card not-ios"'));
check(/ordinateur du comptoir/.test(ios), 'dit que le pont tourne sur l’ordinateur du comptoir');
check(/6 chiffres/.test(ios) && /Relais Kiwi/.test(ios) && /Associer un pont/.test(ios), 'donne le chemin d’association par code à 6 chiffres');
check(/1\.4\.0/.test(ios), 'nomme la version minimale du pont');
check(/body\.is-ios \.not-ios\{display:none\}/.test(HTML), 'les téléchargements sont masqués sur iPhone et iPad');

console.log('■ Pont d’impression · état initial neutre');
check(/<div class="status idle" id="status">/.test(HTML), 'la page démarre sur un état neutre');
check(!/status off|c0392b|f2cdc8|8f2c1e/.test(HTML), 'plus aucune alarme rouge dans la page');
check(!/Pont non détecté/.test(HTML), 'plus de « Pont non détecté »');
check(/n\\?'est pas encore installé/.test(HTML), '« pas encore installé » est dit calmement, avec le téléchargement comme action');

console.log('■ Pont d’impression · honnêteté sur la signature');
check(!/est sûre|est sure|is safe/i.test(HTML), 'aucune affirmation « l’app est sûre »');
const macBlock = HTML.slice(HTML.indexOf('class="os-body" data-os="mac">'), HTML.indexOf('class="os-body" data-os="linux">'));
check(/notari/.test(macBlock), 'macOS : dit que le build n’est pas notarié');
check(/Ouvrir quand même/.test(macBlock), 'macOS : explique toujours comment l’ouvrir');
check(/uniquement|que si vous l'avez téléchargée depuis cette page/.test(macBlock), 'macOS : demande de ne l’ouvrir que depuis cette page Kiwi');
const winBlock = HTML.slice(HTML.indexOf('class="os-body" data-os="win">'), HTML.indexOf('class="os-body" data-os="mac">'));
check(/pas encore signée/.test(winBlock) && !/sûre/.test(winBlock), 'Windows : même honnêteté');

console.log('■ Pont d’impression · les installations en ligne de commande restent, en option avancée');
const curls = [...HTML.matchAll(/curl -fsSL [^<]+/g)];
check(curls.length === 2, 'les deux scripts d’installation (macOS, Linux) sont toujours présents');
for (const c of curls) {
  const before = HTML.slice(0, c.index);
  check(before.lastIndexOf('<details class="adv">') > before.lastIndexOf('</details>'), `« ${c[0].slice(0, 48)}… » est dans une option avancée repliée`);
}
check(/install-macos\.sh" target="_blank"/.test(HTML) && /install-linux\.sh" target="_blank"/.test(HTML), 'chaque script est lisible avant exécution');
check(/chmod \+x ~\/Downloads\/kiwi-printer-bridge-linux/.test(HTML), 'Linux garde un lancement manuel comme chemin par défaut');
check(!/—/.test(HTML.slice(HTML.indexOf('<main'), HTML.indexOf('<script>'))), 'pas de tiret cadratin dans le texte affiché');

console.log(`\n✓ ${checks} checks`);
