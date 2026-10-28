#!/usr/bin/env node
/* Marque : jamais de blanc pur en fond (CLAUDE.md §4, --paper #F7F5F0). Les
 * cartes du mode clair de Vexel et plusieurs surfaces de la caisse se peignaient
 * en #fff ; la fiche de marque nomme --paper-elev (#FFFDFA) pour les cartes,
 * « du papier éclairé, jamais un #fff froid ». Ce test lit les trois feuilles de
 * style des coques et refuse tout fond déclaré en blanc pur. Les voiles
 * translucides (rgba 255,255,255,a) et le texte blanc sur fond sombre restent
 * permis : ce n'est pas un fond blanc. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['assets/design-vexel.css', 'assets/caisse-shell.css', 'assets/dashboard-shell.css'];
const PURE = /(#fff\b|#ffffff\b|(?<![-\w])white(?![-\w])|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*1(?:\.0+)?)?\s*\))/i;
let pass = 0; const bad = [];
for (const file of FILES) {
  const css = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  css.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\bbackground(?:-color)?\s*:\s*([^;}]*)/gi)) {
      const value = m[1];
      /* Un mélange avec une couleur d'accent (survol d'un bouton mint en mode
         sombre) n'est pas un fond blanc. */
      if (/color-mix\(/i.test(value)) continue;
      /* Le repli d'une variable doit être chaud lui aussi. */
      if (PURE.test(value)) bad.push(`${file}:${i + 1} · ${m[0].trim()}`);
    }
  });
  pass += 1;
}
const tokens = fs.readFileSync(path.join(ROOT, 'assets/tokens.css'), 'utf8');
if (!/--paper-elev:\s*#FFFDFA/i.test(tokens)) bad.push('assets/tokens.css · --paper-elev (#FFFDFA) doit exister');
const vexel = fs.readFileSync(path.join(ROOT, 'assets/design-vexel.css'), 'utf8');
/* En dur : le mode clair de Vexel redéfinit --paper-elev en voile translucide (rgba 255,255,255,.86),
   la variable y rendrait la pastille de période transparente. */
if (!/\.vexel-rail-card[\s\S]{0,300}background-color:\s*#FFFDFA\s*!important/i.test(vexel)) bad.push('design-vexel.css · les cartes du mode clair doivent prendre #FFFDFA (papier éclairé, opaque)');
if (bad.length) { console.error(bad.map((b) => '  ✗ ' + b).join('\n')); process.exit(1); }
console.log(`  ✓ paper-surfaces: ${pass} feuilles sans fond blanc pur`);
