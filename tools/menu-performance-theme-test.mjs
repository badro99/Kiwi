import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const window = {}, sheets = [];
const read = f => fs.readFileSync(f, 'utf8');
vm.runInNewContext(read('assets/restaurant-menu/styles.js'), { window, document: { createElement: () => ({}), head: { appendChild: s => sheets.push(s.textContent) } } });
window.KiwiMenuWorkspaceParts.styles({ $: () => null }).style();
const css = sheets.join('');
const rule = selector => css.match(new RegExp(selector.replaceAll('.', '\\.') + '\\{([^}]+)\\}'))?.[1] || '';
assert.match(rule('.rmw-perf-plot'), /,var\(--paper\)/);
assert.match(rule('.rmw-perf-plot'), /border-inline-start:/);
for (const [kind, token] of [['star', 'atlas'], ['plow', 'warning'], ['puzzle', 'info'], ['dog', 'danger']]) {
  assert.equal(rule('.rmw-perf-dot.' + kind), `background:var(--${token})`);
  assert.match(rule('.rmw-perf-q.' + kind), new RegExp(`var\\(--${token}\\)`));
}
for (const kind of ['star', 'plow']) {
  assert.match(rule('.rmw-perf-label.' + kind), /inset-inline-end:18px/);
  assert.match(rule('.rmw-perf-label.' + kind), /text-align:end/);
}
for (const kind of ['dog', 'puzzle']) assert.match(rule('.rmw-perf-label.' + kind), /inset-inline-start:18px/);
const plotCss = css.slice(css.indexOf('.rmw-perf-matrix{'), css.indexOf('.rmw-item-workspace '));
assert.doesNotMatch(plotCss, /#(?:fff|1d9c67|d49a25|357fad|cb5238)\b|(?:^|[;{])(?:left|right):|text-align:(?:left|right)/i);
const theme = read('assets/theme.css');
assert.match(theme, /html\[data-theme="dark"\]/);
for (const token of ['paper', 'danger', 'info']) {
  const value = source => source.match(new RegExp('--' + token + ':\\s*([^;]+)'))[1];
  assert.notEqual(value(theme), value(read('assets/tokens.css')), token + ' follows existing dark tokens');
}
console.log('PASS menu plot: real emitted CSS uses paper, existing quadrant tokens and logical placement; dark token overrides retained');
