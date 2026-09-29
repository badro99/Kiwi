#!/usr/bin/env node
// Pass 7: guards for measured iPhone launch, locale and layout regressions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('  ✓ ' + label); };
const runtime = read('app/src/native-runtime.js');
const css = read('app/src/native-runtime.css');
const config = read('app/capacitor.config.ts');
const storyboard = read('app/ios/App/App/Base.lproj/LaunchScreen.storyboard');
const swift = read('app/ios/App/App/KiwiNativeShell.swift');
const scene = read('app/ios/App/App/SceneDelegate.swift');
ok(config.includes('launchAutoHide: false') && runtime.includes('document.fonts.ready') && runtime.includes("root.classList.contains('kiwi-lock-ready')"), 'launch waits for fonts and the translated keypad');
ok(runtime.includes("pendingHostPayload = payload") && runtime.includes('if (pendingHostPayload) nativeHostPost(pendingHostPayload)'), 'workspace messages cannot reveal an unfinished web frame');
ok(storyboard.includes('image="KiwiBrandIcon"') && !storyboard.includes('image="Splash"') && storyboard.includes('constant="88"'), 'storyboard uses one constrained brand mark');
ok(swift.includes('KiwiMark(size: 88)') && css.includes('background:url(native-brand.png) center/88px 88px'), 'native launch, setup and lock share the same 88 point mark');
ok(scene.includes('webView?.isOpaque = false') && scene.includes('webView?.scrollView.backgroundColor = launchGround') && config.includes("backgroundColor: '#0A1612'"), 'native window and webview have a painted launch ground');
ok(!read('app/ios/App/App/Info.plist').includes('UISceneStoryboardFile'), 'only the programmatic scene creates the bridge, no empty duplicate window');
console.log(`native-pass7-test: ${checks} checks passed`);
