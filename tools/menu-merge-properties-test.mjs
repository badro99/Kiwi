#!/usr/bin/env node
// Two devices edit the same menu; the second to publish merges against the
// server copy instead of throwing its edit away (gap menu#1).
// Properties, over seeded random menus and random edits on both sides:
//  1. an edit made on one side only always survives the merge;
//  2. a field changed differently on both sides is reported as a conflict and
//     resolves to the server's value, never silently to the device's;
//  3. merging with no edit on one side returns the other side exactly;
//  4. the merge is deterministic.
import assert from 'node:assert/strict';
import { mergeMenu, sameValue } from '../functions/api/_rules-menu-merge.js';

let seed = 0x5eed1;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const clone = (v) => JSON.parse(JSON.stringify(v));

const baseMenu = () => {
  const n = 2 + Math.floor(rnd() * 6);
  return {
    langs: ['fr', 'en'],
    kitchenId: 'k1',
    cats: [{ id: 'c1', name: 'Plats', station: '' }, { id: 'c2', name: 'Boissons', station: 'bar' }],
    items: Array.from({ length: n }, (_, i) => ({ id: 'i' + i, name: 'Plat ' + i, price: 1000 + i * 250, cat: pick(['c1', 'c2']), avail: true })),
    stations: [{ id: 'bar', name: 'Bar', color: '#0B6E4F' }],
    opts: [],
    formulaTemplates: [],
  };
};

// One random edit on a copy; returns the touched path so the test knows what each side did.
const edit = (menu, tag) => {
  const items = menu.items;
  const kind = pick(['price', 'name', 'avail', 'add', 'delete', 'kitchen']);
  if (kind === 'add') { const id = 'n' + tag + Math.floor(rnd() * 1e6); items.push({ id, name: 'Nouveau ' + tag, price: 500, cat: 'c1', avail: true }); return { list: 'items', id, field: '*added' }; }
  if (kind === 'kitchen') { menu.kitchenId = 'k-' + tag; return { list: '', id: 'kitchenId', field: 'kitchenId' }; }
  if (!items.length) return null;
  const it = pick(items);
  if (kind === 'delete') { menu.items = items.filter((x) => x !== it); return { list: 'items', id: it.id, field: '*deleted' }; }
  if (kind === 'price') it.price = 100 * (1 + Math.floor(rnd() * 90)) + (tag === 'A' ? 5 : 7);
  if (kind === 'name') it.name = it.name + ' ' + tag;
  if (kind === 'avail') it.avail = !it.avail;
  return { list: 'items', id: it.id, field: kind };
};

const itemOf = (menu, id) => menu.items.find((x) => x.id === id);
let cases = 0, clashes = 0;
for (let n = 0; n < 400; n++) {
  const base = baseMenu();
  const mine = clone(base), theirs = clone(base);
  const a = edit(mine, 'A');
  const b = edit(theirs, 'B');
  const { value, conflicts } = mergeMenu(base, mine, theirs);
  cases++;
  const sameTarget = a && b && a.list === b.list && a.id === b.id;
  const clashed = conflicts.some((c) => a && c.id === a.id);
  if (clashed) clashes++;

  // 1. one-sided edits survive.
  for (const [e, side] of [[a, mine], [b, theirs]]) {
    if (!e || (sameTarget && (e.field === a.field || e.field.startsWith('*') || a.field.startsWith('*') || b.field.startsWith('*')))) continue;
    if (e.list === '') { assert.equal(value.kitchenId, side.kitchenId, 'kitchen choice survives'); continue; }
    if (e.field === '*added') assert.ok(itemOf(value, e.id), 'an added item survives');
    else if (e.field === '*deleted') assert.ok(!itemOf(value, e.id), 'a deleted item stays deleted');
    else assert.ok(sameValue(itemOf(value, e.id)[e.field], itemOf(side, e.id)[e.field]), `${e.field} edit on ${e.id} survives`);
  }

  // 2. a true clash on one field is reported and resolves to the server.
  if (sameTarget && a.field === b.field && !a.field.startsWith('*')) {
    const mv = a.list ? itemOf(mine, a.id)[a.field] : mine.kitchenId;
    const tv = a.list ? itemOf(theirs, a.id)[a.field] : theirs.kitchenId;
    if (!sameValue(mv, tv)) {
      assert.ok(conflicts.some((c) => c.id === a.id && c.fields.includes(a.field)), 'a clash is reported');
      const got = a.list ? itemOf(value, a.id)[a.field] : value.kitchenId;
      assert.ok(sameValue(got, tv), 'a clash resolves to the server value');
    }
  }

  // 3. no edit on one side returns the other side exactly.
  assert.ok(sameValue(mergeMenu(base, clone(base), theirs).value, theirs), 'nothing local: server copy');
  assert.ok(sameValue(mergeMenu(base, mine, clone(base)).value, mine), 'nothing remote: local copy');

  // 4. deterministic.
  assert.ok(sameValue(mergeMenu(base, mine, theirs), { value, conflicts }), 'deterministic');
}
assert.ok(clashes > 0, 'the generator produced real clashes');

// Fixed cases the generator does not reach.
{
  const base = { seq: 10, cats: [{ id: 'c1', name: 'Plats', sub: [{ id: 's1', name: 'Tajines' }] }], items: [], promos: [] };
  const mine = clone(base), theirs = clone(base);
  mine.seq = 12; mine.cats[0].sub.push({ id: 's11', name: 'Grillades' });
  theirs.seq = 11; theirs.cats[0].sub.push({ id: 's12', name: 'Couscous' });
  mine.promos.push({ id: 'p1', pct: 10 }); theirs.promos.push({ id: 'p2', pct: 20 });
  const { value, conflicts } = mergeMenu(base, mine, theirs);
  assert.deepEqual(value.cats[0].sub.map((x) => x.id), ['s1', 's12', 's11'], 'a subcategory added on each device: both kept');
  assert.equal(value.seq, 12, 'the id counter keeps the higher value');
  assert.deepEqual(value.promos.map((x) => x.id), ['p2', 'p1'], 'a promotion added on each device: both kept');
  assert.equal(conflicts.length, 0, 'nothing to report when both edits fit');
  const clash = clone(base); clash.cats[0].sub[0].name = 'Tajine';
  const other = clone(base); other.cats[0].sub[0].name = 'Tagines';
  const r = mergeMenu(base, clash, other);
  assert.equal(r.value.cats[0].sub[0].name, 'Tagines', 'a renamed subcategory clash keeps the server name');
  assert.deepEqual(r.conflicts, [{ list: 'cats', id: 'c1', fields: ['sub.s1'] }], 'and names it');
}
console.log(`✓ menu merge: ${cases} random two-device edits, one-sided edits always kept, ${clashes} clashes reported and resolved to the server`);
