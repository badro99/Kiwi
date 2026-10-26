#!/usr/bin/env node
import printerTestSource from './printer-test-source.cjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0;
function ok(value, message) {
  if (!value) { console.error('  ✗ ' + message); process.exitCode = 1; return; }
  pass++;
}

const bridge = printerTestSource() + '\n' + read('assets/printer/pairing-ui.js');
const socketIndex = bridge.indexOf('return nativeSocketFirst(bytes, null, viaWebTransports)');
const relayIndex = bridge.indexOf('function viaRelayOrFail');
ok(socketIndex > 0 && relayIndex > 0, 'le transport socket natif et le relais existent');
ok(/function nativeSocketFirst[\s\S]*if \(!nativeSocket\(\) \|\| !nativeSocketTarget\(target\)\) return next\(\);/.test(bridge), 'sans plugin ou sans IP, la chaîne web reprend immédiatement');
ok(/function printBytesToTarget[\s\S]*nativeSocketFirst\(bytes, networkTarget,[\s\S]*bridgePrintBytes/.test(bridge), 'une cible de poste IP essaie le socket avant le pont et le relais');
ok(/function printBytes[\s\S]*function viaWebTransports[\s\S]*return nativeSocketFirst\(bytes, null, viaWebTransports\)/.test(bridge), 'la configuration globale essaie le socket avant Bluetooth, USB, pont et relais');
ok(/via: 'socket'/.test(bridge) && /timeoutMs: 4000/.test(bridge), 'un envoi natif réussi annonce socket avec un délai de 4 s');
ok(/Rechercher sur le réseau/.test(bridge) && /socket\.scan\(\{ port:/.test(bridge), 'le modal natif propose la recherche réseau');
ok(/socket\.probe\(\{ host:[\s\S]*nativeSocketSend\(slip, target\)/.test(bridge), 'Tester sonde puis imprime un ticket court');

const defs = read('app/plugins/kiwi-printer-socket/src/definitions.ts');
ok(/send\(options: SendOptions\)/.test(defs), 'les définitions TypeScript exportent send');
ok(/probe\(options: ProbeOptions\)/.test(defs), 'les définitions TypeScript exportent probe');
ok(/scan\(options\?: ScanOptions\)/.test(defs), 'les définitions TypeScript exportent scan');
ok(/'local-network-denied'/.test(defs) && /'bad-args'/.test(defs), 'les codes d’erreur publics sont typés');

const swift = read('app/plugins/kiwi-printer-socket/ios/Sources/KiwiPrinterSocket/KiwiPrinterSocketPlugin.swift');
ok(/import Network/.test(swift) && /NWConnection\(/.test(swift), 'iOS utilise Network.framework');
ok(/case \.waiting/.test(swift) && /local-network-denied/.test(swift), 'iOS traite l’état waiting comme permission réseau local refusée');
ok(/active < 32/.test(swift) && /nextHost <= 254/.test(swift), 'le scan iOS couvre le /24 avec 32 connexions maximum');

const java = read('app/plugins/kiwi-printer-socket/android/src/main/java/com/kiwios/printersocket/KiwiPrinterSocketPlugin.java');
ok(/newFixedThreadPool\(32\)/.test(java) && /new Socket\(\)/.test(java), 'Android utilise java.net.Socket avec 32 connexions maximum');

const plist = read('app/ios/App/App/Info.plist');
ok(/NSLocalNetworkUsageDescription[\s\S]*Kiwi envoie vos tickets à l'imprimante thermique de votre réseau local\./.test(plist), 'Info.plist explique précisément le réseau local en français');
ok(/NSBonjourServices[\s\S]*_printer\._tcp[\s\S]*_pdl-datastream\._tcp[\s\S]*_ipp\._tcp/.test(plist), 'Info.plist déclare les trois services Bonjour');
ok(!plist.includes('NSBluetoothAlwaysUsageDescription'), 'iOS v1 ne demande pas Bluetooth');

const manifest = read('app/android/app/src/main/AndroidManifest.xml');
for (const permission of ['INTERNET', 'ACCESS_WIFI_STATE', 'ACCESS_NETWORK_STATE', 'CAMERA']) {
  ok(manifest.includes('android.permission.' + permission), 'Android déclare ' + permission);
}
ok(!manifest.includes('android.permission.BLUETOOTH'), 'Android v1 ne demande pas Bluetooth');

const pkg = JSON.parse(read('app/package.json'));
ok(pkg.dependencies['kiwi-printer-socket'] === 'file:plugins/kiwi-printer-socket', 'le plugin local est une dépendance de l’app');

/* Run: mutation return r.ok ? next() : r preserves all text contracts but
 * sends a successful socket print through the fallback, duplicating paper. */
{
  const vm = await import('node:vm');
  const strict = await import('node:assert/strict');
  const { createRequire } = await import('node:module');
  const { declaration } = createRequire(import.meta.url)('./js-declarations.cjs');
  const source = read('assets/printer/transports.js');
  let plugin = true, cfg = { ip: '192.0.2.1' }, answer = { ok: true, bytes: 3 }, fallback = 0;
  const sends = [], failures = [];
  const ctx = vm.createContext({ window: { Capacitor: { isNativePlatform: () => plugin,
    isPluginAvailable: () => true, Plugins: { KiwiPrinterSocket: { send: async options => {
      sends.push(options); if (answer instanceof Error) throw answer; return answer;
    } } } }, KiwiEscPos: { toB64: bytes => Buffer.from(bytes).toString('base64') } },
    getConfig: () => cfg, noteNativeFailure: reason => failures.push(reason), nativeFailureCount: 0 });
  vm.runInContext(['nativeSocket', 'nativeSocketTarget', 'nativeSocketSend', 'nativeSocketFirst']
    .map(name => declaration(source.slice(source.indexOf('  function ' + name + '(')), name)).join('\n'), ctx);
  const bytes = new Uint8Array([27, 64, 10]);
  const next = async () => { fallback++; return { ok: true, via: 'fallback' }; };
  strict.equal((await ctx.nativeSocketFirst(bytes, null, next)).via, 'socket');
  strict.equal(fallback, 0, 'run: successful socket sends never duplicate on fallback');
  strict.equal(sends[0].host, '192.0.2.1'); strict.equal(sends[0].port, 9100);
  strict.equal(sends[0].timeoutMs, 4000); strict.equal(sends[0].data, 'G0AK');
  answer = { ok: false, code: 'local-network-denied' };
  strict.equal((await ctx.nativeSocketFirst(bytes, { ip: '192.0.2.2', port: 9200 }, next)).via, 'fallback');
  strict.equal(sends[1].host, '192.0.2.2'); strict.equal(sends[1].port, 9200);
  answer = new Error('unreachable'); await ctx.nativeSocketFirst(bytes, null, next);
  strict.deepEqual(failures, ['local-network-denied', 'unreachable']);
  plugin = false; await ctx.nativeSocketFirst(bytes, null, next);
  plugin = true; cfg = {}; await ctx.nativeSocketFirst(bytes, null, next);
  strict.equal(sends.length, 3, 'run: missing plugin or IP bypasses socket');
  strict.equal(fallback, 4);
}

console.log('print-socket-test: ' + pass + ' contrôles' + (process.exitCode ? ' · ÉCHEC' : ' ✓'));
