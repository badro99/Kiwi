#!/usr/bin/env node
// iPhone pass 4: one source-level guard per fix, so a later edit that quietly
// undoes one of them goes red here instead of on the tester's phone.
// Static reads only: no browser, no network, no credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('  ✓ ' + label); };

const runtime = read('app/src/native-runtime.js');
const runtimeCss = read('app/src/native-runtime.css');
const shell = read('app/src/native-shell.js');
const shellHtml = read('app/src/index.html');
const swift = read('app/ios/App/App/KiwiNativeShell.swift');
const clients = read('assets/clients-directory.js');
const caisse = read('kiwi-caisse.html');
const caisseLang = read('assets/caisse-lang.js');
const cuisine = read('kiwi-cuisine.html');
const serveur = read('kiwi-serveur.html');
const printQueue = read('assets/kitchen-print-queue.js');
const account = read('assets/account.js');
const vexel = read('assets/design-vexel.css');
const demoClock = read('assets/demoClock.js');
const dateRange = read('assets/dateRange.js');
const support = read('support.html');

// 6 · Client detail
ok(/tel:/.test(clients) && /wa\.me\//.test(clients) && /mailto:/.test(clients), 'client detail offers Call, WhatsApp and Email');
ok(/toLocaleDateString\([^)]*month:\s*'long'/.test(clients), 'client birthday is formatted with the locale');
ok(clients.includes('cd-grabber') && clients.includes('kiwi-native-client-sheet'), 'client detail is a native bottom sheet with a grabber');

// 7 · Delete my account in the demo
ok(/is-demo/.test(runtime) && /KiwiEnv[^;]*isReal/.test(runtime), 'demo deletion explains itself instead of failing');

// 8 · Refund search and the keyboard accessory bar
ok(/setAccessoryBarVisible/.test(runtime), 'the WKWebView accessory bar is hidden except on numeric fields');
ok(/id="rf-search-input"[^>]*autocapitalize="none"/.test(caisse), 'refund search does not autocapitalise');
ok(/pointer: coarse/.test(caisse), 'refund search does not autofocus on a touch screen');
ok(/:is\(\.rf-search,\.jr-search\) input:focus-visible\{outline:none\}/.test(runtimeCss), 'refund search draws one rounded ring, not a square one inside it');

// 9 · Header strips
ok(/body\.kiwi-native-team:not\(#kno\)\{padding-top:0!important\}/.test(runtimeCss), 'no empty band above the Team header');

// 10 · Team lock identity
ok(serveur.includes('data-pin-switch') && serveur.includes('data-pin-who'), 'Team lock shows the venue and "Not you? Switch employee"');

// 11 · Kitchen keypad
ok(/ok\.disabled = buf\.length !== 6/.test(cuisine), 'kitchen Confirm waits for six digits');
ok(cuisine.includes("T('void.errServer')") && cuisine.includes("T('void.errSync')"), 'kitchen cancellation errors are translated');

// 12 · Sign-in
ok(shellHtml.includes('login-forgot') && /openURL/.test(shell), 'sign-in offers Forgot password');
ok(/SFSafariViewController/.test(swift) && /kiwi-os\.com/.test(swift), 'Forgot password opens an in-app Safari sheet limited to kiwi-os.com');
ok(/id="mot-de-passe-oublie"/.test(support), 'the reset anchor exists on the support page');

// P2 · atlas buttons, palette, labels
ok(/\.cd-new[^{]*\{[^}]*#0B6E4F/.test(runtimeCss), 'New customer is atlas, not ink');
ok(/\.rp-peek[^{]*\{[^}]*#0B6E4F/.test(runtimeCss), 'View bill is atlas, not ink');
ok(/\.kep-btn\.primary[^{]*\{[^}]*#0B6E4F/.test(runtimeCss), 'Request leave is atlas, not ink');
ok(/\.menu-item-cat\{color:var\(--ink-4/.test(runtimeCss), 'till category labels are neutral, not terracotta or amber');
ok(!/>\s*·\s*version commerçant/.test(caisse), 'no orphan dot before "merchant edition"');
ok(/data-action="fin-service">\s*<i data-lucide="clipboard-check">/.test(caisse), 'End of shift and Leave use different icons');
ok(/terminalIdButton\.hidden = !id/.test(caisse), 'the Till ID pill only shows once the till is paired');
ok(!/'✓' : '·'/.test(printQueue) && /'Prête' : 'Inactif'/.test(printQueue), 'Kitchen printing shows a word, not a lone dot');
ok(/\.acc-avatar \{[^}]*background:#F7F5F0; color:#053B2C/.test(account), 'profile avatar initials pass contrast');
ok(/data-vexel-mode="light"\] \.topbar \.vexel-topbar-merchant \.avatar \{\s*color: #053B2C/.test(vexel), 'light top-bar avatar is riad, not mint on white');

// P2 · motion and haptics
ok(/kiwi-native-order-sheet \.kiwi-modal\{transform:translateY\(100%\);transition:transform 310ms var\(--spring/.test(runtimeCss), 'sheets rise with the brand spring at 310 ms');
ok(/\.pin-dot\{transition:[^}]*310ms cubic-bezier\(0\.34,1\.45,0\.5,1\)/.test(runtimeCss), 'Team keypad dots fill with the spring');
ok(/prefers-reduced-motion:reduce\)\{html\.kiwi-native \.pin-dot\{transition:none/.test(runtimeCss), 'Reduce Motion turns the dot spring off');
ok(/type === 'success'\) hapticNotice\('success'\)/.test(runtime), 'success toasts give a success haptic');
ok(/pin-dots[\s\S]{0,200}shake[\s\S]{0,120}hapticNotice\('danger'\)/.test(runtime), 'a wrong Team code gives an error haptic');

// Demo numbers are not flat day to day
ok(/Math\.imul\(seed \^ \(seed >>> 16\), 0x45d9f3b\)/.test(demoClock), 'demo days vary, so "vs yesterday" is never a flat 0 %');
ok(/pct\(/.test(dateRange), 'demo KPI deltas come from the previous window');

// French sweep: every till toast key carries both English and Arabic
const block = caisseLang.slice(caisseLang.indexOf('Till toasts reachable on iPhone'));
const pairs = [...block.matchAll(/^\s*(['"])(.+?)\1: \[(['"])(.+?)\3, (['"])(.+?)\5\],$/gm)];
ok(pairs.length >= 200, `till toasts carry EN and AR (${pairs.length} entries)`);
ok(pairs.every((m) => !/—/.test(m[4] + m[6])), 'no em dash in the till toast translations');
ok(pairs.every((m) => !/God Mode/.test(m[4] + m[6])), 'no internal console name leaks into the till copy');

// App Review 3.1.1: no subscription price reachable in the iOS app
const stock = read('assets/stock.js');
const interactive = read('assets/interactive.js');
ok(/H\['stock-upgrade-ultra'\] = \(\) => \{\s*if \(document\.documentElement\.classList\.contains\('kiwi-native'\)\) return;/.test(stock) && /\.st-locked-cta\{display:none/.test(runtimeCss), 'the Stock upsell never shows a plan price in the app');
ok(/'upgrade-pro': \(\) => \{\s*if \(document\.documentElement\.classList\.contains\('kiwi-native'\)\)/.test(interactive), 'the plans sheet stays closed in the app');
ok(/subscriptionBlock = document\.documentElement\.classList\.contains\('kiwi-native'\)\s*\? `[^`]*`/.test(account) && !/subscriptionBlock = document\.documentElement\.classList\.contains\('kiwi-native'\)\s*\? `[^`]*MAD/.test(account), 'the profile subscription card carries no price in the app');

// Accessibility and dictation pass (tester report, 2026-09-29)
const voice = read('assets/agent-voice.js');
const agent = read('assets/agent.js');
const privacy = read('app/src/native-privacy.js');
const mobileNav = read('assets/mobile-nav.js');
const vexelLayout = read('assets/design-vexel-layout.js');
const team = read('assets/team.js');
ok(/r\.res\.status === 401 \? 'auth'/.test(voice), 'a 401 on dictation says "sign in", not a generic failure');
ok(/audioBitsPerSecond: 32000/.test(voice), 'dictation records at speech bitrate, so a long question stays under the 2 MB cap');
ok(/P\.allowed && P\.allowed\(\) \? Promise\.resolve\(true\) : P\.show\(\)/.test(voice) && /allowed:function \(\) \{ return choice\(\) === .allowed.; \}/.test(privacy), 'the mic starts recording right after AI consent is given');
ok(/en: \{ dictate: 'Dictate your question'/.test(voice) && /ar: \{ dictate:/.test(voice) && /setAttribute\('aria-label', label\)/.test(voice), 'mic labels are localised, not French-only');
ok(/type = type \|\| 'error';/.test(voice) && /Kiwi\.toast\(msg, \{ type: type, force: true \}\)/.test(voice), 'dictation errors use an error toast, not a success tick');
ok(/finePointer/.test(agent) && /aria-label="\$\{escAttr\(u\.placeholder\)\}"/.test(agent), 'the copilot composer is labelled and does not autofocus on touch');
ok(/html\.kiwi-native \.kiwi-drawer\{box-sizing:border-box;padding-top:var\(--kiwi-safe-top\)/.test(runtimeCss), 'drawer headers clear the Dynamic Island');
ok(/html\.kiwi-native \.fa-toolbar \.fa-hint\{display:none\}/.test(runtimeCss), 'no "Enter to send" keyboard hint on a phone');
ok(/sidebar\.inert = closed/.test(mobileNav), 'the closed phone menu is inert, not just aria-hidden');
ok(/button\.setAttribute\('aria-label', labels\[lang\(\)\]\)/.test(vexelLayout), 'Generate report keeps a name when its label is hidden');
ok(!/c: '#B26B0F'/.test(team), 'team avatar colours pass 4.5:1 against paper');
ok(/\.acts \.approve,\.acts \.dismiss,\.cd-exp,\.eq-icon-btn\)\{min-height:44px/.test(runtimeCss), 'small drawer controls get 44 pt targets');
ok(!/maximum-scale/.test(serveur) && !/maximum-scale/.test(cuisine), 'Team and Kitchen allow pinch zoom');
ok(/class="mode-selector" role="group"/.test(caisse), 'till mode pills are a group of toggles, not a tablist');

console.log(`\nnative-pass4-test · ${checks} checks green`);
