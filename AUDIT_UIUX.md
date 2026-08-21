# Kiwi POS · Grand Audit UI/UX & Sweep d'Amélioration Premium

Ce document consigne l'ensemble des audits visuels, ergonomiques, d'accessibilité et de mouvement menés sur l'ensemble des surfaces du produit Kiwi POS, ainsi que chaque amélioration déployée en production.

---

## 🎯 Principes Directeurs
- **Retenue & Précision** : Stripe pour la rigueur des hiérarchies, Linear pour la discipline des transitions, Apple pour la vérité des matériaux.
- **Identité Atlas Green** : Palette marocaine chaleureuse (`--atlas #0B6E4F`, `--riad #053B2C`, `--mint #7DF2B0`, `--paper #F7F5F0`, `--ink #0A0F0D`).
- **Typographie Romaine** : Jamais d'italique ; hiérarchie portée par `Instrument Serif` (accent éditorial), `Inter Tight` (interface), `JetBrains Mono` / `tabular-nums` (montants & codes), `IBM Plex Sans Arabic` (arabe).
- **Mouvement Fonctionnel** : Ressort maison `cubic-bezier(0.34, 1.45, 0.5, 1)` ~310ms pour la sélection, `--glide` / `--expo` pour les surfaces. Respect strict de `prefers-reduced-motion`.
- **Zéro Régression** : Suite `node tools/check.js` 100 % verte avant chaque commit.

---

## 📋 Registre des Passes & Surfaces Déployées

### Tier 1 · Le Tableau de Bord (`dashboard.html`)
| Surface / Écran | Fichier(s) | Problèmes identifiés | Améliorations apportées | État |
| :--- | :--- | :--- | :--- | :--- |
| **Accueil & Topbar** | `dashboard.html` | Absence de feedback tactile à l'enfoncement, focus outlines par défaut | Échelle 0.97 sur bouton cliqué (`:active`), focus-visible `2px solid var(--atlas)`, suppression de tout résidu italique | ✅ Déployé |
| **Pills de Période** | `dashboard.html` | Transition raide des pilules de date | Ressort `var(--spring)` sur transition active, focus visible net | ✅ Déployé |
| **Page Paramètres Dédiée** | `assets/interactive.js` | Ancien tiroir latéral trop étroit | Déploiement de la page plein écran `appPage('settings')` avec 4 fiches de gestion haut de gamme | ✅ Déployé |
| **Sous-pages & GenPage** | `assets/genpage.css` | Manque d'harmonisation des micro-interactions sur les 13 destinations | Règle globale `.dash-genpage` avec retour tactile et focus AA | ✅ Déployé |
| **Profil Marchand (My Kiwi)** | `assets/account.js` | Boutons d'action sans retour d'impulsion | Affordance `:active` sur `.acc-cta`, `.acc-add-biz`, `.acc-topic` | ✅ Déployé |
| **Tiroirs & Tiroir Vide** | `assets/pages.js` | Écrans vides en simple texte brut | Ajout d'un médaillon icône, d'un titre et d'un message soigné | ✅ Déployé |
| **Cartes & KDS (Pages Pro)** | `assets/pages-pro.css` | Retours haptiques visuels manquants | Feedback tactile sur `.p-tab`, `.stock-card`, `.menu-pill-cat` | ✅ Déployé |

### Tier 2 · Les 14 Verticaux Métiers (`assets/pos-dispatch.js` & `pos-workspaces.css`)
| Surface / Écran | Fichier(s) | Problèmes identifiés | Améliorations apportées | État |
| :--- | :--- | :--- | :--- | :--- |
| **Espaces Métiers Partagés** | `assets/pos-workspaces.css` | Onglets et touches d'ajout sans rebond | Micro-interactions `:active` à échelle 0.97 et focus-visible sur tous les formulaires | ✅ Déployé |

### Tier 3 · La Caisse Tactile (`kiwi-caisse.html`)
| Surface / Écran | Fichier(s) | Problèmes identifiés | Améliorations apportées | État |
| :--- | :--- | :--- | :--- | :--- |
| **Articles du Catalogue** | `kiwi-caisse.html` | Absence d'impulsion à l'ajout panier | Animation active `transform: scale(0.97)` à ressort 70ms | ✅ Déployé |
| **Touches d'Encaissement** | `kiwi-caisse.html` | Retour tactile statique sur `.pay-btn` | Effet ressort `scale(0.97)` sur les boutons d'encaissement (Carte, Espèces, QR) | ✅ Déployé |
| **Modales de Caisse** | `kiwi-caisse.html` | Touches d'actions des modales sans ressort | Feedback `.ma-btn:active` et focus-visible emerald | ✅ Déployé |

### Tier 4 · Le Service en Salle (`kiwi-serveur.html`)
| Surface / Écran | Fichier(s) | Problèmes identifiés | Améliorations apportées | État |
| :--- | :--- | :--- | :--- | :--- |
| **Barre de Navigation Flottante** | `kiwi-serveur.html` | Boutons de navigation (`.bt-btn`) sans impulsion tactile | Ressort `scale(0.92)` à l'enfoncement, focus ring discret | ✅ Déployé |
| **Cartes de Table & Actions** | `kiwi-serveur.html` | Clarté de sélection et retour tactile | Animation tactile fluide et contraste élevé en vue sombre | ✅ Déployé |

---

## 🚀 Passe 2 · Approfondissement par Surface

### 1. Dashboard Accueil (`dashboard.html`, `assets/dateRange.js`)
- **Fichiers** : `assets/dateRange.js:3217`, `assets/dateRange.js:3985`, `dashboard.html:1290`
- **Problèmes identifiés** :
  1. Utilisation de la police non standard `JetBrains Mono` dans l'étiquette de tooltip graphique au lieu de `Inter Tight` / tabular-nums.
  2. État vide du flux de commandes en direct sans médaillon visuel Material Symbols ni hiérarchie de titrage.
- **Améliorations apportées** :
  1. Normalisation typographique de l'infobulle graphique sur `Inter Tight` (600, tracking 0.1em).
  2. Refonte complète de l'état vide `renderFeed()` avec médaillon Material Symbol (`inventory_2`), badge de service live et typographie soignée.
  3. Bumping du timbre de cache `assets/dateRange.js?v=12`.
- **État** : ✅ Déployé

### 2. Commandes / Transactions Drawer (`assets/pages.js`)
- **Fichiers** : `assets/pages.js:105`, `assets/pages.js:870`
- **Problèmes identifiés** :
  1. État vide de `realTransactions` sans médaillon visuel Material Symbols ni bouton d'action clair.
  2. Absence de retour tactile `:active` sur les lignes de tableau `.p-table` et contraste de l'en-tête en thème sombre.
- **Améliorations apportées** :
  1. Refonte de l'état vide `realTransactions` avec médaillon Material Symbol (`inventory_2`), sous-titre explicatif et bouton CTA `data-action="new-sale"` relié à la caisse.
  2. Ajout du retour tactile `.p-table tbody tr:active { transform: scale(0.995); }` et harmonisation du fond d'en-tête de tableau en mode sombre.
- **État** : ✅ Déployé

### 3. Rapport Journalier (`assets/day-report-dash.js`)
- **Fichiers** : `assets/day-report-dash.js:208`, `assets/day-report-dash.js:698`
- **Problèmes identifiés** :
  1. Écran vide sans identité visuelle Material Symbols ni hiérarchie éditoriale.
  2. Absence de retour tactile sur les boutons de navigation et sélecteurs de date (`.kdr-btn`).
- **Améliorations apportées** :
  1. Refonte complète du bloc vide `kdr-empty` avec médaillon Material Symbol (`inventory_2`), titrage typographique romain et mise en valeur du bouton d'action de retour au dernier jour d'activité.
  2. Ajout des micro-interactions tactiles `.kdr-btn:active { transform: scale(0.97); }` et des focus rings de sélection.
  3. Bumping du timbre de cache `assets/day-report-dash.js?v=7`.
- **État** : ✅ Déployé

### 4. Équipe & Planning (`assets/team.js`)
- **Fichiers** : `assets/team.js:1528`, `assets/team.js:3175`
- **Problèmes identifiés** :
  1. États vides de la liste de filtrage d'équipe et de la section paie/planning sans médaillon Material Symbols.
  2. Absence de bouton CTA visible pour ajouter un membre en cas de filtre sans résultat.
- **Améliorations apportées** :
  1. Intégration de médaillons Material Symbol (`inventory_2`), structuration éditoriale et bouton d'action direct `data-action="nav-equipe"` dans les états vides.
  2. Bumping du timbre de cache `assets/team.js?v=279`.
- **État** : ✅ Déployé

### 5. Stock & Menu / Carte (`assets/stock.js`, `assets/restaurant-menu-workspace.js`)
- **Fichiers** : `assets/stock.js:1599`, `assets/stock.js:1915`, `assets/restaurant-menu-workspace.js:58`
- **Problèmes identifiés** :
  1. États vides du tableau d'articles de stock et de la section alertes sans médaillon Material Symbols.
  2. État vide du menu sans structuration visuelle Material Symbols.
- **Améliorations apportées** :
  1. Refonte des états vides de filtrage de stock avec médaillons Material Symbol (`inventory_2`) et badge de validation d'absence d'alerte.
  2. Enrichissement de l'état vide de création de menu avec médaillon et bouton d'action direct `rmw-cat-add`.
  3. Bumping des timbres de cache `assets/stock.js?v=18` et `assets/restaurant-menu-workspace.js?v=17`.
- **État** : ✅ Déployé

### 6. Réservations & Tables (`assets/pages-pro.js`)
- **Fichiers** : `assets/pages-pro.js:2844`, `assets/pages-pro.js:4815`
- **Problèmes identifiés** :
  1. Tableau des réservations sans état vide structuré en cas de journée sans réservation.
  2. Lisibilité du plan de salle et harmonisation des jetons de statut de table.
- **Améliorations apportées** :
  1. Intégration d'un état vide centré avec médaillon Material Symbol (`inventory_2`) et typographie romaine.
  2. Bumping du timbre de cache `assets/pages-pro.js?v=2077`.
- **État** : ✅ Déployé

### 7.1 Vertical Pressing (`assets/pressing-caisse.js`)
- **Fichiers** : `assets/pressing-caisse.js:2568`, `assets/pos-dispatch.js:57`
- **Problèmes identifiés** :
  1. Vue de retrait du pressing avec états vides en texte brut sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Refonte visuelle des états vides de recherche et de commandes prêtes avec médaillon Material Symbol (`inventory_2`) et hiérarchie typographique.
  2. Bumping de la révision `pressing-caisse.js?v=34` dans le dispatcher.
- **État** : ✅ Déployé

### 7.2 Vertical Boutique (`assets/pos-boutique.js`)
- **Fichiers** : `assets/pos-boutique.js:1684`, `assets/pos-boutique.js:2707`, `assets/pos-dispatch.js:58`
- **Problèmes identifiés** :
  1. Panier/ticket vide et onglet échanges & avoirs sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Harmonisation des états vides avec médaillon Material Symbol (`inventory_2`), titrage structuré et indication claire du geste de scan douchette.
  2. Bumping de la révision `pos-boutique.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.3 Vertical Spa & Bien-être (`assets/pos-spa.js`)
- **Fichiers** : `assets/pos-spa.js:971`, `assets/pos-dispatch.js:59`
- **Problèmes identifiés** :
  1. Ticket d'encaissement vide sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Refonte du conteneur vide de caisse avec médaillon Material Symbol (`inventory_2`), hiérarchie claire et indication pour charger une séance depuis le planning.
  2. Bumping de la révision `pos-spa.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.4 Vertical Hôtel & Riad (`assets/pos-hotel.js`)
- **Fichiers** : `assets/pos-hotel.js:464`, `assets/pos-hotel.js:817`, `assets/pos-dispatch.js:60`
- **Problèmes identifiés** :
  1. États vides des arrivées, départs et folios ouverts en texte brut sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Harmonisation visuelle des arrivées, départs et liste des folios avec médaillons Material Symbol (`inventory_2`) et hiérarchie typographique adaptée au front-desk.
  2. Bumping de la révision `pos-hotel.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.5 Vertical Fast-Food & Snack (`assets/pos-fastfood.js`)
- **Fichiers** : `assets/pos-fastfood.js:581`, `assets/pos-fastfood.js:1189`, `assets/pos-dispatch.js:61`
- **Problèmes identifiés** :
  1. Ticket vide et tableau de préparation KDS snack sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Harmonisation visuelle des états vides de commande et d'appel de numéros KDS avec médaillons Material Symbol (`inventory_2`) et hiérarchie soignée.
  2. Bumping de la révision `pos-fastfood.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.6 Vertical Boulangerie (`assets/pos-boulangerie.js`)
- **Fichiers** : `assets/pos-boulangerie.js:469`, `assets/pos-dispatch.js:62`
- **Problèmes identifiés** :
  1. Ticket d'encaissement rapide boulangerie sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Enrichissement du ticket vide de boulangerie avec médaillon Material Symbol (`inventory_2`) et hiérarchie visuelle rapide.
  2. Bumping de la révision `pos-boulangerie.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.7 Vertical Pizzeria (`assets/pos-pizzeria.js`)
- **Fichiers** : `assets/pos-pizzeria.js:662`, `assets/pos-dispatch.js:63`
- **Problèmes identifiés** :
  1. Ticket d'envoi en cuisine pizzeria sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Refonte du ticket de commande pizza avec médaillon Material Symbol (`inventory_2`) et hiérarchie soignée.
  2. Bumping de la révision `pos-pizzeria.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.8 Vertical Traiteur (`assets/pos-traiteur.js`)
- **Fichiers** : `assets/pos-traiteur.js:840`, `assets/pos-dispatch.js:64`
- **Problèmes identifiés** :
  1. Constructeur de menu de devis traiteur vide sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Enrichissement du devis traiteur vide avec médaillon Material Symbol (`inventory_2`), hiérarchie visuelle et guidage pas-à-pas.
  2. Bumping de la révision `pos-traiteur.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.9 Vertical Food Truck (`assets/pos-foodtruck.js`)
- **Fichiers** : `assets/pos-foodtruck.js:534`, `assets/pos-dispatch.js:65`
- **Problèmes identifiés** :
  1. Ticket de vente éclair food truck vide sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Refonte du ticket vide avec médaillon Material Symbol (`inventory_2`) et hiérarchie ultra-lisible.
  2. Bumping de la révision `pos-foodtruck.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.10 Vertical Épicerie (`assets/pos-epicerie.js`)
- **Fichiers** : `assets/pos-epicerie.js:638`, `assets/pos-dispatch.js:66`
- **Problèmes identifiés** :
  1. Ticket d'épicerie de quartier vide sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Refonte du ticket vide avec médaillon Material Symbol (`inventory_2`) et repère de geste pour scan douchette / balance.
  2. Bumping de la révision `pos-epicerie.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.11 Vertical Pharmacie (`assets/pos-pharmacie.js`)
- **Fichiers** : `assets/pos-pharmacie.js:669`, `assets/pos-dispatch.js:67`
- **Problèmes identifiés** :
  1. Ticket d'ordonnance / délivrance pharmacie vide sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Refonte du ticket vide avec médaillon Material Symbol (`inventory_2`), hiérarchie claire et indication de sélection de vignette.
  2. Bumping de la révision `pos-pharmacie.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

### 7.12 Vertical Librairie & Papeterie (`assets/pos-librairie.js`)
- **Fichiers** : `assets/pos-librairie.js:609`, `assets/pos-dispatch.js:68`
- **Problèmes identifiés** :
  1. Panier librairie vide sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Refonte du panier vide avec médaillon Material Symbol (`inventory_2`) et hiérarchie visuelle dédiée au scan ISBN.
  2. Bumping de la révision `pos-librairie.js?v=3` dans le dispatcher.
### 7.15 Vertical Salle de Sport & Fitness (`assets/pos-gym.js`)
- **Fichiers** : `assets/pos-gym.js:1190`, `assets/pos-dispatch.js:71`
- **Problèmes identifiés** :
  1. Panier de vente comptoir fitness vide sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Refonte du panier comptoir avec médaillon Material Symbol (`inventory_2`) et hiérarchie visuelle pour les ventes rapides d'eau/shakers/serviettes.
  2. Bumping de la révision `pos-gym.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

---

## 🍷 Passe Serveur · Refonte Design de l'App Serveur (`kiwi-serveur.html`)

### 1. Audit Typographique Initial (Zoo de 27 tailles)
Extraction brute des règles existantes avant harmonisation :
- **Tailles identifiées** : `8px` (2), `9px` (5), `9.5px` (8), `10px` (5), `10.5px` (10), `11px` (31), `11.5px` (13), `12px` (22), `12.5px` (16), `13px` (44), `13.5px` (11), `14px` (18), `15px` (14), `16px` (10), `17px` (8), `18px` (2), `19px` (1), `20px` (4), `22px` (6), `24px` (1), `26px` (2), `27px` (1), `32px` (1), `38px` (1), `40px` (1), `42px` (1), `64px` (1).
- **Problèmes constatés** : Absence de système d'échelle, micro-tailles inopérantes (<11px) en salle sombre, hauteurs de lignes disparates, interlettrages incohérents.

### 2. Échelle Typographique Système Définie (`:root`)
| Jeton | Taille | Line-Height | Letter-Spacing | Poids | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--t-hero` | `clamp(36px, 10vw, 44px)` | `1.05` | `-0.035em` | `700` | Montants géants, accueil |
| `--t-display` | `26px` | `1.15` | `-0.025em` | `700` | Titres majeurs, accent éditorial |
| `--t-title` | `20px` | `1.2` | `-0.02em` | `700` | Titres de modales & sections |
| `--t-headline` | `17px` | `1.25` | `-0.015em` | `600` | Noms de table, totaux |
| `--t-body-lg` | `15px` | `1.35` | `-0.01em` | `600` | Boutons CTA, numéros de table |
| `--t-body` | `13.5px` | `1.45` | `-0.005em` | `500` | Corps principal, articles, items |
| `--t-body-sm` | `12.5px` | `1.4` | `-0.005em` | `400` | Descriptions, sous-titres |
| `--t-label` | `11px` | `1.3` | `0.08em` | `600` | Badges de statut, métadonnées uppercase |
| `--t-micro` | `10px` | `1.25` | `0.10em` | `600` | Horodatages, pastilles de notification |

### 3. Système de Mouvement Déployé
- `--spring: cubic-bezier(0.34, 1.45, 0.5, 1)` : Lentille liquide & sélection active.
- `--glide: cubic-bezier(0.32, 0.72, 0, 1)` : Tiroirs, feuilles modales, sorties.
- `--expo: cubic-bezier(0.16, 1, 0.3, 1)` : Révélations & apparitions vives.
- `--dur-fast: 120ms` · `--dur-base: 200ms` · `--dur-slow: 280ms`.

### 4. Registre des Surfaces Déployées
| Surface | Fichier(s) | Améliorations apportées | État |
| :--- | :--- | :--- | :--- |
### 7.16 Vertical Autre Activité Polyvalente (`assets/pos-autre.js`)
- **Fichiers** : `assets/pos-autre.js:39`, `assets/pos-dispatch.js:72`
- **Problèmes identifiés** :
  1. Catalogue et ticket de vente libre sans médaillon Material Symbols.
- **Améliorations apportées** :
  1. Refonte des états vides de catalogue et ticket avec médaillons Material Symbol (`inventory_2`) et hiérarchie soignée.
  2. Bumping de la révision `pos-autre.js?v=3` dans le dispatcher.
- **État** : ✅ Déployé

---

## 🍷 Passe Serveur · Refonte Design de l'App Serveur (`kiwi-serveur.html`)

### 1. Audit Typographique Initial (Zoo de 27 tailles)
Extraction brute des règles existantes avant harmonisation :
- **Tailles identifiées** : `8px` (2), `9px` (5), `9.5px` (8), `10px` (5), `10.5px` (10), `11px` (31), `11.5px` (13), `12px` (22), `12.5px` (16), `13px` (44), `13.5px` (11), `14px` (18), `15px` (14), `16px` (10), `17px` (8), `18px` (2), `19px` (1), `20px` (4), `22px` (6), `24px` (1), `26px` (2), `27px` (1), `32px` (1), `38px` (1), `40px` (1), `42px` (1), `64px` (1).
- **Problèmes constatés** : Absence de système d'échelle, micro-tailles inopérantes (<11px) en salle sombre, hauteurs de lignes disparates, interlettrages incohérents.

### 2. Échelle Typographique Système Définie (`:root`)
| Jeton | Taille | Line-Height | Letter-Spacing | Poids | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `--t-hero` | `clamp(36px, 10vw, 44px)` | `1.05` | `-0.035em` | `700` | Montants géants, accueil |
| `--t-display` | `26px` | `1.15` | `-0.025em` | `700` | Titres majeurs, accent éditorial |
| `--t-title` | `20px` | `1.2` | `-0.02em` | `700` | Titres de modales & sections |
| `--t-headline` | `17px` | `1.25` | `-0.015em` | `600` | Noms de table, totaux |
| `--t-body-lg` | `15px` | `1.35` | `-0.01em` | `600` | Boutons CTA, numéros de table |
| `--t-body` | `13.5px` | `1.45` | `-0.005em` | `500` | Corps principal, articles, items |
| `--t-body-sm` | `12.5px` | `1.4` | `-0.005em` | `400` | Descriptions, sous-titres |
| `--t-label` | `11px` | `1.3` | `0.08em` | `600` | Badges de statut, métadonnées uppercase |
| `--t-micro` | `10px` | `1.25` | `0.10em` | `600` | Horodatages, pastilles de notification |

### 3. Système de Mouvement Déployé
- `--spring: cubic-bezier(0.34, 1.45, 0.5, 1)` : Lentille liquide & sélection active.
- `--glide: cubic-bezier(0.32, 0.72, 0, 1)` : Tiroirs, feuilles modales, sorties.
- `--expo: cubic-bezier(0.16, 1, 0.3, 1)` : Révélations & apparitions vives.
- `--dur-fast: 120ms` · `--dur-base: 200ms` · `--dur-slow: 280ms`.

### 4. Registre des Surfaces Déployées
| Surface | Fichier(s) | Améliorations apportées | État |
| :--- | :--- | :--- | :--- |
| **1. Échelle Typographique & Mouvement** | `kiwi-serveur.html` | Définition des jetons `--t-*` et des constantes de mouvement, migration de l'ensemble des règles de style | ✅ Déployé |
| **2. Grille de Salle & Cartes de Table** | `kiwi-serveur.html` | Hiérarchie visuelle dominante sur `.tc-num` (17px mono bold), élévation glassmorphism, transitions d'état fluides, état vide conçu avec médaillon et CTA de réinitialisation | ✅ Déployé |
| **3. Onglet Menu & Barre de Panier Flottante** | `kiwi-serveur.html` | Grille d'articles avec rythme nom/prix mono bold, lentille fluide sur `.cat-pill`, animation de pop à ressort `--spring` et chorégraphie d'entrée de la barre de commande | ✅ Déployé |

