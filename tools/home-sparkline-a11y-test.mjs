/* The KPI sparklines on the home band and in the KPI picker are fixed shapes
 * per indicator, not the merchant's series: the trend itself is told in text by
 * the delta chip next to them ("+12 % vs hier"). So each sparkline is marked
 * decorative (aria-hidden, not focusable) instead of a screen reader meeting an
 * unlabeled graphic. Red on the code before this change. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const files = fs.readdirSync('assets/daterange').filter((f) => f.endsWith('.js')).map((f) => 'assets/daterange/' + f);
let seen = 0;
for (const file of files) {
  for (const tag of fs.readFileSync(file, 'utf8').match(/<svg class="sp"[^>]*>/g) || []) {
    seen++;
    assert.match(tag, /aria-hidden="true"/, file + ' : sparkline décorative masquée aux lecteurs d’écran');
    assert.match(tag, /focusable="false"/, file + ' : sparkline hors du parcours clavier');
  }
}
assert.ok(seen >= 2, 'les deux sparklines (bandeau et sélecteur) sont vérifiées');
const kpi = fs.readFileSync('assets/daterange/kpi.js', 'utf8');
assert.match(kpi, /\$\{__state\.fmtPct\(dv\)\} \$\{deltaSuffix\}/, 'le sélecteur dit la tendance en texte');
console.log('✓ home-sparkline-a11y-test : ' + seen + ' sparklines décoratives, la tendance reste dite en texte par la puce de variation');
