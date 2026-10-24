#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const glossary = JSON.parse(read('content/operational-glossary.json'));
assert.equal(glossary.version, 1);
assert.ok(glossary.approvalContract.includes('named reviewer'));
const ticketSource = read('assets/tickets.js');
const ticket = vm.runInNewContext('(' + ticketSource.match(/const COPY = (\{[\s\S]*?\n  \});/)[1] + ')');
const hotelSource = read('assets/hotel-language.js');
const hotel = vm.runInNewContext('({' + hotelSource.split('/* hx-i18n:begin */')[1].split('/* hx-i18n:end */')[0] + '})');
assert.ok(glossary.terms.length >= 8);
const ids = new Set();
for (const term of glossary.terms) {
  assert.ok(!ids.has(term.id)); ids.add(term.id);
  assert.ok(term.meaning && term.review.by && /^\d{4}-\d{2}-\d{2}$/.test(term.review.date));
  assert.equal(term.review.status, 'approved');
  for (const locale of ['fr', 'en', 'ar']) {
    assert.ok(term[locale]);
    assert.equal(term[locale], term.surface === 'tickets' ? ticket[locale][term.key] : locale === 'fr' ? term.key : hotel[term.key][locale], term.id + ':' + locale);
    assert.deepEqual([...term[locale].matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), [...term.fr.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort());
  }
}
console.log(`✓ ${glossary.terms.length} reviewed FR/EN/AR operational terms and their approval contract match shipping dictionaries`);
