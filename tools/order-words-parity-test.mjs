import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { words, word } from '../functions/api/_rules-order-words.js';

const targets = ['assets/orderpro-page.js', 'assets/serveur-lang.js', 'assets/caisse-kitchen.js'];
function copy(file) {
  const source = fs.readFileSync(file, 'utf8');
  const block = source.match(/\/\* GENERATED SHARED KiwiOrderWords BEGIN \*\/[\s\S]*?\/\* GENERATED SHARED KiwiOrderWords END \*\//);
  assert.ok(block, file + ': shared wording missing');
  return vm.runInNewContext(block[0] + '\nKiwiOrderWords');
}
for (const file of targets) {
  const browser = copy(file);
  for (const lang of ['fr', 'en', 'ar']) {
    for (const key of Object.keys(words.fr)) {
      assert.equal(typeof word(lang, key), 'string', lang + ':' + key);
      assert.equal(browser.words[lang][key], words[lang][key], file + ': own locale key ' + lang + ':' + key);
      assert.equal(browser.word(lang, key), word(lang, key), file + ':' + lang + ':' + key);
      // Even when the accessor falls back to French, a dropped locale key fails parity.
      const before = browser.words[lang][key];
      delete browser.words[lang][key];
      assert.throws(() => assert.equal(browser.words[lang][key], words[lang][key]));
      const french = browser.words.fr[key];
      delete browser.words.fr[key];
      assert.equal(browser.word(lang, key), undefined, file + ': missing key must fail');
      browser.words.fr[key] = french;
      browser.words[lang][key] = before;
    }
  }
}
const guest = fs.readFileSync(targets[0], 'utf8');
const guestT = guest.match(/    function t\(key\) \{[\s\S]*?\n    \}/)[0];
const kitchenSource = fs.readFileSync(targets[2], 'utf8');
const kitchenHelper = kitchenSource.match(/    function kkt\(k, a\) \{[\s\S]*?\n    \}\n/)[0];
for (const lang of ['fr', 'en', 'ar']) {
  const guestContext = { KiwiOrderWords: copy(targets[0]), currentLang: lang, I18N: { fr: {}, en: {}, ar: {} } };
  vm.createContext(guestContext);
  vm.runInContext(guestT + '\nthis.renderWord = t;', guestContext);
  const waiterContext = { window: {} };
  vm.runInNewContext(fs.readFileSync(targets[1], 'utf8'), waiterContext);
  const kitchenContext = { KiwiOrderWords: copy(targets[2]), window: { KiwiCaisseLang: { get: () => lang } } };
  vm.createContext(kitchenContext);
  vm.runInContext(kitchenHelper + '\nthis.renderWord = key => kkt("order." + key);', kitchenContext);
  for (const key of Object.keys(words.fr)) {
    const expected = word(lang, key);
    assert.equal(guestContext.renderWord(key), expected);
    assert.equal(waiterContext.window.KiwiServeurLang.word(lang, key), word(lang, key, 'waiter'));
    assert.equal(kitchenContext.renderWord(key), word('fr', key));
  }
}

assert.match(guest, /const shared = KiwiOrderWords.word\(currentLang, key\)/);
const waiter = fs.readFileSync('assets/serveur/service.js', 'utf8');
assert.match(waiter, /EMPLOYEE_TRANSLATIONS.word\(employeeLanguage, required \? 'opt_required'/);
assert.match(waiter, /EMPLOYEE_TRANSLATIONS.word\(employeeLanguage, 'btn_add'\)/);
const kitchen = fs.readFileSync(targets[2], 'utf8');
assert.match(kitchen, /kkt\(o.pickedUp \? 'order.served' : 'order.ready'\)/);
// Guest defaults and the waiter's preserved label variants are intentional.
for (const [lang, old] of [['fr', 'Obligatoire'], ['en', 'Required'], ['ar', 'إجباري']]) {
  assert.notEqual(old, word(lang, 'opt_required'));
}

const extra = { KiwiOrderWords: copy(targets[0]), currentLang: 'es', I18N: { fr: {}, en: {}, es: { btn_add: 'Añadir' } } };
vm.runInNewContext(guestT + '\nthis.renderWord = t;', extra);
assert.equal(extra.renderWord('btn_add'), 'Añadir');
assert.equal(extra.renderWord('opt_required'), word('en', 'opt_required'));
for (const [lang, required, optional, add] of [['fr', 'Obligatoire', 'Optionnel', 'Ajouter'], ['en', 'Required', 'Optional', 'Add'], ['ar', 'إجباري', 'اختياري', 'إضافة']]) {
  assert.equal(word(lang, 'opt_required', 'waiter'), required);
  assert.equal(word(lang, 'custom_note_optional', 'waiter'), optional);
  assert.equal(word(lang, 'btn_add', 'waiter'), add);
}

console.log('order-words parity: FR/EN/AR, three surfaces, preserved variants and extra locale, every key deletion detected');
