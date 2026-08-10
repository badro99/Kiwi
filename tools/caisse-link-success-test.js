#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const link = read('assets/caisse-link.js');
const dashboard = read('dashboard.html');
const sw = read('kiwi-sw.js');
let count = 0;

function ok(condition, label) {
  if (!condition) throw new Error('FAIL · ' + label);
  count++;
  console.log('  ✓ ' + label);
}

ok(!/Kiwi\.confetti|\bconfetti\s*\(/.test(link), 'caisse connection never launches the global confetti layer');
ok(link.includes('class="kcl-route"') && link.includes('Caisse</span>') && link.includes('Tableau de bord</span>'), 'shared drawer renders the terminal-to-dashboard route');
ok(link.includes("t.textContent = 'Liaison établie'") && link.includes("' · flux de ventes actif'"), 'connected state names the live establishment and active sales feed');
ok(link.includes("heading.textContent = 'Votre caisse est reliée'"), 'connected drawer heading no longer asks the merchant to connect again');
ok(link.includes('connectedPainted = false') && link.includes('if (!connectedPainted)'), 'the success transition runs only once despite the one-second poll');
ok(link.includes('@media (prefers-reduced-motion:reduce)') && link.includes('animation:none'), 'reduced-motion users receive the settled state without animation');
ok(link.includes('@media (max-width:420px)') && link.includes('.kcl-track{min-width:28px}'), 'connection route compresses safely on narrow phones');
ok(link.includes("getElementById('kiwi-op-banner')") && link.includes("classList.add('kcl-under-operator')"), 'operator support banner cannot cover the drawer heading');
ok(link.includes('role="status" aria-live="polite"'), 'assistive technology receives a polite connection update');
ok(link.includes("updateChip();") && link.includes("window.open('kiwi-caisse.html?pair=1'"), 'existing launcher truth and same-device handoff remain wired');
ok(!/font-style\s*:\s*italic/.test(link), 'connection treatment keeps roman type');
ok(dashboard.includes('assets/caisse-link.js?v=7'), 'dashboard loads the revised shared connection component');
ok(sw.includes("'/assets/caisse-link.js?v=7'"), 'the same revised component is available offline');
ok((link.match(/function panelBody\(/g) || []).length === 1 && !/panelBody[A-Z]|panelBody\s*\[/.test(link), 'every store type uses one shared connection presentation');

console.log(`\n✓ caisse-link success treatment green (${count} checks)`);
