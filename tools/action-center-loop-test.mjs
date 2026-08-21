/* Centre d'actions · garde contre la boucle MutationObserver → refresh → mutation.
 * Le 2026-08-21, ouvrir Kiwi AI gelait l'onglet sur toutes les machines :
 * injectButton() finissait TOUJOURS par refresh(), qui réécrivait textContent
 * (= nouveau nœud texte = mutation) sur chaque badge, que l'observateur
 * document-wide renvoyait à injectButton()… sans fin. Ces contrôles figent les
 * trois invariants qui cassent la boucle. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets', 'agent-action-center.js'), 'utf8');
let pass = 0; const fails = [];
const ok = (label, cond) => { if (cond) pass++; else fails.push(label); };

const refreshBody = (src.match(/function refresh\(\) \{([\s\S]*?)\n  \}/) || [])[1] || '';
ok('refresh() ne réécrit le compteur que s’il change', /if \(b\.textContent !== txt\) b\.textContent = txt;/.test(refreshBody));
ok('refresh() ne bascule hidden que s’il change', /if \(b\.hidden !== hide\) b\.hidden = hide;/.test(refreshBody));
ok('refresh() ne réinjecte la liste que si elle a changé', /list\.innerHTML !== html\) list\.innerHTML = html/.test(refreshBody));
ok('refresh() est protégé contre la réentrance', /if \(refreshing\) return;/.test(refreshBody) && /finally \{ refreshing = false; \}/.test(refreshBody));

const injectBody = (src.match(/function injectButton\(node\) \{([\s\S]*?)\n  \}/) || [])[1] || '';
ok('injectButton() ignore les nœuds non-éléments', /nodeType !== 1 && node\.nodeType !== 9\)\) return;/.test(injectBody));
ok('injectButton() ignore ses propres nœuds', /closest\('\[data-kac-open\], \.kac-drawer'\)\) return;/.test(injectBody));
ok('injectButton() ne rafraîchit que s’il a inséré un bouton', /if \(inserted\) refresh\(\);/.test(injectBody) && !/\n    refresh\(\);\n  \}$/.test(injectBody));

const obs = (src.match(/new MutationObserver\(function \(muts\) \{([\s\S]*?)\}\)\.observe/) || [])[1] || '';
ok('l’observateur ignore les mutations issues du centre d’actions', /closest\('\[data-kac-open\], \.kac-drawer'\)\) return;/.test(obs));
ok('l’observateur ne transmet que des éléments', /n\.nodeType === 1\) injectButton\(n\)/.test(obs));

const line = '─'.repeat(64);
console.log('\n' + line);
if (fails.length) { console.log(`  ✗ centre d’actions · boucle d’observation — ${fails.length} échec(s)`); fails.forEach(f => console.log('    · ' + f)); console.log(line); process.exit(1); }
console.log(`  ✓ centre d’actions · pas de boucle observateur→refresh (${pass} contrôles)`);
console.log(line);
