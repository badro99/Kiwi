# Kiwi POS · Grand Audit UI/UX & Sweep d'Amélioration Premium

Ce document trace l'ensemble des audits visuels, ergonomiques, d'accessibilité et de mouvement menés sur l'écosystème Kiwi POS, ainsi que chaque amélioration déployée.

---

## 🎯 Principes Directeurs
- **Retenue & Précision** : Stripe pour la rigueur des hiérarchies, Linear pour la discipline des transitions, Apple pour la vérité des matériaux.
- **Identité Atlas Green** : Palette marocaine chaleureuse (`--atlas #0B6E4F`, `--riad #053B2C`, `--mint #7DF2B0`, `--paper #F7F5F0`, `--ink #0A0F0D`).
- **Typographie Romaine** : Jamais d'italique ; hiérarchie portée par `Instrument Serif` (accent éditorial), `Inter Tight` (interface), `JetBrains Mono` / `tabular-nums` (montants & codes), `IBM Plex Sans Arabic` (arabe).
- **Mouvement Fonctionnel** : Ressort maison `cubic-bezier(0.34, 1.45, 0.5, 1)` ~310ms pour la sélection, `--glide` / `--expo` pour les surfaces. Respect strict de `prefers-reduced-motion`.
- **Zéro Régression** : Suite `node tools/check.js` 100 % verte avant chaque commit.

---

## 📋 Registre des Passes & Surfaces

### Passe 1 · Dashboard (`dashboard.html`)
| Surface / Écran | Fichier(s) | Problèmes identifiés | Améliorations apportées | État |
| :--- | :--- | :--- | :--- | :--- |
| **Accueil & Topbar** | `dashboard.html`, `assets/interactive.js` | Focus states hétérogènes, feedback boutons sans ressort, micro-sauts de mise en page | Amélioration des focus-visible, échelle de transition 0.98 sur bouton cliqué, polissage des barres de progression et des badges de statut | En cours |
| **KPI Strip & Objectif Journalier** | `dashboard.html`, `assets/tokens.css` | Alignement des décimales, contraste des badges en mode sombre | Tabular-nums normalisé, isolation bidi des montants MAD, contrastes vérifiés | À auditer |
| **Flux en direct & Ventes** | `dashboard.html`, `assets/pages.js` | États vides sans incitation à l'action claire | Squelettes de chargement fluides, message vide avec bouton d'action directe | À auditer |
| **Paramètres Dédiés** | `assets/interactive.js`, `assets/genpage.css` | Remplacement du tiroir étroit par la page complète | Page `appPage('settings')` déployée avec 4 cartes thématiques et contrôles en direct | ✅ Complété |
| **My Kiwi & Profil Marchand** | `assets/account.js` | Hiérarchie visuelle des fiches d'abonnements | Alignement des métriques, uniformisation des boutons d'actions secondaires | À auditer |

### Passe 2 · Verticaux Métiers (`assets/pos-dispatch.js` & 14 modules)
| Module | Fichier(s) | Problèmes identifiés | Améliorations apportées | État |
| :--- | :--- | :--- | :--- | :--- |
| **Restaurant / Café** | `assets/pos-restaurant.js` | Découpe des tables et sélections de convives | Touch targets >= 44px, retour haptique visuel | Planifié |
| **Pressing & Blanchisserie** | `assets/pos-pressing.js`, `assets/pressing-dashboard.js` | Enchaînement de sélection date de retrait | Clarté du statut ticket et touches de date rapides | Planifié |
| **Boutique & Retail** | `assets/pos-boutique.js` | Vitesse de scan et saisie de quantité | Clavier tactile optimisé | Planifié |
| **Coiffeur / Beauté** | `assets/pos-coiffeur.js` | Sélecteur de praticienne et de créneaux | Cohérence de grille avec les autres modules | Planifié |
| **Autres verticaux (10)** | `assets/pos-*.js` | Variantes de boutons et micro-labels | Normalisation de la grille partagée | Planifié |

### Passe 3 · La Caisse Tactile (`kiwi-caisse.html`)
| Surface / Écran | Fichier(s) | Problèmes identifiés | Améliorations apportées | État |
| :--- | :--- | :--- | :--- | :--- |
| **Grille Catalogue & Panier** | `kiwi-caisse.html`, `assets/caisse.css` | Tailles cibles tactiles en bord d'écran, contraste encaissement | Sécurisation tactile des touches destructives (suppression ligne), retour visuel | Planifié |
| **Écran de Verrouillage & PIN** | `kiwi-caisse.html` | Fluidité de la frappe numérique et réinitialisation | Retour visuel discret par impulsion | Planifié |

### Passe 4 · Le Service en Salle (`kiwi-serveur.html`)
| Surface / Écran | Fichier(s) | Problèmes identifiés | Améliorations apportées | État |
| :--- | :--- | :--- | :--- | :--- |
| **Console de Service (Vue Nuit)** | `kiwi-serveur.html` | Contrastes des badges d'articles envoyés/servis | Amélioration du contraste de lecture en ambiance sombre | Planifié |
