# Kiwi Commerce : la boutique en ligne d'un commerçant

Une boutique en ligne en paiement à la livraison, construite et hébergée par
l'équipe Kiwi, branchée sur le catalogue et le stock de la caisse.

Deux dépôts :

- **kiwi-storefronts** (github.com/zaka33333-hash/kiwi-storefronts, privé) :
  le moteur de vitrine (Cloudflare Pages Functions + liquidjs) et un thème
  par commerçant (`themes/<nom>`). Il lit le catalogue vivant
  (`GET /api/shop/catalog`, avec la clé du magasin) et envoie les commandes ici.
- **Kiwi** (ce dépôt) : reçoit les commandes, les garde en attente, et la
  boutique les confirme ou les refuse.

## Le parcours d'une commande

1. La cliente remplit le formulaire de la vitrine. La vitrine recalcule le
   prix depuis le catalogue et les offres du magasin (`stores.json`), puis
   envoie `POST /api/shop/orders` avec la clé du magasin.
2. Kiwi vérifie chaque ligne contre le vrai catalogue (`catalogs`) : la
   pièce existe, elle est en ligne, son prix est celui affiché, le total
   tombe juste. La commande attend, statut `pending`. Rien ne sort du stock.
3. Dans le tableau de bord (ou la caisse appairée), **Boutique en ligne**
   montre la file. La boutique appelle la cliente, puis :
   - **Confirmer la livraison** : la commande devient une vente livraison
     ordinaire (`web-<id>`), 0 MAD encaissé, le total dû par le livreur,
     la fiche client pour Livraisons et Ozon Express, le stock retenu
     jusqu'au règlement. Si une taille manque, Kiwi le dit et la boutique
     peut « Confirmer quand même ».
   - **Refuser** avec un motif.
4. Le reste est le circuit livraison existant : colis, règlement du
   livreur, sortie du stock (`functions/api/_delivery-stock.js`, qui ignore
   la ligne de frais de livraison).

## Mettre un commerçant en ligne

Dans l'ordre :

1. **Base de prod** : le propriétaire applique la migration
   `migrations/0019_web_orders.sql`
   (`npx wrangler d1 migrations apply kiwi-sales --remote -c wrangler.d1.toml`).
   Les agents ne l'appliquent jamais. Le code des commandes en ligne exige
   0019 (`MINIMUM_SCHEMA_VERSION = 19`) : il n'est livré qu'une fois la
   migration appliquée, sinon tout le site répondrait 503.
2. **God Mode › modules** : activer « Boutique en ligne » (`commerce`) pour
   le commerçant. Éteint par défaut ; tant qu'il l'est, la vitrine reçoit
   `403 commerce-off` et l'entrée du menu reste cachée.
3. **Catalogue** : dans Boutique en ligne › Articles en ligne, décocher ce
   qui ne doit pas être vendu en ligne. Ajouter les photos aux articles
   dans le catalogue. La vitrine lit le catalogue de la caisse tel qu'il est
   (une minute de cache) : prix, tailles et stock suivent sans republier.
4. **Clé** : Boutique en ligne › Articles en ligne › « Relier la boutique en ligne » › Créer la clé. La clé
   (`kwc.<id>.<secret>`) ne s'affiche qu'une fois. Elle ne peut que déposer
   des commandes pour ce commerçant ; une clé Glovo ne dépose pas de
   commande en ligne et inversement. Elle se révoque comme les autres
   clés de canal.
5. **Vitrine** : dans le projet Pages de kiwi-storefronts, ajouter le
   secret `KIWI_KEY_<MAGASIN>` (ex. `KIWI_KEY_SANTOS`) avec cette clé.
   Sans ce secret la vitrine reste en aperçu : commandes numérotées
   `TEST-…`, envoyées à personne.
6. Passer une commande test (nom `TEST KIWI`), la voir arriver, la refuser.

## Les réglages de la boutique (document `storefront`)

Le commerçant règle sa boutique depuis le tableau de bord. Les réglages sont
un document de magasin, `store_docs` feature `storefront`
(`POST /api/store`), nettoyé par `functions/api/shop/_settings.js`
(`cleanStorefront`) : tout champ inconnu est jeté, chaque valeur est bornée.

| Champ | Forme |
|---|---|
| `name` | nom affiché, 60 caractères au plus (peut être vide) |
| `tagline` | 140 caractères |
| `announcement` | une ligne en haut de la boutique, 120 caractères |
| `whatsapp` | chiffres seulement, 8 à 15, ou vide |
| `instagram` | identifiant `[A-Za-z0-9._]{1,30}` (le `@` est retiré), ou vide |
| `accent` | `#RRGGBB`, ou vide |
| `shipping` | `{ feeMAD: 0..500, freeFromMAD: 0..100000 ou null }` |
| `bundles` | `{ "2": 0..50, "3": 0..50 }`, % de remise pour 2 ou 3 pièces (0 = aucune) |
| `coupons` | `{ "CODE": 1..90 }`, codes `[A-Z0-9]{3,20}` en majuscules, 20 au plus |
| `updatedTs` | posé par le serveur |

Écriture : la session du propriétaire ou un opérateur nommé
(`OWNER_EDIT_FEATURES`, vérifié par `editsRoster`). Une caisse appairée ou
un employé reçoit `403 forbidden-feature`. Lecture : comme les autres
documents (la caisse appairée lit, rien de secret dedans).

La vitrine reçoit ces réglages dans `GET /api/shop/catalog`, champ
`settings` (rebordé à la lecture, `null` si le commerçant n'a jamais
enregistré). Elle les pose par-dessus les valeurs de son `stores.json`,
qui restent les valeurs par défaut. Comme pour tout document, un envoi
entièrement vide (aucun texte, aucun code) ne remplace pas un document
rempli (`409 refused-empty`).

## Ce qui reste vérifié par Kiwi

Kiwi vérifie l'arithmétique et les bornes des commandes (remise ≤ articles,
livraison ≤ 500 MAD), pas le marketing.

## Limites

20 lignes par commande, 10 pièces par ligne, 200 commandes en attente par
commerçant, corps de 64 Ko.

## Ozon Express et suivi

La cliente choisit sa ville dans la liste Ozon (la vitrine la sert depuis
`api.ozonexpress.ma/cities`). L'identifiant suit la commande ; à la
confirmation, la fiche de livraison le porte et `/api/sale` crée le colis
Ozon tout seul, comme pour une fiche remplie à la caisse.

Après la commande, la vitrine affiche « Suivre ma commande »
(`/commande/W-XXXXX?t=…`). La page lit `GET /api/shop/status` avec la clé
du magasin et la clé de la commande (un HMAC d'`AUTH_SECRET`, rendu une
fois à la cliente, jamais stocké). Elle montre l'état, les articles et le
colis, jamais le téléphone ni l'adresse.

## Tests

`tools/web-orders-test.mjs` (dans `check.js`) et `npm test` dans
kiwi-storefronts.
