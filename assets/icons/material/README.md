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

## L'utiliser dans le code

Ces SVG ont un `viewBox="0 -960 960 960"` et une forme **pleine** — pas de
tracé. C'est le format natif de Material Symbols ; ne le convertissez pas.
Le consommateur pose `fill="currentColor"` et laisse la CSS piloter `color`,
exactement comme avant.

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
