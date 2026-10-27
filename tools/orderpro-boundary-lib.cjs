/* Lexical free-name and browser-global checks, shared by the contract suite. */
const ts = require('../app/node_modules/typescript');
function references(source) {
  source = source.replace(/with \(scope\) \{/g, '{');
  const file = ts.createSourceFile('boundary.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const host = { getSourceFile: name => name === 'boundary.js' ? file : undefined, getDefaultLibFileName: () => '', writeFile() {}, getCurrentDirectory: () => '', getDirectories: () => [], fileExists: name => name === 'boundary.js', readFile: () => source, getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n' };
  const checker = ts.createProgram(['boundary.js'], { allowJs: true, noLib: true }, host).getTypeChecker();
  const free = new Set(), globals = new Set();
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && ['window', 'globalThis'].includes(node.expression.getText(file))) globals.add(node.getText(file));
    if (ts.isElementAccessExpression(node) && ['window', 'globalThis'].includes(node.expression.getText(file))) {
      if (!ts.isStringLiteral(node.argumentExpression)) globals.add('dynamic-browser-global');
      else globals.add(node.expression.getText(file) + '.' + node.argumentExpression.text);
    }
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const key = (ts.isPropertyAccessExpression(p) && p.name === node) || ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)) && p.name === node);
      const symbol = ts.isShorthandPropertyAssignment(p) ? checker.getShorthandAssignmentValueSymbol(p) : checker.getSymbolAtLocation(node);
      if (!key && !symbol?.declarations?.length) free.add(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { free: [...free].sort(), globals: [...globals].sort() };
}
function violations(source, contract) {
  const found = references(source);
  return [...found.free.filter(name => !contract.free.includes(name)).map(name => 'undeclared binding: ' + name), ...found.globals.filter(name => !contract.globals.includes(name)).map(name => 'undeclared browser global: ' + name)];
}
module.exports = { references, violations };
