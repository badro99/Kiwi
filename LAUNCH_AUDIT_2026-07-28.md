# Kiwi — audit avant lancement, 28 juillet 2026

Audit complet mené contre `LAUNCH_AUDIT_PROMPT.md`, avec correction dans la
foulée. Trois commits : `885ccaf`, `b8b2044`, `c21777b`.

**Verdict : GO**, avec deux réserves nommées plus bas — aucune bloquante.

Rien de ce qui a été trouvé ne corrompt un chiffre au comptoir, ne fuit de
données entre commerçants, ni ne casse un parcours principal. Le défaut le plus
sérieux — les milliers affichés à l'envers en arabe — mettait un mauvais nombre
sous les yeux du commerçant sans rien casser d'autre ; il est corrigé et sous
garde. La garde de sortie, elle, était rouge au début de l'audit pour deux
raisons qui n'avaient rien à voir avec le produit.

---

## Corrigé

### P1 · En arabe, « 31 500 MAD » s'affichait « MAD 500 31 »
`assets/rtl-numbers.js` (nouveau) · commit `b8b2044`

L'espace ordinaire est neutre pour l'algorithme bidirectionnel d'Unicode :
entre deux nombres dans un paragraphe de droite à gauche, elle prend la
direction du paragraphe et coupe « 31 500 » en deux nombres que le moteur
repose ensuite à l'envers. **Vingt et un nombres touchés sur le seul écran
d'accueil**, dont l'objectif du jour et le cumulé.

Les nombres passés par `toLocaleString('fr-FR')` étaient déjà justes — il émet
une insécable. Seuls les nombres composés à la main étaient cassés, et ils
viennent de deux endroits à la fois (littéraux figés dans le HTML, formateurs
appelés à chaque rendu), d'où une correction à l'exécution plutôt que des
centaines d'éditions dans quarante fichiers.

Le séparateur a été choisi en mesurant, pas en supposant :

| Séparateur | Ordre correct | Largeur à la fonte du chiffre héros |
|---|---|---|
| U+0020 espace ordinaire | ✗ | 4,12 px |
| U+2009 espace fine | ✗ | — |
| **U+00A0 insécable** | **✓** | **4,12 px** |
| U+202F fine insécable | ✓ | 1,94 px |

U+202F est la convention de `toLocaleString`, mais l'adopter aurait corrigé
l'ordre en rétrécissant de moitié la respiration de chaque nombre. U+00A0
corrige l'ordre sans déplacer un pixel.

Hors arabe le module ne touche rien : vérifié, le français garde son espace
ordinaire là où l'arabe reçoit l'insécable. Garde :
`tools/rtl-numbers-test.js`, 22 contrôles — autant sur ce qui doit changer que
sur ce qui ne doit pas (plage de codes `0002 0015`, dates, téléphones).

### P2 · Le menu mobile jetait trois erreurs à chaque fermeture
`assets/ux.js`, `assets/interactive.js`, `assets/mobile-nav.js` · commit `c21777b`

`mobile-nav.js` fermait les surfaces ouvertes en envoyant un Escape sur
`document`, dont la cible n'est pas un élément et n'a donc pas de `.matches()`.
Trois écouteurs clavier l'appelaient sans vérifier — dont une ligne d'`ux.js`
qui s'exécute à **chaque touche** du tableau de bord. Corrigé des deux côtés :
l'événement part de `document.body`, et les trois écouteurs testent le type,
comme `onboarding.js` et `team.js` le faisaient déjà.

### P2 · La croix « Masquer » était intouchable au doigt
`assets/oppo-cards.js` · commit `c21777b`

25 px, et pleine opacité seulement au survol — or il n'y a pas de survol sur un
écran tactile. Le pouce manquait la croix et ouvrait la carte, c'est-à-dire
exactement la fonction qu'on voulait écarter. Sur pointeur grossier : pleinement
visible, zone sensible portée à 45 px par un pseudo-élément débordant, dessin
inchangé.

### La garde de sortie était rouge, et pour de mauvaises raisons
`tools/check.js`, `tools/agent-test.js`, `tools/pos-reprint-test.js` · commit `885ccaf`

1. **Deux suites dépendaient de l'heure.** Elles écrivaient leurs ventes « il y
   a trois heures » ; passé minuit, ces ventes tombent la veille et le code
   testé a raison de ne pas les compter. Ancrées à midi du jour courant —
   vérifié vert de Midway à Kiritimati, dont 00 h 21 à Paris qui échouait.
2. **La garde auditait des copies de synchronisation.** iCloud dépose
   « dashboard 2.html », « CLAUDE 2.md » et vingt-sept autres à côté des vrais.
   Jamais suivis par git, donc jamais déployés — mais lus quand même : la clé
   i18n manquante signalée depuis des jours n'existait plus que dans une copie
   d'il y a trois semaines. La garde n'audite plus que ce qui part en ligne :
   **23 pages au lieu de 42**, parité i18n verte sans toucher à une traduction.

---

## Vérifié sain

- **Assistant** — `KiwiAgentEval()` : 183/183, 100 %. Garde `agent-test.js` :
  55 contrôles (routage ×3 langues, arithmétique, expurgation, isolation,
  permissions).
- **Chiffres** — aucun `NaN`, `undefined`, `[object Object]` sur les cinq
  périodes ni sur les quinze destinations du menu. Les cinq périodes rendent des
  totaux distincts et cohérents.
- **Navigation** — les quinze destinations rendent du contenu réel, zéro erreur
  console.
- **i18n** — FR/EN/AR, zéro clé brute affichée, RTL correct.
- **Sécurité** — aucun secret dans la source ; le chemin des commandes externes
  (Shopify, canaux) échappe chaque champ venant de l'extérieur, et les deux
  points d'entrée bornent la quantité côté serveur.
- **Marque** — zéro emoji dans la source livrée ; les trois seules italiques
  restantes sont les exceptions documentées (glaçage `.bl-script`, imitation de
  manchette `.plogo.telquel`, marque propre `kandisky`).
- **Mobile** — aucun débordement horizontal à 375 px ; la barre de périodes
  défile dans son propre conteneur, comme prévu.
- **Mode sombre** — confirmé volontairement réservé à Ultra
  (`i18n.js:1300`, programmatique uniquement).

---

## Réserves — connues, non corrigées, non bloquantes

**1 · Deux fuites de français dans le sélecteur d'établissement en arabe.**
Le type (« Restaurant ») n'est pas traduit, et la sous-ligne « 2 autres
emplacements » ne se rafraîchit qu'au re-rendu de l'en-tête, pas au changement
de langue. La traduction arabe existe déjà et s'affiche correctement après
navigation. Non corrigé volontairement : `typeLabel` est figé dans le modèle
d'établissement en cinq endroits, et remanier ce modèle sans vérification
complète, la veille d'un lancement, est un risque plus grand que le défaut.

**2 · `assets/orderpro-inbox.js:210` interpole `l.qty` sans échappement.**
Non exploitable aujourd'hui : les deux seuls chemins d'écriture bornent la
quantité côté serveur (`functions/api/channel/order.js:141` et
`functions/api/channel/shopify/[link].js:100`). C'est un durcissement à faire,
pas une faille ouverte — laissé de côté parce que le fichier était en cours de
modification par une autre session pendant l'audit.

---

## Ce qui n'a pas pu être vérifié

- **Le repli LLM (Qwen3-4B / WebLLM)** — non téléchargé ; la porte WebGPU et le
  modèle épinglé ont été lus dans la source, pas exercés.
- **Un vrai compte commerçant** — l'isolation entre locataires repose ici sur
  les gardes existantes (`agent-test`, `stock-lookup-test`, `channel-order-test`,
  toutes vertes) et sur `LAUNCH_FIXES.md` F0–F8, pas sur une connexion réelle :
  créer un compte ou saisir un identifiant sort de ce qu'un agent doit faire.
- **`@media (pointer: coarse)`** — non émulable en redimensionnant l'onglet ;
  vérifié dans le CSSOM et par la géométrie (25 + 2 × 10 = 45 px).
- **Le mode fusion Ultra** — la classe posée à la main sans la palette
  d'établissement donne un état mi-clair mi-sombre qui n'existe pas dans le vrai
  parcours ; non retenu comme défaut faute d'avoir pu le reproduire autrement.

---

## Dette laissée en place

`background: var(--ink)` : 55 occurrences dans 12 fichiers, rattrapées à
l'exécution. Signalée par la garde comme avertissement depuis longtemps, connue,
et hors périmètre d'un audit d'avant-lancement — mais elle ne diminue pas toute
seule.

---

Vingt-neuf doubles de synchronisation (« … 2.html », « … 2.md ») traînent à la
racine. Ils ne partent pas en ligne, et la garde les ignore désormais. Pour les
supprimer :

```bash
cd /Users/zaka/Desktop/kiwi && rm -f *\ [0-9].html *\ [0-9].md
```
