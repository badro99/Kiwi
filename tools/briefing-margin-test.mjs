#!/usr/bin/env node
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/briefing.js', import.meta.url), 'utf8');
let checks = 0;
function ok(condition, message) { if (!condition) throw new Error(message); checks += 1; }

function boot(lang = 'fr') {
  const document = {
    readyState: 'loading', addEventListener() {}, querySelector() { return null; }, getElementById() { return null; },
    head: { appendChild() {} }, createElement() { return { setAttribute() {}, appendChild() {}, addEventListener() {} }; }
  };
  const window = {
    document, console, setTimeout, clearTimeout, addEventListener() {},
    KiwiEnv: { isReal: () => true }, KiwiI18n: { getLang: () => lang },
    KiwiAccount: { get: () => ({ id: 'acct-a', role: 'owner' }) },
    KiwiVenue: { getVenue: () => 'venue-a', getCurrentVenue: () => 'venue-a' },
    localStorage: { getItem() { return null; }, setItem() {} }
  };
  window.window = window;
  vm.runInContext(source, vm.createContext({ window, document, console, setTimeout, clearTimeout, Date, Math, JSON, isFinite }), { filename: 'briefing.js' });
  return window.KiwiBriefing._test.marginErosionRule;
}

const full = { revenueCosted: 1000, pctCosted: 100, marginPct: 52 };
const input = (current, baseline = full) => ({ current, baseline, currentDay: '2026-08-20', baselineDay: '2026-08-13' });
let rule = boot()(input({ revenueCosted: 900, pctCosted: 96, marginPct: 44 }));
ok(!!rule, 'an 8-point erosion with comparable coverage must emit');
ok(rule.roles.length === 1 && rule.roles[0] === 'owner', 'margin is owner-only');
ok(!rule.action, 'margin erosion must never propose a price change');
ok(/5 points/.test(rule.text), 'visible line must state the threshold');
ok(/96/.test(rule.text) && /100/.test(rule.text), 'visible line must state both pctCosted values');
ok(/KiwiCost\.coverage/.test(rule.evidence), 'evidence must name the canonical source');
ok(/2026-08-20/.test(rule.evidence) && /2026-08-13/.test(rule.evidence), 'evidence must name both periods');
ok(boot('en')(input({ revenueCosted: 900, pctCosted: 96, marginPct: 44 })).text.startsWith('Gross margin'), 'English copy is routed');
ok(/الهامش/.test(boot('ar')(input({ revenueCosted: 900, pctCosted: 96, marginPct: 44 })).text), 'Arabic copy is routed');
ok(boot()(input({ revenueCosted: 900, pctCosted: 79, marginPct: 40 })) === null, 'partial current coverage must suppress');
ok(boot()(input({ revenueCosted: 900, pctCosted: 95, marginPct: 40 }, { revenueCosted: 1000, pctCosted: 79, marginPct: 52 })) === null, 'partial baseline coverage must suppress');
ok(boot()(input({ revenueCosted: 900, pctCosted: 80, marginPct: 40 }, { revenueCosted: 1000, pctCosted: 100, marginPct: 52 })) === null, 'non-comparable coverage must suppress');
ok(boot()(input({ revenueCosted: 900, pctCosted: 98, marginPct: 48 })) === null, 'erosion below five points must suppress');
ok(boot()(input({ revenueCosted: 0, pctCosted: 100, marginPct: null })) === null, 'period without costed revenue must suppress');
ok(/D\.lastClosedDay\(\)/.test(source) && /D\.shiftDay\(currentDay, -7\)/.test(source), 'production compares closed same-weekday periods');
ok(/C\.coverage\(rows, currentBounds\.from, currentBounds\.to\)/.test(source) && /C\.coverage\(rows, baselineBounds\.from, baselineBounds\.to\)/.test(source), 'both periods use KiwiCost.coverage');
ok(!/margin-erosion[\s\S]{0,700}?price-change/.test(source), 'rule has no price-change action');

console.log(`briefing-margin-test: ${checks} controls passed`);
