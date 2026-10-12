# Kiwi Health · inventaire des signaux

2026-10-12 · **validé et construit.** Le propriétaire a pris les réponses par
défaut aux quatre questions (en fin de document) le jour même.

## Où ça vit

- `functions/api/_merchant-health.js` · le calcul, pur (faits → score).
- `functions/api/merchant-health.js` · `GET /api/merchant-health?merchant=`,
  lecture seule, mise en cache deux minutes par établissement.
- `assets/merchant-health.js` + `.css` · la carte « Santé Kiwi » de l'accueil,
  entre la bande d'indicateurs et « Pour vous », et son tiroir « Tout voir ».
- `tools/merchant-health-test.mjs` (route sur le schéma complet en SQLite) et
  `tools/merchant-health-browser-test.mjs` (la carte dans le vrai dashboard).

À ne pas confondre avec `assets/kiwi-health.js` / `kiwi-health.html`, la
fenêtre « Santé de Kiwi » de la console opérateur, ni avec `/api/admin/health`.

## Écarts assumés entre le tableau et la v1

- R4 « Fiches recettes » : part des plats **de la carte** (actifs) dont la fiche
  a au moins un ingrédient, pas encore la part des plats **vendus**.
- S3 « Rendez-vous » : fiches `appointments` du document `workspaces` créées
  dans la fenêtre (la caisse spa remet ses rendez-vous du jour à zéro).
- H2 « Séjours suivis » : séjours non annulés commencés dans la fenêtre dont le
  statut est passé à `checked_in` ou `completed`.
- Les trois prochaines actions : les lignes au plus grand poids restant, à
  égalité dans l'ordre du tableau ; seules celles qui ont une destination.
- Démo : la carte lit le locataire de démonstration que le fil des ventes lit
  déjà (`cafe-atlas` par défaut). Injoignable, la démo cache la carte ; un vrai
  commerçant lit que Santé Kiwi est injoignable, jamais un chiffre.

## Ce que la carte mesure

À quel point un commerçant se sert de ce que Kiwi lui offre, pour **son** métier.
Jamais la performance de son commerce : le chiffre d'affaires, la marge et les
paniers restent dans la bande d'indicateurs et n'entrent pas dans ce score.

## Règles de calcul

- **Quatre états par ligne** : fait (1) · partiel (la vraie fraction, 0 à 1) ·
  pas commencé (0) · non mesurable (sorti du calcul, jamais compté 0).
- **Score** = Σ poids × valeur ÷ Σ poids des lignes applicables, arrondi à l'unité.
- **Non applicable** = le module est coupé pour ce commerce
  (`merchant_config.features[clé] === false`, réglé dans kiwi-admin) ou n'existe
  pas pour son métier. Sorti du calcul, absent de la liste.
- **Optionnel** (poids 0) = utile à certains seulement (factures, Shopify,
  promotions…). Affiché comme suggestion une fois les lignes comptées faites,
  jamais compté contre le commerçant.
- **Fenêtre** : 30 jours commerciaux (coupure 05:00, fuseau du commerce).
- **Lecture** : une seule route `GET /api/merchant-health`, en lecture seule, bornée par
  `tenantFor()`, calculée au chargement du tableau de bord et mise en cache par
  commerce. Aucun nouveau polling. Elle ne lit jamais un document porteur de
  codes pour les renvoyer : le roster se compte dans `staff_pins` (`COUNT(*)`),
  les membres d'équipe se comptent côté serveur sans sortir un champ.

## Constat sur les offres (à trancher)

Dans le code, **Basic et Pro ouvrent exactement les mêmes modules.** La seule
règle d'offre appliquée est le nombre d'établissements (`venues.js:1428`). Le
« Kiwi IQ avancé » vendu en Pro n'a aucune vérification d'offre que j'aie
trouvée. Conséquence pour la carte : aucune ligne ne serait « Disponible avec
Pro » aujourd'hui. Je propose de ne pas afficher d'offre du tout dans la v1, et
de traiter le « IQ avancé » comme une question à part.

## Commun à tous les métiers

| # | Ligne | Prouvé « en place » par | Prouvé « utilisé » par | Source | Poids |
|---|---|---|---|---|---|
| C1 | La caisse encaisse | ≥ 1 vente non annulée | part des jours ouverts avec ventes (jours ouverts = `hours`, sinon 6 sur 7) | `sales` | 3 |
| C2 | La journée se clôture | — | part des jours avec ventes qui ont une clôture | `z_reconciliations`, `cash_session_events` (fermeture) | 2 |
| C3 | Chacun son code | ≥ 2 personnes au roster | — | `staff_pins` (compte seulement) | 1 |
| C4 | Pointage | — | ≥ 1 pointage dans la fenêtre ; partiel = part des membres qui pointent | `store_docs.attendance` | 1 |
| C5 | Planning | des créneaux posés | créneaux sur les 14 derniers ou prochains jours | `store_docs.team` (shifts), `payroll` | 1 |
| C6 | Fiches clients | ≥ 1 client | part des ventes rattachées à un client (seuil « fait » à valider, voir question 3) | `clients`, `client_purchase_events` ÷ `sales` | 1 |
| C7 | Fidélité | modèle réglé | récompenses données dans la fenêtre | `store_docs.fidelity`, `client_reward_events` | 1 |
| C8 | Identité sur le ticket | nom, logo et mentions légales remplis | — | `store_docs.business`, `receipt` | 1 |
| C9 | Horaires d'ouverture | semaine réglée | — | `store_docs.hours` | 0,5 |
| C10 | Imprimante | — | pont vu sur 7 jours ou tâche imprimée | `print_bridges`, `print_jobs` | 1 · **non mesurable** sans pont : Bluetooth et USB ne laissent aucune trace côté serveur |
| C11 | Le comptable reçoit le mois | adresse du comptable posée | — | `store_docs.monthreport` | 0,5 |
| C12 | Kiwi IQ | — | briefing ou question IQ dans la fenêtre | `store_docs.briefing`, `ai_usage` | 1 |
| O1 | Factures | — | facture émise | `sale_invoices` | optionnel |
| O2 | Promotions | — | promotion active | `store_docs.promotions` | optionnel |
| O3 | Dépenses | — | dépense saisie | `store_docs.expenses` | optionnel (module coupé d'office) |
| O4 | App employé | — | appareil employé inscrit | `push_tokens` (rôle employé) | optionnel |
| O5 | Agent / API | — | clé active utilisée | `agent_keys` | optionnel |

## Restauration (restaurant, café, fast-food, boulangerie, pizzeria, traiteur, food truck)

| # | Ligne | En place | Utilisé | Source | Poids |
|---|---|---|---|---|---|
| R1 | Carte | ≥ 1 article | part des articles avec photo | `store_docs.menu` (`img`) | 2 |
| R2 | Plan de salle | ≥ 1 table | tables ouvertes dans la fenêtre | `store_docs.floorplan`, `table_sessions` | 2 · non applicable si le mode Salle est coupé |
| R3 | Commandes envoyées en cuisine | — | commandes avec heure d'envoi | `order_course` | 1 |
| R4 | Fiches recettes | ≥ 1 recette | part des plats vendus qui ont une recette | `store_docs.recipes`, `menu` | 2 |
| R5 | Stock suivi | ≥ 1 article de stock | mouvements dans la fenêtre ; inventaire compté sur 90 jours | `store_docs.stock`, `inventory_movements`, `inventory_counts` | 2 |
| R6 | App serveur | — | commandes prises par un serveur nommé | `orders.server_name` | 1 · non applicable si le mode Salle est coupé |
| O6 | Écran cuisine (KDS) | postes réglés | — | `store_docs.kds` | optionnel (l'imprimante cuisine suffit) |
| O7 | Achats fournisseurs | — | bon de commande sur 60 jours | `purchase_orders` | optionnel |
| O8 | Pertes cuisine | — | perte déclarée | `kitchen_voids.is_waste` | optionnel |
| O9 | Réservations | — | réservation dans la fenêtre | `store_docs.reservations` | optionnel |
| O10 | Commande QR / Order Pro | — | commande reçue par ce canal | `orders.channel` | optionnel, seulement si l'option est allumée |

## Commerce (boutique, épicerie, pharmacie, librairie, fleuriste, maison, autre)

| # | Ligne | En place | Utilisé | Source | Poids |
|---|---|---|---|---|---|
| B1 | Catalogue | ≥ 1 produit | part des produits avec code-barres | catalogue du commerce (source exacte à confirmer en phase 1) | 2 |
| B2 | Prix d'achat | — | part des produits avec un coût (sans lui, aucune marge) | idem | 2 |
| B3 | Stock suivi | — | mouvements dans la fenêtre ; inventaire compté sur 90 jours | `inventory_movements`, `inventory_counts` | 2 |
| O11 | Retours et avoirs | — | retour ou avoir dans la fenêtre | `store_docs.returns`, `store_credits` | optionnel |
| O12 | Shopify | connexion active | synchro récente | `shopify_connections` | optionnel |
| O13 | Catégories A / B | — | — | option `depotvente` | optionnel, seulement si allumée |

**Pressing** remplace B1–B3 par :

| # | Ligne | En place | Utilisé | Source | Poids |
|---|---|---|---|---|---|
| P1 | Tarifs pressing | ≥ 1 service | — | `store_docs.pressing-catalog` | 2 |
| P2 | Dépôts suivis | — | part des dépôts avec téléphone client et date de retrait | `store_docs.pressing-orders` | 2 |

## Bien-être (spa, coiffure, salle de sport)

| # | Ligne | En place | Utilisé | Source | Poids |
|---|---|---|---|---|---|
| S1 | Services et tarifs | ≥ 1 service | — | `store_docs.services` | 2 |
| S2 | Praticiens | ≥ 1 praticien | — | `store_docs.practitioners` | 1 |
| S3 | Rendez-vous | — | rendez-vous dans la fenêtre | `store_docs.appointments` | 2 |
| C6 | Fiches clients | | | | passe à 2 ici |

La salle de sport a ses abonnements dans `store_docs.workspaces` : forme exacte
à confirmer en phase 1 avant d'en faire une ligne.

## Hôtel / riad

| # | Ligne | En place | Utilisé | Source | Poids |
|---|---|---|---|---|---|
| H1 | Chambres | ≥ 1 chambre | — | `store_docs.rooms` | 2 |
| H2 | Séjours | — | séjours avec arrivée et départ enregistrés | `hotel_reservations` | 3 |
| H3 | Notes clients (folios) | — | charge posée sur une chambre | `hotel_room_charge_events` | 1 |
| H4 | Économat | — | demande interne dans la fenêtre | `hotel_internal_requests` | 1 |
| O14 | Canaux / OTA | lien actif | synchro récente | `channel_links` | optionnel |

Le ménage n'a pas de trace serveur que j'aie trouvée : non mesurable tant que
ce n'est pas vérifié.

## Ce qui est exclu

Kiwi Pay, Banking et Investing (phases 2–3). Terminaux et Conformité
(coupés d'office, affaire de l'opérateur). Tout module coupé pour ce commerce.

## Questions pour le propriétaire (tranchées le 2026-10-12 : réponses par défaut)

1. Les poids ci-dessus (3 pour la caisse, 2 pour la carte, la salle, les
   recettes et le stock, 1 pour le reste) vous conviennent ?
2. Offres : on n'affiche aucune mention d'offre dans la v1 (Basic et Pro
   ouvrent les mêmes modules) ?
3. Fiches clients : à partir de quand est-ce « fait » ? Proposition : une vente
   sur dix rattachée à un client.
4. Les lignes optionnelles restent hors score et n'apparaissent qu'en
   suggestions une fois le reste fait ?
