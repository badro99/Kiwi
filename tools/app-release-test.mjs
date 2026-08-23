#!/usr/bin/env node
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const runtime = read('app/src/native-runtime.js');
const manifest = read('app/android/app/src/main/AndroidManifest.xml');
const privacy = read('app/ios/App/App/PrivacyInfo.xcprivacy');
const project = read('app/ios/App/App.xcodeproj/project.pbxproj');
const runbook = read('docs/ops/APP.md');
const failures = [];

function check(label, condition) {
  if (condition) console.log('  + ' + label);
  else failures.push(label);
}

check('active native termination is reported through the shared redacted reporter',
  runtime.includes("previous.state === 'active'") && runtime.includes('KiwiReportError'));
check('background termination is not classified as a crash',
  runtime.includes("event && event.isActive ? 'active' : 'background'"));
check('failed Capacitor restoration is observable', runtime.includes("appRestoredResult") && runtime.includes('native-restored-result-failed'));
check('Android v1 requests camera and notifications',
  manifest.includes('android.permission.CAMERA') && manifest.includes('android.permission.POST_NOTIFICATIONS'));
check('Android v1 does not request Bluetooth', !manifest.includes('android.permission.BLUETOOTH'));
check('Apple privacy manifest declares no tracking and diagnostic collection',
  privacy.includes('<key>NSPrivacyTracking</key>') && privacy.includes('NSPrivacyCollectedDataTypeCrashData'));
check('Apple required-reason APIs are declared',
  privacy.includes('NSPrivacyAccessedAPICategoryUserDefaults') && privacy.includes('CA92.1') && privacy.includes('C617.1'));
check('privacy manifest is bundled in the iOS target',
  project.includes('PrivacyInfo.xcprivacy in Resources'));
check('the Apple Team ID has one external source of truth',
  (project.match(/DEVELOPMENT_TEAM = "\$\(KIWI_DEVELOPMENT_TEAM\)";/g) || []).length === 2 && !/DEVELOPMENT_TEAM = [A-Z0-9]{10};/.test(project));
check('runbook covers TestFlight, field proof and rollback',
  runbook.includes('### TestFlight interne') && runbook.includes('POS-8370') && runbook.includes('### Rollback'));

if (failures.length) {
  failures.forEach((label) => console.error('  x ' + label));
  console.error('\napp-release-test: ' + failures.length + ' failure(s)');
  process.exit(1);
}
console.log('\napp-release-test: 10 controls green');
