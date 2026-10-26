# Wave F · claims · 26 octobre 2026

Branche cx/f-claims, travail non committé. Aucun push, changement de stamp, migration ou appel de modèle réel.

## Résultat

- Inventaire borné de 64 chaînes FR : 33 contrats et 31 libellés ou prestations explicitement classés copy-only. Les contrats référencent 29 suites existantes du gate et leurs assertions exactes. Chaque chemin doit exister dans les sept langues, chaque texte FR doit correspondre à l’inventaire, chaque fichier et assertion doivent exister et la suite doit être nommée dans tools/check.js.
- Deux promesses Ultra sans fonction démontrée, « Gestion multi-pays » et « API entreprise », restent telles quelles (offre du propriétaire) et sont inscrites `copy-only` comme engagements contractuels ; la reformulation proposée par GPT a été retirée par le lead.
- Carnet : avances visibles, montant remboursable en centimes, action propriétaire seulement selon KiwiIdentity.state et ses établissements. Enregistrement du virement via credit-book-refund, même identifiant conservé lors des reprises, aucune écriture financière locale. Rafraîchissement serveur après réponse ; plafond concurrent communiqué et contre-écritures affichées, y compris quand l’avance est soldée.
- Le serveur reste propriétaire seulement. Aucun droit manager ajouté. Le contrôle enregistre un virement effectué, il ne réalise pas de paiement bancaire.

## Preuves rouge puis vert

- landing-claims-test.mjs échoue avant création de l’inventaire ; passe ensuite avec 32 732 contrôles.
- credit-book-refund-ui-test.mjs échoue sur l’ancien module : owner refund action exists, undefined au lieu de function. Passe avec l’implémentation : plafond, rôle opérateur, établissement étranger, payload, rafraîchissement et plafond serveur concurrent.
- Nouveau parcours FR lancé sur l’ancien module via KIWI_REFUND_SOURCE : échec sur le sélecteur du remboursement. Sur le module final : 1 parcours réussi. 20 MAD disponibles, 20,01 refusé sans requête, 7,50 enregistré une seule fois, reste 12,50 et entrée distincte visibles. Serveur du navigateur simulé ; autorité réelle couverte séparément par credit-book-properties-test.mjs, 8 propriétés strictes × 300 cas, dont rôles, CAS, rejouabilité et contre-écriture unique.
- Une attente adaptée après rouge : extraction des dépendances du calcul de remboursement dans credit-book-test.mjs.

## Validation

54 suites non navigateur distinctes réussies, aucun skip. Sélection : chaque tools/*test* non navigateur nommant un fichier changé, contrats de l’inventaire et propriétés serveur du carnet. Pas de lancement de tools/check.js. Taille : 726 contrôles réussis. PWA : 913 contrôles réussis. Syntaxe JS et git diff --check réussis.

Chaque lancement du seul nouveau parcours navigateur passe par :

`sh /Users/zaka/Developer/kiwi-scorecard/state/browser-slot.sh node tools/credit-book-refund-browser-test.mjs`

Langue tirée de tools/test-locales.mjs, créé car absent de cette base. Les anciennes suites navigateur multilingues n’ont pas été lancées.

Suites non navigateur exécutées :

- tools/agent-test.js : PASS
- tools/app-bundle-test.mjs : PASS
- tools/app-release-test.mjs : PASS
- tools/article-template-test.mjs : PASS
- tools/booking-api-test.mjs : PASS
- tools/boutique-existing-barcode-test.mjs : PASS
- tools/boutique-variant-stock-test.mjs : PASS
- tools/bump-stamp-test.mjs : PASS
- tools/bundle-manifest-test.mjs : PASS
- tools/caisse-auto-receipt-test.mjs : PASS
- tools/caisse-stock-test.mjs : PASS
- tools/canonical-origin-test.mjs : PASS
- tools/clients-properties-test.mjs : PASS
- tools/config-business-day-test.mjs : PASS
- tools/cost-margin-test.js : PASS
- tools/credit-book-properties-test.mjs : PASS
- tools/credit-book-refund-ui-test.mjs : PASS
- tools/credit-book-test.mjs : PASS
- tools/dayreport-properties-test.mjs : PASS
- tools/economat-rd-invariants-test.mjs : PASS
- tools/employee-properties-test.mjs : PASS
- tools/file-size-ratchet-test.mjs : PASS
- tools/floorplan-sync-test.js : PASS
- tools/food-trades-truth-test.mjs : PASS
- tools/foodcost-api-test.mjs : PASS
- tools/hotel-units-test.mjs : PASS
- tools/import-test.js : PASS
- tools/kitchen-properties-test.mjs : PASS
- tools/landing-claims-test.mjs : PASS
- tools/landing-demo-funnel-test.mjs : PASS
- tools/landing-es-test.mjs : PASS
- tools/loyalty-truth-test.mjs : PASS
- tools/menu-properties-test.mjs : PASS
- tools/native-pass4-test.mjs : PASS
- tools/offline-foundation-test.mjs : PASS
- tools/orderpro-panel-plan-test.mjs : PASS
- tools/origin-move-test.mjs : PASS
- tools/payroll-properties-test.mjs : PASS
- tools/plan-catalog-test.mjs : PASS
- tools/plan-tier-test.mjs : PASS
- tools/planning-core-test.mjs : PASS
- tools/promotions-store-contract-test.mjs : PASS
- tools/pwa-shell-test.js : PASS
- tools/retail-scan-test.mjs : PASS
- tools/retail-truth-test.mjs : PASS
- tools/returns-sales-sync-test.js : PASS
- tools/sale-return-ledger-test.mjs : PASS
- tools/serveur-kitchen-truth-test.mjs : PASS
- tools/specialty-retail-truth-test.mjs : PASS
- tools/support-system-test.mjs : PASS
- tools/team-doc-redaction-test.mjs : PASS
- tools/till-truth-test.mjs : PASS
- tools/trade-workspaces-test.js : PASS
- tools/worker-cpu-test.mjs : PASS

## Intégration restante

Le lead doit restamper assets/trade-workspaces.js, assets/plan-catalog.js et assets/landing-runtime-translations.js, puis exécuter le gate complet et committer. Aucun stamp ni manifest modifié ici. Aucun changement de schéma. Les prestations humaines et le périmètre sur devis demandent une validation commerciale, pas une preuve d’implémentation. L’inventaire prouve les capacités annoncées, pas un audit exhaustif de tous les droits d’abonnement.

Décisions : docs/decisions/2026-10-26-wave-f.md, rubrique claims.

## Fichiers modifiés, lignes ajoutées / retirées

```text
1	1	ar/__next.$d$locale.__PAGE__.txt
1	1	ar/__next._full.txt
1	1	ar/index.html
1	1	ar/index.txt
1	1	assets/landing-runtime-translations.js
6	6	assets/plan-catalog.js
60	8	assets/trade-workspaces.js
15	15	content/landing-pricing.json
1	1	de/index.html
1	1	en/__next.$d$locale.__PAGE__.txt
1	1	en/__next._full.txt
1	1	en/index.html
1	1	en/index.txt
1	1	es/index.html
1	1	fr/__next.$d$locale.__PAGE__.txt
1	1	fr/__next._full.txt
1	1	fr/index.html
1	1	fr/index.txt
1	1	index.html
1	1	it/index.html
1	1	nl/index.html
2	1	tools/check.js
2	0	tools/credit-book-test.mjs
26	0	tools/landing-claims-test.mjs
1	1	tools/landing-es-test.mjs
8	0	docs/decisions/2026-10-26-wave-f.md (nouveau)
133	0	tools/credit-book-refund-browser-test.mjs (nouveau)
36	0	tools/credit-book-refund-ui-test.mjs (nouveau)
747	0	tools/landing-claims-map.json (nouveau)
2	0	tools/test-locales.mjs (nouveau)
```
