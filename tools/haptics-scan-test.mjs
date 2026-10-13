#!/usr/bin/env node
/* Static haptics scan · design 2027, §15.6 (last bullet of "Evidence").
 *
 *   node tools/haptics-scan-test.mjs
 *
 * Over every tracked source file:
 *   - no `navigator.vibrate`, anywhere (the 14 shipped sites were removed or
 *     routed at stage 1, §20.3);
 *   - no UIImpactFeedbackGenerator, UINotificationFeedbackGenerator or
 *     UISelectionFeedbackGenerator, and no Android Vibrator / VibrationEffect,
 *     outside app/plugins/kiwi-haptics/;
 *   - no stock `Haptics` call (`Haptics.impact(`), handle (`Plugins.Haptics`) or
 *     `@capacitor/haptics` import in JS or HTML outside assets/kit/haptics.js
 *     (the feel layer in app/src/native-runtime.js included).
 * Plus the toast hook is gone and no DOM event named kiwi:toast buzzes. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failures++; console.log('  ✗ ' + msg); } };

const listed = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (listed.status !== 0) { console.log('  ✗ git ls-files failed: ' + (listed.stderr || '').trim()); process.exit(1); }

const SOURCE = /\.(html|js|mjs|cjs|ts|swift|java|kt)$/;
const SKIP = /^(docs\/|tools\/|node_modules\/|graphify-out\/)|(^|\/)(node_modules|www|build|dist)\/|\.min\.js$| \d+\.[a-z]+$|^app\/android\/app\/src\/(androidTest|test)\//;
const files = listed.stdout.split('\n').filter((f) => f && SOURCE.test(f) && !SKIP.test(f) && fs.existsSync(path.join(ROOT, f)));
ok(files.length > 100, `scanned ${files.length} tracked source files`);

const KIT = 'assets/kit/haptics.js';
const PLUGIN = 'app/plugins/kiwi-haptics/';
const JS_LIKE = /\.(html|js|mjs|cjs|ts)$/;
const NATIVE_METHODS = '(?:impact|notification|selectionStart|selectionChanged|selectionEnd|vibrate)';
const STOCK_CALL = new RegExp('(?<![A-Za-z])haptics\\s*\\.\\s*' + NATIVE_METHODS + '\\s*\\(', 'i');   // Haptics.impact(, haptics.notification(
const STOCK_HANDLE = /\bPlugins\b[^;\n]{0,16}\.\s*Haptics\b/i;                                                // Capacitor.Plugins.Haptics, plugins.Haptics
const STOCK_IMPORT = /@capacitor\/haptics/;
const hits = { vibrate: [], uikit: [], android: [], haptics: [] };
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (/navigator\s*(?:\.\s*vibrate\b|\[\s*['"]vibrate['"]\s*\])/.test(src)) hits.vibrate.push(f);
  if (!f.startsWith(PLUGIN) && /\bUI(?:Impact|Notification|Selection)FeedbackGenerator\b/.test(src)) hits.uikit.push(f);
  if (!f.startsWith(PLUGIN) && /\b(?:VibrationEffect|VibratorManager|performHapticFeedback)\b|getSystemService\(\s*(?:Context\.)?VIBRATOR/.test(src)) hits.android.push(f);
  /* The `Haptics.` rule is about JS call sites. Native sources and the plugin
     under app/plugins/kiwi-haptics/ are the sanctioned home of native haptics, and
     a doc comment naming Haptics.swift is not a call. `KiwiHaptics.play(` is the
     module's own name; the lookbehind keeps it out. */
  if (f !== KIT && JS_LIKE.test(f) && !f.startsWith(PLUGIN)) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (STOCK_CALL.test(code) || STOCK_HANDLE.test(code) || STOCK_IMPORT.test(code)) hits.haptics.push(f);
  }
}
ok(!hits.vibrate.length, 'no navigator.vibrate anywhere' + (hits.vibrate.length ? ': ' + hits.vibrate.join(', ') : ''));
ok(!hits.uikit.length, 'no UIKit feedback generator outside app/plugins/kiwi-haptics/' + (hits.uikit.length ? ': ' + hits.uikit.join(', ') : ''));
ok(!hits.android.length, 'no Android vibrator outside app/plugins/kiwi-haptics/' + (hits.android.length ? ': ' + hits.android.join(', ') : ''));
ok(!hits.haptics.length, 'no stock `Haptics` call, handle or import in JS or HTML outside ' + KIT + (hits.haptics.length ? ': ' + hits.haptics.join(', ') : ''));

const runtime = fs.readFileSync(path.join(ROOT, 'app/src/native-runtime.js'), 'utf8');
ok(!/kiwi:toast/.test(runtime), 'the kiwi:toast haptic hook is removed from the native runtime (toasts never buzz, §15.6)');
const swift = fs.readFileSync(path.join(ROOT, 'app/ios/App/App/KiwiNativeShell.swift'), 'utf8');
ok(!/FeedbackGenerator/.test(swift), 'the native shell plays no UIKit generator (send, presentSheet and the confirm panel are silent)');

console.log('\n' + (failures ? `haptics-scan-test: ${failures} FAILED, ${passed} passed` : `haptics-scan-test: ${passed} controls passed`));
process.exit(failures ? 1 : 0);
