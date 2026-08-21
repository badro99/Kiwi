#!/usr/bin/env node
/* Garde : la passe sombre (assets/dark-fixes.js) doit reconnaître un fond en
 * dégradé comme un fond peint. Sans cela, le bouton Kiwi AI (menthe en
 * `linear-gradient`, libellé encre) était lu comme du sombre-sur-sombre et son
 * libellé forcé en blanc — bouton délavé en tête de barre (2026-08-21). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(ROOT, 'assets/dark-fixes.js'), 'utf8');

/* Mini-DOM : éléments avec styles calculés déclarés. */
function el(cls, style, text, parent) {
  const n = { nodeType: 1, className: cls, style, parentElement: parent || null, children: [], classes: new Set(),
    childNodes: text ? [{ nodeType: 3, textContent: text }] : [],
    matches(sel) { return sel.split(',').some((s) => { s = s.trim(); return s.startsWith('.') && this.classes.has(s.slice(1)) || this.className.split(' ').includes(s.slice(1)); }); },
    closest(sel) { let x = this; while (x) { if (x.matches(sel)) return x; x = x.parentElement; } return null; },
    querySelectorAll() { return all(this).slice(1); },
    classList: { add: (c) => n.classes.add(c), remove: (...cs) => cs.forEach((c) => n.classes.delete(c)), contains: (c) => n.classes.has(c) } };
  if (parent) parent.children.push(n);
  return n;
}
function all(root, out = []) { out.push(root); root.children.forEach((c) => all(c, out)); return out; }

const body = el('body', { backgroundColor: 'rgb(5, 8, 7)', backgroundImage: 'none', color: 'rgb(255,255,255)', borderTopWidth: '0px', borderTopColor: 'rgba(0,0,0,0)' });
const bar = el('topbar', { backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', color: 'rgb(255,255,255)', borderTopWidth: '0px', borderTopColor: 'rgba(0,0,0,0)' }, '', body);
const T = { backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px', borderTopColor: 'rgba(0,0,0,0)' };
/* 1 · bouton menthe en dégradé, libellé encre — PAS .ai-btn, pour tester la logique dégradé seule */
const mintBtn = el('some-btn', { ...T, backgroundImage: 'linear-gradient(rgb(141, 246, 190) 0%, rgb(95, 233, 164) 100%)', color: 'rgb(4, 35, 26)' }, '', bar);
const mintLabel = el('', { ...T, backgroundImage: 'none', color: 'rgb(4, 35, 26)' }, 'Kiwi AI · Agent', mintBtn);
/* 2 · texte encre directement sur la barre noire : toujours corrigé */
const bareLabel = el('', { ...T, backgroundImage: 'none', color: 'rgb(4, 35, 26)' }, 'Encre sur noir', bar);
/* 3 · dégradé SOMBRE avec texte encre : toujours corrigé */
const darkBtn = el('dark-btn', { ...T, backgroundImage: 'linear-gradient(135deg, rgba(7, 45, 33, 0.96), rgba(3, 20, 15, 0.98))', color: 'rgb(4, 35, 26)' }, '', bar);
const darkLabel = el('', { ...T, backgroundImage: 'none', color: 'rgb(4, 35, 26)' }, 'Encre sur vert nuit', darkBtn);
/* 4 · le vrai bouton Kiwi AI : exempté par sa classe, quoi qu'il arrive */
const aiBtn = el('ai-btn', { ...T, backgroundImage: 'none', color: 'rgb(4, 35, 26)' }, '', bar);
const aiLabel = el('', { ...T, backgroundImage: 'none', color: 'rgb(4, 35, 26)' }, 'Kiwi AI · Agent', aiBtn);

const document = {
  documentElement: { getAttribute: (k) => (k === 'data-theme' ? 'dark' : null) },
  head: { appendChild() {} }, body,
  createElement() { return { textContent: '' }; },
  querySelector() { return null; },
  contains() { return true; }
};
const window = { KiwiDarkFix: null };
const ctx = { window, document, getComputedStyle: (n) => n.style, MutationObserver: class { observe() {} }, requestAnimationFrame: (fn) => fn(), setTimeout: (fn) => fn(), clearTimeout() {}, console };
vm.runInNewContext(source, ctx, { filename: 'assets/dark-fixes.js' });
assert.equal(typeof window.KiwiDarkFix, 'function', 'KiwiDarkFix exposé');
window.KiwiDarkFix();

assert.equal(mintLabel.classes.has('dkfix-text'), false, 'libellé encre sur dégradé menthe : laissé tel quel (fond clair reconnu)');
assert.equal(mintBtn.classes.has('dkfix-text'), false, 'bouton menthe lui-même : non retouché');
assert.equal(bareLabel.classes.has('dkfix-text'), true, 'encre directement sur la barre noire : toujours éclairci');
assert.equal(darkLabel.classes.has('dkfix-text'), true, 'encre sur dégradé sombre : toujours éclairci');
assert.equal(aiLabel.classes.has('dkfix-text'), false, '.ai-btn : exempté de la passe');
assert.ok(/const SKIP = '[^']*\.ai-btn[^']*'/.test(source), '.ai-btn figure dans SKIP');
assert.ok(/backgroundImage/.test(source.slice(source.indexOf('function effBg'), source.indexOf('function hasDirectText'))), 'effBg lit background-image');
assert.ok(/dark-fixes\.js\?v=\d+/.test(readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8')), 'dark-fixes.js est estampillé dans dashboard.html');
console.log('dark-fixes-gradient-test: 9 contrôles OK');
