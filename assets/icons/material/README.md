# Material Symbols — le jeu d'icônes de Kiwi

**La règle : toute icône d'interface vient d'ici.** On ne dessine plus de
`<path>` à la main. Les icônes maison qui vivaient dans `assets/trades.js` et
ailleurs étaient approximatives — épaisseurs de trait incohérentes, formes qui
se lisent mal à 23 px, un fleuriste qu'on prenait pour un arbre. Google Material
Symbols est dessiné sur une grille de 24, optiquement corrigé à petite taille,
et couvre déjà tous les métiers qu'on vend.

Source : [google/material-design-icons](https://github.com/google/material-design-icons)
· style **Outlined**, poids 400, grade 0, taille optique 24
· licence **Apache 2.0** (voir `LICENSE` dans ce dossier).

Le dépôt Google complet pèse environ 1 Go (chaque icône × 4 styles × densités
PNG). On n'en veut pas dans un site servi en statique par GitHub Pages : on
range ici **les fichiers qu'on utilise réellement**, aux octets près tels que
Google les publie, et le dossier grossit à la demande.

## Ajouter une icône

Trouvez son nom sur [fonts.google.com/icons](https://fonts.google.com/icons),
puis :

```bash
n=local_laundry_service   # le nom exact, en snake_case
curl -sL -o "assets/icons/material/$n.svg" \
  "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/$n/default/24px.svg"
```

Un `404` veut dire que le nom n'existe pas dans le style Outlined — vérifiez
l'orthographe sur le site avant de chercher un contournement. (`food_truck`,
par exemple, n'existe pas : le food truck utilise `local_shipping`.)

### Variantes (graisse, taille optique) et sprites : direction 2027, §8

Les mêmes fichiers servent aussi la direction 2027. Une variante se range sous
`<nom>.<style>.<taille>.svg` (`style` : `default` ou `wght500` ; `taille` : la
taille optique `20`, `24` ou `40`), récupérée au même chemin gstatic que
ci-dessus, avec ce style et cette taille à la place de `default/24px` :

```bash
n=error                                   # error.wght500.40.svg : le KDS à 32 px
curl -sL -o "assets/icons/material/$n.wght500.40.svg" \
  "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/$n/wght500/40px.svg"
```

Un `404` s'applique à chaque variante : l'icône retombe alors sur `default` 24
(l'état que `tools/icon-vendored-test.mjs` accepte). Le fichier `<nom>.svg` reste
le nom de `default` en 24, et une variante n'existe jamais sans lui.

`tools/build-icon-sprite.js` écrit `sprite.<surface>.svg`, un `<symbol>` par
icône que la surface utilise (la liste est `tools/icon-sprites.json`, complétée
par les `<k-icon name="…">` littéraux du dossier `assets/kit/`). Chaque symbole
garde le `viewBox="0 -960 960 960"` de Material et le tracé du fichier, octet
pour octet ; l'élément qui le référence est
`<svg width="1em" height="1em" aria-hidden="true"><use href="…#nom" width="100%" height="100%"/></svg>`
et **ne porte aucun `viewBox` à lui** (sinon le glyphe se peint hors du cadre et
l'icône est une case vide : `tools/icon-render-test.mjs` le tient). Les sprites
et les variantes ne sont **pas** des icônes pour `build-material-icons.mjs` : il
ne lit que les `<nom>.svg` simples.

## L'utiliser dans le code

Ces SVG ont un `viewBox="0 -960 960 960"` et une forme **pleine** — pas de
tracé. C'est le format natif de Material Symbols ; ne le convertissez pas.
Le consommateur pose `fill="currentColor"` et laisse la CSS piloter `color`,
exactement comme avant.

### Dans une page : `assets/material-icons.js`

Les pages (caisse, serveur, tableau de bord, commande QR) chargent
`assets/material-icons.js`, **généré** depuis ce dossier par
`node tools/build-material-icons.mjs` : il embarque chaque SVG d'ici et dessine

```html
<i data-icon="print"></i>              <!-- nom Material, pour tout nouveau code -->
```

ou, dans une chaîne de gabarit, `KiwiIcon.svg('print', 18)`. Les anciens
`<i data-lucide="printer">` marchent encore à travers la table
`tools/material-icon-aliases.json`, mais **on n'en ajoute plus** :
`tools/material-icons-test.mjs` (dans `check.js`) refuse tout fichier qui en
gagne un. Après avoir ajouté un fichier ici, relancez le générateur ; un nom
inconnu dessine le « ? » et s'inscrit dans `KiwiIcon.missing`. Le plan de
migration est dans `docs/audits/2026-10-12-icon-migration.md`.

`assets/trades.js` est volontairement sans dépendance (il est chargé par des
pages qui n'ont rien d'autre), alors il recopie les `d="…"` en dur et nomme le
fichier source en commentaire. Partout ailleurs, préférez lire le SVG tel quel.

Les trois listes-parachutes qui doublent `trades.js` — dans `onboarding.js`,
`interactive.js` et `hotel.js` — recopient les mêmes tracés. Elles ne servent
qu'aux pages qui chargeraient ces fichiers sans `trades.js` ; si vous changez
l'icône d'un métier, changez-la dans les quatre, sinon le parachute réintroduit
l'ancien dessin le jour où il s'ouvre.

**Ne retouchez jamais le `d` d'un fichier de ce dossier.** S'il ne convient
pas, c'est qu'il faut une autre icône, pas une icône modifiée : un fichier
divergent ici casse la seule garantie que ce dossier apporte, celle d'être
Material Symbols et rien d'autre.
