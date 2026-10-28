// Extract complete function declarations with the repo's parser, then execute
// them unchanged. Dependencies are explicit fixtures; the function body is shipped code.
import ts from '../app/node_modules/typescript/lib/typescript.js';
import vm from 'node:vm';
export function shippedFunction(source, name, globals = {}) {
  const ast = ts.createSourceFile('shipped.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!found) throw new Error('Missing shipped function: ' + name);
  return vm.runInNewContext('(' + found.getText(ast).replace(/^export\s+/, '') + ')', globals);
}
