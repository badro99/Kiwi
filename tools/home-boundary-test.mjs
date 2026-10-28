import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import home from './home-test-source.cjs';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
for (const part of home.metadata().parts) {
  const text = fs.readFileSync(part.file, 'utf8');
  const ast = ts.createSourceFile(part.file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const state = new Set(), globals = new Set(), globalThisReads = new Set();
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const base = node.expression.getText(ast);
      if (base === 'window' || base === '__state' || base === 'globalThis') {
        const key = ts.isPropertyAccessExpression(node) ? node.name.text : ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : null;
        assert.ok(key, part.name + ': computed private access must be declared');
        (base === 'window' ? globals : base === 'globalThis' ? globalThisReads : state).add(key);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.deepEqual([...globalThisReads].sort(), part.globalThis, part.name + ': only declared globalThis interface');
  assert.deepEqual([...state].sort(), part.reads, part.name + ': only declared live owner interface');
  assert.deepEqual([...globals].sort(), [...part.globals, '__kiwiHomeRenderers'].sort(), part.name + ': no sibling private window state');
  assert.ok(!part.globals.includes('__kiwiHomeRenderers'), 'bodies never reach sibling registry');
}
/* Every name a part reads through the live owner must be exposed by it: the
   owner's state object (partState in assets/dateRange.js) answered undefined
   for three sibling helpers after the split, and the language switch and every
   page change threw on the dashboard (wave 2, 27 Oct). */
{
  const owner = fs.readFileSync('assets/dateRange.js', 'utf8');
  const exposed = new Set([...owner.matchAll(/^\s+([A-Za-z_$][\w$]*): \{ get: \(\) =>/gm)].map((m) => m[1]));
  for (const part of home.metadata().parts) {
    const text = fs.readFileSync(part.file, 'utf8');
    for (const [, name] of text.matchAll(/__state\.([A-Za-z_$][\w$]*)/g)) {
      assert.ok(exposed.has(name), part.file + ' reads __state.' + name + ' but assets/dateRange.js does not expose it');
    }
  }
}
console.log('PASS home boundaries: every state and window access has an explicit per-module declaration, and the owner exposes each one');

// Run the actual band, including each rendered value, when derivation throws.
const { default: vm } = await import('node:vm');
{
  const values = {}, deltas = {};
  const wrap = { style:{setProperty(){}}, dataset:{}, querySelectorAll:()=>[],
    querySelector(selector) { const key=selector.match(/data-kpi="([^"]+)"/)[1];
      values[key] ||= {}; deltas[key] ||= {};
      return {querySelector:s=> s === '[data-kpi-val]' ? values[key] : deltas[key]};
    }
  };
  const state = {
    guardOperatorFigures:()=>false, getLang:()=> 'fr', currentRange:'aujourdhui',
    vData:()=>({tx:{value:999,delta:8},panier:{value:21,delta:3}}),
    KPI_DELTA_SUFFIX:{fr:{aujourdhui:'hier'}}, isLiveDemo:()=>false, ownData:()=>false,
    getKpiLayout:()=>['tx','panier'], effRange:()=> 'aujourdhui', RANGE_DAYS:{aujourdhui:1},
    KPI_CATALOG:{tx:{derive(){throw Error('unavailable ledger');}},panier:{derive:()=>({value:42,unit:'MAD',delta:null})}},
    kpiLabel:k=>k, getCurrentVenue:()=> 'm', KPI_SPARKS:{tx:''}, KPI_MATERIAL_ICONS:{},
    fmtKpiVal:(tile,value)=>tile.text ?? String(value), homeSet:(key,model)=>{state.model=model;}, curUnit:()=> 'MAD'
  };
  const window={};
  vm.runInNewContext(fs.readFileSync('assets/daterange/kpi.js','utf8'),{window,document:{querySelector:()=>wrap}});
  window.__kiwiHomeRenderers.kpi(state).renderKpiBand();
  assert.equal(values.tx.innerHTML,'·','failed derive replaces the stale KPI');
  assert.equal(values.panier.innerHTML,'42','the next KPI still renders its derived value');
  assert.equal(deltas.tx.textContent,'','failed KPI has no invented comparison');
  assert.deepEqual(Array.from(state.model.items,x=>[x.key,x.value,x.delta]),[['tx','·',null],['panier','42',null]],'published home model agrees with every rendered KPI');
}
console.log('PASS home derive failure: rendered KPI values and home model stay honest');
