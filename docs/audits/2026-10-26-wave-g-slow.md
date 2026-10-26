# Vague G · accélération des cinq suites navigateur

Base : `76534429`, branche `cx/g-slow`.

## Protocole

Chaque suite passe seule dans notre séquence, via `sh /Users/zaka/Developer/kiwi-scorecard/state/browser-slot.sh node tools/<suite>`. Trois passages valides avant et après ; médianes en secondes. La CPU est la somme utilisateur + système de `/usr/bin/time -p`, descendants compris. L'instrumentation temporaire exclut l'attente du créneau du temps de la suite, horodate les scénarios et conserve un profil `node --cpu-prof` au premier passage de chaque phase. La machine reste partagée avec d'autres travaux autorisés par les créneaux.

Objectif fixé avant les mesures finales : réduire d'au moins 15 % la médiane de chaque suite, sans retirer de scénario français, d'assertion ni de contrôle axe.

La source initiale de la matrice contenait encore des cas EN/AR explicites ; a11y avait deux scénarios arabes hors du sélecteur commun. Un adaptateur extérieur au dépôt applique FR dès les mesures initiales. Après modification, les suites utilisent directement `tools/test-locales.mjs`, sans ce filtre extérieur. Le gain de filtrage des langues est donc exclu de la comparaison. Les copies initiales figées servent aussi aux passages supplémentaires, sans modifier le produit ou un autre worktree.

Les scripts de mesure, profils, horaires par scénario et journaux complets restent dans `/tmp/kiwi-g-slow-profile/`.

## Résultats

Trois passages valides par phase, mêmes cas et mêmes compteurs de contrôles affichés. Les durées sont en secondes.

| Suite | Mur avant → après | Gain | CPU avant → après | Cas / contrôles par passage |
|---|---:|---:|---:|---:|
| `sync-ledger` | 224,9 → 181,5 | 19,3 % | 204,0 → 174,3 | 8 / 128 |
| `surface-matrix-states-real` | 66,5 → 48,4 | 27,3 % | 36,1 → 26,3 | 8 / 8 |
| `sync-ledger-boutique` | 160,3 → 119,9 | 25,2 % | 136,9 → 116,4 | 5 / 50 |
| `a11y` | 96,5 → 53,2 | 44,9 % | 45,3 → 49,1 | 17 / 19 |
| `trades-ledger` | 138,5 → 113,2 | 18,3 % | 104,9 → 133,2 | 5 / 44 |

Le seuil de gain de 15 % est rouge pour les cinq suites initiales, vert pour les cinq suites finales. Les 129 scénarios finaux sont verts (3 × 43).

La CPU cumulée augmente pour a11y et les métiers ; elle baisse sur les trois autres suites. Cette mesure inclut Chromium et ne remplace pas le ratchet CPU Node de la gate. Aucun pin CPU n’a été relevé.

Deux passages initiaux ont échoué sur la course d’authentification du montage (`sync-ledger` passage 3 et métiers passage 2). Ils sont conservés hors médianes et remplacés chacun par un passage complet vert de la même source initiale. La première itération a11y, verte mais à 84,9 s de médiane, n’atteignait pas l’objectif ; ses journaux sont conservés sous `trial1-after-a11y-*`, puis trois nouvelles mesures ont suivi la seconde modification.

| Suite | Phase | Passages mur / CPU |
|---|---|---|
| `sync-ledger` | Avant | 224,9 / 204,0 ; 228,5 / 272,2 ; 211,3 / 188,9 |
| `sync-ledger` | Après | 175,8 / 153,2 ; 195,4 / 225,7 ; 181,5 / 174,3 |
| `surface-matrix-states-real` | Avant | 66,5 / 36,1 ; 73,5 / 40,9 ; 66,0 / 33,5 |
| `surface-matrix-states-real` | Après | 45,9 / 21,4 ; 48,4 / 26,3 ; 83,2 / 35,3 |
| `sync-ledger-boutique` | Avant | 161,8 / 175,9 ; 155,9 / 125,4 ; 160,3 / 136,9 |
| `sync-ledger-boutique` | Après | 125,5 / 132,0 ; 119,9 / 116,4 ; 118,4 / 89,8 |
| `a11y` | Avant | 134,5 / 80,3 ; 96,5 / 45,3 ; 95,1 / 43,6 |
| `a11y` | Après | 52,8 / 49,1 ; 53,2 / 48,7 ; 63,0 / 61,9 |
| `trades-ledger` | Avant | 139,6 / 109,6 ; 130,1 / 93,6 ; 138,5 / 104,9 |
| `trades-ledger` | Après | 106,2 / 130,9 ; 113,2 / 133,2 ; 127,6 / 165,1 |


## Changements et garanties

- `sync-ledger-browser-test.mjs`, partagé avec l'entrée boutique : attendre une cible activable, la destination effective et la fin du paiement ; conserver les contrôles des montants, paiements, remboursements, annulations, reprise hors ligne, journée commerciale, isolation des commerces, commandes QR, facture et rapprochements Z.
- `trades-ledger-browser-test.mjs` : mêmes attentes observables et même parcours de création, catalogue, encaissement, serveur et tableau de bord.
- `surface-matrix-states-real-browser-test.mjs` : ouvrir l'éditeur depuis la liste vide déjà auditée, par locale et viewport ; conserver les huit scénarios FR, leurs contrôles de visibilité, langue, débordement et axe. Le refus de récompense reste produit par la boucle réelle de synchronisation.
- `a11y-browser-test.mjs` : attendre le démarrage, les polices et les animations finies avant axe ; conserver tous les états français et toutes les règles WCAG, sans modifier la base.

Les comptes synthétiques commencent leurs appels d'inscription sur une page publique légère. Après l'assistant, une pause résiduelle du garde entraîne une recharge authentifiée ; l'API reste autoritaire.

Aucun fichier de production, stamp, génération du service worker ou pin n'est modifié. Aucun nouveau fichier de test n'est ajouté.

## Fautes témoins

Les cinq sondes sortent 1 avant et après, avec la cause attendue. Elles ne touchent que des copies temporaires de la source ; aucune injection ne touche le worktree ni le produit.

| Suite | Faute dans la fixture | Rouge avant / après |
|---|---|---|
| `sync-ledger` | Tajine 72,50 → 72,51 MAD, oracle inchangé | 14 / 14 écarts monétaires |
| `surface-matrix-states-real` | acceptation HTTP 200 au lieu du refus HTTP 409 | refus attendu absent / absent |
| `sync-ledger-boutique` | prix des produits +1 MAD, oracles inchangés | 18 / 18 écarts monétaires |
| `a11y` | bouton visible sans nom accessible | `button-name`, 1 nœud / 1 nœud |
| `trades-ledger` | pizza 62,50 → 62,51 MAD, oracle inchangé | 6 / 6 écarts monétaires |

La première sonde boutique à +0,01 MAD était absorbée par l'arrondi existant ; son journal vert est conservé sous `probe-before-boutique-centime.log`. La sonde effective à +1 MAD change bien les encaissements. Les processus d'injection sont terminés ; les sources vérifiées vertes sont inchangées.

## Vérifications complémentaires

- `sync-ledger-boutique-clock-test.mjs` : 189 contrôles verts.
- `file-size-ratchet-test.mjs` : 728 contrôles verts, aucun pin dépassé.
- `pwa-shell-test.js` : 913 contrôles verts.
- `trades-ledger-retail-browser-test.mjs` : 4 scénarios verts, via le créneau navigateur.
- `trades-ledger-care-browser-test.mjs` : 3 scénarios verts, via le créneau navigateur.
- La gate complète, les commits et les pushes restent au lead, conformément à la consigne.

## Fichiers et volumes

| Fichier | Lignes ajoutées / retirées |
|---|---:|
| `tools/sync-ledger-browser-test.mjs` | +27 / −29 |
| `tools/surface-matrix-states-real-browser-test.mjs` | +55 / −35 |
| `tools/a11y-browser-test.mjs` | +35 / −30 |
| `tools/trades-ledger-browser-test.mjs` | +41 / −44 |
| `docs/decisions/2026-10-26-wave-g.md` | +5 / −0 |
| `docs/audits/2026-10-26-wave-g-slow.md` | +92 / −0 |

Les entrées boutique, retail et care réutilisent leurs suites partagées ; leurs fichiers d'entrée ne changent pas. Aucun fichier à restamper. Le travail reste non commité pour le lead.
