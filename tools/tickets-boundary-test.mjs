import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { ticketsMap } from './tickets-test-source.mjs';
const ts = createRequire(import.meta.url)('../app/node_modules/typescript');
// Closed browser capabilities, not permissions to read sibling module state.
function violations(file, source, name) {
  const contract = ticketsMap.parts.find(part => part.name === name);
  const globals = new Set(contract.globalReads);
  const host = ts.createCompilerHost({allowJs:true,noLib:true});
  host.readFile = f => f===file ? source : undefined;
  const program = ts.createProgram([file],{allowJs:true,noLib:true},host), ast=program.getSourceFile(file), checker=program.getTypeChecker(), bad=[];
  function visit(n) {
    if (ts.isIdentifier(n)) {
      const p=n.parent;
      const property = (ts.isPropertyAccessExpression(p) && p.name===n) || ((ts.isPropertyAssignment(p)||ts.isMethodDeclaration(p)||ts.isPropertyDeclaration(p)) && p.name===n);
      if (!property && !checker.getSymbolAtLocation(n) && !globals.has(n.text)) bad.push('undeclared '+n.text);
      if (n.text==='window') {
        if (!ts.isPropertyAccessExpression(p)||p.expression!==n||!contract.windowReads.includes(p.name.text)) bad.push('window capability '+p.getText(ast));
      }
    }
    ts.forEachChild(n,visit);
  }
  visit(ast); return bad;
}
for (const part of ticketsMap.parts) {
  const source=fs.readFileSync(part.file,'utf8');
  assert.deepEqual(violations(part.file,source,part.name),[],part.file+': only injected dependencies and declared browser capabilities');
  assert.ok(violations(part.file,source+'\nwindow.siblingPrivateState;',part.name).length,'reject sibling window access');
  assert.ok(violations(part.file,source+'\nunknownSiblingState;',part.name).length,'reject undeclared lexical access');
  assert.ok(violations(part.file,source+'\nconst alias = window;',part.name).length,'reject window aliases');
}
const {createTicketState}=await import('../assets/tickets-data.js');
const owner=createTicketState({readFilters:()=>({kind:'',area:'',money:false})});
assert.ok(Object.isFrozen(owner));assert.deepEqual(Object.keys(owner),['read','write','view']);
owner.write('tickets',[{id:1}]);assert.equal(owner.read('tickets'),owner.view().tickets);
assert.notEqual(owner.view(),createTicketState({readFilters:()=>({})}).view(),'isolated owner instances');
console.log('✓ tickets boundaries: declared capabilities, closed interfaces, private state rejection and one mutable state owner');
