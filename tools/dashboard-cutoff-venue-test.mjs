// La bascule publiée par la caisse s'applique aussi aux fenêtres du tableau de bord
// (audit du 26 nov. 2026, #0096 à moitié corrigé).
//
// merchant-config.js rangeait l'heure adoptée sous le slug du magasin, et
// dateRange.js la lit sous l'identifiant de l'établissement (own, scoped…) :
// à 06:30 le Z disait encore le 25, « Aujourd'hui » avait déjà commencé le 26.
// On exécute la vraie fonction adoptTillCutoff contre un rapport du jour minimal.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets/merchant-config.js'), 'utf8');
const start = src.indexOf('function adoptTillCutoff(');
assert.ok(start > 0, 'adoptTillCutoff exists');
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) { if (src[i] === '{') depth++; if (src[i] === '}' && --depth === 0) { end = i + 1; break; } }
let checks = 0;
const run = (venue) => {
  const stored = new Map();
  const R = { cutoff: (s) => (stored.has(s) ? stored.get(s) : 5), setCutoff: (v, s) => { stored.set(s, v); return v; } };
  const ctx = vm.createContext({ location: { pathname: '/dashboard.html' }, document: { readyState: 'complete' },
    window: { KiwiDayReport: R, KiwiVenue: { getVenue: () => venue } }, merchant: () => 'riad-nour', Number });
  vm.runInContext(src.slice(start, end) + '\nadoptTillCutoff(8);', ctx);
  return R;
};
{
  const R = run('own');
  assert.equal(R.cutoff('riad-nour'), 8, 'the store slug takes the till\'s 8 h'); checks++;
  assert.equal(R.cutoff('own'), 8, 'and so does the venue id the dashboard windows read'); checks++;
}
{
  const R = run('riad-nour');
  assert.equal(R.cutoff('riad-nour'), 8, 'a venue already named by its slug is set once'); checks++;
}
console.log(`✓ dashboard-cutoff-venue-test : ${checks} contrôles (bascule de la caisse sous le slug et sous l'établissement)`);
