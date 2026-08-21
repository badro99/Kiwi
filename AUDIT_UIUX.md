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
