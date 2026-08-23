# Kiwi Guides · mode d’emploi du template

Le fichier `article.html` est la galerie `noindex` des modules éditoriaux. Ce n’est
plus un fichier à copier : les pages publiées sont produites depuis le manifeste et
les fragments de contenu, puis vérifiées octet par octet avant livraison.

Le cadre visuel réemploie directement le monde de la landing : mêmes posters paysage
et portrait, navigation 104/64 px, surfaces de verre sombres et scènes produit
bordées. Ne chargez pas le GLB et ne produisez pas de recadrage 3D propre à un
article. Le pied de page doit rester identique à celui de la
landing : navigation, contact, badge Kiwi, crédit Tamminen et grand wordmark compris.
Ne remplacez pas ce cadre par une skin de blog claire dans un article individuel.

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
6. Mettre à jour les trois fragments du hub et le rail de la landing avec le nouveau
   guide. Ne jamais modifier à la main les `*/guides/**/index.html` générés ni les
   lignes guides de `sitemap.xml`.
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

Le style partagé vit dans `assets/articles/article.css` et le rehaussement progressif
dans `assets/articles/article.js`. Les articles publiés ne doivent pas recopier ces
deux fichiers. Toute modification de l’un de ces assets doit incrémenter son `?v=`
dans le patron et dans chaque article publié afin de casser le cache des deux hébergeurs.
