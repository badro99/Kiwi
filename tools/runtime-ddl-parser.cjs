// Resolve static SQL without executing route modules or evaluating JavaScript.
const ts = require('../app/node_modules/typescript');
const fs = require('node:fs');

function scan(file) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const constants = new Map(), out = [], visited = new Set();
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      constants.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collect);
  }
  collect(ast);
  function value(node, seen = new Set()) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isIdentifier(node) && constants.has(node.text) && !seen.has(node.text)) {
      return value(constants.get(node.text), new Set([...seen, node.text]));
    }
    if (ts.isParenthesizedExpression(node)) return value(node.expression, seen);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const a = value(node.left, seen), b = value(node.right, seen);
      return a === null || b === null ? null : a + b;
    }
    if (ts.isTemplateExpression(node)) {
      let sql = node.head.text;
      for (const span of node.templateSpans) {
        const part = value(span.expression, seen);
        if (part === null) return null;
        sql += part + span.literal.text;
      }
      return sql;
    }
    return null;
  }
  const ddl = /\bCREATE\s+(?:TABLE|(?:UNIQUE\s+)?INDEX)\b/i;
  function visit(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))
        && ddl.test(node.getText(ast))) {
      let expression = node;
      while (ts.isParenthesizedExpression(expression.parent)
          || (ts.isBinaryExpression(expression.parent) && expression.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
        expression = expression.parent;
      }
      if (!visited.has(expression)) {
        visited.add(expression);
        const sql = value(expression);
        if (sql === null) throw new Error(`${file}: unresolved runtime DDL; extend the static resolver`);
        out.push({ sql, node: expression });
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { source, ast, out, value };
}
module.exports = { scan };
