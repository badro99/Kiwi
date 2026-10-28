// Per-assertion text/behaviour split of a test file (AST, no execution).
//
// source-assertion-classifier.cjs answers "does this suite run code at all".
// A suite that runs one handler and then greps 35 lines of HTML passes that
// test and counts as behavioural. This module counts assertion by assertion:
// an assertion is TEXT when what it checks is only the text of a file read
// from disk (readFileSync, or a helper that wraps it) put through string
// operations (includes, match, test, split...). Anything else is behaviour:
// a call into code we do not know, a value produced by running the code.
// The count is conservative in one direction only: an unknown call makes an
// assertion behavioural, so the text share is a floor, never inflated.
const ts = require('../app/node_modules/typescript');

const ASSERT_NAMES = new Set(['assert', 'ok', 'check', 'expect', 'eq', 'equal', 'same', 'is', 'must', 'test', 'it', 'step', 'has', 'yes']);
const ASSERT_MEMBERS = /^(ok|equal|notEqual|strictEqual|notStrictEqual|deepEqual|deepStrictEqual|notDeepStrictEqual|match|doesNotMatch|throws|doesNotThrow|rejects|doesNotReject|fail|ifError|isTrue|isFalse)$/;
const TEXT_OPS = new Set(['includes', 'test', 'match', 'matchAll', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith', 'split', 'slice', 'substring', 'substr',
  'replace', 'replaceAll', 'toLowerCase', 'toUpperCase', 'trim', 'join', 'exec', 'search', 'some', 'every', 'filter', 'map', 'find', 'has', 'get',
  'String', 'RegExp', 'Boolean', 'Number', 'isArray', 'keys', 'values', 'entries', 'from', 'concat', 'length', 'not', 'charAt', 'at', 'size', 'normalize',
  'JSON', 'parse', 'stringify', 'sort', 'reduce', 'flat', 'flatMap', 'localeCompare', 'push', 'Set', 'Array', 'Object', 'Math', 'max', 'min', 'abs',
  'readFileSync', 'existsSync', 'resolve', 'join', 'basename', 'dirname', 'extname', 'readdirSync', 'statSync', 'toString', 'padStart', 'padEnd', 'repeat']);
const READER_NAME = /(^read|^load|Source$|Src$|^src$|^text$|^slurp$|^fileText$|^rd$|^cat$|^txt$|^source$)/i;

function parse(text) { return ts.createSourceFile('suite.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); }
function calleeName(e) { return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ''; }
function walk(n, f) { f(n); ts.forEachChild(n, (c) => walk(c, f)); }
function containsRead(n) { let r = false; walk(n, (x) => { if (ts.isCallExpression(x) && calleeName(x.expression) === 'readFileSync') r = true; }); return r; }

function mix(text) {
  const ast = parse(text);
  const readers = new Set();   // local helpers that read a file
  const helpers = new Set();   // local helpers that assert
  const fnBodies = [];
  walk(ast, (n) => {
    let name = '', body = null;
    if (ts.isFunctionDeclaration(n) && n.name) { name = n.name.text; body = n.body; }
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) { name = n.name.text; body = n.initializer.body; }
    if (!name || !body) return;
    fnBodies.push([name, body]);
  });
  for (const [name, body] of fnBodies) {
    if (containsRead(body)) readers.add(name);
    let asserts = false;
    walk(body, (x) => {
      if (ts.isThrowStatement(x)) asserts = true;
      if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.expression.getText(ast) === 'assert') asserts = true;
      if (ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) && x.expression.name.text === 'push' && /fail|errors|problems/i.test(x.expression.expression.getText(ast))) asserts = true;
    });
    if (asserts && !readers.has(name)) helpers.add(name);
  }

  // Taint: identifiers bound to file text, propagated through initialisers.
  const tainted = new Set();
  const isReaderCall = (x) => ts.isCallExpression(x) && (calleeName(x.expression) === 'readFileSync' || readers.has(calleeName(x.expression)) ||
    (ts.isIdentifier(x.expression) && READER_NAME.test(x.expression.text) && !ASSERT_NAMES.has(x.expression.text)));
  const bindNames = (nm, out) => {
    if (ts.isIdentifier(nm)) out.push(nm.text);
    else if (ts.isObjectBindingPattern(nm) || ts.isArrayBindingPattern(nm)) for (const e of nm.elements) if (ts.isBindingElement(e)) bindNames(e.name, out);
  };
  const decls = [];
  walk(ast, (n) => { if (ts.isVariableDeclaration(n) && n.initializer) decls.push(n); });
  for (let changed = true, guard = 0; changed && guard < 8; guard++) {
    changed = false;
    for (const d of decls) {
      const names = []; bindNames(d.name, names);
      if (names.every((x) => tainted.has(x))) continue;
      let t = false;
      const init = d.initializer;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) continue;
      // Only plain data flow: reading a file, or string/array ops over tainted text.
      walk(init, (x) => {
        if (isReaderCall(x)) t = true;
        if (ts.isIdentifier(x) && tainted.has(x.text)) t = true;
      });
      // A value computed by running code over the text is behaviour, not text.
      let runs = false;
      walk(init, (x) => { if (ts.isCallExpression(x) && /^(runInContext|runInNewContext|runInThisContext|Function|eval|evaluate|spawnSync|execFileSync|run|import|require)$/.test(calleeName(x.expression))) runs = true; if (x.kind === ts.SyntaxKind.ImportKeyword) runs = true; });
      if (t && !runs) for (const x of names) if (!tainted.has(x)) { tainted.add(x); changed = true; }
    }
  }

  const isAssertCall = (n) => {
    if (!ts.isCallExpression(n)) return false;
    const e = n.expression;
    if (ts.isIdentifier(e)) return ASSERT_NAMES.has(e.text) && n.arguments.length > 0 && !(e.text === 'test' || e.text === 'it' || e.text === 'step') || helpers.has(e.text);
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
      const o = e.expression.text;
      if (/^(assert|t)$/.test(o) && (ASSERT_MEMBERS.test(e.name.text) || o === 'assert')) return true;
    }
    return false;
  };
  const isText = (call) => {
    let ref = false, other = false;
    for (const a of call.arguments) {
      walk(a, (x) => {
        if (ts.isIdentifier(x) && tainted.has(x.text)) ref = true;
        if (isReaderCall(x)) ref = true;
        if (ts.isCallExpression(x) && !isReaderCall(x)) {
          const nm = calleeName(x.expression);
          if (!TEXT_OPS.has(nm) && !(ts.isIdentifier(x.expression) && tainted.has(x.expression.text))) other = true;
        }
        if (ts.isNewExpression(x)) { const nm = calleeName(x.expression); if (!TEXT_OPS.has(nm)) other = true; }
        if (x.kind === ts.SyntaxKind.AwaitExpression) other = true;
      });
    }
    return ref && !other;
  };
  let total = 0, textCount = 0;
  const seen = new Set();
  walk(ast, (n) => {
    if (!isAssertCall(n)) return;
    // A helper's own definition body is not an assertion site; nested asserts inside an outer call count once.
    if (seen.has(n)) return;
    seen.add(n);
    total++;
    if (isText(n)) textCount++;
  });
  return { total, text: textCount, behavioural: total - textCount };
}
module.exports = { mix };
