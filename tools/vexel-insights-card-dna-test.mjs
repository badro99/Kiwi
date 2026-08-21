#!/usr/bin/env node
/* Garde : la carte Kiwi Insights (.vexel-insights-row) partage l'ADN de carte
 * Vexel (Layer G) avec ses voisines — même coquille, même survol, même marge,
 * même en-tête. Elle était la seule carte de l'accueil hors de ces listes, en
 * clair comme en sombre (2026-08-21). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(ROOT, 'assets/design-vexel.css'), 'utf8');

/* Les listes :is() de Layer G se reconnaissent à la présence conjointe du mix et
 * des cartes oppo ; on isole le bloc qui déclare la coquille et celui du survol. */
const blocks = [...css.matchAll(/body\.design-vexel\[data-vexel-mode\] :is\(([\s\S]*?)\)(:hover)?\s*\{([\s\S]*?)\}/g)]
  .map((m) => ({ list: m[1], hover: !!m[2], body: m[3] }))
  .filter((b) => /\.vexel-bottom-row > \[data-mix-block\]/.test(b.list) && /\.oppo-card/.test(b.list));
const shells = blocks.filter((b) => !b.hover && /var\(--vx-card-shadow\)/.test(b.body));
const hovers = blocks.filter((b) => b.hover && /var\(--vx-card-shadow-hover\)/.test(b.body));
assert.ok(shells.length >= 2, 'les recettes de coquille de carte sont trouvées (' + shells.length + ')');
assert.ok(hovers.length >= 1, 'la liste de survol est trouvée');
shells.forEach((b, i) => assert.ok(/\.vexel-insights-row/.test(b.list), 'Insights est dans la coquille n°' + (i + 1) + ' (surface, bord, rayon, ombre)'));
hovers.forEach((b, i) => assert.ok(/\.vexel-insights-row/.test(b.list), 'Insights est dans la liste de survol n°' + (i + 1)));
assert.ok(/body\.design-vexel\[data-vexel-mode\] \.vexel-insights-row \{[^}]*padding: 18px 20px;/.test(css), 'Insights prend la marge de la paire compacte (18px 20px)');
assert.ok(/\[data-vexel-mode\] \.vexel-bottom-row > \[data-mix-block\] \{[^}]*padding: 18px 20px;/.test(css), 'la paire compacte est bien à 18px 20px (sinon réaligner Insights)');
assert.ok(/\[data-vexel-mode\] \.vexel-insights-row \.hai-title \{[^}]*font-size: 17px;[^}]*font-weight: 600;/.test(css), 'titre Insights au gabarit des titres de carte (17/600)');
assert.ok(/\[data-vexel-mode\] \.vexel-insights-row \.hai-eyebrow \{[^}]*color: var\(--n-500\);[^}]*text-transform: uppercase;/.test(css), 'étiquette Insights en petites capitales neutres comme les cartes du rail');
/* Les deux moitiés de l'ADN (clair ET sombre) doivent définir les jetons que la coquille consomme. */
for (const mode of ['light', 'dark']) {
  const m = css.match(new RegExp('body\\.design-vexel\\[data-vexel-mode="' + mode + '"\\] \\{([\\s\\S]*?)\\}'));
  assert.ok(m && /--vx-card-bg:/.test(m[1]) && /--vx-card-shadow:/.test(m[1]) && /--vx-card-pad:/.test(m[1]), 'jetons de carte définis en mode ' + mode);
}
console.log('vexel-insights-card-dna-test: ' + (7 + shells.length + hovers.length) + ' contrôles OK');
