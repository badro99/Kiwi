#!/usr/bin/env node
/* order-pricing-properties-test · a guest's phone cannot set the price.
 *
 * A QR order arrives with lines built by the phone. priceOrder
 * (functions/api/order/_lib.js) reprices every line from the published menu:
 * item price, option choices, composed-menu supplements, quantities. These
 * properties generate menus and adversarial lines (forged prices, impossible
 * quantities, options from another dish, composed-menu parts without their
 * menu) and check the result against the menu itself. Real code on the SQLite
 * D1 fixture. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fixture } from './server-money-fixture.mjs';
import { priceOrder } from '../functions/api/order/_lib.js';

const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; order pricing properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 300, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0;
async function strict(label, p) { if (process.env.KIWI_PROPERTY_ONLY && !new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label)) return; const r = await fc.check(p, { numRuns: RUNS, seed: SEED }); if (r.failed) { failed++; console.error('✗ ' + label, fc.stringify(r.counterexample).slice(0, Number(process.env.KIWI_WITNESS_CHARS) || 1500), r.errorInstance && r.errorInstance.message); } else { passed++; console.log('✓ ' + label); } }

const f = await fixture(ROOT), { sql, merchant, env } = f;
const NOW = Date.parse('2026-10-22T12:00:00Z');
const cents = fc.integer({ min: 0, max: 50000 });
const GROUPS = ['g0', 'g1', 'g2'], ITEMS = ['i0', 'i1', 'i2', 'i3', 'i4'];

/* A menu: five dishes, three option groups, one composed menu « F » whose two
 * slots pick among the dishes. */
const menuArb = fc.record({
  items: fc.tuple(...ITEMS.map(() => fc.record({ price: cents, avail: fc.boolean(), archived: fc.boolean(), formulaOnly: fc.boolean(), opts: fc.subarray(GROUPS) }))),
  groups: fc.tuple(...GROUPS.map(() => fc.record({ kind: fc.constantFrom('one', 'many'), min: fc.integer({ min: 0, max: 2 }), max: fc.integer({ min: 1, max: 3 }), choices: fc.array(cents, { minLength: 1, maxLength: 3 }) }))),
  formula: fc.record({ price: cents, slots: fc.tuple(...[0, 1].map(() => fc.record({ min: fc.integer({ min: 0, max: 1 }), max: fc.integer({ min: 1, max: 2 }), choices: fc.subarray(ITEMS, { minLength: 1 }), extra: cents }))) }),
}, { noNullPrototype: true }).map((m) => {
  const items = m.items.map((it, i) => ({ id: ITEMS[i], name: 'Plat ' + i, catId: 'c', price: it.price / 100, avail: it.avail || i < 2, archived: it.archived && i > 2, formulaOnly: it.formulaOnly && i === 4, opts: it.opts }));
  items.push({ id: 'F', name: 'Menu', catId: 'c', price: m.formula.price / 100, avail: true, opts: [], formula: { slots: m.formula.slots.map((s, k) => ({ id: 's' + k, label: 'Choix ' + k, min: s.min, max: Math.max(s.min, s.max), choices: s.choices.map((itemId) => ({ itemId, extra: s.extra / 100 })) })) } });
  const opts = m.groups.map((g, k) => ({ id: GROUPS[k], name: 'Groupe ' + k, kind: g.kind, min: g.kind === 'one' ? Math.min(g.min, 1) : Math.min(g.min, g.choices.length), max: g.kind === 'one' ? 1 : Math.min(Math.max(g.max, g.min, 1), g.choices.length), choices: g.choices.map((p, c) => ({ id: GROUPS[k] + 'c' + c, name: 'Choix ' + k + '.' + c, price: p / 100 })) }));
  return { cats: [{ id: 'c', name: 'Carte' }], items, opts };
});

/* Lines a phone could send, honest or not. */
const lineArb = fc.record({
  id: fc.constantFrom(...ITEMS, 'F', 'ghost'),
  qty: fc.oneof(fc.integer({ min: 1, max: 5 }), fc.integer({ min: -5, max: 500 })),
  picks: fc.array(fc.record({ group: fc.constantFrom(...GROUPS, 'gX'), c: fc.integer({ min: 0, max: 3 }) }), { maxLength: 4 }),
  forged: fc.integer({ min: 0, max: 100000 }),
  formula: fc.option(fc.record({ uid: fc.constantFrom('u1', 'u2'), part: fc.boolean(), slot: fc.constantFrom('s0', 's1', 'sX') }), { nil: null }),
});
const toRaw = (l) => {
  const raw = { id: l.id, qty: l.qty, unitPrice: l.forged / 100, price: l.forged / 100, total: l.forged / 100,
    optionChoices: l.picks.map((p) => ({ group: p.group, choiceId: p.group + 'c' + p.c })) };
  if (l.formula) Object.assign(raw, { kind: l.formula.part ? 'formula-part' : 'formula', formulaUid: l.formula.uid, ...(l.formula.part ? { formulaSlotId: l.formula.slot } : {}) });
  return raw;
};
const order = fc.array(lineArb, { minLength: 1, maxLength: 8 });

function publish(menu) {
  sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?) ON CONFLICT(merchant) DO UPDATE SET data = excluded.data, updated_ts = excluded.updated_ts')
    .run(merchant, 'Carte', 'restaurant', JSON.stringify(menu), NOW);
}
const price = (raw) => priceOrder(env, merchant, raw, { publicCaller: true, now: NOW });
const c100 = (v) => Math.round(v * 100);

console.log('order-pricing-properties-test');
try {
  await strict('a forged price, unit price or total sent by the phone never changes what the order costs', fc.asyncProperty(menuArb, order, fc.integer({ min: 0, max: 100000 }), async (menu, lines, other) => {
    publish(menu);
    const a = await price(lines.map(toRaw));
    const b = await price(lines.map((l) => toRaw({ ...l, forged: other })));
    assert.equal(c100(a.total), c100(b.total));
    assert.deepEqual(a.lines.map((l) => l.unitPrice), b.lines.map((l) => l.unitPrice));
  }));

  await strict('every accepted line costs its dish plus the options it really chose, at a quantity between 1 and 99, and the total is their sum in centimes', fc.asyncProperty(menuArb, order, async (menu, lines) => {
    publish(menu);
    const r = await price(lines.map(toRaw));
    const byId = new Map(menu.items.map((i) => [i.id, i]));
    const choice = new Map(menu.opts.flatMap((g) => g.choices.map((c) => [c.id, { ...c, group: g }])));
    let sum = 0;
    for (const l of r.lines) {
      assert.ok(Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 99);
      const item = byId.get(l.id); assert.ok(item, 'unknown dish accepted');
      assert.ok(item.avail && !item.archived, 'unavailable or archived dish accepted');
      if (item.formulaOnly) assert.equal(l.kind, 'formula-part', 'a menu-only dish sold alone');
      if (l.kind === 'formula-part') assert.equal(l.unitPrice, 0);
      else if (l.kind !== 'formula') {
        const extras = (l.options ? l.options.split(' · ') : []).map((label) => [...choice.values()].find((c) => `${c.group.name}: ${c.name}` === label));
        assert.ok(extras.every(Boolean));
        assert.equal(c100(l.unitPrice), c100(item.price) + extras.reduce((n, c) => n + c100(c.price), 0));
      }
      sum += c100(l.unitPrice) * l.qty;
    }
    assert.equal(c100(r.total), sum);
  }));

  await strict('a dish is never served free: each accepted billable line costs at least its menu price', fc.asyncProperty(menuArb, order, async (menu, lines) => {
    publish(menu);
    const r = await price(lines.map(toRaw));
    const byId = new Map(menu.items.map((i) => [i.id, i]));
    for (const l of r.lines) if (l.kind !== 'formula-part') assert.ok(c100(l.unitPrice) >= c100(byId.get(l.id).price));
  }));

  await strict('a composed-menu part rides only with its menu, within its slot, and never more than the menus ordered allow', fc.asyncProperty(menuArb, order, async (menu, lines) => {
    publish(menu);
    const r = await price(lines.map(toRaw));
    const F = menu.items.find((i) => i.id === 'F');
    for (const part of r.lines.filter((l) => l.kind === 'formula-part')) {
      const parents = r.lines.filter((l) => l.kind === 'formula' && l.formulaUid === part.formulaUid);
      assert.equal(parents.length >= 1, true, 'a part was accepted without its menu');
      const slot = F.formula.slots.find((s) => s.id === part.formulaSlotId);
      assert.ok(slot && slot.choices.some((c) => c.itemId === part.id), 'a part outside its slot');
      const qtyParents = parents.reduce((n, p) => n + p.qty, 0);
      const inSlot = r.lines.filter((l) => l.kind === 'formula-part' && l.formulaUid === part.formulaUid && l.formulaSlotId === slot.id).reduce((n, l) => n + l.qty, 0);
      assert.ok(inSlot <= slot.max * qtyParents, 'more parts than the menus allow');
    }
  }));

  await strict('accepted options respect their group: from the dish\'s own groups, one at most where one is allowed, no fewer than required', fc.asyncProperty(menuArb, order, async (menu, lines) => {
    publish(menu);
    const r = await price(lines.map(toRaw));
    const byId = new Map(menu.items.map((i) => [i.id, i]));
    for (const l of r.lines) {
      if (l.kind === 'formula' || l.kind === 'formula-part') continue;
      const labels = l.options ? l.options.split(' · ') : [];
      const item = byId.get(l.id);
      for (const g of menu.opts) {
        const n = labels.filter((x) => x.startsWith(g.name + ': ')).length;
        if (!item.opts.includes(g.id)) { assert.equal(n, 0, 'an option from another dish'); continue; }
        assert.ok(n >= g.min && n <= g.max, `group ${g.id}: ${n} outside ${g.min}..${g.max}`);
      }
    }
  }));

  await strict('the order of the lines does not change the bill', fc.asyncProperty(menuArb, order, fc.integer(), async (menu, lines, seed) => {
    publish(menu);
    const raw = lines.map(toRaw);
    const shuffled = raw.map((x, i) => [((i + 1) * 2654435761 + seed) >>> 0, x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    assert.equal(c100((await price(raw)).total), c100((await price(shuffled)).total));
  }));

  console.log(`${failed ? '✗' : '✓'} order-pricing-properties-test · ${passed} held, ${failed} failed`);
} finally { f.close(); }
process.exit(failed ? 1 : 0);
