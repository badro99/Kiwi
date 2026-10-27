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
