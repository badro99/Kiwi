import assert from 'node:assert/strict';
import { declaration } from './js-declarations.cjs';
const source = [
  '/*', 'function sample() { return "fake"; }', '*/',
  'const text = `', 'function sample() { return "fake template"; }', '`;',
  'function wrapper() {', 'function sample() { return "nested"; }', '}',
  'function sample(arg = {a: "}"}) {',
  '  // }',
  '  const re = /[};]/g; const ratio = 12 / 3;',
  '  const nested = `raw } ${ /[}]/.test(arg.a) ? `${ratio}` : "{" }`;',
  '  return {nested, re};', '}',
  'const amount = value => { /* ; } */ return `${value};`; };',
  'async function other() { return /a\\/b/.test("a/b"); }',
].join('\n');
assert.equal(declaration(source, 'sample'), source.slice(source.indexOf('function sample(arg'), source.indexOf('\nconst amount')));
assert.equal(declaration(source, 'amount'), 'const amount = value => { /* ; } */ return `${value};`; };');
assert.equal(declaration(source, 'other'), 'async function other() { return /a\\/b/.test("a/b"); }');
assert.throws(() => declaration(source, 'absent'), /Declaration not found/);
console.log('PASS live declarations: comments, strings, nested templates, regex, division, defaults and nested names');
