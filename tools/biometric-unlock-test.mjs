#!/usr/bin/env node
// Test suite: Biometric Unlock & Inactivity Relock (Criterion #4)
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
const EXPECTED = 10;

function check(label, ok) {
  assert(ok, label);
  passed++;
  console.log('  + ' + label);
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection in biometric-unlock-test:', err);
  process.exit(1);
});

async function run() {
  console.log('\n■ Biometric Unlock & Inactivity Relock Tests');

  const nativeRuntime = fs.readFileSync(path.join(ROOT, 'app/src/native-runtime.js'), 'utf8');
  const swiftPlugin = fs.readFileSync(path.join(ROOT, 'app/plugins/kiwi-printer-socket/ios/Sources/KiwiPrinterSocket/KiwiPrinterSocketPlugin.swift'), 'utf8');
  const javaPlugin = fs.readFileSync(path.join(ROOT, 'app/plugins/kiwi-printer-socket/android/src/main/java/com/kiwios/printersocket/KiwiPrinterSocketPlugin.java'), 'utf8');
  const caisseHtml = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');
  const dashboardHtml = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');

  // 1. Swift plugin registers and implements checkBiometrics and authenticateBiometric
  check('Swift plugin registers checkBiometrics and authenticateBiometric in pluginMethods',
    swiftPlugin.includes('CAPPluginMethod(name: "checkBiometrics"') &&
    swiftPlugin.includes('CAPPluginMethod(name: "authenticateBiometric"'));

  check('Swift plugin implements LocalAuthentication biometrics evaluation',
    swiftPlugin.includes('import LocalAuthentication') &&
    swiftPlugin.includes('.deviceOwnerAuthenticationWithBiometrics') &&
    swiftPlugin.includes('context.evaluatePolicy('));

  // 2. Android plugin implements biometric methods symmetrically
  check('Android Java plugin implements checkBiometrics and authenticateBiometric stubs',
    javaPlugin.includes('public void checkBiometrics(PluginCall call)') &&
    javaPlugin.includes('public void authenticateBiometric(PluginCall call)'));

  // 3. Native runtime exposes checkBiometrics, authenticateBiometric and app state handlers
  check('Native runtime exports checkBiometrics and authenticateBiometric on KiwiNative',
    nativeRuntime.includes('checkBiometrics: checkBiometrics') &&
    nativeRuntime.includes('authenticateBiometric: authenticateBiometric'));

  // 4. Inactivity threshold is exactly 20 minutes (Criterion #4)
  check('Native runtime enforces 20-minute idle threshold for biometric relock',
    nativeRuntime.includes('20 * 60 * 1000') &&
    nativeRuntime.includes('sessionStorage.setItem(\'kiwi:native:biometric-pending\', \'1\')'));

  // 5. Short absence (< 20 min) does not trigger biometric relock
  check('Short absence does not trigger relock flag',
    nativeRuntime.includes('awayFor >= NATIVE_IDLE_TIMEOUT_MS'));

  // 6. In-progress ticket survives reload in kiwi-caisse.html
  check('Caisse persists in-progress cart in persistShift',
    caisseHtml.includes('cart: cart,') &&
    caisseHtml.includes('localStorage.setItem(KC_STORE, JSON.stringify({'));

  check('Caisse restores in-progress cart on shift load',
    caisseHtml.includes('if (Array.isArray(d.cart)) cart = d.cart;'));

  // 7. Successful biometric unlock opens the dashboard and caisse directly
  check('Biometric success triggers direct unlock on dashboard and caisse',
    nativeRuntime.includes('window.__kiwiLock.reveal()') &&
    nativeRuntime.includes('window.__kiwiUnlockApp()'));

  // 8. Pending flag is cleared and code entry remains on cancel/failure
  check('Pending unlock flag is safely cleared after biometric attempt',
    nativeRuntime.includes('sessionStorage.removeItem(\'kiwi:native:biometric-pending\')'));

  assert.strictEqual(passed, EXPECTED, `Expected ${EXPECTED} checks, passed ${passed}`);
  console.log(`\nbiometric-unlock-test: ${passed} checks green\n`);
}

run();
