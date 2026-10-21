#!/usr/bin/env node
/* Garde : la passe sombre (assets/dark-fixes.js) lit toutes les couleurs d'une
 * passe avant d'écrire la moindre étiquette, et le second regard (une image
 * plus tard) est groupé : un seul lot par image, quel que soit le nombre de
 * morceaux de page apparus. Avant (2026-10-22), lectures et écritures
 * alternaient et chaque morceau avait son propre second regard : 2 372 passes
 * au démarrage du tableau de bord en sombre, environ 1 s de fil principal
 * pour dark-fixes et 0,9 s de plus facturées à dateRange.js. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(ROOT, 'assets/dark-fixes.js'), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

/* Journal des accès : 'R' = lecture d'un style calculé, 'W' = étiquette posée. */
const log = [];
const WHITE = 'rgb(255, 255, 255)', CLEAR = 'rgba(0, 0, 0, 0)', INK = 'rgb(10, 15, 13)';
function el(cls, style, text, parent) {
  const n = {
    nodeType: 1, className: cls, parentElement: parent || null, children: [], classes: new Set(), style,
    childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
    matches(sel) { return sel.split(',').some((s) => { s = s.trim(); return s.startsWith('.') && (n.classes.has(s.slice(1)) || n.className.split(' ').includes(s.slice(1))); }); },
    closest(sel) { let x = n; while (x) { if (x.matches(sel)) return x; x = x.parentElement; } return null; },
    querySelectorAll(sel) { const all = []; const walk = (x) => x.children.forEach((c) => { all.push(c); walk(c); }); walk(n); return sel === '*' ? all : all.filter((x) => x.matches(sel)); },
    contains(x) { while (x) { if (x === n) return true; x = x.parentElement; } return false; },
    classList: {
      add: (c) => { log.push('W'); n.classes.add(c); },
      remove: (...cs) => cs.forEach((c) => n.classes.delete(c)),
      contains: (c) => n.classes.has(c)
    }
  };
  if (parent) parent.children.push(n);
  return n;
}
const S = (bg, color, border) => ({ backgroundColor: bg, backgroundImage: 'none', color, borderTopWidth: border ? '1px' : '0px', borderTopColor: border || CLEAR });

const body = el('body', S('rgb(5, 8, 7)', WHITE));
const card1 = el('card', S(WHITE, INK, WHITE), '', body);
const label1 = el('', S(CLEAR, INK), 'Total', card1);
const card2 = el('card', S(WHITE, INK, WHITE), '', body);
const label2 = el('', S(CLEAR, INK), 'Ventes', card2);
const bare = el('', S(CLEAR, INK), 'Encre sur noir', body);
const inner = el('', S(CLEAR, INK), 'Dans la carte', card2);

/* Images simulées : requestAnimationFrame met en file, frame() exécute. */
let rafQueue = [];
const observers = [];
const frame = () => { const q = rafQueue; rafQueue = []; q.forEach((fn) => fn()); };
const document = {
  documentElement: { getAttribute: (k) => (k === 'data-theme' ? 'dark' : null) },
  head: { appendChild() {} }, body,
  createElement() { return { textContent: '' }; },
  contains: (x) => body.contains(x)
};
const window = {};
const ctx = {
  window, document, console,
  getComputedStyle: (n) => { log.push('R'); return n.style; },
  MutationObserver: class { constructor(cb) { this.cb = cb; observers.push(this); } observe(t, opts) { this.opts = opts; } },
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  setTimeout: (fn) => fn(), clearTimeout() {}
};
vm.runInNewContext(source, ctx, { filename: 'assets/dark-fixes.js' });
ok(typeof window.KiwiDarkFix === 'function', 'KiwiDarkFix exposé');

/* 1 · une passe complète : lectures groupées avant écritures, deux fois au plus. */
log.length = 0;
window.KiwiDarkFix();
const seq = log.join('').replace(/R+/g, 'R').replace(/W+/g, 'W');
ok(seq === 'RWRW' || seq === 'RW' || seq === 'RRW', 'lectures puis écritures, par passe (vu : ' + seq + ')');
ok(card1.classes.has('dkfix-card') && card2.classes.has('dkfix-card'), 'cartes blanches assombries');
ok(card1.classes.has('dkfix-bd'), 'bord clair adouci');
ok(bare.classes.has('dkfix-text'), 'encre directement sur fond noir : éclaircie');
ok(!label1.classes.has('dkfix-text'), 'encre sur une carte (lue avant assombrissement) : laissée, la carte reste un fond clair dans le style calculé simulé');

/* 2 · second regard : différé à l'image suivante, un seul lot par image. */
ok(rafQueue.length >= 1, 'le second regard est différé à l’image suivante');
frame(); frame(); frame();

/* Cinq morceaux apparus pendant la même image, dont un contenu dans un autre :
 * le vrai rappel du MutationObserver est appelé, comme le navigateur le ferait. */
const subtree = observers.find((o) => o.opts && o.opts.subtree);
ok(!!subtree, 'un observateur surveille tout le corps de page');
const extra = [el('', S(CLEAR, INK), 'Un', body), el('', S(CLEAR, INK), 'Deux', body), el('', S(CLEAR, INK), 'Trois', body)];
const queued = rafQueue.length;
subtree.cb([{ addedNodes: [card1, label1, card2, ...extra] }]);
ok(rafQueue.length - queued <= 2, 'cinq morceaux, au plus deux demandes d’image (second regard + fin du mode sans transition), vu ' + (rafQueue.length - queued));
log.length = 0;
frame();
const frameSeq = log.join('').replace(/R+/g, 'R').replace(/W+/g, 'W');
ok(/^R(W)?R?(W)?$/.test(frameSeq), 'le second regard des cinq morceaux est un seul lot : lectures puis écritures (vu : ' + frameSeq + ')');
const reads = log.filter((x) => x === 'R').length;
ok(reads > 0, 'le second regard relit bien la page');

const src = source;
ok(!/requestAnimationFrame\(\(\) => fix\(root\)\)/.test(src), 'plus de second regard individuel par morceau');
ok(!/n\.matches\(SURFACE\)\) run\(n\)/.test(src), 'les surfaces ne sont plus traitées deux fois dans la même tâche');
ok(/if \(!html\.classList\.contains\('dkfix-instant'\)\)/.test(src), 'la classe sans transition n’est pas rebasculée à chaque passe');

console.log('dark-fixes-batch-test: ' + checks + ' contrôles OK');
