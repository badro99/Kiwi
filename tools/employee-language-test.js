#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'kiwi-serveur.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'kiwi-sw.js'), 'utf8');
let checks = 0;

function ok(condition, message) {
  checks++;
  if (!condition) throw new Error('Employee language: ' + message);
}

ok(/data-employee-language="fr"[^>]*>Français</.test(page), 'French selector is available in Profile');
ok(/data-employee-language="en"[^>]*>English</.test(page), 'English selector is available in Profile');
ok(/data-employee-language="ary"[^>]*[\s\S]*?الدارجة</.test(page), 'Darija selector is available in Profile');
ok(/kiwi-employee-language:/.test(page), 'preference is persisted per venue');
ok(/localStorage\.setItem\(EMPLOYEE_LANGUAGE_KEY, language\)/.test(page), 'language changes are persisted');
ok(/EMPLOYEE_TRANSLATIONS[\s\S]*?en:[\s\S]*?ary:/.test(page), 'English and Darija dictionaries exist');
ok(/translateEmployeeElement\(document\.body\)/.test(page), 'the selector translates the app, not only its own label');
ok(/MutationObserver[\s\S]*?characterData: true/.test(page), 'live content is translated after sync updates');
ok(/employeeLocale\(\)/.test(page), 'dates and times follow the chosen language');
ok(/kiwi-app-v333/.test(sw), 'the employee PWA cache is bumped');

console.log(`✓ employee language gate green (${checks} checks: profile selector, persistence, live UI, locale, PWA)`);
