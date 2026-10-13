#!/usr/bin/env node
/* The kiwi-haptics plugin and the iOS floor · design 2027, §15.2 and §4.
 *
 *   node tools/haptics-plugin-test.mjs
 *
 * Static contract (no Xcode, no JDK runs here): in stock mode the Swift side
 * is a line-for-line copy of @capacitor/haptics 8.0.2's Haptics.swift (a new
 * generator per call, no prepare(), the selection generator made by
 * selectionStart), play() resolves the native clock after the generator call,
 * the Android waveforms equal the stock ones, the plugin is wired into the
 * app, and IPHONEOS_DEPLOYMENT_TARGET is 15.5 in all four configurations. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failures++; console.log('  ✗ ' + msg); } };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

const P = 'app/plugins/kiwi-haptics/';
const swift = read(P + 'ios/Sources/KiwiHaptics/KiwiHapticsPlugin.swift');
const java = read(P + 'android/src/main/java/com/kiwios/haptics/KiwiHapticsPlugin.java');
const pkg = JSON.parse(read(P + 'package.json'));
const defs = read(P + 'src/definitions.ts');

console.log('\nLayout (same as kiwi-dynamic-type)');
for (const f of ['package.json', 'Package.swift', 'src/index.ts', 'src/definitions.ts', 'dist/esm/index.js', 'dist/esm/index.d.ts', 'android/build.gradle', 'android/src/main/AndroidManifest.xml']) ok(exists(P + f), f + ' exists');
ok(pkg.name === 'kiwi-haptics' && pkg.capacitor?.ios?.src === 'ios' && pkg.capacitor?.android?.src === 'android', 'package.json declares the iOS and Android sources to Capacitor');
ok(/registerPlugin<KiwiHapticsPlugin>\('KiwiHaptics'\)/.test(read(P + 'src/index.ts')), 'the JS name is KiwiHaptics');

console.log('\niOS · stock mode is today\'s @capacitor/haptics');
ok(/public let jsName = "KiwiHaptics"/.test(swift) && ['play', 'clock', 'prepare'].every((m) => new RegExp(`CAPPluginMethod\\(name: "${m}"`).test(swift)), 'registers play, clock and prepare under the name KiwiHaptics');
ok(/let generator = UIImpactFeedbackGenerator\(style: stockImpactStyle\(style\)\)\s*generator\.impactOccurred\(\)/.test(swift), 'stock impact: a NEW generator per call, impactOccurred() straight away');
ok(/let generator = UINotificationFeedbackGenerator\(\)\s*generator\.notificationOccurred\(notificationType\(style\)\)/.test(swift), 'stock notification: a NEW generator per call');
const stockBranches = swift.split('if prepared {')[1] ? swift.slice(swift.indexOf('} else {', swift.indexOf('func play(')), swift.indexOf('private func playSelection')) : '';
ok(stockBranches.length > 0 && !/prepare\(\)/.test(stockBranches), 'no prepare() on the stock impact or notification path');
ok(/stockSelection = UISelectionFeedbackGenerator\(\)\s*stockSelection\?\.prepare\(\)/.test(swift), 'selectionStart makes the selection generator and prepares it, as Haptics.swift does');
ok(/if let generator = stockSelection \{\s*generator\.selectionChanged\(\)\s*generator\.prepare\(\)/.test(swift), 'selectionChanged ticks then re-prepares, and a bare one is silent without a start');
ok(/stockSelection = nil/.test(swift), 'selectionEnd drops the generator');
ok(/case "MEDIUM": return \.medium/.test(swift) && /default: return \.heavy/.test(swift), 'the stock style table: MEDIUM, LIGHT, anything else Heavy (Soft and Rigid play Light in stock mode)');
ok(/case "WARNING": return \.warning/.test(swift) && /case "ERROR": return \.error/.test(swift) && /default: return \.success/.test(swift), 'the stock notification table: Success unless Warning or Error');
console.log('\niOS · prepared mode and the clock');
ok(/UIImpactFeedbackGenerator\] = \[:\]/.test(swift) && /case "SOFT": return \.soft/.test(swift), 'prepared mode keeps one long-lived impact generator per style, including .soft');
ok(/lazy var notifications = UINotificationFeedbackGenerator\(\)/.test(swift) && /lazy var selection = UISelectionFeedbackGenerator\(\)/.test(swift), 'one notification and one selection generator');
const playBlock = swift.slice(swift.indexOf('@objc public func play('), swift.indexOf('@objc public func clock('));
ok(/DispatchQueue\.main\.async \{[\s\S]*self\.engine\.play\([\s\S]*call\.resolve\(\["t": CACurrentMediaTime\(\)\]\)/.test(playBlock), 'play() reads CACurrentMediaTime() on the main thread, after the generator call returned');
ok(/func clock\([\s\S]*call\.resolve\(\["t": CACurrentMediaTime\(\)\]\)/.test(swift), 'clock() resolves {t} and nothing else');
ok(/if prepared \{ self\.engine\.prepare/.test(swift), 'prepare() is a no-op in stock mode');
ok(/mode: KiwiHapticMode|mode\?: KiwiHapticMode/.test(defs), 'the contract carries mode on play and prepare');

console.log('\nAndroid · the stock waveforms');
const stockDir = 'app/node_modules/@capacitor/haptics/android/src/main/java/com/capacitorjs/plugins/haptics/arguments/';
const tables = {
  LIGHT: ['{ 0, 50 }', '{ 0, 110 }', '{ 0, 20 }'], MEDIUM: ['{ 0, 43 }', '{ 0, 180 }', '{ 0, 43 }'], HEAVY: ['{ 0, 60 }', '{ 0, 255 }', '{ 0, 61 }'],
  SUCCESS: ['{ 0, 35, 65, 21 }', '{ 0, 250, 0, 180 }', '{ 0, 35, 65, 21 }'],
  WARNING: ['{ 0, 30, 40, 30, 50, 60 }', '{ 255, 255, 255, 255, 255, 255 }', '{ 0, 30, 40, 30, 50, 60 }'],
  ERROR: ['{ 0, 27, 45, 50 }', '{ 0, 120, 0, 250 }', '{ 0, 27, 45, 50 }'],
  SELECTION: ['{ 0, 100 }', '{ 0, 100 }', '{ 0, 70 }']
};
for (const [name, [t, a, o]] of Object.entries(tables)) {
  ok(new RegExp(`${name}_T = ${t.replace(/[{}]/g, '\\$&')}`).test(java) && new RegExp(`${name}_A = ${a.replace(/[{}]/g, '\\$&')}`).test(java) && new RegExp(`${name}_OLD = ${o.replace(/[{}]/g, '\\$&')}`).test(java), `${name}: timings, amplitudes and the pre-26 pattern`);
}
if (exists(stockDir + 'HapticsImpactType.java')) {
  const stock = read(stockDir + 'HapticsImpactType.java') + read(stockDir + 'HapticsNotificationType.java') + read(stockDir + 'HapticsSelectionType.java');
  const norm = (s) => s.replace(/\s+/g, ' ');
  ok(Object.values(tables).every(([t, a, o]) => [t, a, o].every((x) => norm(stock).includes(norm(x.replace(/\{ /, '{ ').replace(/ \}/, ' }'))))), 'every table equals the one in the installed @capacitor/haptics');
}
ok(/selectionStarted = true/.test(java) && /if \(selectionStarted\) perform\(SELECTION_T/.test(java), 'a selection tick is silent until selectionStart, as in the stock plugin');
ok(/result\.put\("t", SystemClock\.uptimeMillis\(\) \/ 1000\.0\)/.test(java) && /call\.resolve\(now\(\)\);\s*\}/.test(java), 'play() resolves {t: uptimeMillis / 1000} after the vibrator call');
ok(/@CapacitorPlugin\(name = "KiwiHaptics"\)/.test(java), 'registered as KiwiHaptics');

console.log('\nWired into the app');
const appPkg = JSON.parse(read('app/package.json'));
ok(appPkg.dependencies['kiwi-haptics'] === 'file:plugins/kiwi-haptics', 'app/package.json depends on the local plugin');
const lock = JSON.parse(read('app/package-lock.json'));
ok(lock.packages[''].dependencies['kiwi-haptics'] === 'file:plugins/kiwi-haptics'
  && JSON.stringify(lock.packages['node_modules/kiwi-haptics']) === JSON.stringify({ resolved: 'plugins/kiwi-haptics', link: true })
  && JSON.stringify(lock.packages['plugins/kiwi-haptics']) === JSON.stringify(lock.packages['plugins/kiwi-dynamic-type']), 'the lock lists it exactly as it lists kiwi-dynamic-type');
const spm = read('app/ios/App/CapApp-SPM/Package.swift');
ok(/\.package\(name: "KiwiHaptics", path: "\.\.\/\.\.\/\.\.\/plugins\/kiwi-haptics"\)/.test(spm) && /\.product\(name: "KiwiHaptics", package: "KiwiHaptics"\)/.test(spm), 'CapApp-SPM links the package and the product');
ok(/include ':kiwi-haptics'\s*project\(':kiwi-haptics'\)\.projectDir = new File\('\.\.\/plugins\/kiwi-haptics\/android'\)/.test(read('app/android/capacitor.settings.gradle')) && /implementation project\(':kiwi-haptics'\)/.test(read('app/android/app/capacitor.build.gradle')), 'the Android build includes the module');

console.log('\niOS floor 15.5 (§4, owner decision 1)');
const pbx = read('app/ios/App/App.xcodeproj/project.pbxproj');
const targets = [...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+);/g)].map((m) => m[1]);
ok(targets.length === 4 && targets.every((t) => t === '15.5'), 'IPHONEOS_DEPLOYMENT_TARGET is 15.5 in all four build configurations (' + targets.join(', ') + ')');
ok(/platforms: \[\.iOS\(\.v15\)\]/.test(spm) && /platforms: \[\.iOS\(\.v15\)\]/.test(read(P + 'Package.swift')), 'the SwiftPM floors stay .v15: a dependency may not ask for more than the generated CapApp-SPM, and the Xcode target is the real floor');

console.log('\n' + (failures ? `haptics-plugin-test: ${failures} FAILED, ${passed} passed` : `haptics-plugin-test: ${passed} controls passed`));
process.exit(failures ? 1 : 0);
