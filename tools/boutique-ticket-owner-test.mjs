import fs from 'node:fs';
import vm from 'node:vm';
import sharedRules from './shared-rules-source.cjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const fc = require('../app/node_modules/fast-check');
const files = ['assets/pos-boutique.js', ...fs.readdirSync('assets/pos-boutique').filter(x => x.endsWith('.js') && x !== 'ticket-owner.js').map(x => 'assets/pos-boutique/' + x)];
// Suit les alias du ticket et de ses lignes, y compris les callbacks find/forEach.
function writes(source) {
  const tree = ts.createSourceFile('ticket.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const bodies = [];
  function collect(n) {
    if (ts.isFunctionDeclaration(n)) bodies.push(n);
    else ts.forEachChild(n, collect);
  }
  collect(tree);
  if (bodies.length) {
    let rest = source;
    for (const n of [...bodies].reverse()) rest = rest.slice(0, n.pos) + rest.slice(n.end);
    return writes(rest) + bodies.reduce((sum, n) => sum + writes(n.body.getText(tree).slice(1, -1)), 0);
  }
  const aliases = new Set(['ticket']);
  function isTicket(n) {
    if (!n) return false;
    if (ts.isIdentifier(n)) return aliases.has(n.text);
    if (ts.isParenthesizedExpression(n)) return isTicket(n.expression);
    if (ts.isPropertyAccessExpression(n)) return (n.expression.getText(tree) === 'state' && n.name.text === 'ticket') || isTicket(n.expression);
    if (ts.isElementAccessExpression(n)) return (n.expression.getText(tree) === 'state' && n.argumentExpression.getText(tree).replace(/['"]/g, '') === 'ticket') || isTicket(n.expression);
    if (ts.isCallExpression(n)) return isTicket(n.expression);
    return false;
  }
  function visit(n, fn) { fn(n); ts.forEachChild(n, child => visit(child, fn)); }
  for (let i = 0; i < 4; i++) visit(tree, n => {
    if (ts.isVariableDeclaration(n) && n.initializer && isTicket(n.initializer)) aliases.add(n.name.getText(tree));
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && isTicket(n.expression.expression)) {
      for (const arg of n.arguments) if (ts.isArrowFunction(arg)) for (const p of arg.parameters) aliases.add(p.name.getText(tree));
    }
  });
  let count = 0;
  visit(tree, n => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && isTicket(n.left)) count++;
    if ((ts.isPostfixUnaryExpression(n) || (ts.isPrefixUnaryExpression(n) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator)) || ts.isDeleteExpression(n)) && isTicket(n.operand || n.expression)) count++;
    if (ts.isCallExpression(n) && /\.(?:push|splice|pop|shift|unshift|sort|reverse|fill|copyWithin)$/.test(n.expression.getText(tree)) && isTicket(n.expression)) count++;
    if (ts.isCallExpression(n) && /^(?:Object\.(?:assign|defineProperty|defineProperties)|Reflect\.(?:set|deleteProperty))$/.test(n.expression.getText(tree)) && isTicket(n.arguments[0])) count++;
  });
  return count;
}
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(writes(source), 0, file);
  for (const mutation of ['state.ticket.client = 1;', 'const t = state.ticket; t.lines.push({});', 'const t = state.ticket; const ln = t.lines[0]; ln.qty++;', 'const ticket = state.ticket; ticket.num = 1;', 'Object.assign(state.ticket, {client: 1});', '(state.ticket).client = 1;', "state['ticket'].client = 1;", 'const t = state.ticket; delete t.reward;', 'const t = state.ticket; const same = t.lines.find(l => true); same.qty += 1;' ]) assert.ok(writes(source + '\n' + mutation) > 0, file + ': mutation détectée');
}
const ownerSource = fs.readFileSync('assets/pos-boutique/ticket-owner.js', 'utf8');
const c = vm.createContext({});
vm.runInContext(ownerSource.replace(/export \{ ticketOwner \};/, 'this.owner = ticketOwner;'), c);
const owner = c.owner;
const previous = {reward:{}};
const intent = owner.reserveReward(previous, 'fidélité');
const next = {reward:{}};
const state = {ticket:previous};
owner.clear(state,next);
owner.acceptReward(intent);
owner.numbered(previous,'ancien','2026');
assert.equal(previous.reward.reservation.accepted,true);
assert.equal(next.reward.reservation,undefined);
assert.equal(next.num,undefined);
const { declaration } = require('./js-declarations.cjs');
const core = fs.readFileSync('assets/pos-boutique.js', 'utf8').replace(/^(?:import .*;\n)+/, '');
const old = require('node:zlib').gunzipSync(fs.readFileSync('tools/fixtures/boutique-ticket/pricing-before.js.gz')).toString();
function pricing(source) {
  const ctx = vm.createContext({ P: { a: { price: 129.90 }, b: { price: 249.95 } }, shelf: n => Math.max(0, Math.floor(n * 100 + 1e-6) / 100), promoFor: () => null });
  vm.runInContext(sharedRules(source) + '\n' + ['lineDeal','linePromo','lineBase','lineUnit','lineTotal','rewardDiscount','ticketTotals'].map(n => declaration(source, n)).join('\n') + '\nthis.total = ticketTotals;', ctx);
  return ctx.total;
}
const before = pricing(old), after = pricing(core);
fc.assert(fc.property(fc.array(fc.record({ op: fc.integer({min:0,max:9}), pid: fc.constantFrom('a','b'), qty: fc.integer({min:1,max:9}), remise: fc.constantFrom(0,5,10,20), price: fc.integer({min:1,max:150}) }), {maxLength:100}), edits => {
  let a = { lines: [], client: null }, b = structuredClone(a);
  for (const e of edits) {
    if (e.op === 0) {
      const line = {pid:e.pid,size:'TU',color:'ivoire',qty:e.qty,remise:e.remise,promo:{price:e.price}};
      owner.addLine(a, structuredClone(line));
      const same = b.lines.find(l => l.pid===line.pid && l.size===line.size && l.color===line.color && l.remise===line.remise);
      if (same) { same.qty += line.qty; if (line.promo && (!same.promo || line.promo.price < same.promo.price)) same.promo=line.promo; } else b.lines.push(line);
    } else if (e.op===1 && a.lines.length) { owner.changeQuantity(a,0,-1); b.lines[0].qty--; if(b.lines[0].qty<=0)b.lines.splice(0,1); }
    else if(e.op===2) { owner.setCustomer(a,e.pid); b.client=e.pid; }
    else if(e.op===3) { const reward={clientId:e.pid,kind:'percent',value:e.remise}; owner.applyReward(a,reward); b.reward=reward; }
    else if(e.op===4) { owner.replaceLines(a,[]); b.lines=[]; }
    else if(e.op===6) { const state={ticket:a}; owner.clear(state,{lines:[],client:null}); a=state.ticket; b={lines:[],client:null}; }
    else if(e.op===7) { owner.prune(a,{a:true}); b.lines=b.lines.filter(l=>l.pid==='a'); }
    else if(e.op===8) { const state={ticket:a,ret:{saleId:'vente'}}; const exchange={saleId:'vente',idx:0,qty:1,motif:'taille'}; owner.startReturn(state,exchange); assert.equal(state.ret,null); assert.equal(state.exchange,exchange); assert.equal(state.ticket,a); }
    else if(e.op===9) { owner.numbering(a); b.numbering=true; b.numError=false; owner.numbered(a,'123','2026'); Object.assign(b,{num:'123',period:'2026',numbering:false,numError:false}); }
    else { owner.applyDiscount(a,{pct:e.remise}); b.remiseAuth={pct:e.remise}; }
    assert.equal(JSON.stringify(a),JSON.stringify(b));
    for(const key of ['sub','promo','remise','reward','total']) assert.equal((Math.round(after(a)[key]*100) || 0),(Math.round(before(b)[key]*100) || 0));
  }
}), {numRuns:1000,seed:20261026});
console.log('✓ Ticket boutique : zéro mutation externe, mutations détectées, 1 000 séquences et centimes identiques');
