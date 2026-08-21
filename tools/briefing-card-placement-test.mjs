#!/usr/bin/env node
/* Garde : la carte « Le point du matin » ne doit jamais vivre dans
 * .vexel-revenue-row (rangée flex à hauteur fixe de la peau Vexel) — elle y
 * comprimait le graphe et faisait déborder la colonne objectif/clients sur
 * tout le tableau de bord (2026-08-21). Sous Vexel elle suit la rangée
 * revenus ; sinon elle suit .hero-today. Et elle est re-logée si la peau
 * compose après le premier rendu. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(ROOT, 'assets/briefing.js'), 'utf8');

/* Mini-DOM : juste assez pour parentNode / nextSibling / insertBefore / closest. */
function node(cls) {
  const n = { className: cls || '', children: [], parentNode: null, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {},
    get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.children.indexOf(this); return p.children[i + 1] || null; },
    get previousSibling() { const p = this.parentNode; if (!p) return null; const i = p.children.indexOf(this); return p.children[i - 1] || null; },
    has(c) { return (' ' + this.className + ' ').indexOf(' ' + c + ' ') >= 0; },
    closest(sel) { const c = sel.replace(/^\./, ''); let x = this; while (x) { if (x.has && x.has(c)) return x; x = x.parentNode; } return null; },
    insertBefore(el, before) { if (el.parentNode) el.parentNode.children.splice(el.parentNode.children.indexOf(el), 1); const i = before ? this.children.indexOf(before) : this.children.length; this.children.splice(i < 0 ? this.children.length : i, 0, el); el.parentNode = this; return el; },
    appendChild(el) { return this.insertBefore(el, null); }
  };
  return n;
}
function all(root, out = []) { out.push(root); root.children.forEach((c) => all(c, out)); return out; }
function find(root, pred) { return all(root).find(pred) || null; }

let tree;
const document = {
  readyState: 'complete', documentElement: { lang: 'fr' }, head: { appendChild() {} }, addEventListener() {},
  createElement() { return node(''); },
  querySelector(sel) {
    if (sel === '[data-briefing-card]') return find(tree, (n) => n.attrs['data-briefing-card'] !== undefined);
    if (sel === '.hero-today') return find(tree, (n) => n.has('hero-today'));
    if (sel === '.hero-right .hai-chips') { const hr = find(tree, (n) => n.has('hero-right')); return hr ? find(hr, (n) => n.has('hai-chips')) : null; }
    return null;
  }
};
const window = { document, localStorage: { getItem: () => null, setItem() {} }, KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'browse' }, KiwiDayReport: { businessDay: () => '2026-08-21', cutoff: () => 5 }, addEventListener() {} };
window.window = window;
vm.runInNewContext(source, { window, document, localStorage: window.localStorage, console, Date, setTimeout, clearTimeout }, { filename: 'assets/briefing.js' });
const T = window.KiwiBriefing._test;
assert.ok(T.anchor && T.place && T.card, 'anchor/place/card exposés au test');

/* 1 · Mise en page standard : la carte suit .hero-today dans .dash-standard. */
tree = node('dash-standard');
const hero = node('hero-today'); const after = node('dash-cols');
tree.appendChild(hero); tree.appendChild(after);
let card = T.card();
assert.equal(card.parentNode, tree, 'standard : la carte est dans .dash-standard');
assert.equal(hero.nextSibling, card, 'standard : la carte suit immédiatement le héros');
assert.equal(card.nextSibling, after, 'standard : la carte précède la suite du flux');
assert.equal(T.card(), card, 'card() est idempotent (pas de doublon)');
assert.equal(tree.children.filter((n) => n.attrs['data-briefing-card'] !== undefined).length, 1, 'une seule carte');

/* 2 · La peau Vexel compose APRÈS le premier rendu : le héros migre dans la
 *     rangée flex ; au rendu suivant la carte doit sortir de .dash-standard et
 *     se loger juste après .vexel-revenue-row, jamais dedans. */
const compose = node('vexel-compose'); const row = node('vexel-revenue-row'); const rail = node('vexel-revenue-rail'); const bottom = node('vexel-bottom-row');
tree.insertBefore(compose, tree.children[0]);
compose.appendChild(row); row.appendChild(hero); row.appendChild(rail); compose.appendChild(bottom);
card = T.card();
assert.equal(card.closest('.vexel-revenue-row'), null, 'Vexel : la carte n’est pas dans la rangée flex à hauteur fixe');
assert.equal(card.parentNode, compose, 'Vexel : la carte est un enfant direct de .vexel-compose');
assert.equal(row.nextSibling, card, 'Vexel : la carte suit la rangée revenus');
assert.equal(card.nextSibling, bottom, 'Vexel : la carte précède la rangée du bas');
assert.equal(row.children.length, 2, 'Vexel : la rangée revenus garde exactement héros + rail');

/* 3 · Carte créée alors que Vexel est déjà composée : même ancrage. */
tree = node('dash-standard'); const compose2 = node('vexel-compose'); const row2 = node('vexel-revenue-row'); const hero2 = node('hero-today'); const bottom2 = node('vexel-bottom-row');
tree.appendChild(compose2); compose2.appendChild(row2); row2.appendChild(hero2); row2.appendChild(node('vexel-revenue-rail')); compose2.appendChild(bottom2);
card = T.card();
assert.equal(card.parentNode, compose2, 'Vexel (déjà composée) : carte dans .vexel-compose');
assert.equal(row2.nextSibling, card, 'Vexel (déjà composée) : carte après la rangée revenus');

/* 4 · Carte Kiwi Insights présente (.hero-right) : le point du matin vit DEDANS,
 *     juste avant les puces de questions — une seule carte pour les deux. */
tree = node('dash-standard'); const hero4 = node('hero-today'); const right = node('hero-right'); const recs = node('hai-recs'); const chips = node('hai-chips'); const form = node('hai-input');
tree.appendChild(hero4); hero4.appendChild(right); right.appendChild(node('hai-title')); right.appendChild(recs); right.appendChild(chips); right.appendChild(form);
card = T.card();
assert.equal(card.parentNode, right, 'Insights : le bloc est dans .hero-right');
assert.equal(card.previousSibling, recs, 'Insights : après les recommandations');
assert.equal(card.nextSibling, chips, 'Insights : avant les puces');
assert.equal(card.className, 'briefing-inline', 'Insights : bloc en ligne, pas une carte .block autonome');
/* La peau Vexel déplace .hero-right entière dans .vexel-insights-row : le bloc suit. */
const insightsRow = node('vexel-insights-row'); tree.appendChild(insightsRow); insightsRow.appendChild(right);
assert.equal(T.card(), card, 'Insights (Vexel) : même élément, pas de doublon');
assert.equal(card.parentNode, right, 'Insights (Vexel) : toujours dans .hero-right');
assert.equal(card.nextSibling, chips, 'Insights (Vexel) : toujours avant les puces');

/* 5 · Le code source ne doit plus ancrer la carte sur hero.nextSibling à l’aveugle,
 *     et n’injecte plus la puce redondante « Voir le point du matin ». */
assert.ok(!/data-briefing-entry/.test(source), 'plus de puce redondante dans .hai-chips');
assert.ok(/querySelector\('\.hero-right \.hai-chips'\)/.test(source), 'l’ancrage vise la carte Kiwi Insights');
assert.ok(!/hero\.parentNode\.insertBefore\(el,\s*hero\.nextSibling\)/.test(source), 'plus d’insertion aveugle après .hero-today');
assert.ok(/closest\('\.vexel-revenue-row'\)/.test(source), 'l’ancrage tient compte de .vexel-revenue-row');

console.log('briefing-card-placement-test: 26 contrôles OK');
