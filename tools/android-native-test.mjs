#!/usr/bin/env node
/* Android native shell (app/android, Capacitor 8) · static contract.
 *
 * No JDK runs in check.js, so nothing here compiles Kotlin or Java. What it
 * can hold is the shape of each decision: the Compose setup clears the system
 * bars and the keyboard, every tab id the web sends has its own Material icon,
 * colours are brand tokens, the tab overlay follows the navigation bar and
 * publishes the same CSS variables as iOS, JS dialogs speak fr/en/ar, the
 * system text size reaches the WebView and the web, the manifest keeps pairing
 * state on the device, the version is injectable, the adaptive icon is the
 * real mark inside the safe circle, and the export/share plugin methods exist. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let pass = 0;
let fail = 0;
function ok(value, message) {
  if (value) { pass++; return; }
  fail++;
  console.error('  x ' + message);
}

const RES = 'app/android/app/src/main/res/';
const kt = read('app/android/app/src/main/java/com/kiwios/pro/MainActivity.kt');
const manifest = read('app/android/app/src/main/AndroidManifest.xml');
const gradle = read('app/android/app/build.gradle');
const settingsGradle = read('app/android/capacitor.settings.gradle');
const buildGradle = read('app/android/app/capacitor.build.gradle');
const runtime = read('app/src/native-runtime.js');
const runtimeCss = read('app/src/native-runtime.css');
const shell = read('app/src/native-shell.js');
const serveur = read('kiwi-serveur.html');
const swiftShell = read('app/ios/App/App/KiwiNativeShell.swift');
const tokens = read('assets/tokens.css');
const printerJava = read('app/plugins/kiwi-printer-socket/android/src/main/java/com/kiwios/printersocket/KiwiPrinterSocketPlugin.java');
const printerGradle = read('app/plugins/kiwi-printer-socket/android/build.gradle');
const dynamicJavaPath = 'app/plugins/kiwi-dynamic-type/android/src/main/java/com/kiwios/dynamictype/KiwiDynamicTypePlugin.java';
const dynamicJava = exists(dynamicJavaPath) ? read(dynamicJavaPath) : '';
const dynamicPkg = JSON.parse(read('app/plugins/kiwi-dynamic-type/package.json'));

/* Same idea as android-print-bridge-test: braces balanced outside strings,
 * chars and comments is the cheapest proof a file can still parse. */
function braceDepth(source) {
  let depth = 0, min = 0, i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (c === '/' && source[i + 1] === '*') { i += 2; while (i + 1 < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth < min) min = depth; }
    i++;
  }
  return depth === 0 && min === 0;
}
ok(braceDepth(kt), 'MainActivity.kt braces balance');
ok(braceDepth(printerJava), 'KiwiPrinterSocketPlugin.java braces balance');
ok(dynamicJava && braceDepth(dynamicJava), 'KiwiDynamicTypePlugin.java exists and its braces balance');

/* ── 3 · brand colours ─────────────────────────────────────────────────── */
const token = (name) => (tokens.match(new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})')) || [])[1];
const brand = new Set(['atlas', 'riad', 'mint', 'paper', 'ink'].map((n) => (token(n) || '').toUpperCase()).filter(Boolean));
ok(brand.has('#7DF2B0') && brand.has('#F7F5F0'), 'assets/tokens.css still defines the brand tokens this suite compares against');
ok(/KiwiMint = Color\(0xFF7DF2B0\)/.test(kt) && !/00FFAE/i.test(kt), 'KiwiMint is the product mint #7DF2B0, not #00FFAE');
const ktColours = [...kt.matchAll(/Color\(0xFF([0-9A-Fa-f]{6})\)/g)].map((m) => '#' + m[1].toUpperCase());
ok(ktColours.length >= 3 && ktColours.every((c) => brand.has(c)), 'every hard-coded Compose colour is a brand token (' + ktColours.filter((c) => !brand.has(c)).join(', ') + ')');
ok(!/Color\.White/.test(kt), 'no pure white surfaces in the Compose shell');

/* ── 1 · setup insets and keyboard ─────────────────────────────────────── */
const setup = kt.slice(kt.indexOf('private fun SetupSurface('), kt.indexOf('private fun NativeField('));
ok(/LazyColumn\(modifier = Modifier[^\n]*\.(systemBarsPadding|statusBarsPadding)\(\)[^\n]*\.imePadding\(\)/.test(setup),
  'the setup column clears the status/navigation bars and the keyboard (edge to edge on targetSdk 36)');
ok(/ImeAction\.Next,\s*KeyboardActions\(onNext = \{ passwordFocus\.requestFocus\(\) \}\)/.test(setup), 'email Next moves to the password');
ok(/ImeAction\.Go,\s*KeyboardActions\(onGo = \{ submit\("login"\) \}\), Modifier\.focusRequester\(passwordFocus\)/.test(setup), 'password Go submits the login');
ok(/ImeAction\.Next,\s*KeyboardActions\(onNext = \{ portFocus\.requestFocus\(\) \}\)/.test(setup), 'printer host Next moves to the port');
ok(/ImeAction\.Go,\s*KeyboardActions\(onGo = \{ submit\("printer-test"\) \}\), Modifier\.focusRequester\(portFocus\)/.test(setup), 'printer port Go runs the printer test');
ok(/fun submit\(id: String\) \{ context\.actions\.firstOrNull \{ it\.id == id && it\.enabled \}/.test(setup), 'the keyboard runs a step action only when its button is enabled, as on iOS');
ok(/keyboardActions = actions/.test(kt), 'NativeField forwards its keyboard actions to the text field');

/* ── 2 · one Material icon per id the web sends ────────────────────────── */
const iconFn = kt.slice(kt.indexOf('private fun choiceIcon('));
const iconMap = new Map();
for (const m of iconFn.matchAll(/^\s*((?:"[^"]+",\s*)*"[^"]+")\s*->\s*Icons\.(\w+)\.(\w+)/gm)) {
  for (const id of m[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1))) iconMap.set(id, m[3]);
}
const ownerTabs = [...runtime.matchAll(/\{ id:'([a-z]+)', label:copy\.[a-zA-Z]+ \}/g)].map((m) => m[1]);
const caisseTabs = [...((runtime.match(/var tabItems = \[([\s\S]*?)\];/) || [])[1] || '').matchAll(/\['([a-z]+)', copy\./g)].map((m) => m[1]);
const teamTabs = [...new Set([...serveur.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]))];
const roles = Object.keys(Function('return ' + ((shell.match(/var ROLES = (\{[^}]+\})/) || [])[1] || '{}'))());
const papers = ((shell.match(/\[([^\]]+)\]\.forEach\(function \(paper\)/) || [])[1] || '').match(/'(\d+)'/g)?.map((s) => s.slice(1, -1)) || [];
ok(ownerTabs.length === 4 && caisseTabs.length === 3 && teamTabs.length >= 4 && roles.length === 4 && papers.length === 2,
  `the suite still finds the web's tab and setup ids (owner ${ownerTabs}, caisse ${caisseTabs}, team ${teamTabs}, roles ${roles}, paper ${papers})`);
for (const id of [...ownerTabs, ...caisseTabs, ...teamTabs, ...roles, ...papers]) {
  ok(iconMap.has(id) && iconMap.get(id) !== 'Storefront', `"${id}" has its own Material icon instead of the Storefront fallback`);
}
for (const m of kt.matchAll(/Icons\.(Outlined|Filled|AutoMirrored\.Outlined)\.(\w+)/g)) {
  const pkg = m[1] === 'AutoMirrored.Outlined' ? 'automirrored.outlined' : m[1].toLowerCase();
  ok(kt.includes(`import androidx.compose.material.icons.${pkg}.${m[2]}\n`), `Icons.${m[1]}.${m[2]} is imported`);
}
ok(gradle.includes("'androidx.compose.material:material-icons-extended'"), 'the extended Material icon set the map relies on is a declared dependency');

/* ── 4 · tab overlay height and the CSS the web reads ──────────────────── */
ok(!/104 \* resources/.test(kt) && /TAB_CONTENT_DP \* resources\.displayMetrics\.density\)\.roundToInt\(\) \+ tabBarInset\.bottom/.test(kt),
  'the tab overlay height is the capsule plus the live navigation-bar overlap, not a 104dp constant');
ok(/getRootWindowInsets\(root\)/.test(kt) && /getInsets\(WindowInsetsCompat\.Type\.navigationBars\(\)\)/.test(kt) &&
  /max\(0, nav\.bottom - \(root\.height - at\[1\] - content\.height\)\)/.test(kt),
  'the navigation bar is measured against the content area (edge to edge or not), not assumed');
ok(/setOnApplyWindowInsetsListener\(nativeOverlay\)[\s\S]{0,80}refreshBarInsets\(\)/.test(kt) && /content\.addOnLayoutChangeListener/.test(kt),
  'insets and layout changes (rotation, navigation mode) re-measure the bar');
const tabsFn = kt.slice(kt.indexOf('private fun NativeTabs('), kt.indexOf('private fun choiceIcon('));
ok(/absolutePadding\(left = pad\.first, right = pad\.second, bottom = pad\.third\)/.test(tabsFn) && !/navigationBarsPadding/.test(tabsFn),
  'the Compose capsule pads by the same inset that sizes the overlay, so the two cannot disagree');
ok(/max\(0, min\(webBottom, contentBottom\) - max\(origin\[1\], contentBottom - tabOverlayHeightPx\(\)\)\)/.test(kt),
  '--kiwi-host-tab-height is the part of the overlay that actually covers the WebView');
const iosVars = new Set([...swiftShell.matchAll(/setProperty\('(--kiwi-host-[a-z-]+)'/g)].map((m) => m[1]));
const androidVars = new Set([...kt.matchAll(/setProperty\('(--kiwi-host-[a-z-]+)'/g)].map((m) => m[1]));
ok(iosVars.size === 5 && [...iosVars].every((v) => androidVars.has(v)) && androidVars.size === iosVars.size,
  `Android publishes the same --kiwi-host-* variables as iOS (iOS ${[...iosVars]}, Android ${[...androidVars]})`);
ok([...androidVars].every((v) => runtimeCss.includes('var(' + v)), 'every published variable is read by native-runtime.css');
ok(/publishHostInsets\(force = true\)/.test(kt) && /addOnLayoutChangeListener/.test(kt), 'the variables are republished on each page/host message and when the WebView moves');

/* ── 5 · localized JS dialogs ──────────────────────────────────────────── */
ok(/class KiwiChromeClient\([\s\S]*?\) : BridgeWebChromeClient\(kiwiBridge\)/.test(kt), 'a BridgeWebChromeClient subclass keeps Capacitor’s file chooser and permissions');
ok(/webView\.webChromeClient = KiwiChromeClient\(/.test(kt), 'the subclass is installed on the bridge WebView');
for (const fn of ['onJsAlert', 'onJsConfirm', 'onJsPrompt']) ok(new RegExp('override fun ' + fn + '\\(').test(kt), fn + ' is overridden');
ok(!/override fun (onShowFileChooser|onPermissionRequest|onGeolocationPermissionsShowPrompt)/.test(kt), 'file chooser and permission prompts stay the base class’s');
ok(kt.includes('"ar" -> "إلغاء" to "موافق"') && kt.includes('"en" -> "Cancel" to "OK"') && kt.includes('else -> "Annuler" to "OK"'),
  'dialog buttons read fr Annuler/OK, en Cancel/OK, ar إلغاء/موافق, French by default');
ok(/setCanceledOnTouchOutside\(false\)/.test(kt) && /setOnCancelListener \{ cancel\(\) \}/.test(kt) && /setOnDismissListener \{ cancel\(\) \}/.test(kt) && /if \(!settled\)/.test(kt),
  'a dialog resolves its JsResult exactly once, and a stray outside tap does not dismiss it');
ok(/localStorage\.getItem\('kiwiLang'\)/.test(kt) && /document\.documentElement\.lang/.test(kt), 'the dialog language follows the page (lang attribute, then kiwiLang)');

/* ── 6 · system text size ──────────────────────────────────────────────── */
ok(/webView\.settings\.textZoom = kiwiTextZoom\(resources\.configuration\.fontScale\)/.test(kt) &&
  /override fun onConfigurationChanged[\s\S]*?textZoom = kiwiTextZoom\(newConfig\.fontScale\)/.test(kt),
  'the WebView text zoom follows the system font scale, at launch and on change');
ok(/coerceIn\(85, 135\)/.test(kt) && /Math\.max\(85, Math\.min\(135,/.test(dynamicJava), 'native and plugin clamp the zoom to the same 85..135 range as the web');
ok(/android:configChanges="[^"]*\bfontScale\b/.test(manifest), 'a text-size change does not recreate the activity mid-sale');
ok(/@CapacitorPlugin\(name = "KiwiDynamicType"\)/.test(dynamicJava) && /@PluginMethod\s+public void getDynamicTypeScale\(PluginCall call\)/.test(dynamicJava),
  'KiwiDynamicType has an Android implementation of getDynamicTypeScale');
ok(/getConfiguration\(\)\.fontScale/.test(dynamicJava) && /result\.put\("scale", scale\)/.test(dynamicJava) && /result\.put\("category"/.test(dynamicJava),
  'the Android scale is the system fontScale, in the iOS {scale, category} shape');
ok(/handleOnConfigurationChanged\(Configuration newConfig\)[\s\S]*notifyListeners\("dynamicTypeChange", payload\(scale\)\)/.test(dynamicJava),
  'a font-scale change emits dynamicTypeChange like iOS');
ok(dynamicPkg.capacitor?.android?.src === 'android' && dynamicPkg.files.includes('android'), 'kiwi-dynamic-type declares its Android source to Capacitor');
ok(/include ':kiwi-dynamic-type'/.test(settingsGradle) && /implementation project\(':kiwi-dynamic-type'\)/.test(buildGradle),
  'cap sync wired kiwi-dynamic-type into the Android build');
ok(/include ':capacitor-keyboard'/.test(settingsGradle) && /implementation project\(':capacitor-keyboard'\)/.test(buildGradle),
  'cap sync wired @capacitor/keyboard into the Android build');

/* ── 7 · manifest ──────────────────────────────────────────────────────── */
ok(/android:allowBackup="false"/.test(manifest), 'backup is off');
const extraction = (manifest.match(/android:dataExtractionRules="@xml\/(\w+)"/) || [])[1];
const fullBackup = (manifest.match(/android:fullBackupContent="@xml\/(\w+)"/) || [])[1];
ok(extraction && exists(RES + 'xml/' + extraction + '.xml') && fullBackup && exists(RES + 'xml/' + fullBackup + '.xml'), 'dataExtractionRules and fullBackupContent point at real XML');
if (extraction && exists(RES + 'xml/' + extraction + '.xml')) {
  const rules = read(RES + 'xml/' + extraction + '.xml');
  for (const section of ['cloud-backup', 'device-transfer']) {
    const body = (rules.match(new RegExp('<' + section + '>([\\s\\S]*?)</' + section + '>')) || [])[1] || '';
    ok(['root', 'file', 'database', 'sharedpref', 'external'].every((d) => body.includes(`<exclude domain="${d}" path="." />`)) && !body.includes('<include'),
      section + ' excludes every domain (pairing state and the print ledger never leave the device)');
  }
}
if (fullBackup && exists(RES + 'xml/' + fullBackup + '.xml')) {
  const rules = read(RES + 'xml/' + fullBackup + '.xml');
  ok(['root', 'file', 'database', 'sharedpref', 'external'].every((d) => rules.includes(`<exclude domain="${d}" path="." />`)), 'full-backup-content excludes every domain');
}
ok(/<uses-feature android:name="android\.hardware\.camera" android:required="false" \/>/.test(manifest) &&
  /<uses-feature android:name="android\.hardware\.camera\.autofocus" android:required="false" \/>/.test(manifest),
  'camera and autofocus are optional hardware, so Play lists the app on camera-less POS tablets');
ok(!manifest.includes('POST_NOTIFICATIONS'), 'no notification permission (nothing posts notifications)');
ok(manifest.includes('android.permission.RECORD_AUDIO') && manifest.includes('android.permission.MODIFY_AUDIO_SETTINGS'), 'the voice agent’s microphone permissions are declared');
const chromeSource = 'app/node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java';
if (exists(chromeSource)) {
  const chrome = read(chromeSource);
  ok(/AUDIO_CAPTURE[\s\S]{0,120}MODIFY_AUDIO_SETTINGS[\s\S]{0,80}RECORD_AUDIO/.test(chrome),
    'Capacitor still requests RECORD_AUDIO and MODIFY_AUDIO_SETTINGS for getUserMedia audio (why both are declared)');
}

/* ── 8 · injectable version ────────────────────────────────────────────── */
ok(/versionCode kiwiVersionCode/.test(gradle) && /versionName kiwiVersionName/.test(gradle) && !/versionCode 1\b/.test(gradle), 'versionCode/versionName are not hard-coded');
ok(/findProperty\('KIWI_VERSION_CODE'\) \?: System\.getenv\('KIWI_VERSION_CODE'\) \?: '1'/.test(gradle) &&
  /findProperty\('KIWI_VERSION_NAME'\) \?: System\.getenv\('KIWI_VERSION_NAME'\) \?: '1\.0'/.test(gradle),
  'release builds pass KIWI_VERSION_CODE / KIWI_VERSION_NAME as a Gradle property or env, defaulting to 1 / 1.0');

/* ── 9 · adaptive icon ─────────────────────────────────────────────────── */
for (const file of ['ic_launcher', 'ic_launcher_round']) {
  const xml = read(RES + 'mipmap-anydpi-v26/' + file + '.xml');
  ok(xml.includes('<background android:drawable="@color/ic_launcher_background"/>') &&
    xml.includes('<foreground android:drawable="@drawable/ic_launcher_foreground"/>') &&
    xml.includes('<monochrome android:drawable="@drawable/ic_launcher_foreground"/>'), file + ' has paper background, vector foreground and a monochrome layer');
}
ok(/<color name="ic_launcher_background">#F7F5F0<\/color>/.test(read(RES + 'values/ic_launcher_background.xml')), 'the icon background is paper #F7F5F0');
ok(!exists(RES + 'drawable-v24/ic_launcher_foreground.xml'), 'no drawable-v24 template shadows the vector foreground');
const vector = read(RES + 'drawable/ic_launcher_foreground.xml');
const mark = read('assets/kiwi-favicon-new.svg');
const markPaths = [...mark.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
const vectorPaths = [...vector.matchAll(/android:pathData="([^"]+)"/g)].map((m) => m[1]);
ok(markPaths.length === 2 && JSON.stringify(markPaths) === JSON.stringify(vectorPaths), 'the foreground is the Kiwi mark’s own paths, unaltered');
ok([...vector.matchAll(/android:fillColor="([^"]+)"/g)].every((m) => m[1].toUpperCase() === '#0B6E4F') && !/gradient/.test(vector), 'the mark is solid atlas');
ok(/android:viewportWidth="108"/.test(vector) && /android:viewportHeight="108"/.test(vector), 'the foreground canvas is the 108dp adaptive grid');
const attr = (name) => Number((vector.match(new RegExp('android:' + name + '="([-\\d.]+)"')) || [])[1]);
const [sx, sy, tx, ty] = ['scaleX', 'scaleY', 'translateX', 'translateY'].map(attr);
function flatten(d) {
  const toks = d.match(/[MmLlHhVvCcSsZz]|-?(?:\d+\.?\d*|\.\d+)/g);
  const out = [];
  let i = 0, cmd = null, x = 0, y = 0, sx0 = 0, sy0 = 0, last = null;
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    if (cmd === 'Z' || cmd === 'z') { x = sx0; y = sy0; last = null; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M' || C === 'L') {
      let nx = num(), ny = num();
      if (rel) { nx += x; ny += y; }
      x = nx; y = ny; out.push([x, y]); last = null;
      if (C === 'M') { sx0 = x; sy0 = y; cmd = rel ? 'l' : 'L'; }
    } else if (C === 'H') { x = num() + (rel ? x : 0); out.push([x, y]); last = null; }
    else if (C === 'V') { y = num() + (rel ? y : 0); out.push([x, y]); last = null; }
    else if (C === 'C' || C === 'S') {
      let x1, y1;
      if (C === 'C') { x1 = num(); y1 = num(); if (rel) { x1 += x; y1 += y; } }
      else { [x1, y1] = last ? [2 * x - last[0], 2 * y - last[1]] : [x, y]; }
      let x2 = num(), y2 = num(), ex = num(), ey = num();
      if (rel) { x2 += x; y2 += y; ex += x; ey += y; }
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, m = 1 - t;
        out.push([m ** 3 * x + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t ** 3 * ex, m ** 3 * y + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t ** 3 * ey]);
      }
      last = [x2, y2]; x = ex; y = ey;
    } else { return null; }
  }
  return out;
}
const points = vectorPaths.flatMap((d) => flatten(d) || [[Infinity, Infinity]]);
const farthest = Math.max(...points.map(([px, py]) => Math.hypot(px * sx + tx - 54, py * sy + ty - 54)));
ok(sx === sy && farthest <= 33, `every point of the glyph sits inside the 66dp safe circle (farthest ${farthest.toFixed(2)}dp from centre)`);
ok(farthest >= 26, `the glyph still fills the safe zone instead of shrinking to a dot (farthest ${farthest.toFixed(2)}dp)`);

/* ── 11 · native export and share ──────────────────────────────────────── */
for (const method of ['exportInvoice', 'printHtml', 'shareFile']) {
  ok(new RegExp('@PluginMethod\\s+public void ' + method + '\\(PluginCall call\\)').test(printerJava), method + ' is an Android plugin method');
}
ok(/public void printHtml\(PluginCall call\) \{\s*printDocument\(call\);/.test(printerJava) && /public void exportInvoice\(PluginCall call\) \{\s*printDocument\(call\);/.test(printerJava),
  'printHtml is exportInvoice under another name');
ok(/INVOICE_MAX_BYTES = 2_000_000/.test(printerJava) && /call\.reject\("invalid-invoice", "invalid-invoice"\)/.test(printerJava), 'a missing or oversized document is rejected as invalid-invoice');
ok(/new WebView\(activity\)/.test(printerJava) && /onPageFinished/.test(printerJava) && /createPrintDocumentAdapter\(jobName\)/.test(printerJava) &&
  /PrintAttributes\.MediaSize\.ISO_A4/.test(printerJava) && /manager\.print\(jobName/.test(printerJava),
  'the document is laid out off screen and handed to the system print dialog in A4 (Save as PDF or a printer)');
ok(/printRenderers\.add\(renderer\)/.test(printerJava) && /public void onFinish\(\) \{\s*try \{\s*inner\.onFinish\(\);\s*\} finally \{\s*release\.run\(\);/.test(printerJava),
  'the renderer stays strongly referenced until the print adapter finishes');
ok(/loadDataWithBaseURL\(base == null \? null : base\.toString\(\), html, "text\/html", "utf-8", null\)/.test(printerJava) &&
  /shouldInterceptRequest[\s\S]*?bundledAsset\(request\.getUrl\(\)\)/.test(printerJava) && /getAssets\(\)\.open\("public\/" \+ path\)/.test(printerJava) &&
  /segment\.equals\("\.\."\)/.test(printerJava),
  'with a baseUrl, https://localhost/<path> resolves to the bundled web (assets/public), never outside it');
ok(/result\.put\("presented", true\)/.test(printerJava) && !/result\.put\("saved"/.test(printerJava), 'success says presented, never saved');
ok(/SHARE_MAX_BYTES = 25 \* 1024 \* 1024/.test(printerJava) && /call\.reject\("invalid-file", "invalid-file"\)/.test(printerJava), 'a missing or oversized share is rejected as invalid-file');
ok(/new File\(getContext\(\)\.getCacheDir\(\), "kiwi-share"\)/.test(printerJava) && /UUID\.randomUUID\(\)/.test(printerJava) &&
  /FileProvider\.getUriForFile\(getContext\(\), getContext\(\)\.getPackageName\(\) \+ "\.fileprovider", file\)/.test(printerJava),
  'shared files live in cache/kiwi-share/<uuid>/ and leave through the app FileProvider');
ok(/Intent\.ACTION_SEND/.test(printerJava) && /EXTRA_STREAM/.test(printerJava) && /FLAG_GRANT_READ_URI_PERMISSION/.test(printerJava) && /Intent\.createChooser/.test(printerJava),
  'the share sheet receives a read grant on the content URI only');
ok(/c == '-' \|\| c == '_' \|\| c == '\.'/.test(printerJava) && /int room = 120 - extension\.length\(\)/.test(printerJava) && /while \(name\.startsWith\("\."\)\)/.test(printerJava),
  'the shared file name keeps letters, digits, - _ . only, at most 120 characters with its extension, and is never a path');
ok(/<cache-path name="kiwi_share" path="kiwi-share\/" \/>/.test(read(RES + 'xml/file_paths.xml')), 'the FileProvider exposes cache/kiwi-share');
ok(/androidx\.core:core:/.test(printerGradle) && /androidx\.appcompat:appcompat:/.test(printerGradle), 'the plugin declares the AndroidX libraries it now compiles against');

console.log(`android-native-test: ${pass} passed, ${fail} failed.`);
if (fail) process.exit(1);
