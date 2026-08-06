#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pos-boutique.js'), 'utf8');
const dash = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pages-pro.js'), 'utf8');
const feed = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', 'feed.js'), 'utf8');

const checks = [
  ['Échanges relit les sept jours réels du magasin', /start\.setDate\(start\.getDate\(\) - \(RETAIN_DAYS - 1\)\)[\s\S]*fetch\('\/api\/feed\?merchant='/.test(src)],
  ['la requête garde le cookie de la caisse appairée', /syncReturnSales[\s\S]*credentials: 'same-origin'/.test(src)],
  ['une référence déjà locale gagne sur la copie serveur', /SALES\.some\(\(s\) => s && s\.id === ref\)/.test(src)],
  ['les tickets serveur sont fusionnés dans le journal des échanges', /serverId:[\s\S]*remote: true/.test(src)],
  ['un ticket sans article identifiable ne devient pas un faux échange', /if \(!lines\.length\) return/.test(src)],
  ['une copie d’une autre caisse ne rend pas deux fois le stock sur un void', /if \(sale\.remote\) return/.test(src)],
  ['le montage déclenche effectivement la synchronisation', /renderAll\(\);\s*syncReturnSales\(\);/.test(src)],
  ['Aujourd’hui et Hier sont des choix directs', /data-bq-ret-day="\$\{todayKey\}"[\s\S]*data-bq-ret-day="\$\{yesterdayKey\}"/.test(src)],
  ['le sélecteur de date reste borné à sept jours', /id="bq-ret-date"[\s\S]*min="\$\{oldestKey\}" max="\$\{todayKey\}"/.test(src)],
  ['la liste montre toutes les ventes du jour choisi', /dateKey\(s\.at\) === state\.retDate/.test(src)],
  ['un retour terminé est écrit dans le document partagé', /feature: 'returns'[\s\S]*recordReturn\(sale, idxs, amount/.test(src)],
  ['les échanges sont eux aussi journalisés', /recordReturn\(sale, \[ex\.idx\], ln\.unit/.test(src)],
  ['une ligne multiple conserve le nombre exact de pièces retournées', /function lineReturnedQty\(ln\)[\s\S]*ln\.returnedQty/.test(src)],
  ['la quantité retournée est choisissable sans dépasser le solde vendu', /data-bq-ret-qty=[\s\S]*Math\.min\(lineAvailableQty/.test(src)],
  ['un échange autorise une seule pièce issue d’une ligne multiple', /const qty = pickedQty\(ret, idx, ln\)[\s\S]*state\.exchange = \{ saleId: ret\.saleId, idx, qty: 1 \}/.test(src)],
  ['l’avoir utilise la quantité choisie et non toute la ligne', /const quantities = new Map\(idxs\.map[\s\S]*sale\.lines\[i\]\.unit \* quantities\.get\(i\)/.test(src)],
  ['seules les pièces réellement rendues reviennent au stock', /markLineReturned\(ln, qty, note\)[\s\S]*persistStock\(ln\.pid, ln\.size, ln\.color, qty\)/.test(src)],
  ['le journal propriétaire reçoit la quantité partielle exacte', /recordReturn\(sale, idxs, amount, ret\.motif, 'avoir', av\.code, quantities\)/.test(src)],
  ['le dashboard lit le même document de retours', /feature: 'returns'[\s\S]*liveReturns\.flatMap/.test(dash)],
  ['le dashboard réel n’affiche plus les exemples', /const pending = real \? liveReturns/.test(dash)],
  ['le serveur ne tronque pas une semaine active à 300 tickets', /const DAY_LIMIT = 2000/.test(feed)],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  failed.forEach(([name]) => console.error('  ✗ ' + name));
  process.exit(1);
}
console.log(`  ✓ échanges & avoirs (${checks.length} contrôles : 7 jours, dates, retours partagés, dashboard réel)`);
