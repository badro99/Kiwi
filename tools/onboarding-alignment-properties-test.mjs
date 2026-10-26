import { onboardingTestSource } from './onboarding-test-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import data from '../assets/onboarding-data.js';
const fc = createRequire(new URL('../app/package.json', import.meta.url))('fast-check');
const legacy = onboardingTestSource();
const kit = fs.readFileSync('assets/kit/dash-onboarding.js', 'utf8');
function grab(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw Error(name);
}
const trades = vm.createContext({ window: {}, document: { documentElement: { lang: 'fr' } } });
vm.runInContext(fs.readFileSync('assets/trades.js', 'utf8'), trades);
const types = trades.window.KiwiTrades.all();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
for (const type of types) {
  const result = fc.check(fc.property(fc.record({ bizName: fc.string(), teamGiven: fc.boolean(), teamSize: fc.integer({ min: 1, max: 200 }), goals: fc.subarray(['sales', 'stock', 'time']), device: fc.constantFrom('', 'till', 'kds', 'team', 'dashboard'), pins: fc.boolean().map(done => [{ role: 'owner', code: done ? Array(4).fill(7).join('') : '' }]) }), answers => {
    const S = { ...answers, typeId: type.id, ownerName: '', venueCount: 1 };
    const snapshot = JSON.stringify(S);
    const model = data.viewModel(S, types);
    assert.equal(JSON.stringify(S), snapshot);
    const ctx = vm.createContext({ window: { KiwiOnboardingData: data }, S, TYPES: types, GOALS: [], esc, tr: o => o?.fr || '', unitFor: () => '', footNav: () => '' });
    vm.runInContext(grab(legacy, 'setupPresentation') + '\n' + grab(legacy, 'stepFinish'), ctx);
    const a = ctx.stepFinish().body.match(/<div data-onboarding-summary[\s\S]*?Action suivante : [\s\S]*?<\/p><\/div>/)[0];
    let body;
    const fields = { '[data-l="device"]': {}, '[data-warn]': {} };
    const k = vm.createContext({ api: { presentation: () => ctx.setupPresentation() }, esc, t: s => s, device: S.device, $: s => fields[s], DEVICES: ['till', 'kds', 'team', 'dashboard'], primary: () => '', frame: html => { body = html; }, warn: () => {} });
    vm.runInContext(grab(kit, 'setupPresentation') + '\n' + grab(kit, 'deviceStep'), k);
    k.deviceStep();
    assert.ok(body.includes(a));
    for (const step of model.steps) assert.ok(a.includes(`data-setup-step="${step.id}" data-done="${step.done}"`));
    for (const line of model.recap) assert.ok(a.includes(esc(line.value)));
    assert.equal(model.steps[0].done, true);
    assert.equal(model.steps[2].done, !!S.pins[0].code);
    assert.equal(model.recap[3].id, type.base === 'restaurant' ? 'menu' : 'catalogue');
  }), { numRuns: 50 });
  assert.equal(result.failed, false, 'Alignement du métier ' + type.id);
}
console.log(`✓ alignement des rendus : ${types.length} métiers × 50 états`);
