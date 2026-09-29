#!/usr/bin/env node
// iPhone pass 5 (tickets #0107 to #0114): one source-level guard per fix, so a
// later edit that quietly undoes one of them goes red here instead of on the
// tester's phone. Static reads only: no browser, no network, no credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('  ✓ ' + label); };

const runtime = read('app/src/native-runtime.js');
const css = read('app/src/native-runtime.css');
const dateRange = read('assets/dateRange.js');
const dashboard = read('dashboard.html');
const pages = read('assets/pages.js');
const pagesPro = read('assets/pages-pro.js');
const menu = read('assets/restaurant-menu-workspace.js');
const team = read('assets/team.js');
const stock = read('assets/stock.js');

// #0107 · date range reachable and swipeable
ok(/function initPeriodSwipe\(/.test(runtime) && /initPeriodSwipe\(\)/.test(runtime.replace(/function initPeriodSwipe\(/, '')), 'the period pills and hero chart step through ranges on a horizontal swipe');
ok(/\.dr-pills\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\) 40px/.test(css), 'the custom-range pill stays on screen as an icon beside the four presets');
ok(/function initChipRowFollow\(/.test(runtime), 'a tapped pill scrolls itself into view');

// #0108 · the calendar is a bottom sheet with a reachable Apply
ok(/dr-sheet-veil/.test(dateRange) && /classList\.add\('dr-sheet'\)/.test(dateRange), 'the custom picker opens as a bottom sheet on a phone');
ok(/shiftView\(/.test(dateRange) && /touchstart/.test(dateRange), 'the calendar months change on a swipe');
ok(/\.dr-popover\.dr-sheet \{[^}]*max-height: calc\(100dvh/.test(dashboard), 'the sheet never grows past the screen, so Apply stays reachable');

// #0109 · customers
ok(/table\.p-table\.sc-table tr>td:nth-child\(5\)\{display:block!important/.test(css), 'the spa customer list keeps its tier column on a phone');
ok(/\.dash-genpage \.p-toolbar>\.p-search\{[^}]*white-space:nowrap/.test(css), 'the customer search stays on one line beside New client');

// #0110 · no toast on every feature switch
ok(!/toast\(NAV_ACCUEIL_STR/.test(pagesPro), 'going home no longer shows a toast');
ok(!/toast\(T\.accueilTitle/.test(pages), 'the legacy home handler no longer shows a toast');

// #0111 · filter rows are one swipeable line
ok(/\.eq-pill-row,\.st-item-subtabs,\.sc-pills,\.cf-tabs\)/.test(css) && /flex-wrap:nowrap!important/.test(css), 'filter pill rows scroll sideways instead of wrapping');

// #0112 · planning day view
ok(/function initPlanningDayView\(/.test(runtime) && /kt-phone-day/.test(css), 'planning has a one-day view on a phone');
ok(/\.kt-shpop/.test(runtime.slice(runtime.indexOf('function openNativeLayers'), runtime.indexOf('function openNativeLayers') + 1600)), 'the shift editor counts as a native layer (tab bar hides)');
ok(/\.kt-shpop\{position:fixed!important/.test(css), 'the shift editor is a bottom sheet, not a popover anchored to a hidden cell');
ok(/pointer: coarse/.test(team), 'the shift editor does not raise the keyboard on open');

// #0113 · phone assigns servers, the floor plan stays on larger screens
ok(/function pdsOpenPhoneAssign\(/.test(pagesPro) && /if \(pdsPhoneWanted\(\)\) \{ pdsOpenPhoneAssign\(state, v\); return; \}/.test(pagesPro), 'the tables page opens server assignment on a phone');
ok(/state\.tables\.find\(o => String\(o\.id\) === tid\)/.test(pagesPro), 'tapping a table toggles the table itself, not a lookup wrapper');
ok(!/<section class="pdsp-srv/.test(pagesPro), 'server rows are not <section>, which global page styles inflate');

// #0114 · menu rows and opaque editors
ok(/u\('stepCount'/.test(menu) && /u\('availableOpt'\)/.test(menu), 'menu card footers are localised');
ok(/\.mi-grid>\.mi-card\{[^}]*grid-template-areas/.test(css), 'menu items are compact rows on a phone');
ok(/\.kiwi-backdrop:not\(\.kiwi-native-order-sheet\) \.kiwi-modal\{[^}]*backdrop-filter:none/.test(css), 'create and edit sheets are opaque on a phone');

// #0115 · the roster retains desktop detail but becomes a phone-first person list.
ok(/\.eq-table td\{display:none!important\}/.test(css) && /\.eq-table td:first-child\{display:block!important/.test(css), 'team roster hides desktop columns on a phone');
ok(/eq-member-phone-role/.test(team) && /eq-member-phone-meta/.test(team) && /eq-member-open/.test(team), 'phone roster shows role, department and status with a profile action');
ok(/liveOffDuty: 'Off duty'/.test(team) && /liveOffDuty: 'خارج الخدمة'/.test(team), 'team duty status follows the selected language');

// #0116 · all owner drawers share the opaque phone surface.
ok(/html\.kiwi-native body \.kiwi-drawer\{background:#FBFAF7!important;[^}]*backdrop-filter:none!important/.test(css), 'light-mode native drawers are opaque');
ok(/html\.kiwi-native:is\(\[data-theme="dark"\],\[data-vexel-mode="dark"\]\) body \.kiwi-drawer\{background:#131A17!important/.test(css), 'dark-mode native drawers are opaque');
ok(!/\.kiwi-drawer:has\(\.pdsp\)/.test(pagesPro), 'table assignment no longer carries a local drawer-paint patch');

// #0117 · counted stock is a real one-row-per-item form on iPhone.
ok(/tr\[data-stock-pc-row\]\{display:grid!important/.test(css) && /grid-template-columns:minmax\(0,1fr\) 112px/.test(css), 'physical count uses a phone list with a large quantity field');
ok(/inputmode="decimal"/.test(stock) && !/placeholder="·" data-pc-real/.test(stock), 'count input summons the decimal keypad without a dot placeholder');
ok(/classList\.add\('has-count'\)/.test(stock) && /\.st-pc-blind tr\[data-stock-pc-row\]\.has-count \[data-pc-var\]\{visibility:visible!important/.test(css), 'variance appears after a blind-count entry');

// #0118 · fleet cards are compact and the native bundle has the actual photos.
ok(/\.term-device-main\{display:grid!important;grid-template-columns:72px minmax\(0,1fr\)/.test(css) && /\.term-device-actions\{grid-column:1\/-1/.test(css), 'terminal cards place actions on one phone row');

// #0119 · finance/compliance use one gutter and a non-wrapping P&L.
ok(/:is\(\.fin-page,\.cf-page\)\{[^}]*padding:0 0 32px!important/.test(css), 'finance and compliance shed their nested phone gutter');
ok(/\.fin-pnl-row\{grid-template-columns:minmax\(0,1fr\) auto auto!important/.test(css), 'result rows keep the sign, label, amount and percent on one line');
ok(/\.cf-tabs\)/.test(css) && /\.cf-tab,\.chip/.test(css), 'compliance tabs join the one-line swipeable chip system');

console.log(`\nnative-pass5-test · ${checks} checks green`);
