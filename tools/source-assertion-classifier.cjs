// Conservative AST classification. Imports, comments, strings and merely
// constructing a loader/context are not evidence that a target ran.
const ts = require('../app/node_modules/typescript');
function sourceOnly(text) {
  const ast = ts.createSourceFile('suite.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  let reads=false, executes=false;
  const imported = new Set(), called = new Set();
  function calls(n) {
    if(ts.isCallExpression(n) && ts.isIdentifier(n.expression)) called.add(n.expression.text);
    ts.forEachChild(n,calls);
  }
  calls(ast);
  function imports(n) {
    if (ts.isImportDeclaration(n) && /\.\.\/(functions|assets|app)\//.test(n.moduleSpecifier.text)) {
      const c=n.importClause;
      if(c?.name) imported.add(c.name.text);
      if(c?.namedBindings && ts.isNamedImports(c.namedBindings)) for(const e of c.namedBindings.elements) imported.add(e.name.text);
    }
    if(ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isCallExpression(n.initializer) && n.initializer.expression.getText(ast)==='require' && /assets\//.test(n.initializer.getText(ast))) imported.add(n.name.text);
    ts.forEachChild(n,imports);
  }
  imports(ast);
  function walk(n) {
    if(ts.isFunctionDeclaration(n) && n.name && !called.has(n.name.text)) return;
    if(ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const e=n.expression, name=ts.isIdentifier(e)?e.text:ts.isPropertyAccessExpression(e)?e.name.text:'';
      if(name==='readFileSync') reads=true;
      if (e.kind === ts.SyntaxKind.ImportKeyword) executes=true;
      if (name === 'Function' && (ts.isCallExpression(n.parent)
          || ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name) && called.has(n.parent.name.text))) executes=true;
      if (/^(runInContext|runInNewContext|runInThisContext|evaluate|launch|spawnSync|execFileSync|spawn|execFile|eval)$/.test(name) || imported.has(name) || (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && imported.has(e.expression.text)) || (name==='run' && /text2Require|text2-runtime/.test(e.getText(ast))) || name==='runNativeRuntime' || name==='sourceOnly') executes=true;
    }
    ts.forEachChild(n,walk);
  }
  walk(ast);
  return reads && !executes;
}
function assertions(text) {
  const ast=ts.createSourceFile('suite.js',text,ts.ScriptTarget.Latest,true), found=[];
  function walk(n) {
    if(ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && n.expression.expression.getText(ast)==='assert') found.push(n.getText(ast));
    ts.forEachChild(n,walk);
  }
  walk(ast);
  return found;
}
module.exports = {sourceOnly, assertions};
