# Kiwi Guides · mode d’emploi du template

Le fichier `article.html` est le patron source des guides Kiwi. Il est volontairement
`noindex` et montre tous les modules éditoriaux disponibles. Pour publier :

Le cadre visuel réemploie directement le monde de la landing : posters paysage et
portrait, navigation 104/64 px, surfaces de verre sombres et scènes produit bordées.
Ne remplacez pas ce cadre par une skin de blog claire dans un article individuel.

1. Copier `docs/templates/article.html` vers `/<lang>/guides/<slug>/index.html`.
2. Remplacer le titre, la description, le canonical, les alternates, les dates, la
   section, l’image et toutes les valeurs du JSON-LD.
3. Réécrire le contenu visible. Supprimer les modules inutiles plutôt que de les
   remplir artificiellement.
4. Produire une couverture unique en 1200 × 630, idéalement PNG ou WebP. Le SVG
   `guide-cover-template.svg` est un repère de composition, pas une image commune à
   tous les articles.
5. Vérifier chaque chiffre et chaque affirmation réglementaire avec une source
   primaire. Le texte doit distinguer clairement mesure, exemple et estimation.
6. Remplacer les trois cartes liées par des pages réellement publiées et proches du
   sujet. Aucun lien factice.
7. Retirer `noindex, nofollow` seulement après relecture, puis ajouter la page et ses
   alternates au sitemap.
8. Valider au clavier, à 320 px, en RTL, sans JavaScript, avec mouvement réduit, dans
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
- Figure ou capture produit avec légende sourcée
- Citation de principe ou citation attribuée
- Tableau de comparaison défilant sur mobile
- Checklist opérationnelle
- CTA contextuel
- FAQ native avec `details`
- Trois guides liés

Le style partagé vit dans `assets/articles/article.css` et le rehaussement progressif
dans `assets/articles/article.js`. Les articles publiés ne doivent pas recopier ces
deux fichiers. Toute modification de l’un de ces assets doit incrémenter son `?v=`
dans le patron et dans chaque article publié afin de casser le cache des deux hébergeurs.
