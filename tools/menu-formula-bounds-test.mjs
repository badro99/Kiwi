#!/usr/bin/env node
/* menu-formula-bounds-test · le min et le max d'une étape de formule ne changent
 * jamais en silence.
 *
 * L'éditeur d'article ramenait ce que le propriétaire tapait (12, 2,5, un min
 * au-dessus du max) à un entier de 0 à 10 sans rien dire : ce qui était affiché
 * n'était pas ce qui était enregistré. Les vraies fonctions `bound` et
 * `boundsNote` de assets/menu-catalog/item-editor.js tournent ici dans un `vm`,
 * avec un faux champ ; le message existe en français, en anglais et en arabe. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/menu-catalog/item-editor.js', import.meta.url), 'utf8');
const start = source.indexOf('    function bound(raw, lo, hi, dflt)');
const end = source.indexOf('    /* Quand le champ est quitté');
assert.ok(start > 0 && end > start, 'bound() and boundsNote() are still in the item editor');
const code = source.slice(start, end);

function editor(lang, slot) {
  const note = { hidden: true, textContent: '' };
  const ctx = {
    formulaSlots: [slot],
    slotsContainer: { querySelector: (q) => (q === '[data-f-slot-note="0"]' ? note : null) },
    tr: (o) => o[lang],
  };
  vm.runInNewContext(code + '\nthis.bound = bound; this.boundsNote = boundsNote;', ctx);
  const type = (field, raw) => {
    if (field === 'min') { ctx.formulaSlots[0].min = ctx.bound(raw, 0, 10, 0).value; ctx.boundsNote(0, raw, null); }
    else { ctx.formulaSlots[0].max = ctx.bound(raw, 1, 10, 1).value; ctx.boundsNote(0, null, raw); }
  };
  return { slot: ctx.formulaSlots[0], note, type };
}

// A value inside the range is saved as typed and says nothing.
let e = editor('fr', { min: 1, max: 1 });
e.type('max', '4'); e.type('min', '2');
assert.deepEqual([e.slot.min, e.slot.max, e.note.hidden, e.note.textContent], [2, 4, true, '']);

// 12 is saved as 10 and the owner is told so, in each language.
for (const [lang, expected] of [['fr', 'Max ramené à 10'], ['en', 'Max changed to 10'], ['ar', 'تم تعديل الحد الأقصى إلى 10']]) {
  e = editor(lang, { min: 1, max: 1 });
  e.type('max', '12');
  assert.equal(e.slot.max, 10, lang + ': the stored max is the clamped one');
  assert.equal(e.note.hidden, false, lang + ': a note appears');
  assert.ok(e.note.textContent.includes(expected), lang + ': ' + e.note.textContent);
  assert.ok(!/—/.test(e.note.textContent), 'no em dash in user-facing text');
}

// A fraction is rounded and says so; a negative min is raised to 0 and says so.
e = editor('en', { min: 1, max: 5 });
e.type('min', '2.5');
assert.equal(e.slot.min, 3); assert.match(e.note.textContent, /Min changed to 3/);
e.type('min', '-4');
assert.equal(e.slot.min, 0); assert.match(e.note.textContent, /Min changed to 0/);
e.type('min', '3');
assert.equal(e.note.hidden, true, 'typing a valid number clears the note');

// A max below 1 is raised to 1.
e = editor('fr', { min: 0, max: 3 });
e.type('max', '0');
assert.equal(e.slot.max, 1); assert.match(e.note.textContent, /Max ramené à 1/);

// An empty field, mid-typing, is not an error.
e = editor('fr', { min: 1, max: 3 });
e.type('min', '');
assert.deepEqual([e.slot.min, e.note.hidden], [0, true]);

// A min above the max is flagged before save, where the form used to say nothing
// and the sanitizer quietly lowered it.
e = editor('fr', { min: 1, max: 2 });
e.type('min', '5');
assert.equal(e.slot.min, 5);
assert.match(e.note.textContent, /Le min \(5\) dépasse le max \(2\) : il sera enregistré à 2/);
e = editor('ar', { min: 1, max: 2 }); e.type('min', '5');
assert.match(e.note.textContent, /سيُحفظ 2/);
e.type('min', '2');
assert.equal(e.note.hidden, true, 'fixing the min clears the warning');

// The field shows what is saved once the owner leaves it.
assert.ok(/addEventListener\('change'[\s\S]{0,500}inp\.value = String\(isMin \? slot\.min : slot\.max\)/.test(source), 'leaving the field shows the stored value');

console.log('✓ formula slot bounds: clamped values are announced in FR/EN/AR and the field shows what is saved');
