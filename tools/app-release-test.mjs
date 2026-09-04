#!/usr/bin/env node
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const runtime = read('app/src/native-runtime.js');
const appShell = read('app/src/index.html');
const nativeShell = read('app/src/native-shell.js');
const nativeRuntimeCss = read('app/src/native-runtime.css');
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
const pagesPro = read('assets/pages-pro.js');
const landingLocaleCss = read('assets/landing-locale-menu.css');
const dashboard = read('dashboard.html');
const launchStoryboard = read('app/ios/App/App/Base.lproj/LaunchScreen.storyboard');
const sceneDelegate = read('app/ios/App/App/SceneDelegate.swift');
const caisse = read('kiwi-caisse.html');
const capacitorConfig = read('app/capacitor.config.ts');
const appPackage = JSON.parse(read('app/package.json'));
const androidStyles = read('app/android/app/src/main/res/values/styles.xml');
const failures = [];
let controls = 0;

function pngSize(file) {
  const data = fs.readFileSync(new URL('../' + file, import.meta.url));
  if (data.length < 24 || data.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), colorType: data[25] };
}

function check(label, condition) {
  controls++;
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
check('Info.plist declares Face ID usage for biometric idle unlock',
  plist.includes('<key>NSFaceIDUsageDescription</key>'));
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

/* Native first paint must match the dark Kiwi Pro boot stage. Keep the
 * platform resource matrices complete: missing one density/scale otherwise
 * produces a fallback flash only on that device class. */
const iosSplash = [
  'app/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png',
  'app/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png',
  'app/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png',
];
const androidSplash = [
  ['app/android/app/src/main/res/drawable/splash.png', 480, 320],
  ['app/android/app/src/main/res/drawable-land-mdpi/splash.png', 480, 320],
  ['app/android/app/src/main/res/drawable-land-hdpi/splash.png', 800, 480],
  ['app/android/app/src/main/res/drawable-land-xhdpi/splash.png', 1280, 720],
  ['app/android/app/src/main/res/drawable-land-xxhdpi/splash.png', 1600, 960],
  ['app/android/app/src/main/res/drawable-land-xxxhdpi/splash.png', 1920, 1280],
  ['app/android/app/src/main/res/drawable-port-mdpi/splash.png', 320, 480],
  ['app/android/app/src/main/res/drawable-port-hdpi/splash.png', 480, 800],
  ['app/android/app/src/main/res/drawable-port-xhdpi/splash.png', 720, 1280],
  ['app/android/app/src/main/res/drawable-port-xxhdpi/splash.png', 960, 1600],
  ['app/android/app/src/main/res/drawable-port-xxxhdpi/splash.png', 1280, 1920],
];
check('all iOS launch assets are valid 2732px square PNGs',
  iosSplash.every((file) => { const size = pngSize(file); return size && size.width === 2732 && size.height === 2732; }));
check('iOS app icon is an opaque 1024px production PNG', (() => {
  const icon = pngSize('app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
  return icon && icon.width === 1024 && icon.height === 1024 && icon.colorType !== 4 && icon.colorType !== 6;
})());
check('all Android launch assets exist at their density-specific dimensions',
  androidSplash.every(([file, width, height]) => { const size = pngSize(file); return size && size.width === width && size.height === height; }));
check('iOS launch canvas uses Kiwi ink instead of the retired light splash',
  launchStoryboard.includes('red="0.03921568627450980"') && launchStoryboard.includes('green="0.05882352941176471"') && launchStoryboard.includes('blue="0.05098039215686274"'));
check('Android launch theme still owns the branded splash drawable',
  androidStyles.includes('<item name="android:background">@drawable/splash</item>'));
check('native setup uses the vendored Material visibility and direction icons',
  ['visibility.svg', 'visibility_off.svg', 'north_east.svg'].every((name) => {
    const file = new URL('../assets/icons/material/' + name, import.meta.url);
    return fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('viewBox="0 -960 960 960"');
  }));
check('password visibility is localized, stateful and keeps the password field addressable',
  appShell.includes('id="login-password"') && appShell.includes('id="password-toggle"') &&
  nativeShell.includes("tr(reveal ? 'hidePassword' : 'showPassword')") && nativeShell.includes("aria-pressed', reveal ? 'true' : 'false'"));
check('native setup paints edge-to-edge without applying the safe area twice',
  appShell.includes('<body class="native-shell-page">') &&
  nativeRuntimeCss.includes('body:not(.native-shell-page)') &&
  nativeRuntimeCss.includes('body.native-shell-page{min-height:calc(100dvh - var(--kiwi-keyboard));padding:0!important'));
check('iOS uses interactive keyboard dismissal in the embedded workspaces',
  sceneDelegate.includes('scrollView.keyboardDismissMode = .interactive'));
check('native login requests the right mobile keyboard actions',
  appShell.includes('autocapitalize="none"') && appShell.includes('enterkeyhint="next"') && appShell.includes('enterkeyhint="go"'));
check('the automatic launcher keeps the branded boot stage mounted through redirect',
  /if \(role && !manual && !forceSetup\) \{ location\.replace\(ROLES\[role\]\); return; \}\s*clearBoot\(\)/.test(nativeShell));
check('the native launch screen stays up until the final workspace paints, with a bounded escape hatch',
  appPackage.dependencies['@capacitor/splash-screen'] === '8.0.2' &&
  capacitorConfig.includes('launchAutoHide: false') && runtime.includes("call(splashScreen, 'hide')") &&
  runtime.includes('setTimeout(hideLaunchSplash, 8000)') && nativeShell.includes("CustomEvent('kiwi:native-ready')"));
check('the native till removes the empty bill shelf and synchronizes sheet accessibility',
  nativeRuntimeCss.includes('.kiwi-native-cart-empty .rightpanel') && runtime.includes("peek.setAttribute('aria-expanded'") &&
  runtime.includes("attributeFilter: ['hidden', 'style']") &&
  runtime.includes("classList.contains('kiwi-native-cart-empty') !== empty"));
check('successful tender completion emits semantic native feedback',
  caisse.includes('function nativeHapticSuccess()') && caisse.includes('nativeHapticSuccess();'));
check('Arabic KPI mixed-direction numbers are explicitly isolated',
  interactive.includes('<div dir="ltr" style="font-size:42px') &&
  interactive.includes('<bdi dir="ltr">+32%</bdi>') && interactive.includes('<bdi dir="ltr">+1,8</bdi>') &&
  interactive.includes('<bdi dir="ltr" style="font-family:var(--mono); text-align:end; font-weight:500;">${pct} %</bdi>'));
check('dashboard restores RTL from the persisted language, not only the query parameter',
  dashboard.includes("document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'") &&
  !dashboard.includes("document.documentElement.dir = picked === 'ar' ? 'rtl' : 'ltr'"));
check('illustrative terminal and settlement figures use stable keyed demo values',
  pagesPro.includes('function demoUnit(key)') && pagesPro.includes('demoUnit(`${t.id}:minute`)') &&
  pagesPro.includes('demoUnit(`settlements:forecast:${i}`)') && !pagesPro.includes("'14:' + (28 + Math.floor(Math.random() * 9))"));
check('landing header switches to its real menu before iPad controls collide',
  landingLocaleCss.includes('@media (min-width: 768px) and (max-width: 1100px)') &&
  landingLocaleCss.includes('header nav[aria-label]') && landingLocaleCss.includes('header button[aria-controls="kw-mobile-menu"]'));

if (failures.length) {
  failures.forEach((label) => console.error('  x ' + label));
  console.error('\napp-release-test: ' + failures.length + ' failure(s)');
  process.exit(1);
}
console.log(`\napp-release-test: ${controls} controls green`);
