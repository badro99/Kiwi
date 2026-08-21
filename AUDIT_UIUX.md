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
| **PIN Dispatcher & Légende** | `assets/pos-dispatch.js` | Fluidité d'affichage de la légende des codes PIN | Transition adoucie et gestion de l'état ouvert/fermé | ✅ Déployé |

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
