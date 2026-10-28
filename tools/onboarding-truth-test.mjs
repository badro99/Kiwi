#!/usr/bin/env node
import { createRequire } from 'node:module';
const { DOMParser } = createRequire(import.meta.url)('../app/node_modules/@xmldom/xmldom');
import { onboardingTestSource } from './onboarding-test-source.mjs';
/* ═══════════════════════════════════════════════════════════════════════════
 * INSTALLATION · CE QUE L'ASSISTANT ET LA FIN DE L'ASSISTANT AFFIRMENT
 *
 * Mesuré le 2026-10-11 sur le stack local :
 *
 * 1. « Vous êtes combien à travailler ici ? 3 », puis l'étape des codes
 *    proposait toujours le même nombre de lignes, quel que soit le chiffre.
 * 2. Fini sans recharger la page, le magasin (en attente d'activation) gardait
 *    la porte « installation » : ses écritures partaient vers un serveur qui
 *    les refuse toutes (401), et l'écran disait « Paramètres enregistrés »,
 *    puis « En ligne » pour des réservations que le lien public refusait.
 *
 * Exécute la vraie fonction de assets/onboarding.js.
 *
 *   node tools/onboarding-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OB = onboardingTestSource();
const DATA = readFileSync(path.join(ROOT, 'assets/onboarding-data.js'), 'utf8');
const dataApi = (await import('../assets/onboarding-data.js')).default;
const ENT = readFileSync(path.join(ROOT, 'assets/entitlements-v2.js'), 'utf8');

function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' found');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

function fit(teamSize, pins, extra) {
  const ctx = vm.createContext({ S: { teamSize, teamGiven: true, pins, ...extra } });
  vm.runInContext(grab(OB, 'function fitPinsToTeam(') + '\nfitPinsToTeam();', ctx);
  return Array.from(ctx.S.pins, (p) => String(p.role));
}
/* Runs fitPinsToTeam the way the wizard does: on the step, then again on the
   re-render that follows a click on « Retirer ». */
function fitRemoveRefit(teamSize, teamGiven) {
  const ctx = vm.createContext({ S: { teamSize, teamGiven, pins: [owner()] } });
  vm.runInContext(grab(OB, 'function fitPinsToTeam(') + '\nfitPinsToTeam(); S.pins.splice(S.pins.length - 1, 1); fitPinsToTeam();', ctx);
  return Array.from(ctx.S.pins, (p) => String(p.role));
}
const owner = () => ({ role: 'owner', name: 'Testeur', code: '' });
const blank = (role) => ({ role, name: '', code: '' });

ok('autant de lignes de code que de personnes annoncées', () => {
  assert.deepEqual(fit(1, [owner(), blank('manager'), blank('staff')]), ['owner']);
  assert.deepEqual(fit(2, [owner(), blank('manager'), blank('staff')]), ['owner', 'staff']);
  assert.deepEqual(fit(3, [owner()]), ['owner', 'manager', 'staff']);
});
ok('jamais plus de quatre lignes proposées, le reste s’ajoute à la main', () => {
  assert.deepEqual(fit(12, [owner()]), ['owner', 'manager', 'staff', 'staff']);
});
ok('une ligne déjà remplie n’est jamais effacée', () => {
  const kept = [owner(), { role: 'staff', name: 'Salma', code: '' }];
  assert.deepEqual(fit(1, kept), ['owner', 'staff']);
});
ok('« Retirer » sur une ligne vide la retire pour de bon', () => {
  assert.deepEqual(fitRemoveRefit(3, true), ['owner', 'manager']);
});
ok('une équipe passée ne propose que la ligne du propriétaire', () => {
  assert.deepEqual(fit(3, [owner(), blank('manager'), blank('staff')], { teamGiven: false }), ['owner']);
});
ok('changer le nombre annoncé réajuste les lignes vides', () => {
  assert.deepEqual(fit(2, [owner(), blank('manager'), blank('staff')], { pinsFitFor: 3 }), ['owner', 'staff']);
});
ok('l’étape des codes s’ajuste à chaque passage', () => {
  assert.match(grab(OB, 'function stepAccess('), /^function stepAccess\(\) \{\s*fitPinsToTeam\(\);/);
});

ok('la fin de l’assistant prévient la porte d’abonnement, dans la même page', () => {
  const enter = grab(OB, 'function enterApp(');
  assert.match(enter, /dispatchEvent\(new CustomEvent\('kiwi-onboarded'\)\)/);
  assert.match(enter, /KiwiIdentity\.state\.onboarded = true/);
});
ok('…à l’entrée, pas pendant « votre espace est prêt »', () => {
  assert.ok(!/kiwi-onboarded/.test(grab(OB, 'async function finish(')), 'finish() must not raise the gate');
});
ok('la porte l’entend et cesse de se croire en installation', () => {
  assert.match(ENT, /addEventListener\('kiwi-onboarded',function\(\)\{onboarded=true;identitySettled=true;refreshPill\(\);\}\)/);
});

/* Un brouillon qui n'a pas pris (quota plein, stockage refusé) était avalé :
   le commerçant avançait, rechargeait, et repartait de zéro sans savoir
   pourquoi. Exécute les vraies saveDraft() et paintDraftNote(). */
function draftRun(fails, lang) {
  const events = [];
  const card = {
    note: null,
    querySelector(sel) { return sel === '[data-draft-note]' ? this.note : sel === '.kob-foot' ? { foot: true } : null; },
    insertBefore(n) { this.note = n; n.remove = () => { card.note = null; }; },
  };
  const LS = {
    set(k, v) {
      if (fails()) return false;
      store[k] = v; return true;
    },
  };
  const store = {};
  const ctx = vm.createContext({
    S: { step: 2, ownerName: 'Salma', bizName: 'Atlas', typeId: 'boutique', venueCount: 1, city: '', teamSize: 1, teamGiven: false, goals: [], dailyGoal: '', pins: [owner()] },
    draft: dataApi.createDraft(LS, ['boutique'], []), namePrefilled: false, lang: () => lang,
    tr: (o) => (o == null ? '' : (o[lang] ?? o.fr ?? '')),
    root: { querySelector: (s) => (s === '.kob-card' ? card : null) },
    document: { createElement: () => ({ className: '', textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) },
    window: { dispatchEvent: (e) => { events.push(e); return true; } },
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = (o || {}).detail; } },
  });
  vm.runInContext(grab(OB, 'function saveDraft(') + '\n' + grab(OB, 'function paintDraftNote('), ctx);
  return { ctx, card, events, store };
}
ok('un brouillon qui ne prend pas le dit, sans bloquer l’assistant', () => {
  let full = true;
  const r = draftRun(() => full, 'fr');
  const first = vm.runInContext('saveDraft()', r.ctx);
  assert.equal(first, false, 'saveDraft() rend faux quand le stockage refuse');
  assert.ok(r.card.note, 'une ligne apparaît sous la carte');
  assert.match(r.card.note.textContent, /Brouillon non enregistré sur cet appareil/);
  assert.equal(r.card.note.attrs.role, 'status', 'annoncée sans voler le focus');
  assert.deepEqual(r.events.map((e) => [e.type, e.detail.store, e.detail.durable]), [['kiwi:local-save', 'onboarding', false]]);
  full = false;
  assert.equal(vm.runInContext('saveDraft()', r.ctx), true, 'la première écriture qui reprend rend vrai');
  assert.equal(r.card.note, null, 'et la ligne disparaît');
  assert.ok(r.store['kiwiOnboardingDraft:v1'], 'le brouillon est rangé');
  assert.equal(r.events.length, 2, 'le retour à la normale est annoncé une fois');
});
ok('l’avertissement du brouillon est traduit', () => {
  for (const [lang, word] of [['en', 'Draft not saved on this device'], ['ar', 'لم تُحفظ المسودة على هذا الجهاز']]) {
    const r = draftRun(() => true, lang);
    vm.runInContext('saveDraft()', r.ctx);
    assert.ok(r.card.note && r.card.note.textContent.includes(word), lang);
  }
});
ok('chaque rendu de l’assistant repeint l’avertissement', () => {
  assert.match(grab(OB, 'function render('), /kob-foot">\$\{def\.foot\}<\/div>`;\s*paintDraftNote\(\);/);
});

ok('le vrai assistant expose le message de brouillon refusé', () => {
  assert.ok(OB.includes("draftWarning: () => draft ? draft.warning(lang()) : ''"), 'le vrai assistant expose le message');
  assert.ok(/const DRAFT_NOTE = \{[\s\S]*?\n  \};/.test(DATA), 'et les trois langues du message restent dans les données');
});

// Parse the live generator declarations, then execute them in their lexical scope.
const ts = createRequire(import.meta.url)('../app/node_modules/typescript');
const stepAst = ts.createSourceFile('onboarding.js', OB, ts.ScriptTarget.Latest, true);
function stepBody(step, ctx) {
  let source;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === step) source = node.getText(stepAst);
    ts.forEachChild(node, visit);
  }
  visit(stepAst);
  return vm.runInNewContext(source + ';' + step + '().body', ctx);
}

for (const locale of ['fr', 'en', 'ar']) {
  for (const [step, field] of [['stepName', 'ownerName'], ['stepBusiness', 'bizName'], ['stepPlaces', 'city']]) {
    ok(`generated ${field} accessible name (${locale})`, () => {
      const ctx = { S: { ownerName: '', bizName: '', city: '' }, TYPES: [], TYPE_HINT: {}, tr: o => o[locale], esc: String, footNav: () => '', stepper: () => '' };
      const html = stepBody(step, ctx);
      const dom = new DOMParser().parseFromString(html, 'text/html');
      const input = Array.from(dom.getElementsByTagName('input')).find(el => el.getAttribute('data-f') === field);
      assert.ok(input.getAttribute('aria-label').trim());
    });
    if (field !== 'city') ok(`generated ${field} visible limit (${locale})`, () => {
      const ctx = { S: { ownerName: '', bizName: '' }, TYPES: [], TYPE_HINT: {}, tr: o => o[locale], esc: String, footNav: () => '' };
      const html = stepBody(step, ctx);
      const dom = new DOMParser().parseFromString(html, 'text/html');
      const input = dom.getElementsByTagName('input')[0];
        const id = input.getAttribute('aria-describedby');
      assert.ok(id && dom.getElementById(id).textContent.trim(), 'visible limit description');
      assert.ok(dom.getElementById(id).textContent.includes(input.getAttribute('maxlength')), 'description gives the enforced limit');
    });
  }
}

console.log(`\nonboarding-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
