#!/usr/bin/env node
/* Tableau de bord · l'accueil écrit sa devise comme le reste du tableau de bord.
 *
 * 2026-10-12. Sous l'arabe, l'inventaire, la fiche produit, les insights et la
 * répartition des paiements disaient « درهم » ; l'accueil, seul, disait « 0 MAD »
 * (bandeau d'indicateurs, montant du jour, net, règlement, objectif, infobulle
 * du graphique, flux, total des ventes). Exécute la vraie curUnit() de
 * assets/dateRange.js, puis contrôle chaque point d'affichage.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.env.KIWI_ROOT || path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'assets/dateRange.js'), 'utf8');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const line = src.split('\n').find((l) => /^\s*const curUnit = \(\) =>/.test(l));
check(!!line, 'dateRange has one currency label for the screen');
const ctx = vm.createContext({ LANG: 'fr' });
vm.runInContext("const getLang = () => LANG;\n" + line + "\nthis.curUnit = curUnit;", ctx);
const as = (l) => { ctx.LANG = l; return ctx.curUnit(); };
check(as('ar') === 'درهم' && as('en') === 'MAD' && as('fr') === 'MAD', 'Arabic reads « درهم », French and English « MAD »');

/* Aucun affichage de l'accueil n'écrit « MAD » en dur, hors démonstration. */
const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
const hard = code.filter((l) => /(>MAD<|\} MAD`|\bMAD<\/span>)/.test(l) && !/legendPrimary: `Cumul aujourd'hui/.test(l));
check(!hard.length, 'no home display writes a literal MAD' + (hard.length ? ' · ' + hard.map((l) => l.trim().slice(0, 60)).join(' | ') : ''));
check(/String\(spec\.unit === 'MAD' \? curUnit\(\) : spec\.unit\)/.test(src), 'the KPI band maps its MAD unit through the screen\'s label');
check(/<span class="currency">\$\{curUnit\(\)\}<\/span>/.test(src) && /<span class="rev-hero-cur">\$\{curUnit\(\)\}<\/span>/.test(src), 'the hero amount and the revenue chart read it');
check(/MIX_CENTER_ALL = \{ fr: 'MAD encaissé', en: 'MAD collected', ar: 'درهم محصّل' \}/.test(src), 'and it agrees with the payment mix, which already said « درهم » in Arabic');

const pp = fs.readFileSync(path.join(root, 'assets/pages-pro.js'), 'utf8');
check(/cur: 'درهم'/.test(pp), 'the product inventory the home must agree with says « درهم »');

console.log(`\ndashboard-currency-ar: ${checks} passed, 0 failed`);
