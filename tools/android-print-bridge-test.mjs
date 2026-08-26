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
const build = read('bridge/android/app/build.gradle');
const page = read('printer.html');

check(manifest.includes('FOREGROUND_SERVICE_DATA_SYNC') && manifest.includes('RECEIVE_BOOT_COMPLETED'), 'foreground printing and reboot permissions are declared');
check(manifest.includes('.BootReceiver') && manifest.includes('.BridgeService'), 'boot receiver and bridge service are registered');
check(service.includes('START_STICKY') && service.includes('startForeground'), 'bridge remains a foreground sticky service');
check(relay.includes('/api/print/bridges') && relay.includes('/api/print/jobs'), 'APK reuses the existing Kiwi pairing and job relay');
check(relay.includes('new InetSocketAddress(ip, port)') && relay.includes('8000'), 'LAN printing has a bounded raw TCP connection');
check(service.includes('RelayClient.ack') && service.includes('BridgeStore.clearPair'), 'jobs are acknowledged and revoked credentials are cleared');
check(build.includes('requireReleaseSigning') && build.includes('KIWI_BRIDGE_KEYSTORE'), 'release build refuses to ship without external signing credentials');
check(page.includes('/downloads/kiwi-print-bridge.apk') && !page.includes('Télécharger Termux sur F-Droid'), 'Kiwi download page offers the native Android APK');

console.log(`\nAndroid print bridge: ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
