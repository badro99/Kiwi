#!/usr/bin/env node
// Pass 7: guards for measured iPhone launch, locale and layout regressions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
// Execute the actual bootstrap against conflicting legacy keys and a picker change.
const data = new Map([['kiwiNativeLocale','ar'], ['kiwiLang','en']]);
const root = {lang:'fr',dir:'ltr',classList:{add(){}}};
let localeChanged;
const context = {window:{},document:{documentElement:root},navigator:{language:'en'},localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},MutationObserver:class{constructor(cb){localeChanged=cb;}observe(){}}};
vm.runInNewContext(read('app/src/native-locale.js'), context);
ok(root.lang==='ar' && data.get('kiwiLang')==='ar', 'saved native Arabic wins over stale dashboard English');
context.window.KiwiNativeLocale.set('fr');
ok(['kiwiNativeLocale','kiwiLang','kiwiCaisseLang','kiwiCuisineLang'].every(k=>data.get(k)==='fr'), 'a picker change updates all four compatibility keys');
root.lang='en';localeChanged();
ok(data.get('kiwiNativeLocale')==='en', 'Team and Kitchen locale changes persist for relaunch');
ok(read('assets/caisse-lang.js').includes('window.KiwiNativeLocale.set(id)') && read('assets/i18n.js').includes('window.KiwiNativeLocale.set(lang)'), 'till and dashboard setters use the same native source');
const vexel = read('assets/design-vexel-layout.js');
ok(vexel.includes('window.KiwiNumber.number(current)') && vexel.includes('window.KiwiNumber.number(total)'), 'regulars format both values through KiwiNumber');
ok(vexel.includes("clientDelta.dir = 'ltr'") && vexel.includes("cleaned.replace(/,/g, '')"), 'regulars isolate signed deltas and parse English grouped values without losing magnitude');
ok(vexel.includes("document.createElement('bdi')") && vexel.includes('class="vexel-goal-values" dir="ltr"'), 'goal percentages and amount pairs isolate numeric runs');
ok(css.includes('.vexel-revenue-rail>.vexel-rail-card{height:auto!important'), 'phone goal cards grow from their content instead of stretching an empty band');
ok(css.includes('.kpi-m[data-kpi="ratio"] .v{direction:ltr!important;unicode-bidi:isolate'), 'card and cash retain their order together with the percent unit in RTL');
ok(read('assets/i18n.js').includes('format: formatNumber'), 'KiwiNumber accepts precision options for display without changing fiscal output');
for (const file of ['team','restaurant-menu-workspace','account','simple','clients-book','operations-ui','briefing','pages-pro']) {
  ok(read('assets/'+file+'.js').includes('window.KiwiNumber?.format') || read('assets/'+file+'.js').includes('window.KiwiNumber?.number'), file+' routes display figures through KiwiNumber');
}
ok(read("assets/dateRange.js").includes("i < xs.length && Number.isFinite(xs[i])"), "partial chart series cannot abort locale rendering on a stale tick");
ok(read("assets/restaurant-menu-workspace.js").includes("if(!d.cats.length){openCategory(null);return;}"), "empty-menu New item opens section creation instead of a dead button");
// Execute the shared formatter itself in each supported locale.
const i18nSource = read('assets/i18n.js');
const numberStart = i18nSource.indexOf('  const numberLocale =');
const numberEnd = i18nSource.indexOf('\n  };', i18nSource.indexOf('window.KiwiNumber =', numberStart)) + 5;
for (const language of ['en', 'fr', 'ar']) {
  const ctx = {window:{},getLang:()=>language,Intl,Number};
  vm.runInNewContext(i18nSource.slice(numberStart, numberEnd), ctx);
  const f = ctx.window.KiwiNumber;
  ok(f.number(1240) === (language === 'en' ? '1,240' : '1\u202f240'), language+' groups regulars without magnitude loss');
  ok(f.format(15765.38,{minimumFractionDigits:2,maximumFractionDigits:2}) === (language === 'en' ? '15,765.38' : '15\u202f765,38'), language+' preserves precision and separators');
  ok(f.number(NaN) === '·', language+' rejects non-finite display values');
}
ok(read("assets/mobile-nav.js").includes('nav a[data-nav], [data-action="clients-directory"]') && read("assets/mobile-nav.js").includes("true); // Capture before destination"), "all sidebar destinations close the phone menu even when handlers stop propagation");
ok(!css.includes("border-radius:20.24px") && swift.includes("Match the unmasked LaunchScreen asset"), "all launch marks preserve the same source-image corners");
ok(read("assets/day-report-dash.js").includes("window.KiwiNumber?.format(v") && read("assets/day-report-dash.js").includes('<bdi dir="ltr"><b>'), "daily report uses shared display money and isolates signed percentages");
ok(/\.topbar \.ai-btn\{[^}]*height:44px!important;min-height:44px!important/.test(css), "Kiwi AI header entry meets the 44 point touch target");
ok(runtime.includes("var dark = setup || inkLock ||"), "ink lock screens keep readable status text in light appearance");
ok(read("assets/mobile-nav.js").includes("if (!sidebar.contains(e.target)) return;"), "window capture dismisses navigation before document-level destination interception");
console.log(`native-pass7-test: ${checks} checks passed`);
