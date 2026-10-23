import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Keep literal spelling and interpolation tokens; discard only comments and whitespace.
export function tokenize(source, positions = []) {
  let i = 0;
  const tokens = [];
  const push = (start) => { tokens.push(source.slice(start, i)); positions.push([start, i]); };
  function quoted(quote) {
    const start = i++;
    while (i < source.length) {
      if (source[i] === '\\') { i += 2; continue; }
      if (source[i++] === quote) { push(start); return; }
    }
    throw new Error('Unterminated string');
  }
  function template() {
    let start = i++;
    while (i < source.length) {
      if (source[i] === '\\') { i += 2; continue; }
      if (source[i] === '`') { i++; push(start); return; }
      if (source.startsWith('${', i)) {
        i += 2;
        push(start);
        code(true);
        start = i;
      } else i++;
    }
    throw new Error('Unterminated template');
  }
  function code(interpolation = false) {
    let depth = 0;
    while (i < source.length) {
      const c = source[i], start = i;
      if (/\s/.test(c)) { i++; continue; }
      if (source.startsWith('//', i)) {
        while (i < source.length && source[i] !== '\n') i++;
        continue;
      }
      if (source.startsWith('/*', i)) {
        const end = source.indexOf('*/', i + 2);
        assert.notEqual(end, -1, 'Unterminated comment');
        i = end + 2;
        continue;
      }
      if (c === "'" || c === '"') { quoted(c); continue; }
      if (c === '`') { template(); continue; }
      const previous = tokens.at(-1);
      const regexAllowed = previous?.endsWith('${') || ['&&', '||', '??'].includes(previous) || !previous || /^(?:[({[=,:;!?&|]|return|throw|case|=>|\$\{)$/.test(previous);
      if (c === '/' && regexAllowed) {
        i++;
        let inClass = false, closed = false;
        while (i < source.length) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '[') inClass = true;
          if (source[i] === ']') inClass = false;
          if (source[i++] === '/' && !inClass) { closed = true; break; }
        }
        assert.ok(closed, 'Unterminated regex');
        while (/[a-z]/i.test(source[i] || '') && i < source.length) i++;
        push(start);
        continue;
      }
      const word = source.slice(i).match(/^(?:[\p{ID_Start}_$][\p{ID_Continue}$]*|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)/iu);
      if (word) { i += word[0].length; push(start); continue; }
      const operator = source.slice(i).match(/^(?:===|!==|>>>|\*\*=|=>|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\+\+|--|\+=|-=|\*=|\/=|<<|>>|\*\*|\.\.\.)/);
      i += operator ? operator[0].length : 1;
      push(start);
      if (c === '{') depth++;
      if (c === '}') {
        if (interpolation && depth === 0) return;
        depth--;
      }
    }
    assert.ok(!interpolation, 'Unterminated interpolation');
  }
  code();
  return tokens;
}

async function inspect(source, present) {
  const listeners = [], timers = [], requests = [], nodes = [];
  const makeNode = () => ({
    dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
    innerHTML: '', textContent: '', hidden: false,
    querySelector() { return makeNode(); }, querySelectorAll() { return []; },
    addEventListener(name, fn) { listeners.push({ target: 'launch', name, fn }); }
  });
  const launch = makeNode();
  const window = {
    addEventListener(name, fn) { listeners.push({ target: 'window', name, fn }); }
  };
  const context = vm.createContext({
    window, document: {
      getElementById() { return present ? launch : null; },
      createElement() { const node = makeNode(); nodes.push(node); return node; },
      body: { appendChild() {} }, querySelector() { return null; }
    },
    setTimeout(fn, delay) { timers.push({ fn, delay }); },
    requestAnimationFrame(fn) { fn(); },
    async fetch(url, opts) {
      requests.push([url, opts]);
      return { ok: true, async json() { return { tickets: [], articles: [] }; } };
    }
  });
  vm.runInContext(source, context);
  const startup = {
    globals: Object.keys(context).sort(), window: Object.keys(window).sort(),
    listeners: listeners.map(({ target, name }) => [target, name]),
    timers: timers.map(({ delay }) => delay)
  };
  assert.deepEqual(startup.listeners, present ? [['launch', 'click'], ['window', 'kiwi:open-support']] : []);
  assert.deepEqual(startup.timers, present ? [1200] : []);
  if (present) {
    await timers[0].fn();
    listeners[0].fn();
    await new Promise(setImmediate);
    listeners[1].fn({ detail: { merchant: 'fixture-shop' } });
    await new Promise(setImmediate);
    const shell = nodes[0];
    await shell.onclick({ target: { closest() { return { dataset: { ksTab: 'articles' } }; } } });
    shell.onchange({ target: { matches() { return true; }, value: 'open' } });
    await new Promise(setImmediate);
    await shell.onclick({ target: { closest() { return { dataset: { ksClose: '' } }; } } });
  }
  return JSON.parse(JSON.stringify({ startup, requests, nodes: nodes.map(node => ({
    html: node.innerHTML, hidden: node.hidden, bound: node.dataset.bound,
    onclick: typeof node.onclick, onchange: typeof node.onchange
  })) }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const original = fs.readFileSync(process.argv[2] || new URL('./fixtures/admin-support/original.js', import.meta.url), 'utf8');
  const formatted = fs.readFileSync(new URL('../assets/admin-support.js', import.meta.url), 'utf8');
  assert.deepEqual(tokenize(formatted), tokenize(original), 'Only whitespace and comments may change');
  assert.deepEqual(tokenize('a / b; return /[/*]/g;'), ['a', '/', 'b', ';', 'return', '/[/*]/g', ';']);
  assert.deepEqual(tokenize('`a${ /* comment */ `b${x + 1}` }c`'), tokenize('`a${`b${x+1}`}c`'));
  assert.deepEqual(tokenize('`a${ /[}]/.test(x) ? `${y}` : z }`'), tokenize('`a${/[}]/.test(x)?`${y}`:z}`'));
  assert.notDeepEqual(tokenize('`a b`'), tokenize('`ab`'));
  assert.notDeepEqual(tokenize('return /a/;'), tokenize('return /b/;'));
  for (const present of [false, true]) {
    assert.deepEqual(await inspect(formatted, present), await inspect(original, present));
  }
  console.log(`admin-support-format-test: ${tokenize(formatted).length} identical tokens; VM globals, listeners, timers and console handlers identical`);
}
