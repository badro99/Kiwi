#!/usr/bin/env node
/* Caisse maison · la grille par pages (assets/pos-maison/grid-pager.js).
 *
 * La Maison en Vogue ouvrait sa caisse sur 562 tuiles d'un coup (20 nov. 2026) :
 * après le code, l'écran restait figé cinq secondes. La grille peint d'abord une
 * page, puis la suite quand on approche du bas. Ce test tient le découpage
 * (têtes de rayon, ordre, index) et le remplissage sur le vrai module. */
import assert from 'node:assert/strict';
import { mzGridPlan, mzPageGrid } from '../assets/pos-maison/grid-pager.js';

let passed = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); passed++; };

const ray = (id, n) => ({ id, label: id.toUpperCase(), items: Array.from({ length: n }, (_, k) => ({ id: `${id}${k}` })) });
const rayons = [ray('a', 3), ray('b', 5), ray('c', 2)];

/* Le plan : une page coupe au milieu d'un rayon sans répéter sa tête. */
let p = mzGridPlan(rayons, { r: 0, k: 0 }, 4);
eq(p.chunks.map((c) => [c.r, c.head, c.items.map((x) => x.id)]), [[0, true, ['a0', 'a1', 'a2']], [1, true, ['b0']]], 'a first page of 4 takes all of a, then b starts with its head');
eq(p.next, { r: 1, k: 1 }, 'the cursor stops inside b');
p = mzGridPlan(rayons, p.next, 5);
eq(p.chunks.map((c) => [c.r, c.head, c.items.length]), [[1, false, 4], [2, true, 1]], 'the next page continues b without a second head');
p = mzGridPlan(rayons, p.next, 50);
eq([p.chunks.map((c) => c.items.map((x) => x.id)), p.next], [[['c1']], null], 'the last page ends the plan');
eq(mzGridPlan([], { r: 0, k: 0 }, 10), { chunks: [], next: null }, 'an empty shelf plans nothing');

/* Le remplissage, sur un élément minimal. */
function fakeWrap() {
  const kids = [];
  const el = (cls) => ({ cls, html: '', insertAdjacentHTML(_, h) { this.html += h; }, remove() { const x = kids.indexOf(this); if (x >= 0) kids.splice(x, 1); } });
  return {
    kids, get innerHTML() { return ''; }, set innerHTML(v) { kids.length = 0; },
    get lastElementChild() { return kids[kids.length - 1]; },
    insertAdjacentHTML(_, h) { for (const m of h.matchAll(/<div class="([^"]+)"/g)) kids.push(el(m[1])); },
    appendChild(n) { kids.push(n); return n; },
    ownerDocument: { createElement: () => el('sentinel') },
  };
}
const tile = (p, i) => `<b data-i="${i}">${p.id}</b>`;
const head = (r) => r.label;
const big = [ray('a', 40), ray('b', 40)];

/* Sans IntersectionObserver (vieux navigateur, banc), tout est peint d'un coup. */
let w = fakeWrap();
let pager = mzPageGrid(w, big, { tile, head, first: 10, step: 20, IO: null });
eq([w.kids.filter((k) => k.cls === 'mz-grid').map((g) => (g.html.match(/<b /g) || []).length), pager.done()], [[40, 40], true], 'without an observer every tile is painted at once');

/* Avec : une première page, puis une page par approche du bas, l'index continue. */
let fire;
class IO { constructor(cb) { fire = () => cb([{ isIntersecting: true }]); } observe() {} disconnect() { this.off = true; } }
w = fakeWrap();
let afters = 0;
pager = mzPageGrid(w, big, { tile, head, first: 10, step: 20, IO, after: () => afters++ });
const count = () => w.kids.filter((k) => k.cls === 'mz-grid').reduce((s, g) => s + (g.html.match(/<b /g) || []).length, 0);
eq([count(), pager.done()], [10, false], 'the first page holds 10 tiles');
fire();
eq([count(), afters], [30, 1], 'nearing the bottom adds one page of 20, then draws its icons');
fire(); fire(); fire();
eq([count(), pager.done(), w.kids.some((k) => k.cls === 'sentinel')], [80, true, false], 'the shelf ends complete and the sentinel is gone');
eq(w.kids.filter((k) => k.cls === 'mz-cat-head').length, 2, 'one head per rayon, never repeated across pages');
eq(/data-i="79"/.test(w.kids[3].html), true, 'the tile index keeps counting across pages');

/* Un nouveau rendu coupe l'ancien observateur. */
w = fakeWrap();
const first = mzPageGrid(w, big, { tile, head, first: 10, step: 20, IO });
const second = mzPageGrid(w, big, { tile, head, first: 10, step: 20, IO });
eq([first.observer.off, !!second.observer.off], [true, false], 'a redraw disconnects the previous pager');

/* Tout montrer d'un coup (recherche d'un article précis). */
w = fakeWrap();
pager = mzPageGrid(w, big, { tile, head, first: 10, step: 20, IO });
pager.all();
eq([count(), pager.done()], [80, true], 'all() paints the rest at once');

console.log(`✓ maison grid pager · ${passed} checks`);
