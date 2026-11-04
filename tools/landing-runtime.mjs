// Execute the shipped client components. JSX/React hooks are host edges; all
// component rendering, selection handlers, prices and destinations are real.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { formatPrice } from './landing-pricing.mjs';
export function landingRuntime(file) {
  const realm = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), realm, { filename: file });
  const factories = new Map(), modules = new Map(), states = new Map();
  for (const row of realm.TURBOPACK) for (let i = 1; i < row.length; i += 2) factories.set(row[i], row[i + 1]);
  let current, cursor;
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const hooks = {
    useState(initial) {
      const state = states.get(current), index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
    },
    useRef: () => ({ current: null }), useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
  };
  modules.set(43476, { jsx, jsxs: jsx, Fragment: 'fragment' });
  modules.set(71645, hooks);
  modules.set(98291, { useLiquidLens: () => ({ wrapRef: { current: null }, lensRef: { current: null } }) });
  modules.set(8164, { ArrowBadge: () => null, TRADE_ICONS: [] });
  modules.set(2325, { TRADE_ICONS: [], MaterialIcon: () => null });
  // The quote contact is external navigation. Signup URLs are emitted by the real card.
  modules.set(84834, { DEMO_HREF: 'https://wa.me/212624495159' });
  function load(id) {
    if (modules.has(id)) return modules.get(id);
    const output = {}; modules.set(id, output);
    const factory = factories.get(id);
    if (!factory) throw Error('Missing client module ' + id);
    factory({ i: load, s(exports) { for (let i = 0; i < exports.length; i += 3) output[exports[i]] = exports[i + 2]; } });
    return output;
  }
  function expand(node, path) {
    if (Array.isArray(node)) return node.map((n, i) => expand(n, path + '/' + i));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const saved = [current, cursor]; current = path;
      if (!states.has(current)) states.set(current, []);
      cursor = 0;
      const value = node.type(node.props);
      [current, cursor] = saved;
      return expand(value, path + '/body');
    }
    return { ...node, props: { ...node.props, children: expand(node.props.children, path + '/children') } };
  }
  return { render: (id, props) => expand(jsx(load(id).default, props), String(id)) };
}
export const descendants = node => Array.isArray(node) ? node.flatMap(descendants)
  : node && typeof node === 'object' ? [node, ...descendants(node.props.children)] : [];
export const nodeText = node => Array.isArray(node) ? node.map(nodeText).join('')
  : node && typeof node === 'object' ? nodeText(node.props.children) : node == null || node === false ? '' : String(node);
export function checkPricingRuntime(file, copy, locale) {
  const runtime = landingRuntime(file), render = () => runtime.render(18667, { locale, t: copy });
  let tree = render();
  const cards = () => descendants(tree).filter(n => n.props['data-plan'] && n.props['data-plan'] !== 'ultimate');
  assert.equal(cards().length, 4);
  const assertPeriod = annual => cards().forEach((card, i) => {
    const nodes = descendants(card), href = nodes.find(n => n.type === 'a').props.href;
    const price = nodes.find(n => n.props.className?.startsWith('kw-price-in'));
    const expected = (annual ? [99, 249, 349, 1499] : [150, 300, 399, 1499])[i];
    assert.ok(nodeText(price).replace(/[.,\s ]/g, '').includes(String(expected)), locale + ' displayed price');
    if (i < 3) {
      assert.equal(href, '/dashboard.html?plan=' + copy.tiers[i].signupPlan + '&period=' + (annual ? 'annual' : 'monthly'));
      assert.ok(nodeText(card).includes(annual ? copy.billedYearly.replace('{total}', formatPrice([1188, 2988, 4188][i], locale)) : copy.billedMonthly));
    }
    assert.ok(copy.tiers[i].features.every(feature => nodeText(card).includes(feature)), 'features stay with their plan');
  });
  assertPeriod(false);
  let radios = descendants(tree).filter(n => n.props.role === 'radio');
  radios[1].props.onClick(); tree = render(); assertPeriod(true);
  radios = descendants(tree).filter(n => n.props.role === 'radio');
  assert.equal(radios[1].props['aria-checked'], true);
  descendants(tree).find(n => n.props.role === 'radiogroup').props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
  tree = render(); assertPeriod(false);
  assert.equal(descendants(tree).filter(n => n.props.role === 'radio')[0].props.tabIndex, 0);
}
export function checkAudienceRuntime(file, html) {
  const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join('');
  function find(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.pickLabel && value.items && value.screen) return value;
    return Object.values(value).map(find).find(Boolean);
  }
  let copy;
  for (const line of flight.split('\n')) {
    try { copy ||= find(JSON.parse(line.slice(line.indexOf(':') + 1))); } catch {}
  }
  assert.ok(copy, 'real hydration props contain the trade audience selector');
  const runtime = landingRuntime(file), render = () => runtime.render(56227, { t: copy });
  let tree = render();
  assert.equal(descendants(tree).filter(n => n.props.role === 'radio').length, copy.items.length);
  for (let index = 0; index < copy.items.length; index++) {
    descendants(tree).filter(n => n.props.role === 'radio')[index].props.onClick(); tree = render();
    const nodes = descendants(tree), radios = nodes.filter(n => n.props.role === 'radio');
    assert.equal(radios[index].props['aria-checked'], true);
    assert.equal(radios.filter(n => n.props['aria-checked']).length, 1);
    assert.ok(nodes.some(n => n.type === 'h3' && nodeText(n) === copy.items[index].name), 'selected trade heading follows the clicked control');
    assert.ok(nodeText(tree).includes(copy.items[index].hook), 'selected trade explanation follows the clicked control');
    assert.ok(nodeText(tree).includes(copy.stageTag));
  }
  descendants(tree).find(n => n.props.role === 'radiogroup').props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
  tree = render();
  assert.equal(descendants(tree).filter(n => n.props.role === 'radio')[0].props['aria-checked'], true, 'keyboard wraps to the first audience');
}
