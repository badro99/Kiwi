/* Le propriétaire des champs de règlement reste unique, y compris via alias. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript/lib/typescript.js');
const fields = new Set(['server', 'status', 'covers', 'elapsed', 'orderStartedAt', 'timerSession', 'orderNo', 'discount', 'reopenRef', 'reopenSessionId', 'reopenedBill', 'settlement']);
function inspect(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true), aliases = new Set(), errors = [];
  assert.equal(ast.parseDiagnostics.length, 0, file + ' syntaxe');
  const table = n => n && ((ts.isElementAccessExpression(n) || ts.isPropertyAccessExpression(n)) && n.expression.getText(ast) === 'tables'
    || ts.isIdentifier(n) && aliases.has(n.text)
    || ts.isParenthesizedExpression(n) && table(n.expression)
    || ts.isConditionalExpression(n) && (table(n.whenTrue) || table(n.whenFalse))
    || ts.isBinaryExpression(n) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind) && (table(n.left) || table(n.right)));
  const walk = (n, callback) => { callback(n); ts.forEachChild(n, child => walk(child, callback)); };
  let size;
  do {
    size = aliases.size;
    walk(ast, n => {
      if (ts.isVariableDeclaration(n) && table(n.initializer)) aliases.add(n.name.getText(ast));
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && table(n.right)) aliases.add(n.left.text);
      if (ts.isFunctionDeclaration(n) && n.name?.text === 'resetTableTimer') aliases.add('t');
      if (ts.isCallExpression(n) && /Object\.(?:entries|values)\(tables\)\.forEach$/.test(n.expression.getText(ast))) {
        const param = n.arguments[0]?.parameters?.[0]?.name;
        if (param && ts.isIdentifier(param)) aliases.add(param.text);
        if (param && ts.isArrayBindingPattern(param)) param.elements.slice(1).forEach(e => { if (e.name) aliases.add(e.name.getText(ast)); });
      }
    });
  } while (size !== aliases.size);
  const field = n => ts.isPropertyAccessExpression(n) ? n.name.text : ts.isElementAccessExpression(n)
    ? ts.isStringLiteral(n.argumentExpression) ? n.argumentExpression.text : '*' : null;
  const money = n => n && (table(n.expression) && (fields.has(field(n)) || field(n) === '*') || n.expression && money(n.expression));
  const fail = n => errors.push(file + ':' + (ast.getLineAndCharacterOfPosition(n.getStart()).line + 1) + ' ' + n.getText(ast));
  walk(ast, n => {
    let target;
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) target = n.left;
    if (ts.isDeleteExpression(n)) target = n.expression;
    if ((ts.isPostfixUnaryExpression(n) || ts.isPrefixUnaryExpression(n)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator)) target = n.operand;
    if (target && money(target)) fail(n);
    if (target && (ts.isElementAccessExpression(target) || ts.isPropertyAccessExpression(target)) && target.expression.getText(ast) === 'tables' && !(ts.isDeleteExpression(n) || ts.isObjectLiteralExpression(n.right) && !n.right.properties.length)) fail(n);
    if (ts.isCallExpression(n) && ['Object.assign', 'Object.defineProperty', 'Object.defineProperties', 'Reflect.set', 'Reflect.deleteProperty'].includes(n.expression.getText(ast)) && table(n.arguments[0])) fail(n);
  });
  return errors;
}
for (const bad of ["tables[id].status = 'khlass'", "const t = tables[id]; delete t.discount", "const t = tables[id] || {}; t['covers']++",
  "let t; t = tables[id]; t.timerSession = 's'", "const t = tables[id]; t[field] = 1", "Object.assign(tables[id], state)",
  "tables[id] = {status:'khlass'}", "Object.values(tables).forEach(t => { t.orderNo = '1'; })", "Reflect.set(tables[id], 'status', 'khlass')"]) {
  assert.ok(inspect(bad, 'fixture.js').length, 'Mutation interdite détectée : ' + bad);
}
const files = fs.readdirSync('assets').filter(f => /^caisse.*\.js$/.test(f)).map(f => 'assets/' + f)
  .concat(fs.readdirSync('assets/caisse').filter(f => f.endsWith('.js')).map(f => 'assets/caisse/' + f));
const violations = files.filter(f => f !== 'assets/caisse/table-settlement.js').flatMap(file => inspect(fs.readFileSync(file, 'utf8'), file));
assert.deepEqual(violations, [], 'Écritures hors du propriétaire de règlement:\n' + violations.join('\n'));
assert.ok(fs.existsSync('assets/caisse/table-settlement.js'), 'Le propriétaire est livré');
console.log('PASS propriété du règlement : neuf mutations interdites détectées, aucune écriture externe');
