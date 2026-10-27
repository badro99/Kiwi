/* Ownership analysis only: classic-script exports, lexical references and eager
 * execution. Needs the repository's existing app TypeScript dev dependency.
 * The legacy global-ownership parser only matches Kiwi* text, including comments,
 * and cannot classify execution scopes; an AST is needed here instead.
 * No runtime files are executed. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript/lib/typescript.js');
const hosts = new Set(['window', 'globalThis', 'self']);
export function analyse(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (ast.parseDiagnostics.length) throw new Error(`${file}: cannot parse JavaScript`);
  const definitions = new Set(), reads = new Map();
  /* An ES module's top-level bindings are private to the module, not page
     globals: only window/globalThis writes define names there. */
  const isModule = ast.statements.some(s => ts.isImportDeclaration(s) || ts.isExportDeclaration(s) || ts.isExportAssignment(s)
    || (ts.canHaveModifiers(s) && (ts.getModifiers(s) || []).some(m => m.kind === ts.SyntaxKind.ExportKeyword)));
  const scopes = new Map(), functions = new Map(), pending = [], invoked = new Set();
  const isFunction = n => ts.isFunctionLike(n);
  const bind = (name, scope) => {
    if (ts.isIdentifier(name)) scope.locals.add(name.text);
    else if (name && name.elements) for (const e of name.elements) if (e.name) bind(e.name, scope);
  };
  const root = { locals: new Set(), aliases: new Set(hosts), parent: null };
  function collect(n, scope) {
    if (ts.isFunctionDeclaration(n) && n.name) {
      bind(n.name, scope);
      if (!functions.has(scope)) functions.set(scope, new Map());
      functions.get(scope).set(n.name.text, n);
    }
    let current = scope;
    if (isFunction(n) || ts.isBlock(n) || ts.isCatchClause(n)) {
      current = { locals: new Set(), aliases: new Set(), parent: scope, fn: isFunction(n) };
      scopes.set(n, current);
      if (isFunction(n)) {
        if (n.name) bind(n.name, current);
        for (const p of n.parameters) bind(p.name, current);
      }
      if (ts.isCatchClause(n) && n.variableDeclaration) bind(n.variableDeclaration.name, current);
    }
    if (ts.isVariableDeclaration(n)) {
      let target = current;
      if (!(n.parent.flags & ts.NodeFlags.BlockScoped)) while (target.parent && !target.fn) target = target.parent;
      bind(n.name, target);
      if (target === root && !isModule && ts.isIdentifier(n.name)) definitions.add(n.name.text);
    }
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name && scope === root && !isModule) definitions.add(n.name.text);
    ts.forEachChild(n, child => collect(child, current));
  }
  collect(ast, root);
  const unwrap = n => { while (n && ts.isParenthesizedExpression(n)) n = n.expression; return n; };
  const alias = (n, scope) => {
    n = unwrap(n);
    if (n && ts.isConditionalExpression(n)) return alias(n.whenTrue, scope) || alias(n.whenFalse, scope);
    if (!n || !ts.isIdentifier(n)) return false;
    for (let s = scope; s; s = s.parent) {
      if (s.aliases.has(n.text)) return true;
      if (s.locals.has(n.text)) return false;
    }
    return hosts.has(n.text);
  };
  const prop = (n, scope) => {
    if (ts.isPropertyAccessExpression(n) && alias(n.expression, scope)) return n.name.text;
    if (ts.isElementAccessExpression(n) && alias(n.expression, scope) && ts.isStringLiteral(n.argumentExpression)) return n.argumentExpression.text;
  };
  const addRead = (name, eager) => reads.set(name, !!reads.get(name) || eager);
  function visit(n, scope, eager, called = false) {
    const outer = scope;
    scope = scopes.get(n) || scope;
    if (isFunction(n)) {
      let expr = n;
      while (expr.parent && ts.isParenthesizedExpression(expr.parent)) expr = expr.parent;
      const call = expr.parent;
      const immediate = call && ts.isCallExpression(call) && call.expression === expr;
      eager = eager && (immediate || called);
      if (immediate) n.parameters.forEach((p, i) => {
        if (ts.isIdentifier(p.name) && alias(call.arguments[i], outer)) scope.aliases.add(p.name.text);
      });
    }
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && alias(n.initializer, scope)) scope.aliases.add(n.name.text);
    if (eager && ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      for (let s = scope; s; s = s.parent) {
        const fn = functions.get(s)?.get(n.expression.text);
        if (fn && !invoked.has(fn)) { invoked.add(fn); pending.push([fn, s]); }
        if (fn || s.locals.has(n.expression.text)) break;
      }
    }
    const name = prop(n, scope);
    const p = n.parent;
    const write = p && ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    if (name) {
      if (write) definitions.add(name); else addRead(name, eager);
    }
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'Object.defineProperty' && alias(n.arguments[0], scope) && n.arguments[1] && ts.isStringLiteral(n.arguments[1])) definitions.add(n.arguments[1].text);
    if (ts.isIdentifier(n)) {
      const excluded = (ts.isPropertyAccessExpression(p) && p.name === n) ||
        ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) && p.name === n && !ts.isComputedPropertyName(p.name)) ||
        ((ts.isVariableDeclaration(p) || ts.isParameter(p) || isFunction(p) || ts.isClassDeclaration(p)) && p.name === n) ||
        ts.isBindingElement(p) || ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p);
      let local = false;
      for (let s = scope; s && (s !== root || isModule); s = s.parent) if (s.locals.has(n.text)) { local = true; break; }
      if (!excluded && !local && !hosts.has(n.text) && !write) addRead(n.text, eager);
    }
    ts.forEachChild(n, child => visit(child, scope, eager));
  }
  visit(ast, root, true);
  for (let i = 0; i < pending.length; i++) visit(pending[i][0], pending[i][1], true, true);
  return { definitions, reads };
}

export function inspect(sources, shells, manifest) {
  // A split moves code, not ownership. Canonical paths also preserve the
  // pre-split duplicate and eager-order debt keys without adding allowances.
  const canonical = file => {
    if (Object.values(manifest.units || {}).some(unit => file === unit.parent)) return file;
    for (const unit of Object.values(manifest.units || {}))
      if (file === unit.parent || file.startsWith(unit.parts)) return unit.parent;
    return file;
  };
  const parsed = new Map([...sources].map(([file, source]) => [file, analyse(source, file)]));
  const owners = new Map();
  for (const [file, data] of parsed) for (const name of data.definitions) {
    if (!owners.has(name)) owners.set(name, []);
    if (!owners.get(name).includes(canonical(file))) owners.get(name).push(canonical(file));
  }
  const failures = [], actual = {}, duplicates = {}, order = [];
  for (const [name, files] of owners) if (files.length > 1) {
    duplicates[name] = files.sort();
    if (files.some(file => !manifest.duplicates?.[name]?.includes(file))) failures.push(`duplicate: ${name}: ${files.join(', ')}`);
  }
  for (const [file, rule] of Object.entries(manifest.files)) {
    const members = [...parsed].filter(([member]) => canonical(member) === file);
    const data = members.length ? {
      definitions: new Set(members.flatMap(([, d]) => [...d.definitions])),
      reads: new Map(members.flatMap(([, d]) => [...d.reads]))
    } : (shells.has(file) ? { reads: new Map(shells.get(file).filter(f => f.startsWith(file + "#")).flatMap(f => [...parsed.get(f).reads])) } : null);
    if (!data) { failures.push(`missing: ${file}`); continue; }
    const foreign = [...data.reads.keys()].filter(n => !data.definitions?.has(n) && owners.has(n) && owners.get(n).some(f => f !== file)).sort();
    actual[file] = foreign;
    for (const name of foreign) if (!rule.reads.includes(name)) failures.push(`unlisted: ${file} reads ${name} (${owners.get(name).join(', ')})`);
    if (foreign.length > rule.coupling) failures.push(`coupling: ${file}: ${foreign.length} > ${rule.coupling}`);
    if (!rule.owner) failures.push(`owner: ${file} has no area`);
  }
  for (const [shell, sequence] of shells) {
    const first = new Map();
    sequence.forEach((entry, i) => { for (const name of parsed.get(entry)?.definitions || []) if (!first.has(name)) first.set(name, i); });
    sequence.forEach((file, i) => {
      for (const [name, eager] of parsed.get(file)?.reads || []) if (eager && first.has(name) && first.get(name) > i && canonical(file) !== canonical(sequence[first.get(name)])) {
        const key = `${shell}:${canonical(file)}:${name}:${canonical(sequence[first.get(name)])}`;
        order.push(key);
        if (!manifest.order.includes(key)) failures.push(`order: ${key}`);
      }
    });
  }
  return { failures, actual, duplicates, order: [...new Set(order)].sort() };
}
