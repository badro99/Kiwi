# Hotel : découpe par responsabilité, corps conservés

## Références et périmètre

Original : `82e5d1297faf221d4177bcfe70949d9e7d34380d`,
`assets/hotel.js`, 10 296 lignes. L'archive immuable est
`tools/fixtures/hotel/original.js.gz`, avec son SHA-256 dans `split.json`.
Première étape : commit `3e1312a9`, localisation déplacée à l'octet,
cœur de 8 909 lignes et préambule de langue de 1 400 lignes.

La deuxième étape sort quatre responsabilités, sans déplacer les mutations
communes des tiroirs/modales ni les callbacks de dispatch du cœur :

| Fichier | Avant | Après | Fonctions déplacées |
| --- | ---: | ---: | ---: |
| `assets/hotel.js` | 8 909 | 8 276 | 32 corps remplacés par des relais |
| `assets/hotel-language.js` | 1 400 | 1 413 | registre privé ajouté, langue inchangée |
| `assets/hotel-rates.js` | absent | 384 | 10 |
| `assets/hotel-housekeeping.js` | absent | 89 | 3 |
| `assets/hotel-folio.js` | absent | 195 | 13 |
| `assets/hotel-channels.js` | absent | 118 | 6 |

Tarifs : performance et page des prix, signature et affichage des devis,
prix directs, cycle et interface de synchronisation tarifaire.
Ménage : file démo, modèle exposé à l'Accueil et page du ménage réel.
Folios : note détaillée, choix/ajout de consommations, horodatage,
préfacturation (lignes, répartition, erreurs, collecte et impression).
Canaux : page démo, fournisseur/connexion, lecture et synchronisation iCal,
libellés des chambres, état du lien direct et page réelle des canaux.

Réception, séjours, groupes, onboarding et orchestration des modales restent
dans le cœur. Le rendu des notes en cours y reste aussi : il écrit
`cuStripUnknown`, témoin partagé de rafraîchissement. Les deux modales OTA
y restent car elles remplacent `openModal`. L'accusé de synchronisation tarifaire
reste au cœur car il lit `hotelCloud`, handle réassignable. Aucun de ces états
scalaires n'est capturé dans une fabrique.

## Places de scripts et fusion des voisins

Avant toute extraction, cinq places du dashboard sont libérées, sur le modèle
de `bd04b483`. Les anciens corps sont concaténés à l'octet, chacun séparé par
un commentaire repère compatible avec `tools/merged-source.cjs` :

| Voisin conservé | Corps ajoutés, dans l'ordre initial | Lignes avant → après |
| --- | --- | ---: |
| `assets/agent-voice.js` | `agent-vision.js`, `agent-skin.js` | 312 → 1 161 |
| `assets/month-report.js` | `month-report-tools.js`, `month-report-pdf.js`, `month-report-ui.js` | 189 → 480 |

Ces groupes étaient contigus et chargés uniquement par le dashboard. Les cinq
anciens fichiers sont supprimés, leurs balises et leurs entrées SHELL retirées.
Les tests isolés lisent leurs octets via `mergedPart`; la fixture mensuelle et
son navigateur chargent désormais le fichier réuni une seule fois. Les archives
de fusion sont dans `tools/fixtures/hotel/merged-originals.json.gz`.

Dashboard : **162 → 157 → 161** balises. Cinq places rendues, quatre utilisées,
une encore disponible pour le stock. Aucun pin n'est augmenté. Le pin de lignes
de `hotel.js` descend de 8 909 à 8 276 via le ratchet officiel.

## Contrat et ordre de chargement

Les six scripts classiques `defer` sont adjacents : langue, tarifs, ménage,
folios, canaux, puis cœur. Les nouveaux préambules ne font qu'enregistrer des
fabriques. Aucun chargement réseau déclenché au clic, aucune promesse de readiness.
Le cœur initialise son état à la même place qu'avant.

Un seul global interne : `window.__kiwiHotelInternal`, objet gelé avec les clés
fixes `define`, `bind`, `part`, `language`. `define` enregistre une des quatre
fabriques connues, `bind` reçoit un objet gelé d'accesseurs privés vers les
liaisons du cœur, `part` instancie puis conserve la fabrique au premier appel.
Les objets exportés sont gelés. `language` garde le contrat de la première étape.
Le registre des quatre noms est scellé et le scope partagé reste privé.

Les déclarations du cœur restent des fonctions nommées et disponibles avant leur
position textuelle. Leur relais appelle la fonction déplacée par
`.apply(this, arguments)`, en conservant nom, paramètres, contexte, arguments et
valeur retournée. Une fonction asynchrone déplacée renvoie directement sa promesse
à travers le relais, sans wrapper `async` supplémentaire.

Les dépendances ont été déterminées par les symboles TypeScript de la fermeture
initiale : fonctions stables et objets déclarés `const`. Les fabriques gardent les
mêmes références aux maps, files et modèles; les fonctions du cœur continuent de
lire l'état courant et le commerce courant. Aucune liaison `let`/`var` réassignable
n'est injectée. Les fonctions internes d'une même partie s'appellent directement.

Le nouveau SHELL inclut les quatre parties, la langue et le cœur (ces deux
entrées manquaient avant cette étape). Les URL littérales sont découvertes par
`tools/stamps.js`. Aucune révision existante, génération SW ni entrée du manifeste
d'estampilles n'est déplacée. À l'intégration, estampiller les deux voisins fusionnés,
`hotel.js`, `hotel-language.js` et les quatre nouveaux fichiers par l'outil officiel.

## Preuves

`node tools/hotel-split-test.mjs` :

- reconstruit l'original de 10 296 lignes octet par octet depuis les corps de
  production, puis vérifie le SHA-256 de l'archive;
- vérifie intégralement les enveloppes, les corps des 32 fonctions, les relais et
  la liaison du scope, documentés dans `tools/fixtures/hotel/split-2.json`;
- vérifie les sept corps des deux fusions à l'octet, les seuls commentaires ajoutés,
  l'ordre exact de toutes les balises survivantes et le compte de 161;
- vérifie chargement différé adjacent, découverte d'estampilles et pré-cache des
  six scripts hôtel;
- refuse toute dépendance issue d'une liaison mutable du cœur original;
- compare original et vrais scripts pour état initial, écritures locales, handlers,
  globals, fonctions exportées et sorties de langue/pluriels FR/EN/AR;
- relance `hotel-rooms`, `hotel-room-plan`, `hotel-stays-group`,
  `hotel-reception-journal`, `hotel-direct-pricing` avec les vrais scripts réunis
  (`KIWI_HOTEL_TEST_RUNTIME=1`), pour exercer les relais et fabriques en VM.

Les tests historiques d'extraction continuent à lire la portée initiale reconstruite
par `tools/hotel-test-source.mjs`, exclusivement depuis les fichiers de production.
Les fixtures navigateur chargent les six fichiers réels dans l'ordre.
`tools/check.js` reste inchangé. La nouvelle preuve doit rester nommée dans le
rapport pour son raccordement par le propriétaire.

## Validation locale

Les 52 suites `tools/*hotel*test.mjs` et `tools/*economat*test.mjs` sont
lancées séquentiellement : **46 passent**, six rencontrent les restrictions de
l'environnement. Les mêmes erreurs ont été reproduites sur un export intact
de `3e1312a9`, avec les mêmes dépendances :

- `economat-real-d1-transfer`, `hotel-commercial-layout`, `hotel-i18n`,
  `hotel-room-plan-ui` : `listen EPERM 127.0.0.1`.
- `hotel-direct-booking-browser`, `hotel-stays-group-browser` : Chromium ne démarre pas.

Sept contrôles connexes ont aussi été lancés : `agent-voice` (16 contrôles),
`agent-vision` (20 + cas de confiance), `month-report` (317),
`month-report-api` (40), `modal-desc-escape` (40), `books-money-properties`
(20 propriétés strictes, 1 804 cas, aucune erreur) passent.
`month-report-browser` rencontre `listen EPERM`, reproduit sur le même export intact.
Un ancien chargement dynamique des fichiers mensuels a été corrigé dans la
fixture des propriétés comptables, puis cette suite est repassée verte.
Au total : 59 suites distinctes, **52 passent et sept sont bloquées par le sandbox**.
Jamais plus d'une suite navigateur à la fois.

La preuve de découpe, y compris ses cinq suites VM sur le vrai runtime, passe.
Le test refuse le cœur de la première étape et refuse un commentaire ajouté dans
un corps déplacé; les fichiers ont été restaurés et la preuve est repassée verte.
Les sept fragments fusionnés ont aussi été comparés directement aux octets de HEAD.
Le ratchet passe (664 contrôles), le PWA shell passe (789), toutes les syntaxes JS
modifiées/nouvelles sont vérifiées, et `git diff --check` passe.
La validation navigateur reste à terminer sur une machine autorisant localhost
et Chromium; aucun succès navigateur n'est revendiqué ici.

## Fichiers exacts de cette étape

`M` : modifié, `D` : supprimé, `A` : nouveau fichier.

```text
D assets/agent-skin.js
D assets/agent-vision.js
M assets/agent-voice.js
M assets/hotel-language.js
M assets/hotel.js
D assets/month-report-pdf.js
D assets/month-report-tools.js
D assets/month-report-ui.js
M assets/month-report.js
M dashboard.html
M docs/specs/hotel-split.md
M kiwi-sw.js
M tools/agent-vision-test.mjs
M tools/agent-voice-test.mjs
M tools/books-money-properties-test.mjs
M tools/file-size-baseline.json
M tools/fixtures/hotel/split.json
M tools/hotel-i18n-test.mjs
M tools/hotel-room-plan-ui-test.mjs
M tools/hotel-split-test.mjs
M tools/hotel-stays-group-browser-test.mjs
M tools/hotel-test-source.mjs
M tools/modal-desc-escape-test.mjs
M tools/month-report-browser-test.mjs
M tools/month-report-fixtures.mjs
M tools/month-report-test.mjs
A assets/hotel-channels.js
A assets/hotel-folio.js
A assets/hotel-housekeeping.js
A assets/hotel-rates.js
A tools/fixtures/hotel/merged-originals.json.gz
A tools/fixtures/hotel/split-2.json
```
