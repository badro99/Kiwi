#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let passed = 0, failed = 0;
function check(value, label) { if (value) { passed++; console.log('  ✓ ' + label); } else { failed++; console.error('  ✗ ' + label); } }

const manifest = read('bridge/android/app/src/main/AndroidManifest.xml');
const service = read('bridge/android/app/src/main/java/com/kiwios/printbridge/BridgeService.java');
const relay = read('bridge/android/app/src/main/java/com/kiwios/printbridge/RelayClient.java');
const mainAct = read('bridge/android/app/src/main/java/com/kiwios/printbridge/MainActivity.java');
const build = read('bridge/android/app/build.gradle');
const server = read('bridge/server.js');
const page = read('printer.html');

check(manifest.includes('FOREGROUND_SERVICE_DATA_SYNC') && manifest.includes('RECEIVE_BOOT_COMPLETED'), 'foreground printing and reboot permissions are declared');
check(manifest.includes('android.permission.WAKE_LOCK') && manifest.includes('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'), 'wake lock and battery optimization exemption permissions are declared');
check(manifest.includes('.BootReceiver') && manifest.includes('.BridgeService'), 'boot receiver and bridge service are registered');
check(service.includes('START_STICKY') && service.includes('startForeground'), 'bridge remains a foreground sticky service');
check(service.includes('PARTIAL_WAKE_LOCK') && service.includes('WIFI_MODE_FULL_HIGH_PERF') && service.includes('releaseLocks'), 'CPU and Wi-Fi locks are held and safely released on service teardown');
check(service.includes('finally {') && service.includes('RelayClient.keepPrinterWarm()'), 'LAN printer keepalive runs in finally block decoupled from WAN relay errors');
check(mainAct.includes('ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS') && mainAct.includes('isIgnoringBatteryOptimizations'), 'MainActivity requests battery optimization exemption to survive OEM doze');
check(relay.includes('/api/print/bridges') && relay.includes('/api/print/jobs'), 'APK reuses the existing Kiwi pairing and job relay');
check(relay.includes('new InetSocketAddress(ip, port)') && relay.includes('8000'), 'LAN printing has a bounded raw TCP connection');
check(service.includes('RelayClient.ack') && service.includes('BridgeStore.clearPair'), 'jobs are acknowledged and revoked credentials are cleared');
check(build.includes('versionCode 5') && build.includes("versionName '1.0.4'"), 'Android bridge build is bumped to v1.0.4 (code 5)');
check(relay.includes('VERSION = "1.0.4"') && relay.includes('PRINTER_KEEPALIVE_MS = 10000'), 'RelayClient is v1.0.4 with 10s keepalive interval');
check(relay.includes('7 * 24 * 60 * 60 * 1000') && server.includes('7 * 24 * 60 * 60 * 1000'), 'printer warm window is 7 days across Android and Node bridges — it survives a weekly closing day');
check(relay.includes('PRINTER_WARM_BACKOFF_MAX_MS') && relay.includes('warmBackoffMs') && server.includes('PRINTER_WARM_BACKOFF_MAX_MS'), 'a printer that stops answering is probed less often, not every 10s for a week');
check(/printerWarmMisses = warmPrinter\([^)]*\) \? 0 : printerWarmMisses \+ 1/.test(relay), 'the Android backoff resets the moment the printer answers again');
check(relay.includes('0x10, 0x04, 0x01') && relay.includes('probePrinter'), 'RelayClient probes printer readiness via real-time DLE EOT status bytes');
check(service.includes('resumePrinterWarm') && service.includes('saveWarmTarget'), 'BridgeService persists warm target and resumes warm channel on boot');
check(relay.includes('"wake"') && relay.includes('timing'), 'RelayClient supports explicit wake jobs and reports print timing in ack');
check(build.includes('requireReleaseSigning') && build.includes('KIWI_BRIDGE_KEYSTORE'), 'release build refuses to ship without external signing credentials');
check(page.includes('/downloads/kiwi-print-bridge.apk') && !page.includes('Télécharger Termux sur F-Droid'), 'Kiwi download page offers the native Android APK');
check((fs.statSync(path.join(root, 'app/android/gradlew')).mode & 0o111) !== 0, 'Gradle wrapper in app/android/gradlew is executable');

// No JDK ships with this repo and none is installed on the build machines, so
// `check.js` can never compile the bridge. A dropped brace therefore reaches
// both mirrors looking green — it did, in 0cb9f831, where the for-loop that
// walks the job list lost its closing brace and left `catch` dangling off a
// `for`. Balancing braces outside strings and comments is the cheapest thing
// that would have caught it.
function javaDepth(source) {
  let depth = 0, min = 0, i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      while (i < source.length && source[i] !== quote) i += source[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (c === '/' && source[i + 1] === '*') { i += 2; while (i + 1 < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth < min) min = depth; }
    i++;
  }
  return { depth, min };
}
for (const file of ['BridgeService', 'RelayClient', 'MainActivity', 'BridgeStore', 'BootReceiver']) {
  const { depth, min } = javaDepth(read(`bridge/android/app/src/main/java/com/kiwios/printbridge/${file}.java`));
  check(depth === 0 && min === 0, `${file}.java braces balance (depth ${depth}, min ${min}) — the file can parse`);
}

console.log(`\nAndroid print bridge: ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
