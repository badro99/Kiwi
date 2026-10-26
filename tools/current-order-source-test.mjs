/* Inventaire AST des écritures, alias et arguments inter-fonctions inclus. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('../app/node_modules/typescript');
const source = require('./caisse-test-source.cjs');
export function inspect(text) {
  const file = '/panier.js', host = ts.createCompilerHost({ allowJs: true });
  host.getSourceFile = name => name === file ? ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) : undefined;
  const program = ts.createProgram([file], { allowJs: true, noLib: true }, host), ast = program.getSourceFile(file), checker = program.getTypeChecker();
  assert.equal(ast.parseDiagnostics.length, 0);
  const aliases = new Set(), roots = new Set(), returns = new Set(), errors = [];
  const symbol = n => checker.getSymbolAtLocation(n);
  const walk = (n, cb) => {
    if (ts.isFunctionDeclaration(n) && ['createCurrentOrder', 'currentOrder'].includes(n.name?.text)) return;
    cb(n); ts.forEachChild(n, child => walk(child, cb));
  };
  for (const n of ast.statements) if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations)
    if (['cart', 'tableOrders', 'vrapDiscount', 'vrapEditingNum'].includes(d.name.getText(ast))) { aliases.add(symbol(d.name)); roots.add(symbol(d.name)); }
  const owned = n => !!n && (ts.isIdentifier(n) ? aliases.has(symbol(n))
    : ts.isParenthesizedExpression(n) ? owned(n.expression)
    : ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) ? owned(n.expression)
    : ts.isConditionalExpression(n) ? owned(n.whenTrue) || owned(n.whenFalse)
    : ts.isBinaryExpression(n) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.EqualsToken].includes(n.operatorToken.kind) ? owned(n.left) || owned(n.right)
    : ts.isCallExpression(n) ? ts.isPropertyAccessExpression(n.expression) && ['find', 'filter', 'map', 'slice', 'concat', 'at'].includes(n.expression.name.text) && owned(n.expression.expression)
      || ts.isIdentifier(n.expression) && returns.has(symbol(n.expression)) : false);
  let count;
  do {
    count = aliases.size + returns.size;
    walk(ast, n => {
      if (ts.isVariableDeclaration(n) && owned(n.initializer)) aliases.add(symbol(n.name));
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && owned(n.right)) aliases.add(symbol(n.left));
      if (ts.isReturnStatement(n) && owned(n.expression)) {
        let parent = n.parent;
        while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
        if (parent && ts.isFunctionDeclaration(parent)) returns.add(symbol(parent.name));
      }
      if (!ts.isCallExpression(n)) return;
      if (ts.isPropertyAccessExpression(n.expression) && owned(n.expression.expression)) for (const arg of n.arguments)
        if (ts.isFunctionLike(arg) && arg.parameters[0]) aliases.add(symbol(arg.parameters[0].name));
      const fn = ts.isIdentifier(n.expression) && symbol(n.expression)?.valueDeclaration;
      const callable = fn && (ts.isFunctionDeclaration(fn) ? fn : ts.isVariableDeclaration(fn) && ts.isFunctionLike(fn.initializer) ? fn.initializer : null);
      if (callable) n.arguments.forEach((arg, i) => { if (owned(arg) && callable.parameters[i]) aliases.add(symbol(callable.parameters[i].name)); });
    });
  } while (count !== aliases.size + returns.size);
  walk(ast, n => {
    let target;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) target = n.left;
    if (ts.isDeleteExpression(n)) target = n.expression;
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator)) target = n.operand;
    const mutator = ts.isCallExpression(n) && (ts.isPropertyAccessExpression(n.expression) && ['push','pop','splice','shift','unshift','sort','reverse','fill','copyWithin'].includes(n.expression.name.text) && owned(n.expression.expression)
      || ['Object.assign','Object.defineProperty','Object.defineProperties','Reflect.set','Reflect.deleteProperty'].includes(n.expression.getText(ast)) && owned(n.arguments[0]));
    if (target && (ts.isIdentifier(target) ? roots.has(symbol(target)) : owned(target)) || mutator) errors.push(n.getText(ast));
  });
  return errors;
}
const prelude = 'let cart = [], tableOrders = {}, vrapDiscount = null, vrapEditingNum = null;\n';
const mutations = ['cart = []', 'cart.push(line)', 'cart[0].qty++', 'const l = cart.find(x => x.uid); l.note = "test"',
  'const lines = tableOrders[id] || []; lines.forEach(l => { l.sent = true; })', 'delete tableOrders[id]',
  'Object.assign(tableOrders, input)', 'Reflect.set(cart[0], "qty", 1)', 'vrapDiscount = input', 'vrapEditingNum = 3',
  'function edit(lines) { lines[0].qty = 2; } edit(cart)', 'const edit = lines => lines[0].qty++; edit(cart)',
  'function group(lines) { return lines.filter(x => x); } group(cart).forEach(l => l.qty++)',
  'const l = cart[0]; l.opts.push(option)', 'const l = tableOrders[id]?.[0]; delete l.note'];
for (const mutation of mutations) assert.ok(inspect(prelude + mutation).length, mutation);
const baseline = JSON.parse(fs.readFileSync('tools/fixtures/caisse-app/cart-before.json'));
const old = baseline.functions;
const before = inspect(prelude + Object.values(old).join('\n')).length;
assert.ok(before > 0 && baseline.writesBefore.length >= before, 'L’oracle ancien expose les écritures inventoriées');
const violations = inspect(source.liveSource());
assert.deepEqual(violations, [], 'Écritures hors propriétaire :\n' + violations.join('\n'));
console.log(`PASS panier : ${baseline.writesBefore.length} écritures inventoriées avant extraction, ${violations.length} hors propriétaire, ${mutations.length} mutations détectées`);
