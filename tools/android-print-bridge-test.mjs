#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
check(relay.includes('new InetSocketAddress(ip, port)') && /PRINT_CONNECT_MS = 5000/.test(relay) && /WARM_CONNECT_MS = 2500/.test(relay), 'LAN printing has a bounded raw TCP connection (5 s for a ticket, 2.5 s for a warm-up)');
// 1.0.6 · Pasta Corner, 26 Nov 2026: a printer that stopped reading froze the
// 1.0.5 service for twelve minutes inside write(), tickets and drawer kicks
// queued behind it. Every write is now bounded by a watchdog that closes the socket.
check(/WRITE_DEADLINE_MS = 8000/.test(relay) && /private static void writeWithDeadline\(/.test(relay) && /WATCHDOG\.schedule\(/.test(relay) && /socket\.close\(\)/.test(relay),
  'a printer write has a deadline: a printer that stops reading cannot freeze the bridge');
check(/writeWithDeadline\(PRINTER_PROBE_BYTES, PROBE_WRITE_DEADLINE_MS\)/.test(relay) && !/printerOutput\.write\(data\)/.test(relay),
  'no printer write (ticket or warm probe) bypasses the deadline');
check(/new PrinterException\("printer-write-timeout", true\)/.test(relay) && /new PrinterException\("printer-unreachable /.test(relay) && /body\.put\("outcome", "uncertain"\)/.test(relay),
  'a timed-out write is acked uncertain (never reprinted blind); an unreachable printer is acked failed so the server requeues it');
check(/deadTargets\.contains\(key\)/.test(service) && /deadTargets\.add\(key\)/.test(service),
  'after a printer fails, the rest of the batch for it is acked at once instead of each waiting past the 30 s lease');
check(service.includes('RelayClient.ack') && service.includes('BridgeStore.clearPair'), 'jobs are acknowledged and revoked credentials are cleared');
check(build.includes('versionCode 9') && build.includes("versionName '1.0.8'"), 'Android bridge build is bumped to v1.0.8 (code 9)');
check(relay.includes('VERSION = "1.0.8"') && relay.includes('PRINTER_KEEPALIVE_MS = 10000'), 'RelayClient is v1.0.8 with 10s keepalive interval');
// 1.0.7 · the service watches itself (LoopWatchdog, run on the JVM by android-bridge-jvm-test)
// and offers the server's update. Here: the wiring the JVM cannot see.
const watchdogSrc = read('bridge/android/app/src/main/java/com/kiwios/printbridge/LoopWatchdog.java');
check(/ABORT_AFTER_MS = 75_000L/.test(watchdogSrc) && /RESTART_AFTER_MS = 150_000L/.test(watchdogSrc) && !/import android/.test(watchdogSrc),
  'the watchdog thresholds are 75 s (cut the printer socket) and 150 s (restart), in a class with no Android import');
check(/watchdog\.beat\(System\.currentTimeMillis\(\)\);\s*String token/.test(service) && (service.match(/watchdog\.beat\(/g) || []).length >= 2,
  'the service loop beats at every poll and after every ticket');
check(/scheduleWithFixedDelay\(this::checkLoop/.test(service) && /RelayClient\.abortPrinter\(\)/.test(service) && /setAndAllowWhileIdle\(/.test(service) && /killProcess\(/.test(service),
  'a stalled loop cuts the printer socket, then restarts the process through an alarm');
check(/static void abortPrinter\(\)/.test(relay) && !/static synchronized void abortPrinter/.test(relay) && /private static volatile Socket printerSocket/.test(relay),
  'abortPrinter does not wait for the lock the stuck thread holds');
check(/offerUpdate\(response, count\)/.test(service) && /RelayClient\.updateUrl\(response\)/.test(service) && /url\.startsWith\("https:\/\/kiwi-os\.com\/"\)/.test(relay),
  'the update offer is shown once per version and only for an APK on kiwi-os.com');
// 1.0.8 · it installs itself. The policy runs on the JVM (android-bridge-jvm-test);
// here, the Android wiring the JVM cannot see.
const pkg = 'bridge/android/app/src/main/';
const updater = read(pkg + 'java/com/kiwios/printbridge/Updater.java'), policy = read(pkg + 'java/com/kiwios/printbridge/UpdatePolicy.java');
const updateReceiver = read(pkg + 'java/com/kiwios/printbridge/UpdateReceiver.java'), activity = read(pkg + 'java/com/kiwios/printbridge/MainActivity.java');
check(!/import android/.test(policy) && /QUIET_MS = 10 \* 60_000L/.test(policy) && /MAX_ATTEMPTS = 3/.test(policy) && /\[0-9a-f\]\{64\}/.test(policy),
  'self-update policy: 10 quiet minutes, 3 tries, a sha256 required, in a class with no Android import');
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
// The server paces every bridge (functions/api/print/jobs.js: 1 s in service, 5 s idle).
// Up to 1.0.4 the APK slept a fixed second and ignored it: 86 400 polls a tablet a day.
check(/sleep\(count > 0 \? 250 : RelayClient\.nextPollMs\(response\)\)/.test(service) && !/sleep\(count > 0 \? 250 : 1000\)/.test(service),
  'an idle bridge waits as long as the server says (poll), not a fixed second');
check(/optInt\("poll", 0\)/.test(relay) && /Math\.max\(200, Math\.min\(5000, poll\)\)/.test(relay) && /: 1000;/.test(relay),
  'the poll hint is bounded 200 ms to 5 s like the Node bridge, 1 s when the server gives none');
check(relay.includes('7 * 24 * 60 * 60 * 1000') && server.includes('7 * 24 * 60 * 60 * 1000'), 'printer warm window is 7 days across Android and Node bridges — it survives a weekly closing day');
check(relay.includes('PRINTER_WARM_BACKOFF_MAX_MS') && relay.includes('warmBackoffMs') && server.includes('PRINTER_WARM_BACKOFF_MAX_MS'), 'a printer that stops answering is probed less often, not every 10s for a week');
check(/printerWarmMisses = warmPrinter\([^)]*\) \? 0 : printerWarmMisses \+ 1/.test(relay), 'the Android backoff resets the moment the printer answers again');
check(relay.includes('0x10, 0x04, 0x01') && relay.includes('probePrinter'), 'RelayClient probes printer readiness via real-time DLE EOT status bytes');
check(service.includes('resumePrinterWarm') && service.includes('saveWarmTarget'), 'BridgeService persists warm target and resumes warm channel on boot');
check(relay.includes('"wake"') && relay.includes('timing'), 'RelayClient supports explicit wake jobs and reports print timing in ack');
check(build.includes('requireReleaseSigning') && build.includes('KIWI_BRIDGE_KEYSTORE'), 'release build refuses to ship without external signing credentials');
check(page.includes('/downloads/kiwi-print-bridge.apk') && !page.includes('Télécharger Termux sur F-Droid'), 'Kiwi download page offers the native Android APK');
// Windows has no execute bit on disk: there, read the mode Git records (what ships).
const gradlewExecutable = process.platform === 'win32'
  ? /^100755 /.test(spawnSync('git', ['ls-files', '-s', 'app/android/gradlew'], { cwd: root, encoding: 'utf8' }).stdout)
  : (fs.statSync(path.join(root, 'app/android/gradlew')).mode & 0o111) !== 0;
check(gradlewExecutable, 'Gradle wrapper in app/android/gradlew is executable');

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
for (const file of ['BridgeService', 'RelayClient', 'MainActivity', 'BridgeStore', 'BootReceiver', 'Updater', 'UpdatePolicy', 'UpdateReceiver', 'LoopWatchdog']) {
  const { depth, min } = javaDepth(read(`bridge/android/app/src/main/java/com/kiwios/printbridge/${file}.java`));
  check(depth === 0 && min === 0, `${file}.java braces balance (depth ${depth}, min ${min}) — the file can parse`);
}

console.log(`\nAndroid print bridge: ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
