# Kiwi Guides · mode d’emploi du template

Le fichier `article.html` est la galerie `noindex` des modules éditoriaux. Ce n’est
plus un fichier à copier : les pages publiées sont produites depuis le manifeste et
les fragments de contenu, puis vérifiées octet par octet avant livraison.

**Le cadre visuel est clair depuis le 11 octobre 2026** (décision du propriétaire).
Les guides sont un centre de ressources, pas une page produit : le fond noir plein
écran et le poster photographique les faisaient lire comme une démo. La palette est
celle de l'identité Kiwi, en clair : `--paper` porte la page, `--surface` les cartes,
`--paper-soft` les sections alternées, `--atlas` les liens et les états actifs, et
`--mint` reste un rehaut qui ne couvre jamais plus d'environ 5 % d'un écran. Pas de
verre, pas de `backdrop-filter`, pas de dégradé derrière le texte du hero.

Ce qui est conservé de la landing : la géométrie de navigation (104 / 64 px), la
colonne de lecture de 720 px, et le pied de page, qui reste **identique** à celui de
la landing (navigation, contact, badge Kiwi, crédit Tamminen et grand wordmark
compris) et donc **sombre**. Le pied de page et l'unique bloc de conversion sont les
seules surfaces foncées autorisées. Ne chargez pas le GLB et ne produisez pas de
recadrage 3D propre à un article.

N'inversez pas cette décision dans un article isolé : la skin est partagée par la
bibliothèque et les vingt-et-une éditions, et `tools/article-template-test.mjs`
échoue si le noir plein écran ou le verre réapparaissent.

1. Ajouter le sujet, ses trois routes et ses métadonnées FR/EN/AR dans
   `content/guides/manifest.mjs`.
2. Écrire uniquement le `<main id="article">…</main>` de chaque édition dans
   `content/guides/pages/<id>/{fr,en,ar}.html`. Partir des modules visibles dans
   `docs/templates/article.html` et supprimer les modules inutiles.
3. Produire une couverture unique en 1200 × 630 pour chaque langue. Le SVG
   `guide-cover-template.svg` est un repère de composition, pas une image commune à
   tous les articles.
4. Vérifier chaque chiffre et chaque affirmation réglementaire avec une source
   primaire. Le texte doit distinguer clairement mesure, exemple et estimation.
5. Remplacer les trois cartes liées par des pages réellement publiées et proches du
   sujet. Aucun lien factice.
6. Déclarer le nouveau guide dans les tables de la bibliothèque, en bas de
   `content/guides/manifest.mjs` : `TOPIC_CATEGORY` (une catégorie), `TOPIC_GOALS`
   (au moins un objectif), `TOPIC_CARDS` (un résumé de carte par langue), puis, si
   le sujet le mérite, `FEATURED` et `PATHS`. La construction échoue tant qu'une de
   ces entrées manque, donc un guide ne peut pas être publié sans sa carte.
   **Les trois fragments du hub n'ont plus à être modifiés** : les cartes, les
   filtres, les mises en avant et les parcours sont générés depuis le manifeste, et
   le nombre de guides affiché dans l'en-tête est compté, pas écrit. Les fragments du
   hub ne gardent que leur hero, leur méthode éditoriale et les deux jetons
   `<!--GUIDES_FACTS-->` et `<!--GUIDES_LIBRARY-->`. Ne jamais modifier à la main les
   `*/guides/**/index.html` générés ni les lignes guides de `sitemap.xml`.
   Le temps de lecture n'est pas saisi : il est mesuré sur le fragment publié, donc
   la carte et la signature de l'article affichent forcément le même chiffre.
7. Lancer `node tools/build-guides.mjs`, puis
   `node tools/build-guides.mjs --check`. Le générateur écrit le head, le header, le
   footer exact de chaque landing, le JSON-LD, les alternates réciproques et les
   lignes sitemap à partir d’une seule définition.
8. Lancer `node tools/article-template-test.mjs`, puis valider au clavier, à 320 px,
   en RTL, sans JavaScript, avec mouvement réduit, dans
   Rich Results Test et dans l’inspection d’URL Search Console.

## Principes éditoriaux

- Un guide répond à une décision de commerçant, pas à une longueur de mot-clé.
- L’expertise Kiwi doit être visible : écrans réels, procédures testées, mesures et
  exemples marocains.
- Le français, l’anglais et l’arabe sont des éditions locales. Une traduction non
  relue ne doit pas être publiée ni déclarée dans `hreflang`.
- Une seule conversion principale par article. Le CTA doit prolonger la question du
  guide, jamais interrompre chaque section.
- Le contenu reste complet sans JavaScript. Le script n’ajoute que la progression
  de lecture et l’état actif du sommaire.

## Composants disponibles

- Résumé « L’essentiel en 30 secondes »
- Figure, flux opérationnel ou capture produit avec légende sourcée
- Citation de principe ou citation attribuée
- Tableau de comparaison défilant sur mobile
- Checklist opérationnelle
- CTA contextuel
- FAQ native avec `details`
- Trois guides liés, chacun avec une scène visuelle propre au sujet

Le style partagé vit dans `assets/articles/article.css`, le rehaussement progressif
dans `assets/articles/article.js`, et la recherche, les filtres et le tri de la
bibliothèque dans `assets/articles/guides-library.js`, chargé uniquement sur
`/{fr,en,ar}/guides/`. Les commandes de la bibliothèque sont masquées par le CSS
jusqu'à ce que ce script ajoute `.js-library` : sans JavaScript, la grille complète
reste servie et indexable, et aucun bouton mort n'est affiché. Les articles publiés ne doivent pas recopier ces
deux fichiers. Toute modification de l’un de ces assets doit incrémenter son `?v=`
dans le patron et dans chaque article publié afin de casser le cache des deux hébergeurs.
