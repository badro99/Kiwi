# Wave D · people · validation

Décisions : [2026-10-24-wave-d.md](2026-10-24-wave-d.md). Aucun commit, aucun déploiement, aucun stamp modifié.

## Preuves

- Rouge sur HEAD : DM-1 et DM-2 stricts échouent; notification à net nul et conservation de 370 briefings échouent. Les mêmes suites passent après modification.
- Rouge sur les vrais handlers HEAD chargés isolément : pas de journal complet paginé, export du carnet accessible au service. Le test actuel refuse le service et autorise le propriétaire et le gérant.
- Rouge sur le store HEAD avec le test de refus strict : 50 refus conservés pour 60 attendus; vert maintenant. Le scénario local conserve aussi 75 achats hors ligne.
- Les décisions conservant un comportement existant (paie par période, comparaison calendaire, ventes provisoires) sont désormais strictes. Aucun faux changement runtime ni contre-exemple rouge inventé pour ces contrats déjà respectés.

## Suites

- 256 suites ciblées sans navigateur : 251 vertes au premier passage; les cinq attentes héritées ont été corrigées puis rejouées au vert (channel-percentage, loyalty-refused-redemption, security-and-channel-hardening, service-interconnectivity, clients-properties).
- Paie : 21 propriétés strictes, 300 cas par propriété. Rapports : 14 propriétés strictes, 300 cas par propriété.
- Tableau de bord : 30 propriétés strictes, 300 cas. Briefing : 26 propriétés strictes, 150 cas. Clients : 41 propriétés strictes, 100 cas, plus reprises ciblées du journal gérant/service/fusion et des historiques locaux après les dernières extensions.
- Dix suites mentionnant sales-history.js rejouées après harmonisation des ventes à zéro dans la réconciliation : toutes vertes.
- employee-properties : 20 strictes; d1-migrations : schéma identique; reconstruction serveur : 149 fonctions; traductions serveur : 448 vérifications; file-size : 680; PWA : 811; diff --check : vert.
- known-issues : 10 décisions retirées du baseline, 24 entrées restantes sur les autres périmètres.

## Limites et reprise par le lead

- Migration 0012_client_reward_refusals.sql rédigée via le brouillon d1; jamais appliquée à la production.
- Les refus déjà tronqués avant cette version ne peuvent pas être reconstitués. Le journal durable commence avec les refus reçus par cette version; les anciennes écritures d’achat et remboursement restent disponibles.
- Les annotations FR/EN/AR par appareil existaient déjà. Aucun navigateur exécuté ici : les parcours complets d’édition du roster et des bulletins ne sont pas nouvellement prouvés par ce travail; les cellules d’entrée et les suites déjà présentes ne doivent pas être présentées comme cette preuve.
- Le gate complet reste au lead. Restamper ensemble les assets ci-dessous et leurs consommateurs avant livraison.

## Fichiers modifiés (ajouts / suppressions)

| Fichier | + | - |
| --- | ---: | ---: |
| `assets/briefing.js` | 2 | 1 |
| `assets/channel-sales.js` | 4 | 4 |
| `assets/clients-directory.js` | 23 | 4 |
| `assets/clients-store.js` | 3 | 3 |
| `assets/dateRange.js` | 1 | 1 |
| `assets/live-link.js` | 3 | 3 |
| `assets/sales-history.js` | 6 | 6 |
| `assets/serveur-lang.js` | 6 | 0 |
| `assets/serveur/service.js` | 18 | 15 |
| `functions/api/_client-merge.js` | 2 | 2 |
| `functions/api/clients.js` | 11 | 5 |
| `functions/api/employee-clients.js` | 10 | 7 |
| `functions/api/push/morning.js` | 0 | 1 |
| `functions/api/sales-summary.js` | 0 | 1 |
| `kiwi-serveur.html` | 1 | 1 |
| `schema.sql` | 7 | 0 |
| `tools/briefing-properties-test.mjs` | 4 | 3 |
| `tools/channel-percentage-test.mjs` | 2 | 2 |
| `tools/clients-properties-test.mjs` | 45 | 3 |
| `tools/dashboard-money-properties-test.mjs` | 11 | 11 |
| `tools/dayreport-properties-test.mjs` | 1 | 1 |
| `tools/fixtures/serveur/original.js.gz` | - | - |
| `tools/fixtures/serveur/split.json` | 126 | 126 |
| `tools/known-issues-baseline.json` | 0 | 60 |
| `tools/loyalty-refused-redemption-test.mjs` | 3 | 3 |
| `tools/payroll-properties-test.mjs` | 2 | 2 |
| `tools/sales-summary-test.mjs` | 1 | 1 |
| `tools/security-and-channel-hardening-test.mjs` | 3 | 1 |
| `tools/service-interconnectivity-test.mjs` | 3 | 3 |
| `docs/decisions/2026-10-24-wave-d.md` | 25 | 0 |
| `functions/api/_client-audit.js` | 43 | 0 |
| `migrations/0012_client_reward_refusals.sql` | 5 | 0 |

## Assets à restamper

- `assets/briefing.js`
- `assets/channel-sales.js`
- `assets/clients-directory.js`
- `assets/clients-store.js`
- `assets/dateRange.js`
- `assets/live-link.js`
- `assets/sales-history.js`
- `assets/serveur-lang.js`
- `assets/serveur/service.js`
