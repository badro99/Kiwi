#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'kiwi-serveur.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'kiwi-sw.js'), 'utf8');
const manifest = fs.readFileSync(path.join(root, 'serveur.webmanifest'), 'utf8');
let checks = 0;

function ok(condition, message) {
  checks++;
  if (!condition) throw new Error('Employee language: ' + message);
}

ok(/data-employee-language="fr"[^>]*>Français</.test(page), 'French selector is available in Profile');
ok(/data-employee-language="en"[^>]*>English</.test(page), 'English selector is available in Profile');
ok(/data-employee-language="ar"[^>]*[\s\S]*?العربية</.test(page), 'standard Arabic selector is available in Profile');
ok(/kiwi-employee-language:/.test(page), 'preference is persisted per venue');
ok(/localStorage\.setItem\(EMPLOYEE_LANGUAGE_KEY, language\)/.test(page), 'language changes are persisted');
ok(/EMPLOYEE_TRANSLATIONS[\s\S]*?en:[\s\S]*?ar:/.test(page), 'English and standard Arabic dictionaries exist');
ok(/saved === 'ary'\) return 'ar'/.test(page), 'legacy Darija preference migrates to standard Arabic');
ok(!/(?:الدارجة|ديالك|دابا|السيمانة|كاع|خاوية|المينيو|كارط|كاش|البوز|كاتسير|شحال|الماكلة|غيبانو|نتا|نتي)/.test(page), 'Darija wording no longer leaks into the Serveur app');
ok(!/\b(?:Slm|mesa|Ltn|Tlt|Lrb|Lkh|Ljm|Sbt|Lhd)\b/.test(page), 'Latin Darija and Spanish labels no longer leak into French UI');
ok(/document\.documentElement\.dir = employeeLanguage === 'ar' \? 'rtl' : 'ltr'/.test(page), 'standard Arabic uses the correct reading direction');
ok(/function setEmployeeLanguage[\s\S]*?renderSchedule\(\)[\s\S]*?renderHours\(\)/.test(page), 'changing language immediately redraws schedule and hours');
ok(/function kgRankName[\s\S]*?متدرّب[\s\S]*?مدير القاعة/.test(page), 'employee ranks have standard Arabic names');
ok(/function kgChallengeText[\s\S]*?خلال هذه الوردية/.test(page), 'shift challenges are generated in standard Arabic');
ok(/translateEmployeeElement\(document\.body\)/.test(page), 'the selector translates the app, not only its own label');
ok(/MutationObserver[\s\S]*?characterData: true/.test(page), 'live content is translated after sync updates');
ok(/employeeLocale\(\)/.test(page), 'dates and times follow the chosen language');
ok(/id="kg-rec-empty"[^>]*>Vos records apparaîtront après votre première table réglée\.</.test(page), 'first-shift records use an explicit empty state');
ok(!/id="kg-rec-(?:night|streak|speed)-num">—</.test(page), 'first-shift record tiles never render bare em-dashes');
ok(/const hasRecords = snap\.paid > 0[\s\S]*?recGrid\.hidden = !hasRecords[\s\S]*?recEmpty\.hidden = hasRecords/.test(page), 'the record grid replaces the empty state after the first settlement');
ok(/kiwi-newlogo\.svg\?v=2/.test(page), 'the current Serveur logo has a cache-busted asset URL');
ok(/rel="icon" href="assets\/kiwi-favicon-new\.svg\?v=2"/.test(page), 'the browser tab uses the current Kiwi favicon');
ok(/apple-touch-icon[^>]*kiwi-employee-180\.png\?v=2/.test(page), 'the iPhone home-screen card uses the current Kiwi mark');
ok(/kiwi-employee-192\.png\?v=2/.test(manifest) && /kiwi-employee-512\.png\?v=2/.test(manifest)
  && !/kiwi-mark-app-icon|kiwi-employee-k/.test(manifest), 'the install manifest cannot fall back to a legacy k icon');
ok(/var CACHE = 'kiwi-app-v\d+'/.test(sw), 'the employee PWA has a versioned cache');
ok(/kiwi-app-v368/.test(sw) && !/kiwi-employee-k-/.test(sw), 'the shared PWA cache evicts every legacy employee icon');

console.log(`✓ employee language gate green (${checks} checks: profile selector, persistence, live UI, locale, PWA)`);
