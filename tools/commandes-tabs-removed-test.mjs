#!/usr/bin/env node
// 2026-10-13: the Commandes drawer lost its Réconciliation and Anti-fraude tabs
// (processor-only content Kiwi does not have in Phase 1). Guard against them
// coming back through handlers['nav-transactions'] in assets/pages-pro.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pagesProSource from './pages-pro-test-source.cjs'; // pages-pro.js en quatre fichiers depuis le 22 octobre 2026

const ROOT = path.resolve(import.meta.dirname, '..');
const src = pagesProSource();
const start = src.indexOf("handlers['nav-transactions'] = () => {");
assert.ok(start > 0, "handlers['nav-transactions'] must still exist");
const end = src.indexOf('/* ═══', start);
const body = src.slice(start, end > start ? end : start + 40000);

let checks = 0;
const absent = (re, why) => { assert.ok(!re.test(body), why); checks++; };
absent(/data-tx-tab|\.tx-tab|kx-tabs tx-tabs/, 'the Commandes drawer must render no tab row');
absent(/data-tx-pane="(rec|fra)"/, 'the Réconciliation / Anti-fraude panes must stay removed');
absent(/Réconciliation|Reconciliation|Anti-fraud|التسوية|مكافحة الاحتيال/, 'no Réconciliation / Anti-fraude strings in any language');
absent(/Bloquer la carte|Économie vs CMI|Interchange Visa|fra-(investigate|allow|block)/, 'no processor / fraud content');
assert.match(body, /data-tx-pane="flux"/, 'the orders list pane must remain');
assert.match(body, /data-action="tx-filter"/, 'the order filters must remain');
assert.match(body, /handlers\['tx-detail'\]/, 'the row detail must remain');
checks += 3;
console.log(`✓ Commandes drawer has no Réconciliation / Anti-fraude tabs (${checks} checks)`);
