# Nutrition et allergènes de la carte

Kiwi calcule les valeurs par portion à partir des ingrédients et des portions de la fiche recette. Chaque quantité est convertie en grammes, puis les valeurs pour 100 g sont additionnées et divisées par le nombre de portions. Les calories sont arrondies à l’unité ; protéines, glucides, lipides, sucres et sel à 0,1 g. Les allergènes publiés sont l’union des clés EU-14 explicitement confirmées sur chaque article de stock.

La publication échoue silencieusement pour un plat dès qu’un ingrédient actif n’a pas les six valeurs nutritionnelles, une conversion en grammes résoluble ou une liste d’allergènes confirmée. Dans ce cas, aucune valeur partielle ni ancienne valeur n’est envoyée au client. Le commerçant peut aussi masquer un plat et l’opérateur peut couper la fonctionnalité pour tout l’établissement.

Les options et modificateurs choisis par le client sont exclus du calcul. La carte l’indique par « Valeurs indicatives par portion, hors options ».

Le référentiel embarqué `assets/data/ciqual-lite.json` est un extrait reproductible de la table Ciqual 2025 de l’Anses, complété avec les noms anglais de la publication 2020. Source : Anses, *Table de composition nutritionnelle des aliments Ciqual 2025*, DOI `10.57745/RDMHWY`. Réutilisation sous Licence Ouverte / Etalab 2.0. Le script `tools/build-ciqual-lite.py` documente les fichiers sources, leurs empreintes et la transformation déterministe.
