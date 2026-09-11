# Compte démo pour la revue App Store / Google Play

Le compte `demo-review@kiwi-os.com` (établissement **Kiwi Démo**, restaurant, Pro)
se crée par le formulaire d'inscription de kiwi-os.com, jamais à la main dans D1.
Le mot de passe ne s'écrit nulle part ailleurs que dans *Sign-In Information*
(App Store Connect) et *App access* (Play Console).

Une fois le compte ouvert, le contenu ci-dessous le remplit en une dizaine de
minutes depuis le tableau de bord.

## 1. La carte · `carte-kiwi-demo.csv`

Menu → Importer → déposer `carte-kiwi-demo.csv` (vingt articles, cinq catégories,
prix en MAD). Le fichier suit le modèle `modele-import-carte.csv` du dashboard.

## 2. La formule

Menu → Formules → nouvelle formule **Menu du jour · 75 MAD** :
- Entrée au choix : Harira, Salade marocaine, Zaalouk
- Plat au choix : Tajine de poulet aux olives, Tajine de kefta
- Dessert au choix : Cornes de gazelle, Salade d'oranges à la cannelle
- Supplément : Brochettes de boeuf +15 MAD

## 3. Deux recettes complètes (la nutrition s'affiche sur la fiche)

Stock → articles, puis Menu → article → Recette. Les ingrédients existent tous
dans la table Ciqual allégée (recherche par nom, clic « Utiliser cette valeur »
pour la portion).

**Tajine de poulet aux olives** (une portion)
| Ingrédient | Quantité |
|---|---|
| Poulet, cuisse, viande et peau, crue | 250 g |
| Olive verte | 40 g |
| Citron | 30 g |
| Oignon | 80 g |
| Huile d'olive vierge extra | 15 g |
| Gingembre | 3 g |
| Coriandre | 5 g |

**Harira** (une portion)
| Ingrédient | Quantité |
|---|---|
| Tomate ronde, crue | 150 g |
| Lentille | 40 g |
| Pois chiche, sec | 30 g |
| Oignon | 40 g |
| Céleri | 20 g |
| Farine de blé | 10 g |
| Huile d'olive vierge extra | 8 g |
| Coriandre | 5 g |

Allergènes à cocher : gluten (Harira, farine). Tout le reste se calcule.

## 4. Trois employés

Équipe → Salariés :
| Nom | Rôle |
|---|---|
| Yasmine Alaoui | Manager |
| Omar Benjelloun | Serveur |
| Salma Idrissi | Caissière |

Les codes à quatre chiffres se choisissent au moment de la saisie et ne se
notent nulle part (ni ici, ni dans les notes de revue : la revue teste avec le
compte propriétaire, pas avec un code salarié).

## 5. Ce qu'il ne faut PAS faire

- **Ne rien appairer d'avance.** La revue doit faire Tableau de bord → code
  d'appairage → Caisse sur le même appareil ; c'est ce que décrivent les notes
  de revue (`APP_STORE.md` §5).
- Ne pas activer le Live Link sur un vrai terminal.
- Marquer le compte `demo` dans la console opérateur pour qu'il n'entre jamais
  dans les chiffres clients.
