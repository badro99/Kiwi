#!/usr/bin/env node
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const runtime = read('app/src/native-runtime.js');
const manifest = read('app/android/app/src/main/AndroidManifest.xml');
const privacy = read('app/ios/App/App/PrivacyInfo.xcprivacy');
const project = read('app/ios/App/App.xcodeproj/project.pbxproj');
const runbook = read('docs/ops/APP.md');
const plist = read('app/ios/App/App/Info.plist');
const exportOptions = read('app/ios/ExportOptions.plist');
const archiveScript = read('tools/app-archive.sh');
const gradle = read('app/android/app/build.gradle');
const appIgnore = read('app/.gitignore');
const gate = read('functions/_middleware.js');
const storeDoc = read('docs/ops/APP_STORE.md');
const interactive = read('assets/interactive.js');
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

/* ── Ce que les boutiques vérifient avant même la première revue ─────────── */
const legalPages = ['/privacy.html', '/privacy', '/terms.html', '/terms', '/support.html', '/support'];
check('privacy policy and support URLs are public (Apple and Google fetch them without a session)',
  legalPages.every((p) => {
    const re = new RegExp("isRead && \\([^;]*path === '" + p.replace(/[.]/g, '\\.') + "'[^;]*\\)\\) return next\\(\\);");
    return re.test(gate.replace(/\n/g, ' '));
  }));
check('the support page exists and names a contact',
  fs.existsSync(new URL('../support.html', import.meta.url)) && read('support.html').includes('contact@kiwi-os.com'));
check('Info.plist declares camera usage (the boutique barcode scan calls getUserMedia in the WebView)',
  plist.includes('NSCameraUsageDescription'));
check('Info.plist lists the three store languages', /CFBundleLocalizations[\s\S]*<string>fr<\/string>[\s\S]*<string>en<\/string>[\s\S]*<string>ar<\/string>/.test(plist));
check('Info.plist no longer requires armv7', !plist.includes('<string>armv7</string>') && plist.includes('<string>arm64</string>'));
check('ExportOptions.plist carries no Team ID and targets App Store Connect',
  exportOptions.includes('<string>KIWI_DEVELOPMENT_TEAM</string>') && exportOptions.includes('app-store-connect') && !/<string>[A-Z0-9]{10}<\/string>/.test(exportOptions));
check('the archive script injects the Team ID from the environment only',
  archiveScript.includes('KIWI_DEVELOPMENT_TEAM') && archiveScript.includes('-exportOptionsPlist') && !/(?![X]{10})[A-Z0-9]{10}/.test(archiveScript.replace(/KIWI_[A-Z_]+|PlistBuddy|ExportOptions|DEVELOPER_DIR/g, '')));
check('Android release signing reads keystore.properties or env, never a committed key',
  gradle.includes("rootProject.file('keystore.properties')") && gradle.includes('KIWI_ANDROID_KEYSTORE') && appIgnore.includes('android/keystore.properties') && appIgnore.includes('*.jks'));
check('the store pack exists with listing, privacy labels, review notes and demo account',
  storeDoc.includes('## 3. Fiche App Store Connect') && storeDoc.includes('## 4. App Privacy') && storeDoc.includes('## 5. Notes pour la revue') && storeDoc.includes('## 2. Compte démo'));
check('the dashboard offers in-app account deletion (App Store 5.1.1 v)',
  interactive.includes("'settings-delete-account'") && interactive.includes('mailto:dpo@kiwi-os.com') && interactive.includes("action: 'settings-delete-account'"));

if (failures.length) {
  failures.forEach((label) => console.error('  x ' + label));
  console.error('\napp-release-test: ' + failures.length + ' failure(s)');
  process.exit(1);
}
console.log('\napp-release-test: 20 controls green');
