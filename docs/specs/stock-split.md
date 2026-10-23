# Stock : séparation par responsabilité

Référence : commit indiqué dans `tools/fixtures/stock/split.json`,
`assets/stock.js` de 8 188 lignes (pin antérieur : 8 188).

| Fichier | Lignes après séparation | Responsabilité |
| --- | ---: | --- |
| assets/stock.js | 3 953 | État, traductions, persistance tenant, projections stock/recettes, vue principale, handlers, chargeur |
| assets/stock/loss.js | 296 | Journal et déclaration des pertes |
| assets/stock/counts.js | 920 | Historique, revue, approbation et inventaire physique |
| assets/stock/purchasing.js | 741 | Fournisseurs, commandes et réapprovisionnement |
| assets/stock/intake.js | 1 502 | PDF, rapprochement, Smart Intake, dépôt comptable et archives |
| assets/stock/catalog.js | 1 221 | Articles, nutrition, mouvements et catégories |

La projection de consommation des recettes reste dans le noyau : les recettes,
le briefing et les autres consommateurs doivent pouvoir lire le stock dès le
chargement, sans attendre une page. Le corps de `cancelWasteMovement` reste
inchangé dans le noyau pour laisser fusionner la conversion concurrente de
`confirm` vers `Kiwi.modal`.

## Chargement et état partagé

Aucune modification de dashboard.html : toujours 161 balises script externes,
pin `scripts` de 159 et marge de 3, donc plafond 162 inchangé.
Le noyau conserve son IIFE stricte et inscrit les handlers au même moment.
Le premier geste `nav-stock` ou `stock-*` charge les cinq parties, une fois
chacune, puis appelle le handler original avec le même `this` et les mêmes
arguments. Ce premier appel renvoie une promesse de chargement ; les suivants
retrouvent leur retour synchrone d'origine. Les gardes ajoutées ultérieurement
restent autour du handler et de son relais. Une partie en échec réseau est
retentée au prochain geste ; aucune écriture de stock ne précède le chargement.

**Seul espace interne ajouté : `window.KiwiStockInternal`.** Son unique méthode
`install(name, factory)` installe une partie privée dans le noyau. La factory
reçoit `S`, l'interface partagée de 89 liaisons nécessaires : getters pour les
fonctions et constantes stables, getters/setters pour les `let` du noyau.
Les parties capturent les fonctions et constantes ; seules les références aux
liaisons mutables deviennent `S.nom`. Ainsi une réaffectation d'array, de filtre,
de cache ou du verrou de revue reste visible de tous. Les fonctions de chaque
partie restent privées, sans nouveau global par fonction. Les factories ne
font que déclarer leurs fonctions, sans DOM, lecture tenant ou écriture au
chargement ; elles peuvent être installées dans n'importe quel ordre.

Les URLs littérales `assets/stock/*.js?v=1` sont découvertes par
`tools/stamps.js` et ses `referenceFiles`. Le bump d'une partie remonte au
chargeur puis à dashboard.html et au SW ; le test de cascade utilise un arbre
jetable. Le contrôle PWA impose aussi la présence des cinq URLs dans SHELL.
Conformément aux règles de cette vague, aucun stamp, manifeste ni kiwi-sw.js
n'est modifié ici. À l'intégration : ajouter les cinq URLs au précache, puis
estampiller les parties et stock.js ensemble.

## Preuve et vérification

`node tools/stock-split-test.mjs` reconstruit les 8 188 lignes originales depuis
les **sources de production actuelles**, vérifie leur égalité octet par octet
avec une référence gzip et son SHA-256, et vérifie chacun des 138 déplacements.
111 corps restent identiques ; les 27 autres changent uniquement la qualification
des références mutables (les offsets et substitutions sont archivés).
La référence n'est jamais exécutée à la place des parties dans les anciens
bancs : `tools/stock-test-source.cjs` reconstruit leur source depuis les fichiers
livrés. Les assertions métier existantes restent inchangées. Une restauration
temporaire de l'ancien stock.js fait échouer la nouvelle preuve ; le fichier
séparé la fait passer.

Le nouveau banc exécute aussi le vrai noyau et les vraies parties dans une VM :
démarrage démo/réel, inscriptions, pont recettes avant tout téléchargement,
rendus identiques, verrou partagé, appels simultanés, ordre d'installation
inversé, retour synchrone après chargement, échec réseau, reprise et conservation
d'une garde externe. La VM n'est pas une preuve de rendu navigateur.

Tous les 38 bancs non navigateur stock/inventory/intake/recipe passent, ainsi
que les 12 autres bancs directement liés exécutés. Les 18 propriétés monétaires
strictes passent sans skip. La preuve du split et le ratchet passent également.
Le banc de stamps étendu passe ses 74 contrôles. Aucun ajout à tools/check.js.

`retail-return-stock-browser-test.mjs` échoue avant toute navigation : le sandbox
interdit `listen 127.0.0.1` (EPERM). Même échec reproduit depuis les fichiers
intacts de HEAD dans un arbre temporaire. Une seule suite navigateur lancée
à la fois. Le contrôle PWA ne rapporte que les cinq entrées précache différées
à l'intégration. Aucun déploiement ni accès production.

## Limite de livraison du sandbox

Le staging a été tenté avec des chemins explicites. Le sandbox refuse la
création du `index.lock` dans le gitdir du worktree, situé hors des racines
inscriptibles. Aucun fichier n'a été stagé, aucun commit ni push n'a été fait.
Le commit demandé avec `KIWI_SKIP_STAMP_HOOK=1` et le footer
`Co-Authored-By: GPT (Codex) <noreply@openai.com>` reste à effectuer dans
un contexte autorisant l'écriture des métadonnées Git.
