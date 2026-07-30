#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pos-boutique.js'), 'utf8');

const checks = [
  ['Échanges relit la journée réelle du magasin', /fetch\('\/api\/feed\?merchant='[\s\S]*'&from='/.test(src)],
  ['la requête garde le cookie de la caisse appairée', /syncReturnSales[\s\S]*credentials: 'same-origin'/.test(src)],
  ['une référence déjà locale gagne sur la copie serveur', /SALES\.some\(\(s\) => s && s\.id === ref\)/.test(src)],
  ['les tickets serveur sont fusionnés dans le journal des échanges', /serverId:[\s\S]*remote: true/.test(src)],
  ['un ticket sans article identifiable ne devient pas un faux échange', /if \(!lines\.length\) return/.test(src)],
  ['une copie d’une autre caisse ne rend pas deux fois le stock sur un void', /if \(sale\.remote\) return/.test(src)],
  ['le montage déclenche effectivement la synchronisation', /renderAll\(\);\s*syncReturnSales\(\);/.test(src)],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  failed.forEach(([name]) => console.error('  ✗ ' + name));
  process.exit(1);
}
console.log(`  ✓ échanges & avoirs (${checks.length} contrôles : ventes serveur du jour, fusion locale prioritaire, stock sûr)`);
