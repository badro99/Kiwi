#!/usr/bin/env node
/* Kiwi Print Bridge for Android · the wiring that only Android can run.
 *
 * The bridge's logic that a plain JVM can load (write deadlines, the loop
 * watchdog, the self-update policy, the update URL) runs against fake
 * printers in tools/android-bridge-jvm-test.mjs (CI, .github/workflows/
 * android-bridge.yml, on every bridge change). What is left needs Android
 * itself: the foreground service loop, the alarm that restarts it, the
 * PackageInstaller session, the manifest. No JDK or emulator runs in the gate,
 * so these are declarations of that wiring, read from the sources that ship
 * in the APK (Pasta Corner, 26 Nov 2026: bridges 1.0.6 to 1.0.8). */
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = 'bridge/android/app/src/main/';
const read = (p) => fs.readFileSync(path.join(root, src, p), 'utf8');
let passed = 0, failed = 0;
function check(value, label) { if (value) { passed++; console.log('  ✓ ' + label); } else { failed++; console.error('  ✗ ' + label); } }

const manifest = read('AndroidManifest.xml');
const service = read('java/com/kiwios/printbridge/BridgeService.java');
const relay = read('java/com/kiwios/printbridge/RelayClient.java');
const updater = read('java/com/kiwios/printbridge/Updater.java');
const updateReceiver = read('java/com/kiwios/printbridge/UpdateReceiver.java');
const activity = read('java/com/kiwios/printbridge/MainActivity.java');

check(/deadTargets\.contains\(key\)/.test(service) && /deadTargets\.add\(key\)/.test(service),
  'after a printer fails, the rest of the batch for it is acked at once instead of each waiting past the 30 s lease');
check(/watchdog\.beat\(System\.currentTimeMillis\(\)\);\s*String token/.test(service) && (service.match(/watchdog\.beat\(/g) || []).length >= 2,
  'the service loop beats at every poll and after every ticket');
check(/scheduleWithFixedDelay\(this::checkLoop/.test(service) && /RelayClient\.abortPrinter\(\)/.test(service) && /setAndAllowWhileIdle\(/.test(service) && /killProcess\(/.test(service),
  'a stalled loop cuts the printer socket, then restarts the process through an alarm');
check(/offerUpdate\(response, count\)/.test(service) && /RelayClient\.updateUrl\(response\)/.test(service) && /url\.startsWith\("https:\/\/kiwi-os\.com\/"\)/.test(relay),
  'the update offer is shown once per version and only for an APK on kiwi-os.com');
check(/updater\.consider\(offer, UpdatePolicy\.quiet\(now, lastJobAt, jobs\)\)/.test(service) && /if \(jobs > 0\) lastJobAt = now/.test(service),
  'the service installs only when no ticket came for 10 minutes');
check(/UpdatePolicy\.verified\(file, offer\)/.test(updater) && /UpdatePolicy\.verified\(part, offer\)/.test(updater) && /apk changed before install/.test(updater) && /session\.abandon\(\)/.test(updater),
  'only an APK with the server\'s exact size and fingerprint reaches the installer, hashed again as it is written');
check(/setRequireUserAction\(PackageInstaller\.SessionParams\.USER_ACTION_NOT_REQUIRED\)/.test(updater) && /setAppPackageName\(ctx\.getPackageName\(\)\)/.test(updater) && /PendingIntent\.FLAG_MUTABLE/.test(updater),
  'PackageInstaller updates the app itself without a tap on Android 12+');
check(/STATUS_PENDING_USER_ACTION/.test(updateReceiver) && /EXTRA_INTENT/.test(updateReceiver) && /fallback\(offer\.version, offer\.url\)/.test(updater),
  'when Android still wants a tap, a notification carries it; after three failures, the 1.0.7 download notification');
check(/REQUEST_INSTALL_PACKAGES/.test(manifest) && /\.UpdateReceiver"\s*android:exported="false"/.test(manifest) && /MY_PACKAGE_REPLACED/.test(manifest),
  'manifest: install permission, a private status receiver, and the service restarts after the update');
check(/ACTION_MANAGE_UNKNOWN_APP_SOURCES/.test(activity) && /canRequestPackageInstalls\(\)/.test(activity) && /askedInstall/.test(activity),
  'the app asks once for « Installer des applis inconnues »');

console.log(`\nAndroid bridge wiring: ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
