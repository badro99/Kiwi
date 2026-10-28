/* Historical split coordinates are not stable after a behaviour fix. Locate
 * live declarations by name; archives remain independent split proofs only. */
const ts = require('../app/node_modules/typescript');
const parse = source => ts.createSourceFile('split.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declarations = new Map();
function declaration(source, name, occurrence = 0) {
  if (!declarations.has(source)) {
    const ast = parse(source), names = new Map();
    function visit(n) {
      if ((ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n)) && n.name) {
        const node = ts.isVariableDeclaration(n) ? n.parent.parent : n;
        const key = n.name.getText(ast);
        if (!names.has(key)) names.set(key, []);
        names.get(key).push(source.slice(node.getFullStart(), node.end).trimStart());
      }
      ts.forEachChild(n, visit);
    }
    visit(ast); declarations.set(source, names);
  }
  const text = declarations.get(source).get(name)?.[occurrence];
  if (!text) throw Error('Missing live declaration: ' + name);
  return text;
}
function fragment(source, f) {
  const name = f.name || /function (\w+)/.exec(f.replacement)?.[1] || 'M';
  return '\n  ' + declaration(source, name);
}
// A split remains token-identical outside the explicitly reviewed behaviours.
// Those behaviours execute in r13-d-failsoft-test.mjs, rather than a frozen copy.
const translated = new Set(['notStored','filter.saveFailed','Conversion photo impossible. Essayez une autre image.']);
const removedProperty = n => n && ts.isPropertyAssignment(n) && translated.has(n.name.text);
const evolved = new Set(['rememberManage','manageBlock','cancelBooking','openManage','empPayRefsWrite','saveFilters','addFiles','cuShrinkHotelPhoto','cuUploadTypePhotos']);
function tokens(source) {
  const ast = parse(source), out = [], removedEnds = new Set();
  function walk(n) {
    if (ts.isVariableStatement(n) && n.declarationList.declarations.every(d => ['previewUrls','followupPreviewUrls'].includes(d.name.getText(ast)))) return;
    if (ts.isFunctionDeclaration(n) && evolved.has(n.name?.text)) { out.push(['function',n.name.text]); return; }
    if (removedProperty(n)) { removedEnds.add(n.end); return; }
    if (n.kind === ts.SyntaxKind.CommaToken && removedEnds.has(n.pos)) return;
    const children = n.getChildren(ast);
    if (!children.length && n.kind !== ts.SyntaxKind.EndOfFileToken) out.push([n.kind,n.getText(ast)]);
    for (const child of children) walk(child);
  }
  walk(ast); return out;
}
module.exports = {declaration, fragment, tokens};
