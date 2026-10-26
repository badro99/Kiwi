# Wave O · infra · validation

## Fichiers et lignes

| Fichier | Lignes ajoutées/supprimées |
| --- | --- |
| `assets/caisse-lang.js` | +8/−0 |
| `assets/caisse-pairing.js` | +8/−1 |
| `assets/hotel-economat-requests.css` | +4/−4 |
| `assets/promo-rules.js` | +13/−6 |
| `assets/team-hours.js` | +1/−0 |
| `assets/team/profile-ui.js` | +6/−3 |
| `functions/_schema-version.js` | +23/−2 |
| `tools/check.js` | +2/−0 |
| `tools/discount-policy-test.mjs` | +2/−2 |
| `tools/schema-minimum-test.mjs` | +2/−0 |
| `tools/shopify-sync-properties-test.mjs` | +33/−1 |
| `tools/source-assertion-manifest.json` | +65/−5 |
| `tools/source-assertion-ratchet-test.mjs` | +18/−5 |
| `assets/offline-pin-coverage.js` | +16/−0 |
| `docs/decisions/2026-10-26-wave-o.md` | +21/−0 |
| `functions/api/_middleware.js` | +6/−0 |
| `tools/assertion-provenance-loader.mjs` | +11/−0 |
| `tools/assertion-provenance-test.mjs` | +15/−0 |
| `tools/fixtures/shopify/2026-07.json` | +263/−0 |
| `tools/fixtures/shopify/README.md` | +23/−0 |
| `tools/source-assertion-classifier.cjs` | +48/−0 |
| `tools/wave-o-infra-test.mjs` | +77/−0 |

## Décisions et limites

Voir [les décisions](2026-10-26-wave-o.md#infra). Gate#0 est renforcé, mais sa garantie globale sur chaque assertion des suites mixtes reste ouverte. Le helper de couverture hors ligne doit avoir été chargé pour apparaître pendant une panne réseau ; son absence ne bloque pas la vérification locale.

## Preuves rouges puis vertes

Les originaux ont été sauvegardés avant édition. Pour chaque ligne ci-dessous : restaurer temporairement le fichier original, lancer le mode du test, constater code 1/AssertionError, restaurer la correction dans un `finally`, relancer et constater code 0. Aucune opération git en écriture, aucun autre worktree.

| Écart | Test enregistré | Rouge observé |
| --- | --- | --- |
| schema#0 | `wave-o-infra-test.mjs schema` | pas de contrôle exporté ; le vert prouve aussi 20 requêtes concurrentes/une lecture, refus avant `next`, reprise après 60 s |
| promos#1 | `wave-o-infra-test.mjs promos` | 26 octobre au lieu du 25 avec New York/08:00 ; changements de coupure et de zone ensuite suivis |
| planning#2 | `wave-o-infra-test.mjs planning` | trois traductions sans précision 0,01 h/36 s ; indication désormais présente dans la grille réalisée |
| economat#1 | `wave-o-infra-test.mjs economat` | taille 10,5/9,5 px et texte sans retour à la ligne |
| pairing#1 | `wave-o-infra-test.mjs pairing` | 12 vérificateurs au lieu de 20 ; tests de texte du panneau dans le mode `coverage` |
| gate#0 | `wave-o-infra-test.mjs classifier` | imports/commentaires/chaînes interprétés comme exécution ; vieux classificateur extrait sans exécuter son ratchet |
| shopify#2 | `shopify-sync-properties-test.mjs` | corpus retiré temporairement : ENOENT ; corpus restauré : sept cas verts. En plus, loader mutant ignorant `userErrors` : AssertionError sur CAS, puis vrai code vert |

`assertion-provenance-test.mjs` vérifie séparément le vrai handler de vente : succès normal, mutation en mémoire de son motif d’audit, AssertionError observée. Le manifeste manquant échouait avant l’ajout de la preuve. Les deux nouveaux tests sont nommés dans `tools/check.js`.

## Suites sans navigateur

Sélection finale : 50 fichiers exécutés, 49 réussis. Seul `team-split-test.mjs` échoue : `locale: entire section unchanged`, changement volontaire des traductions et de l’indication dans `team-hours.js`. Le lead doit resceller la fixture, elle n’a pas été modifiée ici.

- `app-bundle-test.mjs` : PASS
- `assertion-provenance-test.mjs` : PASS
- `briefing-cash-sessions-test.mjs` : PASS
- `briefing-discounts-test.mjs` : PASS
- `caisse-client-sale-test.mjs` : PASS
- `caisse-color-picker-language-test.mjs` : PASS
- `caisse-handoff-demo-reload-test.mjs` : PASS
- `caisse-offline-pin-test.mjs` : PASS
- `caisse-pairing-kdf-test.mjs` : PASS
- `caisse-pairing-recovery-test.mjs` : PASS
- `caisse-pairing-repair-test.mjs` : PASS
- `caisse-pressing-hotel-lang-test.mjs` : PASS
- `caisse-repair-pin-venue-test.mjs` : PASS
- `caisse-surface-lang-test.js` : PASS
- `catalog-merge-test.js` : PASS
- `config-pin-projection-test.mjs` : PASS
- `critical-flow-test.mjs` : PASS
- `discount-policy-test.mjs` : PASS
- `economat-rd-invariants-test.mjs` : PASS
- `employee-live-test.mjs` : PASS
- `escpos-unsupported-test.mjs` : PASS
- `file-size-ratchet-test.mjs` : PASS
- `hotel-units-test.mjs` : PASS
- `import-test.js` : PASS
- `landing-claims-test.mjs` : PASS
- `loyalty-confirmation-test.mjs` : PASS
- `menu-promos-properties-test.mjs` : PASS
- `menu-promos-test.mjs` : PASS
- `money-properties-test.mjs` : PASS
- `native-audit-fixes-test.mjs` : PASS
- `native-pass4-test.mjs` : PASS
- `native-pass7-test.mjs` : PASS
- `orderpro-relay-test.js` : PASS
- `pairing-parity-test.mjs` : PASS
- `pin-lockout-truth-test.mjs` : PASS
- `pressing-workspace-test.js` : PASS
- `promo-rules-properties-test.mjs` : PASS
- `promos-properties-test.mjs` : PASS
- `promotions-store-contract-test.mjs` : PASS
- `pwa-shell-test.js` : PASS
- `retail-truth-test.mjs` : PASS
- `scan-view-test.mjs` : PASS
- `schema-minimum-test.mjs` : PASS
- `shopify-sync-properties-test.mjs` : PASS
- `source-assertion-ratchet-test.mjs` : PASS
- `team-split-test.mjs` : RED, preuve de split à resceller
- `team-test-source.cjs` : PASS
- `till-truth-test.mjs` : PASS
- `type-policy-test.js` : PASS
- `wave-o-infra-test.mjs` : PASS

Compléments PASS : `asset-stamp-coverage-test.mjs`, `typecheck-ratchet-test.mjs` (10 diagnostics existants, aucun nouveau), `runtime-ddl-test.mjs`, `runtime-ddl-routes-test.mjs`, `payroll-properties-test.mjs` (21 propriétés, 300 cas chacune). Syntaxe des 17 scripts/modules modifiés et `git diff --check` : PASS. Le corpus Shopify complet passe avec 100 cas par propriété. Ratchets : 776 vérifications de taille et 947 vérifications PWA vertes, aucun pin relevé.

## Navigateurs réservés au lead

Aucune suite navigateur lancée. Détection transitive par `check-guard.isSlow` des fichiers de tests nommant les fichiers changés :

- `tools/app-interaction-test.mjs`
- `tools/caisse-restaurant-lang-browser-test.mjs`
- `tools/check-guard-test.mjs`
- `tools/dashboard-breadcrumb-language-test.mjs`
- `tools/hotel-direct-booking-browser-test.mjs`
- `tools/hotel-stays-group-browser-test.mjs`
- `tools/maison-shelf-price-browser-test.mjs`
- `tools/native-owner-home-browser-test.mjs`
- `tools/native-store-readiness-test.mjs`
- `tools/pos-autre-custom-amount-test.mjs`
- `tools/till-approval-server-writes-test.mjs`
- `tools/trades-ledger-browser-test.mjs`

## Livraison restante

Restamper : `assets/caisse-lang.js`, `assets/caisse-pairing.js`, `assets/hotel-economat-requests.css`, `assets/promo-rules.js`, `assets/team-hours.js`, `assets/team/profile-ui.js`. Intégrer le nouvel asset `assets/offline-pin-coverage.js` dans la livraison/cache. Aucune estampille, aucun manifeste de stamps ni génération SW changé. Aucun commit ni push. Le lead conserve le gate complet, les navigateurs et le rescellage du split.
